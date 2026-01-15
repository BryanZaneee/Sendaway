# Sendaway

Time-locked message delivery platform. Users compose messages (text + optional video) with a future delivery date. Messages are locked until their scheduled date, then delivered via email with access to unlocked content.

## Architecture

Sendaway is a single-page application (Vite + Vanilla TypeScript) backed by Supabase (PostgreSQL + Auth + Storage + Edge Functions).

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
│  Database: Messages, profiles, payments, delivery_logs      │
│  Auth: Email/password authentication                        │
│  Storage: Video files in 'message-videos' bucket            │
│  Edge Functions: Stripe checkout, webhooks, message delivery│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                         │
│  Stripe: Payment processing ($9 Pro upgrade)                │
│  Resend: Transactional email delivery                       │
│  cron-job.org: Daily trigger at 8 AM UTC                    │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Tier System
- **Free tier**: 1 message (no video), enforced via optimistic locking on `profiles.free_message_used`
- **Pro tier**: Unlimited messages, 2GB video storage, $9 one-time payment
- Optimistic locking prevents race condition: `UPDATE profiles SET free_message_used = true WHERE id = ? AND free_message_used = false RETURNING *`. If 0 rows updated, another request won the race.

### Message Locking Mechanism
- **Locked state**: Current date < scheduled_date. Frontend shows countdown timer (client-side, updates every 1 second).
- **Unlocked state**: Current date >= scheduled_date. Frontend generates signed URL (7-day expiry) for video viewing.
- Clock drift acceptable: Countdown is UX enhancement, not security boundary. Server-side delivery is authoritative.

### Compensating Transactions
Supabase doesn't support multi-resource transactions (DB + Storage). Manual compensation required:

1. **Free message race condition**: If optimistic lock fails after message insertion, delete the just-created message.
2. **Storage quota failure**: If `update_storage_used` RPC fails after video upload, delete uploaded video via storage API + delete message record. Structured log on double-failure: `{event: 'COMPENSATING_DELETE_FAILED', message_id, video_storage_path, storage_error, delete_error}`

### Daily Batch Delivery
- Process-delivery Edge Function triggered daily at 8 AM UTC by cron-job.org
- Batch size: 30 messages per run (respects 60s Edge Function timeout: 45s execution + 15s buffer to prevent hard kill)
- Batch lock (`delivery_batch_locks` table) prevents concurrent execution
- Sequential email sending with 1000ms delay (respects Resend 1/second rate limit)
- Unprocessed messages picked up by next cron run or manual trigger

### Video Storage Strategy
- Path structure: `{user_id}/{uuid}.{ext}` (user isolation + collision prevention)
- Signed URLs cached in modal instance (7-day expiry, regenerated if expired)
- Ownership validation: All video operations verify path starts with `{user.id}/`
- Deletion cascades: Canceling a message deletes video from storage + updates quota

### Delivery Idempotency
- `delivery_logs` is source of truth for delivery status
- Before sending email, check if `delivery_logs` has `status='delivered'` for this `message_id`
- `messages.status` is derived state (updated after delivery_logs insertion)
- Prevents duplicate emails on cron retry or manual trigger

### Webhook Idempotency
- Stripe sends duplicate webhooks on network retry
- Query `payments` table WHERE `checkout_session_id=?` without status filter
- Handles both duplicate webhooks AND interrupted transactions (webhook arrives, DB update fails)

## System Invariants

1. **Free message enforcement**: Optimistic locking prevents race conditions. Rollback on conflict.
2. **Storage quota accuracy**: Compensating transaction on RPC failure prevents quota drift.
3. **Delivery idempotency**: Check delivery_logs before sending email. Never send twice.
4. **Webhook idempotency**: Query by checkout_session_id without status filter.
5. **Batch delivery lock**: Only one process-delivery execution at a time (delivery_batch_locks).
6. **Video ownership**: All operations verify path starts with user.id.
7. **Message deletion**: Only pending messages can be deleted (RLS enforced).
8. **Admin operations**: Edge Functions use service role client from _shared/supabase-admin.ts to bypass RLS.

## Tradeoffs

| Decision | Chosen Approach | Alternative | Reasoning |
|----------|-----------------|-------------|-----------|
| Tier enforcement | Optimistic locking + compensating transaction | Database constraint | Better error messages, allows compensation for message insertion |
| Message locking | Client-side countdown | Server-side polling | Reduces server load, acceptable clock drift for UX |
| Batch delivery | Daily at 8 AM UTC | Per-message scheduling | Simpler cron setup, acceptable delay for use case |
| Video storage | Supabase Storage + signed URLs | CDN | Simpler architecture, integrated with Supabase auth |
| Transaction safety | Manual compensating transactions | Distributed transaction coordinator | Supabase limitations, manual approach sufficient for scale |
| Delivery logs | Separate table from messages | Status column only | Audit trail, delivery idempotency, supports retry logic |
| Singleton services | Global instances | Dependency injection | Simpler for small app, acceptable coupling |
| Neo-brutalist design | Bold borders, high contrast | Subtle gradients | Distinct visual identity, accessibility |

## Development Workflow

1. **Local development**: Vite dev server + Supabase local project
2. **Database migrations**: `supabase migration new <name>` → `supabase db push`
3. **Edge Function deployment**: `supabase functions deploy <name>`
4. **Environment secrets**: `supabase secrets set <key>=<value>`
5. **Type generation**: `supabase gen types typescript --local > src/types/database.ts`

## External Dependencies

| Service | Purpose | Failure Mode |
|---------|---------|--------------|
| Stripe | Payment processing | Users cannot upgrade to Pro until service recovers |
| Resend | Email delivery | Messages remain pending, retried on next cron run |
| cron-job.org | Daily delivery trigger | Manual trigger via Edge Function URL |
| Supabase | Database, auth, storage, functions | Full outage, no fallback |

## Scaling Considerations

- **Free tier Resend**: 100 emails/day limit. Upgrade to paid plan as user base grows.
- **Batch size**: Current 30 messages/run. Monitor Edge Function execution time, adjust if needed.
- **Storage quota**: Pro users limited to 2GB. Consider paid tier or external CDN for expansion.
- **Database**: Supabase free tier sufficient for MVP. Monitor connection pool and query performance.
- **Clock drift**: Client-side countdown acceptable for current scale. Server-side polling if precision becomes critical.

## Security Boundaries

- **RLS policies**: Enforce user isolation for messages, profiles, payments
- **Cron authentication**: x-cron-secret header verified before execution
- **Stripe webhook signature**: Verified before processing payment events
- **Video ownership**: Path prefix validation prevents cross-user access
- **Admin client**: Used only in Edge Functions (server-side), never exposed to client
