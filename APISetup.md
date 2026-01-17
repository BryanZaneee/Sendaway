# Sendaway API Setup Checklist

Use this file to track external service configuration progress.

## Quick Start: Seed Test Data

```bash
npx tsx scripts/seed-test-data.ts
```

This creates a test user (`sendaway.test+user1@gmail.com` / `TestPass123!`) and 6 test messages. See [Section 7](#7-test-data--seeding) for details.

---

## 1. Supabase Auth Configuration

- [ ] **Disable email confirmation** (for development)
  - Go to [Auth Providers](https://supabase.com/dashboard/project/brxcirhbtgwdevkaeebc/auth/providers)
  - Under Email, toggle OFF "Confirm email"

- [ ] **Confirm test user** (if email confirmation stays enabled)
  - Go to [Auth Users](https://supabase.com/dashboard/project/brxcirhbtgwdevkaeebc/auth/users)
  - Find `sendaway.test+user1@gmail.com` → Confirm user

---

## 2. Stripe Setup

- [ ] **Create Stripe account** at [stripe.com](https://stripe.com)
- [ ] **Get API keys**
  - Go to Developers → [API keys](https://dashboard.stripe.com/test/apikeys)
  - Copy **Secret key** (`sk_test_...`)
- [ ] **Create webhook endpoint**
  - Go to Developers → [Webhooks](https://dashboard.stripe.com/test/webhooks)
  - Add endpoint: `https://brxcirhbtgwdevkaeebc.supabase.co/functions/v1/webhook-stripe`
  - Select event: `checkout.session.completed`
  - Copy **Signing secret** (`whsec_...`)
- [ ] **Create Pro price** (optional - for upgrade flow)
  - Go to Products → Create product
  - Add price, copy **Price ID** (`price_...`)

---

## 3. Email Service Setup

Choose one option:

### Option A: Resend (Recommended)
- [ ] **Create account** at [resend.com](https://resend.com)
- [ ] **Verify domain** (or use test domain for dev)
- [ ] **Create API key** → Copy (`re_...`)
- [ ] **Note sender email** (e.g., `noreply@yourdomain.com`)

### Option B: SendGrid
- [ ] **Create account** at [sendgrid.com](https://sendgrid.com)
- [ ] **Verify sender identity**
- [ ] **Create API key** → Copy (`SG...`)
- [ ] Update `process-delivery/index.ts` to use SendGrid API

### Option C: Gmail SMTP (Dev only)
- [ ] **Enable 2FA** on Gmail account
- [ ] **Create App Password**: Google Account → Security → App passwords
- [ ] Update `process-delivery/index.ts` to use nodemailer with SMTP

---

## 4. Cron Job Setup

- [ ] **Create account** at [cron-job.org](https://cron-job.org)
- [ ] **Generate CRON_SECRET**: Run `openssl rand -hex 32`
- [ ] **Create cron job**
  - URL: `https://brxcirhbtgwdevkaeebc.supabase.co/functions/v1/process-delivery`
  - Method: POST
  - Schedule: Daily at 8:00 AM (or preferred time)
  - Headers: `Authorization: Bearer <CRON_SECRET>`

---

## 5. Supabase Edge Function Secrets

After completing the above, set all secrets:

```bash
supabase secrets set --project-ref brxcirhbtgwdevkaeebc \
  STRIPE_SECRET_KEY="sk_test_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  RESEND_API_KEY="re_..." \
  FROM_EMAIL="noreply@yourdomain.com" \
  SUPABASE_URL="https://brxcirhbtgwdevkaeebc.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
  CRON_SECRET="<generated-secret>" \
  APP_URL="http://localhost:5173"
```

To get your **Service Role Key**:
- Go to [API Settings](https://supabase.com/dashboard/project/brxcirhbtgwdevkaeebc/settings/api)
- Copy `service_role` key (keep secret!)

---

## 6. Deploy Edge Functions

```bash
supabase functions deploy --project-ref brxcirhbtgwdevkaeebc
```

---

## 7. Test Data & Seeding

### How the Seed Script Works

The seed script (`scripts/seed-test-data.ts`) creates test data for UI verification:

1. **Reads `.env.local`** to get Supabase URL and anon key
2. **Creates/signs in a test user** via Supabase Auth
3. **Deletes existing test messages** (for idempotency - safe to run multiple times)
4. **Inserts 6 test messages** with different scenarios

### Test Data Created

| # | Description | Date | Status | Purpose |
|---|-------------|------|--------|---------|
| 1 | Long text message | +30 days | pending | Card truncation test |
| 2 | Short message | +3 days | pending | Near-future countdown |
| 3 | Video message | +14 days | pending | Video indicator display |
| 4 | Delivered message | -7 days | delivered | Unlocked state |
| 5 | Unlocks today | today | pending | Zero countdown edge case |
| 6 | Failed delivery | -3 days | failed | Error state display |

### Running Against Remote Supabase (Development)

This is the default configuration. Your `.env.local` points to the hosted Supabase project.

```bash
# 1. Ensure .env.local has the remote Supabase URL
cat .env.local | grep VITE_SUPABASE_URL
# Should show: https://brxcirhbtgwdevkaeebc.supabase.co

# 2. Run the seed script
npx tsx scripts/seed-test-data.ts
```

**Prerequisites:**
- [ ] Email confirmation disabled in Supabase Dashboard, OR
- [ ] Test user manually confirmed in Auth > Users

### Running Against Local Supabase

For fully offline development, you can run Supabase locally:

```bash
# 1. Start local Supabase (requires Docker)
supabase start

# 2. Get local credentials (printed after start)
# API URL: http://127.0.0.1:54321
# anon key: eyJ...

# 3. Create .env.local.local (or temporarily edit .env.local)
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key>

# 4. Run seed script
npx tsx scripts/seed-test-data.ts

# 5. Access local Supabase Studio
open http://127.0.0.1:54323
```

**Note:** Local Supabase has email confirmation disabled by default.

### Custom Test User

Override the default test credentials via environment variables:

```bash
TEST_EMAIL="myemail@gmail.com" TEST_PASSWORD="MyPass123!" npx tsx scripts/seed-test-data.ts
```

### Verification Checklist

- [ ] **Run seed script** (after auth is configured)
  ```bash
  npx tsx scripts/seed-test-data.ts
  ```
- [ ] **Start dev server**
  ```bash
  npm run dev
  ```
- [ ] **Sign in** with: `sendaway.test+user1@gmail.com` / `TestPass123!`
- [ ] **Verify UI displays:**
  - [ ] Pending messages show "Unlocks [DATE]" badge (yellow)
  - [ ] Long message text truncates properly
  - [ ] Video message shows indicator
  - [ ] Delivered message shows unlocked/green state
  - [ ] "Today" message shows correct countdown (0 or unlocked)
  - [ ] Failed message has error styling

---

## Quick Status Check

```bash
# Check configured secrets
supabase secrets list --project-ref brxcirhbtgwdevkaeebc

# Check deployed functions
supabase functions list --project-ref brxcirhbtgwdevkaeebc
```

---

## Summary

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| Stripe | Payments | Test mode free |
| Resend | Email delivery | 100/day |
| cron-job.org | Daily trigger | Free |
| Supabase | Database, Auth, Functions | 50k MAU, 500MB |
