# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Vite dev server
npm run build            # TypeScript compile + Vite build
npm run typecheck        # Type check without emit

# Supabase
npm run supabase:start   # Start local Supabase
npm run supabase:gen-types  # Generate types from local DB → src/types/database.ts

# Edge Functions
supabase functions serve <name> --env-file .env.local  # Test locally
supabase functions deploy <name>   # Deploy single function
supabase functions deploy          # Deploy all functions

# Database
supabase migration new <name>      # Create migration file
supabase db push                   # Apply migrations to local
supabase secrets set KEY=value     # Set environment secrets
```

## Architecture

Single-page app (Vite + Vanilla TypeScript) backed by Supabase.

**Frontend Flow:** `src/main.ts` initializes `formHandler` and `messagesDashboard`, subscribes to `authService.onAuthStateChange()` to toggle between landing page and dashboard.

**Service Layer:** Singleton services in `src/services/` encapsulate Supabase operations:
- `authService` - auth state, profile data, tier checking
- `messageService` - message CRUD with tier enforcement
- `paymentService` - Stripe checkout session creation
- `videoService` - Storage uploads, signed URLs

**Edge Functions:** Server-side operations requiring admin privileges:
- `create-checkout` - Stripe checkout for $9 Pro upgrade
- `webhook-stripe` - Payment confirmation → tier update
- `process-delivery` - Daily batch delivery via Resend (8 AM UTC)
- `cleanup-logs` - 90-day log retention

## Key Patterns

**Free tier enforcement:** Optimistic locking on `profiles.free_message_used`. UPDATE returns 0 rows if another request won the race → compensating delete of just-created message.

**Compensating transactions:** Supabase lacks multi-resource transactions. On storage quota failure after video upload: delete video from storage + delete message record.

**Delivery idempotency:** Check `delivery_logs` for `status='delivered'` before sending email. `messages.status` is derived state updated after `delivery_logs` insertion.

**Webhook idempotency:** Query `payments WHERE checkout_session_id=?` without status filter to handle both duplicate webhooks and interrupted transactions.

**Batch delivery lock:** `delivery_batch_locks` table prevents concurrent `process-delivery` execution.

**Admin client:** Edge Functions use `getSupabaseAdmin()` from `_shared/supabase-admin.ts` to bypass RLS.

## Repository Index

| Path | Purpose |
|------|---------|
| `supabase/functions/` | Edge Functions (see `supabase/functions/CLAUDE.md`) |
| `supabase/migrations/` | Database schema and RLS policies |
| `src/components/` | UI components (see `src/components/CLAUDE.md`) |
| `src/services/` | Service singletons (see `src/services/CLAUDE.md`) |
| `src/utils/` | Validation, countdown, status utilities |
| `src/config/` | Supabase client configuration |
| `src/types/` | Generated database types |

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

## Constraints

- Resend free tier: 100 emails/day, 1/second rate limit
- Edge Function timeout: 60s (process-delivery uses 45s execution + 15s buffer)
- Batch size: 30 messages per delivery run
- Pro storage limit: 2GB per user
- Video path structure: `{user_id}/{uuid}.{ext}` (ownership validated by path prefix)
