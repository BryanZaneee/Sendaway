# Edge Functions Index

| Function | What | When |
|----------|------|------|
| create-checkout | Creates Stripe checkout session for Pro upgrade ($9) | User requests Pro upgrade payment |
| webhook-stripe | Handles Stripe payment webhooks, updates user tier to 'pro' and storage_limit_bytes to 2GB | Stripe sends checkout.session.completed event |
| process-delivery | Sends scheduled messages via Resend for messages due today (status='pending', deliver_at <= today) | Triggered daily at 8 AM UTC by cron-job.org |
| cleanup-logs | Deletes delivery_logs older than 90 days | Triggered periodically for log retention |

## Shared Utilities

| Module | What | When |
|--------|------|------|
| _shared/cron-auth.ts | Verifies CRON_SECRET header matches environment variable | Guards process-delivery and cleanup-logs from unauthorized invocation |
| _shared/supabase-admin.ts | Creates Supabase admin client with service role key | Edge Functions need admin privileges for RLS-protected operations |
