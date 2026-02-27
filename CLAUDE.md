# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Vite dev server
npm run build            # TypeScript compile + Vite build
npm run preview          # Preview production build
npm run typecheck        # Type check without emit

# Test data (creates test user + 6 sample messages)
npx tsx scripts/seed-test-data.ts
# Custom credentials: TEST_EMAIL="x@y.com" TEST_PASSWORD="Pass123!" npx tsx scripts/seed-test-data.ts

# Supabase
npm run supabase:start   # Start local Supabase (requires Docker)
npm run supabase:gen-types  # Generate types from local DB → src/types/database.ts
npm run supabase:deploy  # Deploy all Edge Functions

# Edge Functions (individual)
supabase functions serve <name> --env-file .env.local  # Test locally
supabase functions deploy <name>   # Deploy single function

# Database
supabase migration new <name>      # Create migration file
supabase db push                   # Apply migrations to local
supabase secrets set KEY=value     # Set environment secrets

# Stripe webhook testing (local)
stripe listen --forward-to localhost:54321/functions/v1/webhook-stripe
```

## Architecture

Single-page app (Vite + Vanilla TypeScript) backed by Supabase.

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vite + TS)                     │
│  Components: Modals, forms, dashboard                       │
│  Services: Auth, messages, payments, video (singletons)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              SUPABASE (Backend as a Service)                │
│  Database: Messages, profiles, payments, delivery_logs,      │
│            notification_queue                                │
│  Auth: Email/password authentication                        │
│  Storage: Video files in 'message-videos' bucket            │
│  Edge Functions: Stripe checkout, webhooks, scheduled notif. │
│                 and message delivery                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                         │
│  Stripe: Payment processing ($9 Pro upgrade)                │
│  Resend: Transactional email delivery                       │
│  cron-job.org: Triggers confirmations + daily delivery       │
└─────────────────────────────────────────────────────────────┘
```

**Frontend Flow:** `src/main.ts` initializes `formHandler` and `messagesDashboard`, subscribes to `authService.onAuthStateChange()` to toggle between landing page and dashboard.

**Service Layer:** Singleton services in `src/services/` encapsulate Supabase operations. See `src/services/CLAUDE.md` for details.

**Edge Functions:** Server-side operations requiring admin privileges. See `supabase/functions/CLAUDE.md` for details.

## Key Patterns

**Free tier enforcement:** Optimistic locking on `profiles.free_message_used`. UPDATE returns 0 rows if another request won the race → compensating delete of just-created message.

**Compensating transactions:** Supabase lacks multi-resource transactions. On storage quota failure after video upload: delete video from storage + delete message record.

**Delivery idempotency:** Check `delivery_logs` for `status='delivered'` before sending email. `messages.status` is derived state updated after successful delivery.

**Scheduled confirmation reliability:** `notification_queue` stores queued confirmation sends with retry/backoff and dedupe via `(message_id, notification_type, recipient_email)` unique key.

**Webhook idempotency:** Query `payments WHERE checkout_session_id=?` without status filter to handle both duplicate webhooks and interrupted transactions.

**Batch delivery lock:** `delivery_batch_locks` table prevents concurrent `process-delivery` execution.

**Admin client:** Edge Functions use `getSupabaseAdmin()` from `_shared/supabase-admin.ts` to bypass RLS.

## Repository Index

| Path | Purpose |
|------|---------|
| `src/components/` | UI components (see `src/components/CLAUDE.md`) |
| `src/services/` | Service singletons (see `src/services/CLAUDE.md`) |
| `src/utils/` | Validation, countdown, status utilities |
| `src/config/` | Supabase client configuration |
| `src/types/` | Generated database types (run `npm run supabase:gen-types`) |
| `supabase/functions/` | Edge Functions (see `supabase/functions/CLAUDE.md`) |
| `supabase/migrations/` | Database schema and RLS policies |

## Environment Variables (Edge Functions)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe API authentication |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin operations |
| `RESEND_API_KEY` | Email sending |
| `CRON_SECRET` | Authenticates cron triggers |
| `APP_URL` | Frontend URL for redirects |
| `FROM_EMAIL` | Email sender address |

## Database Schema (Key Tables)

- `profiles` - User tiers, storage quotas. `free_message_used` (bool) for optimistic locking.
- `messages` - Scheduled messages. `delivery_token` (UUID) for secure email links.
- `payments` - Stripe transactions. `checkout_session_id` for idempotency.
- `delivery_logs` - Email delivery audit trail. Source of truth for delivery status.
- `notification_queue` - Queued scheduled-confirmation emails with retry metadata.
- `delivery_batch_locks` - Prevents concurrent process-delivery runs.

RPC: `update_storage_used(user_id, delta_bytes)` - atomic storage quota updates.

## System Invariants

1. **Free message enforcement**: Optimistic locking prevents race conditions. Rollback on conflict.
2. **Storage quota accuracy**: Compensating transaction on RPC failure prevents quota drift.
3. **Delivery idempotency**: Check delivery_logs before sending email. Never send twice.
4. **Webhook idempotency**: Query by checkout_session_id without status filter.
5. **Batch delivery lock**: Only one process-delivery execution at a time.
6. **Scheduled confirmation retries**: notification_queue retries until max attempts, then marks failed.
7. **Video ownership**: All operations verify path starts with `user.id`.
8. **Message deletion**: Only pending messages can be deleted (RLS enforced).
9. **Admin operations**: Edge Functions use service role client to bypass RLS.

## External Service Failure Modes

| Service | Failure Impact |
|---------|----------------|
| Stripe | Users cannot upgrade to Pro until service recovers |
| Resend | Messages remain pending, retried on next cron run |
| cron-job.org | Confirmation + delivery jobs can be manually triggered via Edge Function URL |
| Supabase | Full outage, no fallback |

## Constraints

- Resend free tier: 100 emails/day, 1/second rate limit
- Edge Function timeout: 60s (process-delivery uses 45s execution + 15s buffer)
- Batch size: 30 messages per delivery run
- Pro storage limit: 2GB per user
- Video path structure: `{user_id}/{uuid}.{ext}` (ownership validated by path prefix)
- Message text limit: 4000 characters
