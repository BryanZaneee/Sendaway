# Edge Functions

Supabase Edge Functions handle payment processing, scheduled message delivery, and log cleanup.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE EDGE FUNCTIONS                   │
├─────────────────────────────────────────────────────────────┤
│  create-checkout    │ Creates Stripe checkout session       │
│  webhook-stripe     │ Handles payment confirmation          │
│  process-delivery   │ Sends due messages via Resend         │
│  cleanup-logs       │ Deletes old delivery_logs entries     │
├─────────────────────────────────────────────────────────────┤
│                    SHARED UTILITIES                         │
│  _shared/cron-auth.ts        │ Cron request authentication  │
│  _shared/supabase-admin.ts   │ Admin client factory         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                        │
├─────────────────────────────────────────────────────────────┤
│  Stripe      │ Payment processing, checkout sessions        │
│  Resend      │ Transactional email delivery                 │
│  cron-job.org│ Daily trigger for process-delivery at 8 AM  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

**Payment Flow:**
1. User clicks "Go Pro" → create-checkout → Stripe Checkout
2. User pays → Stripe webhook → webhook-stripe → Update profiles.tier to 'pro', storage_limit_bytes to 2147483648 (2GB)

**Message Delivery Flow:**
1. User submits message form → messages table (status='pending')
2. Cron triggers process-delivery daily at 8 AM UTC → Query pending messages due today
3. For each message: Generate signed URL → Send via Resend → Update status='delivered'
4. Batch lock (delivery_batch_locks) prevents concurrent execution

**Log Cleanup Flow:**
1. cleanup-logs runs periodically → Deletes delivery_logs WHERE created_at < now() - 90 days

## Setup Instructions

### Stripe Configuration

1. Get API keys from Stripe Dashboard:
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
   ```

2. Configure webhook endpoint:
   - URL: `https://<project-ref>.supabase.co/functions/v1/webhook-stripe`
   - Events: `checkout.session.completed`
   - Get webhook signing secret:
     ```bash
     supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
     ```

### Resend Configuration

1. Get API key from Resend Dashboard:
   ```bash
   supabase secrets set RESEND_API_KEY=re_...
   ```

2. Set sender email (must be verified domain):
   ```bash
   supabase secrets set FROM_EMAIL=noreply@yourdomain.com
   ```

### Supabase Configuration

Set service role key for admin operations:
```bash
supabase secrets set SUPABASE_URL=https://<project-ref>.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### Application URL

Set frontend URL for checkout redirects:
```bash
supabase secrets set APP_URL=https://yourdomain.com
```

### Cron Configuration

1. Create account on cron-job.org
2. Set up daily job:
   - URL: `https://<project-ref>.supabase.co/functions/v1/process-delivery`
   - Schedule: Daily at 8:00 AM UTC
   - HTTP Method: POST
   - Headers: `x-cron-secret: <CRON_SECRET>`, `Content-Type: application/json`

3. Set cron secret:
   ```bash
   supabase secrets set CRON_SECRET=<random-secure-string>
   ```

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| STRIPE_SECRET_KEY | Stripe API authentication | sk_test_... |
| STRIPE_WEBHOOK_SECRET | Webhook signature verification | whsec_... |
| SUPABASE_URL | Supabase project URL | https://xyz.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | Admin operations | eyJhbGc... |
| RESEND_API_KEY | Email sending | re_... |
| CRON_SECRET | Authenticates cron trigger | random-secure-string |
| APP_URL | Frontend URL for redirects | https://yourdomain.com |
| FROM_EMAIL | Email sender address | noreply@domain.com |

## Invariants

- Stripe webhook verifies signature before processing (security)
- Only one process-delivery execution can run at a time (delivery_batch_locks enforces this)
- delivery_logs is source of truth for delivery status. Before sending email, check if delivery_logs has status='delivered' for this message_id. messages.status is derived state.
- Webhook idempotency: Query WHERE checkout_session_id=? without status filter to handle both duplicate webhooks AND interrupted transactions
- Cron authentication: process-delivery and cleanup-logs verify x-cron-secret header matches CRON_SECRET environment variable before execution
- Admin client pattern: Edge Functions use getSupabaseAdmin() from _shared/supabase-admin.ts for operations requiring service role privileges (bypasses RLS)

## Rate Limits

- Resend free tier: 100 emails/day, 1/second rate limit
- process-delivery batch size: 30 messages per run (respects 60s Edge Function timeout: 45s execution + 15s buffer to prevent hard kill)
- Sequential email sending with 1000ms delay between calls

## Tradeoffs

- Daily delivery batch (8 AM UTC) simplifies cron scheduling vs. per-message scheduling precision
- Batch size of 30 leaves margin for API latency, DB queries, signed URL generation within 60s timeout
- Unprocessed messages picked up by next cron run or manual trigger
- checkout_session_id stored in payments table enables reconciliation if webhook fails
