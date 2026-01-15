# Sendaway Implementation Plan

## Overview

Complete the Sendaway future-message application by implementing: Stripe payment Edge Functions for Pro upgrades, scheduled email delivery via Resend, and an integrated "Your Messages" dashboard that replaces landing page content after user sign-in. The dashboard displays scheduled messages in a locked state with countdown timers until delivery date.

**Approach**: Hybrid - Use Stripe SDK and Resend SDK in Edge Functions for type safety and cleaner code. Maintain vanilla TypeScript consistency for frontend components.

## Planning Context

### Decision Log

| Decision | Reasoning Chain | Backing |
|----------|-----------------|---------|
| Pro tier: $9, 2GB storage, unlimited messages | User confirmed business policy -> one-time payment model simpler than subscription -> 2GB sufficient for multiple 3-min videos | user-specified |
| Free tier: 1 message total, no video | User confirmed limit -> encourages upgrade to Pro -> text-only reduces storage costs | user-specified |
| Video URL expiry: 7 days | User specified -> longer than 24h gives flexibility -> regenerates on subsequent views if expired | user-specified |
| Video download option | User requested -> allows permanent copy of message -> improves UX for important memories | user-specified |
| Max video size: 2GB (full quota) | User confirmed -> 3-min limit enforced client-side prevents abuse -> single large video acceptable | user-specified |
| Message text limit: 4000 chars | Initial specification -> sufficient for meaningful messages -> prevents storage abuse | user-specified |
| Stripe SDK over raw fetch | SDK provides type safety + webhook signature verification built-in -> reduces boilerplate and security risks -> official Deno support available | doc-derived |
| Resend SDK for email | Resend has excellent Deno/Edge support -> simpler than raw API calls -> includes retry logic and delivery tracking | doc-derived |
| Integrated dashboard over separate page | User requested integrated view -> landing content irrelevant after sign-in -> single-page experience improves UX | user-specified |
| Countdown timer client-side | Server-side would require constant polling -> client-side JS can update every second -> reduces server load and provides real-time feedback | default-derived |
| 1-second countdown interval | Standard for countdowns -> 100ms too frequent (performance), 5s too slow (UX) -> 1s balances smoothness with efficiency | default-derived |
| Delete only for pending messages | Users should be able to cancel future messages -> delivered messages are immutable -> aligns with existing RLS policy | doc-derived |
| Webhook-based payment confirmation | Stripe checkout redirects are not reliable for confirming payment -> webhook provides guaranteed delivery -> Edge Function updates user tier atomically | doc-derived |
| 8 AM UTC delivery time | User specified in planning phase -> simplifies cron scheduling -> single daily job processes all due messages | user-specified |
| Property-based testing | User confirmed preference -> covers edge cases in countdown logic -> fewer tests needed for comprehensive coverage | user-specified |
| cron-job.org for scheduling | Free tier supports daily jobs -> no infrastructure to manage -> HTTP trigger fits Edge Function model -> alternatives (GitHub Actions, Cloud Scheduler) require more setup | default-derived |
| Neo-brutalist email template | Brand consistency with web UI -> high contrast improves accessibility -> pastel colors match app aesthetic | doc-derived |
| Batch size: 30 messages per run | Resend free tier 1/second rate limit + Edge Function 60s timeout -> 45s execution + 15s buffer for Edge Function 60s timeout -> BATCH_SIZE=30 leaves additional margin for API latency, DB queries, signed URL generation -> unprocessed messages picked up by next cron run (8 AM next day or manual trigger) | default-derived |
| Sequential email sending | Resend free tier: 100 emails/day, 1/second rate limit -> sequential respects limits -> parallel would hit rate limits | doc-derived |
| checkout_session_id storage | Enables reconciliation if webhook fails -> required for refund processing -> Stripe recommends for audit trail | doc-derived |
| Cron secret header auth | Simpler than API key management -> Edge Function secrets auto-injected -> IP whitelist unreliable for cron services | default-derived |
| Message preview: 100 chars | User confirmed -> sufficient to identify message -> consistent with common UX patterns (email previews) | user-specified |
| setInterval cleanup on modal close | Prevent memory leaks -> standard React-style cleanup pattern -> clearInterval in hide() method | default-derived |
| Delete confirmation: native confirm() | Simplest implementation -> consistent with browser UX -> modal-in-modal adds complexity | default-derived |
| Video URL caching in modal | URLs valid 7 days -> cache in modal instance (signedUrl, urlExpiresAt) to avoid redundant SDK calls during single viewing session -> regenerate if urlExpiresAt < now -> cache persists across hide/show calls within same modal instance lifecycle -> only cleared when app closes/reloads -> reduces Supabase API calls | default-derived |
| Video missing fallback | Show error message "Video unavailable" -> hide video player element -> don't break message display | default-derived |
| Free message optimistic locking | UPDATE profiles SET free_message_used = true WHERE free_message_used = false RETURNING * -> prevents race condition from concurrent requests -> no rows returned = already used | default-derived |
| Storage quota compensating transaction | If update_storage_used RPC fails after upload -> immediately delete uploaded video -> prevents quota drift from partial failures | default-derived |
| URL caching in modal state | Store signedUrl and urlExpiresAt -> check expiry before rendering -> regenerate if expired -> avoids redundant SDK calls | default-derived |
| Delivery batch lock | INSERT INTO delivery_batch_locks prevents concurrent process-delivery execution -> ensures single-process delivery -> prevents duplicate emails from simultaneous cron triggers | default-derived |
| Batch lock trigger mechanism | Trigger-based single-row enforcement chosen over SELECT FOR UPDATE (adds contention, requires transaction management unsuitable for Edge Functions) and UNIQUE constraint with ON CONFLICT (requires deterministic primary key, complicates lock release). Trigger returns NULL to silently reject duplicates, making lock acquisition idempotent. | default-derived |
| delivery_logs as source of truth | Check delivery_logs before sending email -> if already delivered, skip even if messages.status='pending' -> prevents duplicates from DB update failures | default-derived |
| delivery_logs status values | 'pending' (before send), 'delivered' (success), 'sent' (Resend accepted), 'bounced' (email bounced), 'failed' (error) -> expanded from original schema to support idempotency tracking | default-derived |
| Webhook idempotency: check any status | Query WHERE checkout_session_id=? without status filter -> handles both duplicate webhooks AND interrupted transactions -> resume pending rows instead of creating duplicates | default-derived |
| Batch lock release error handling | Wrap DELETE in try-catch, log critical error with structured JSON if fails -> enables alerting and manual intervention -> prevents silent permanent delivery halt | default-derived |
| Sequential delay mechanism | setTimeout 1000ms between sendMessage calls -> Resend free tier enforces 1/second rate limit -> simple delay chosen over rate-limiting library for transparency | default-derived |
| processMessageBatch extraction | Separate business logic (message delivery) from infrastructure (lock, auth, query) -> improves testability -> reduces main function complexity | default-derived |
| buildDeliveryEmail error severity | Null/undefined text defaults to empty string (email can render without text), malformed email throws ValidationError (cannot send without valid recipient). Rule: Degrade gracefully for display issues, fail fast for delivery blockers. | default-derived |
| Delivery log retention: 90 days | User confirmed -> balances privacy (no indefinite PII storage) with support needs (90 days enough for debugging) -> storage costs minimal | user-specified |
| Pagination: 10 messages per page | User confirmed -> faster initial load -> most users expected to have <10 messages -> can increase if feedback indicates need | user-specified |

### Rejected Alternatives

| Alternative | Why Rejected |
|-------------|--------------|
| Separate view.html page | User requested integrated experience where landing page becomes dashboard after login |
| Raw fetch for Stripe API | SDK provides signature verification, type safety, and cleaner error handling |
| Real-time WebSocket for countdown | Overkill for client-side timer that only needs to update display -> adds infrastructure complexity |
| Server-side countdown rendering | Would require constant page refreshes or polling -> client-side timer is standard practice |

### Constraints & Assumptions

**Technical:**
- Supabase Edge Functions use Deno runtime
- Stripe checkout is one-time payment ($9 for Pro), not subscription
- Email delivery at 8 AM UTC daily via cron-job.org trigger
- Video playback uses signed URLs with 7-day expiry (user-specified)
- Messages cannot be edited after creation, only deleted while pending
- Batch size: 30 messages per delivery run (45s execution + 15s buffer for Edge Function 60s timeout)

**Business (user-confirmed):**
- Free tier: 1 text message total, no video, no storage
- Pro tier: $9 one-time, unlimited messages, video support, 2GB storage
- Message text: max 4000 characters
- Video: max 3 minutes, max 2GB file size (full quota allowed)
- Video access: 7-day URL expiry, in-app viewing, download option

**Default conventions applied:**
- `<default-conventions domain="testing">`: Property-based for unit tests, real dependencies for integration
- `<default-conventions domain="file-creation">`: Extend existing files when possible

### Additional Policies

| Policy | Value | Backing |
|--------|-------|---------|
| Stripe checkout session timeout | 30 minutes (Stripe default) | default-derived |
| Payment status transitions | pending -> completed OR pending -> failed OR completed -> refunded | doc-derived |
| Delivery log retention | 90 days (user confirmed for privacy/storage balance) | user-specified |
| Pagination limit | 10 messages per page (user confirmed for faster initial load) | user-specified |
| Manual retry for failed emails | Accepted - low volume expected, automated retry adds complexity | user-specified |

### Known Risks

| Risk | Mitigation | Anchor |
|------|------------|--------|
| Stripe webhook signature bypass | Verify signature using Stripe SDK constructEvent | Edge Function implementation |
| Email delivery failure | Log to delivery_logs table, update status to 'failed', support manual retry (user accepted) | 001_initial_schema.sql:L74-L84 |
| Countdown timer timezone confusion | Display "Unlocks on [date]" alongside countdown for clarity | UI design |
| Large message list performance | Paginate with limit 10, load more on scroll (user-confirmed, implemented in M3) | Initial implementation covers expected usage |
| messages.status update failure after successful delivery | Log inconsistency for manual reconciliation, idempotency prevents duplicate delivery, delivery_logs is source of truth | process-delivery implementation |
| Storage quota drift from failed compensating transaction | Log error for manual reconciliation, consider periodic storage audit job | video.service.ts upload flow |
| Batch lock release failure | Log critical error with structured JSON, alert operations team, manual DELETE required to clear lock | process-delivery implementation |
| Edge Function hard timeout (60s) | Monitor execution time, set up alerting for >50s execution, if finally block doesn't execute due to hard kill, batch lock remains - same manual cleanup as batch lock release failure | process-delivery implementation |

## Invisible Knowledge

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Vite + TS)                    │
├─────────────────────────────────────────────────────────────┤
│  index.html                                                 │
│    ├── Hero (message form) - always visible                │
│    ├── Landing sections - hidden after login               │
│    └── Your Messages dashboard - shown after login          │
│         └── Message cards (locked/unlocked)                │
│              └── Locked detail view (countdown)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE EDGE FUNCTIONS                   │
├─────────────────────────────────────────────────────────────┤
│  create-checkout    │ Creates Stripe checkout session       │
│  webhook-stripe     │ Handles payment confirmation          │
│  process-delivery   │ Sends due messages via Resend         │
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

### Data Flow

```
Payment Flow:
  User clicks "Go Pro" -> create-checkout -> Stripe Checkout
  User pays -> Stripe webhook -> webhook-stripe -> Update profiles.tier

Message Flow:
  User submits form -> messages table (status='pending')
  Cron triggers -> process-delivery -> Query pending due today
  For each: Generate signed URL -> Send via Resend -> Update status='delivered'

Dashboard Flow:
  User signs in -> Fetch messages -> Display cards
  User clicks locked card -> Show countdown detail
  User clicks unlocked card -> Show message content + video
```

### Why This Structure

- Edge Functions grouped by responsibility (payment, delivery)
- Dashboard component integrated into main app to avoid separate routing
- Services remain singletons for state consistency
- Message detail views are modal-based (consistent with existing auth/plan modals)

### Invariants

- Messages can only be deleted while status='pending' (RLS enforced)
- Storage used must be updated atomically with video upload/delete. **Compensating transaction**: If `update_storage_used` RPC fails after video upload completes, immediately delete the uploaded video via `supabase.storage.from('message-videos').remove([filePath])`. If compensating delete also fails, log error with message_id and video_storage_path to application monitoring (console.error with structured JSON) for manual reconciliation. Consider periodic storage audit job to detect and fix quota drift.
- Stripe webhook must verify signature before processing
- Delivery token is immutable once message is created
- Free message limit uses optimistic locking: UPDATE profiles SET free_message_used = true WHERE id = user.id AND free_message_used = false RETURNING *. If no rows returned, reject with 'free message already used' error. Perform BEFORE inserting message.
- Only one process-delivery execution can run at a time (enforced via delivery_batch_locks table with row-level locking)
- delivery_logs is the source of truth for delivery status. Before sending email, check if delivery_logs has status='delivered' for this message_id. messages.status is derived state that mirrors delivery_logs for query performance.

### Tradeoffs

- Client-side countdown: Real-time updates vs. potential clock drift (acceptable)
- Integrated dashboard: More complex index.html vs. separate page routing
- Daily delivery batch: Simpler cron vs. per-message scheduling precision

## Milestones

### Milestone 1: Stripe Edge Functions

**Files**:
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/webhook-stripe/index.ts`

**Flags**: `security`, `error-handling`

**Requirements**:
- create-checkout: Accept productType and userId, create Stripe checkout session, return session URL
- webhook-stripe: Verify Stripe signature, handle checkout.session.completed event, update user tier to 'pro', set storage_limit_bytes to 2GB, log payment to payments table

**Acceptance Criteria**:
- create-checkout returns valid Stripe checkout URL
- webhook-stripe rejects invalid signatures with 400
- webhook-stripe updates profiles.tier to 'pro' on successful payment
- webhook-stripe sets storage_limit_bytes to 2147483648 (2GB)
- Payment logged to payments table with status='completed'

**Tests**:
- **Test files**: `supabase/functions/create-checkout/index.test.ts`, `supabase/functions/webhook-stripe/index.test.ts`
- **Test type**: integration
- **Backing**: user-specified
- **Dependencies**: Real Supabase (local via supabase start), mocked Stripe API (external service boundary)
- **Rationale**: Stripe is external service - mock at boundary. Database operations use real Supabase for accurate RLS testing.
- **Scenarios**:
  - Normal: Valid checkout creation, valid webhook processing
  - Edge: Already pro user attempts upgrade, duplicate webhook event
  - Error: Invalid signature, missing userId, Stripe API failure

**Code Intent**:
- `create-checkout/index.ts`:
  - Import Stripe SDK from esm.sh
  - Validate request body has productType ('pro_upgrade') and userId
  - Check if user already Pro (reject with 400 if so)
  - Create Stripe checkout session with price $9.00 USD (mode: 'payment')
  - Include userId in session metadata for webhook
  - Set success_url and cancel_url to APP_URL with query params
  - Insert payment record with status='pending', checkout_session_id
  - Return { url: session.url }
  - Error handling: Return 400 for validation errors, 500 for Stripe API errors

- `webhook-stripe/index.ts`:
  - Import Stripe SDK, verify signature using stripe.webhooks.constructEvent()
  - Return 400 immediately if signature invalid (Decision: webhook signature verification)
  - Handle only 'checkout.session.completed' event (ignore others with 200)
  - Extract userId from session.metadata, checkout_session_id from session.id
  - **Idempotency check (MUST before any updates)**: Query payments table WHERE checkout_session_id = session.id (no status filter). If row exists with status='completed', return 200 immediately (already processed). If row exists with status='pending', UPDATE status='completed' and proceed with tier upgrade (resume interrupted transaction). If no row exists, INSERT new payment row with status='pending' first, then proceed. This handles both duplicate webhooks and interrupted transactions.
  - Use service role client to update profiles table: tier='pro', storage_limit_bytes=2147483648
  - Update payments table: status='completed', stripe_payment_intent_id
  - Return 200 on success

**Code Changes**:

```diff
--- /dev/null
+++ supabase/functions/create-checkout/index.ts
@@ -0,0 +1,102 @@
+import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
+import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
+import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno';
+
+const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
+  apiVersion: '2023-10-16',
+  httpClient: Stripe.createFetchHttpClient(),
+});
+
+const corsHeaders = {
+  'Access-Control-Allow-Origin': '*',
+  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
+};
+
+serve(async (req: Request) => {
+  if (req.method === 'OPTIONS') {
+    return new Response('ok', { headers: corsHeaders });
+  }
+
+  try {
+    const { productType, userId } = await req.json();
+
+    if (!productType || !userId) {
+      return new Response(
+        JSON.stringify({ error: 'Missing productType or userId' }),
+        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
+      );
+    }
+
+    if (productType !== 'pro_upgrade') {
+      return new Response(
+        JSON.stringify({ error: 'Invalid product type' }),
+        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
+      );
+    }
+
+    const supabaseAdmin = createClient(
+      Deno.env.get('SUPABASE_URL')!,
+      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
+    );
+
+    const { data: profile, error: profileError } = await supabaseAdmin
+      .from('profiles')
+      .select('tier')
+      .eq('id', userId)
+      .single();
+
+    if (profileError || !profile) {
+      return new Response(
+        JSON.stringify({ error: 'User not found' }),
+        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
+      );
+    }
+
+    if (profile.tier === 'pro') {
+      return new Response(
+        JSON.stringify({ error: 'User is already Pro' }),
+        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
+      );
+    }
+
+    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
+    const session = await stripe.checkout.sessions.create({
+      mode: 'payment',
+      payment_method_types: ['card'],
+      line_items: [
+        {
+          price_data: {
+            currency: 'usd',
+            product_data: {
+              name: 'Sendaway Pro',
+              description: 'Unlimited messages, video support, 2GB storage',
+            },
+            unit_amount: 900,
+          },
+          quantity: 1,
+        },
+      ],
+      metadata: {
+        userId,
+        productType,
+      },
+      success_url: `${appUrl}?success=true`,
+      cancel_url: `${appUrl}?canceled=true`,
+    });
+
+    // Payment record enables webhook idempotency and refund processing
+    const { error: paymentError } = await supabaseAdmin
+      .from('payments')
+      .insert({
+        user_id: userId,
+        stripe_checkout_session_id: session.id,
+        amount_cents: 900,
+        currency: 'usd',
+        product_type: 'pro_upgrade',
+        status: 'pending',
+      });
+
+    if (paymentError) {
+      console.error('Failed to create payment record:', paymentError);
+      // Webhook handles record creation if this insert fails
+    }
+
+    return new Response(
+      JSON.stringify({ url: session.url }),
+      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
+    );
+  } catch (error) {
+    console.error('Checkout error:', error);
+    return new Response(
+      JSON.stringify({ error: 'Failed to create checkout session' }),
+      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
+    );
+  }
+});
```

```diff
--- /dev/null
+++ supabase/functions/webhook-stripe/index.ts
@@ -0,0 +1,137 @@
+import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
+import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
+import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno';
+
+const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
+  apiVersion: '2023-10-16',
+  httpClient: Stripe.createFetchHttpClient(),
+});
+
+const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
+
+serve(async (req: Request) => {
+  const signature = req.headers.get('stripe-signature');
+
+  if (!signature) {
+    return new Response(
+      JSON.stringify({ error: 'Missing stripe-signature header' }),
+      { status: 400, headers: { 'Content-Type': 'application/json' } }
+    );
+  }
+
+  const body = await req.text();
+  let event: Stripe.Event;
+
+  try {
+    event = await stripe.webhooks.constructEventAsync(
+      body,
+      signature,
+      endpointSecret
+    );
+  } catch (err) {
+    console.error('Webhook signature verification failed:', err);
+    return new Response(
+      JSON.stringify({ error: 'Invalid signature' }),
+      { status: 400, headers: { 'Content-Type': 'application/json' } }
+    );
+  }
+
+  if (event.type !== 'checkout.session.completed') {
+    return new Response(
+      JSON.stringify({ received: true, ignored: event.type }),
+      { status: 200, headers: { 'Content-Type': 'application/json' } }
+    );
+  }
+
+  const session = event.data.object as Stripe.Checkout.Session;
+  const userId = session.metadata?.userId;
+  const checkoutSessionId = session.id;
+  const paymentIntentId = session.payment_intent as string;
+
+  if (!userId) {
+    console.error('Missing userId in session metadata');
+    return new Response(
+      JSON.stringify({ error: 'Missing userId in metadata' }),
+      { status: 400, headers: { 'Content-Type': 'application/json' } }
+    );
+  }
+
+  const supabaseAdmin = createClient(
+    Deno.env.get('SUPABASE_URL')!,
+    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
+  );
+
+  const { data: existingPayment } = await supabaseAdmin
+    .from('payments')
+    .select('*')
+    .eq('stripe_checkout_session_id', checkoutSessionId)
+    .single();
+
+  if (existingPayment) {
+    if (existingPayment.status === 'completed') {
+      console.log('Payment already processed:', checkoutSessionId);
+      return new Response(
+        JSON.stringify({ received: true, status: 'already_processed' }),
+        { status: 200, headers: { 'Content-Type': 'application/json' } }
+      );
+    }
+  } else {
+    const { error: insertError } = await supabaseAdmin
+      .from('payments')
+      .insert({
+        user_id: userId,
+        stripe_payment_intent_id: paymentIntentId,
+        stripe_checkout_session_id: checkoutSessionId,
+        amount_cents: 900,
+        currency: 'usd',
+        product_type: 'pro_upgrade',
+        status: 'pending',
+      });
+
+    if (insertError) {
+      console.error('Failed to insert payment record:', insertError);
+      return new Response(
+        JSON.stringify({ error: 'Failed to record payment' }),
+        { status: 500, headers: { 'Content-Type': 'application/json' } }
+      );
+    }
+  }
+
+  const { error: profileError } = await supabaseAdmin
+    .from('profiles')
+    .update({
+      tier: 'pro',
+      storage_limit_bytes: 2147483648,
+    })
+    .eq('id', userId);
+
+  if (profileError) {
+    console.error('Failed to update profile:', profileError);
+    // Returning 500 triggers Stripe's automatic webhook retry (exponential backoff, up to 3 days).
+    // Payment remains pending; tier upgrade is idempotent on retry.
+    await supabaseAdmin
+      .from('payments')
+      .update({
+        status: 'failed',
+        error_message: profileError.message
+      })
+      .eq('stripe_checkout_session_id', checkoutSessionId);
+
+    return new Response(
+      JSON.stringify({ error: 'Failed to provision Pro tier' }),
+      { status: 500, headers: { 'Content-Type': 'application/json' } }
+    );
+  }
+
+  const { error: paymentError } = await supabaseAdmin
+    .from('payments')
+    .update({
+      status: 'completed',
+      updated_at: new Date().toISOString(),
+    })
+    .eq('stripe_checkout_session_id', checkoutSessionId);
+
+  if (paymentError) {
+    console.error('Failed to update payment status:', paymentError);
+    // Payment status must match profile state for audit trail.
+    // Returning 500 triggers Stripe retry; profile update is idempotent.
+    return new Response(
+      JSON.stringify({ error: 'Failed to update payment status' }),
+      { status: 500, headers: { 'Content-Type': 'application/json' } }
+    );
+  }
+
+  return new Response(
+    JSON.stringify({ received: true, status: 'completed' }),
+    { status: 200, headers: { 'Content-Type': 'application/json' } }
+  );
+});
```

---

### Milestone 2: Scheduled Delivery Edge Function

**Files**:
- `supabase/migrations/004_delivery_batch_locks.sql`
- `supabase/functions/_shared/cron-auth.ts`
- `supabase/functions/process-delivery/index.ts`
- `supabase/functions/cleanup-logs/index.ts`

**Flags**: `error-handling`, `needs-rationale`

**Requirements**:
- Query messages where scheduled_date <= today AND status='pending'
- For each message: generate signed URL for video (if exists), compose email with Resend, update status to 'delivered' or 'failed'
- Verify cron secret header for authentication
- Log all delivery attempts to delivery_logs table
- Cleanup Edge Function to delete delivery_logs older than 90 days (user-specified retention policy)

**Acceptance Criteria**:
- Returns 401 for missing/invalid cron secret
- Sends email via Resend for each due message
- Updates message status to 'delivered' on success
- Updates message status to 'failed' on Resend error
- Logs attempt with email_provider_id from Resend response
- Video signed URLs expire in 7 days (user-specified)
- cleanup-logs removes logs where created_at < NOW() - INTERVAL '90 days'

**Tests**:
- **Test files**: `supabase/functions/process-delivery/index.test.ts`
- **Test type**: integration
- **Backing**: user-specified
- **Dependencies**: Real Supabase (local), mocked Resend API (external service boundary)
- **Rationale**: Resend is external service - mock at boundary. Database and storage operations use real Supabase.
- **Scenarios**:
  - Normal: Single message delivered successfully
  - Edge: Multiple messages in batch, message with video attachment
  - Error: Resend API failure, invalid cron secret

**Code Intent**:
- `supabase/migrations/004_delivery_batch_locks.sql`:
  - CREATE TABLE delivery_batch_locks (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), locked_at TIMESTAMPTZ DEFAULT NOW())
  - Single row table (max 1 row enforced by trigger)
  - Used for mutex lock during process-delivery execution

- `supabase/functions/_shared/cron-auth.ts`:
  - Export `verifyCronSecret(request: Request): boolean` function
  - Returns true if x-cron-secret header matches CRON_SECRET env var
  - Import and call from both process-delivery and cleanup-logs (DRY principle)

- `process-delivery/index.ts`:
  - Import verifyCronSecret from _shared/cron-auth.ts
  - Return 401 if verifyCronSecret(request) returns false
  - **Acquire batch lock**: INSERT INTO delivery_batch_locks (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING RETURNING id. If no row returned, another instance is processing - return 200 with { skipped: true, reason: 'concurrent execution' }
  - Query messages: scheduled_date <= CURRENT_DATE AND status='pending', LIMIT 30 (batch size)
  - Use service role client for database access
  - Record startTime = Date.now() before processing loop
  - **Extract helper**: `buildDeliveryEmail(message, videoUrl?): { subject, html }` - returns neo-brutalist HTML email. Input validation: if message.text is null/undefined, use empty string. If message.delivery_email is malformed (no @), throw ValidationError (caught by processMessageBatch, logged to delivery_logs with status='failed'). Never throw for recoverable formatting issues - degrade gracefully to ensure batch continues.
  - **Extract helper**: `sendMessage(message): Promise<{ success, emailProviderId?, error? }>` - handles single message delivery
  - **Extract helper**: `checkDeliveryIdempotency(messageId): Promise<boolean>` - SELECT FROM delivery_logs WHERE message_id=? AND status='delivered', returns true if already delivered
  - **Extract helper**: `delayForRateLimit(): Promise<void>` - await new Promise(resolve => setTimeout(resolve, 1000)) to enforce 1/s Resend limit
  - **Extract helper**: `processMessageBatch(messages, startTime): Promise<{delivered, failed, stoppedEarly}>` - orchestrates loop calling: checkDeliveryIdempotency, buildDeliveryEmail, sendMessage, delayForRateLimit. Handles early termination and counting. **Error handling**: Wrap each message iteration in try-catch block. Catch both buildDeliveryEmail ValidationError and sendMessage errors uniformly. On any error: UPDATE delivery_logs SET status='failed', error_message=?. Continue to next message to prevent batch termination from single message failure.
  - For each message in processMessageBatch (sequential processing with 1-second delay between sends via `await new Promise(resolve => setTimeout(resolve, 1000))` to respect Resend rate limit):
    - **Idempotency check**: SELECT * FROM delivery_logs WHERE message_id = ? AND status = 'delivered'. If row exists, skip this message (already delivered).
    - **Early termination**: If Date.now() - startTime > 45000 (45s), stop processing and return. Remaining messages picked up by next cron run.
    - **Log pending**: INSERT INTO delivery_logs (message_id, attempt_number, status) VALUES (?, ?, 'pending')
    - Generate signed video URL if video_storage_path exists (7-day expiry)
    - Call buildDeliveryEmail() for HTML composition
    - Call sendMessage() which sends via Resend API with from: 'Sendaway <noreply@[domain]>'
    - On success: UPDATE delivery_logs SET status='delivered', email_provider_id=? WHERE message_id=? AND attempt_number=?; then UPDATE messages SET status='delivered', delivered_at=NOW() WHERE id=?. **If messages UPDATE fails but delivery_logs succeeded**: Log error with message_id to console.error for manual reconciliation. Dashboard will show incorrect 'pending' state but idempotency prevents duplicate delivery on next cron run.
    - On failure: UPDATE delivery_logs SET status='failed', error_message=? WHERE message_id=? AND attempt_number=?; then UPDATE messages SET status='failed' WHERE id=?
  - Main function orchestration (after helpers): (1) verifyCronSecret, (2) acquire batch lock, (3) query messages, (4) startTime = Date.now(), (5) result = await processMessageBatch(messages, startTime), (6) release lock in finally
  - **Release batch lock**: DELETE FROM delivery_batch_locks (always, even on error via try/finally). In finally block: wrap DELETE in try-catch. **If DELETE fails**: Log critical error with structured JSON { event: 'BATCH_LOCK_RELEASE_FAILED', lock_id, timestamp, error } to console.error. This indicates manual intervention required - run: DELETE FROM delivery_batch_locks to clear stale lock. Set up alerting on 'BATCH_LOCK_RELEASE_FAILED' log pattern to notify operations team immediately.
  - Return result from processMessageBatch: { processed: count, delivered: successCount, failed: failCount, stoppedEarly: boolean }

- `cleanup-logs/index.ts`:
  - Import verifyCronSecret from _shared/cron-auth.ts
  - Return 401 if verifyCronSecret(request) returns false
  - DELETE FROM delivery_logs WHERE created_at < NOW() - INTERVAL '90 days'
  - Return { deleted: count }
  - Schedule via cron-job.org weekly (Sundays at 3 AM UTC)

**Code Changes**:

```diff
--- /dev/null
+++ supabase/migrations/004_delivery_batch_locks.sql
@@ -0,0 +1,25 @@
+-- Delivery Batch Locks Table
+-- Serializes process-delivery execution via single-row constraint
+-- Trigger rejects INSERT if row exists; DELETE releases lock
+
+CREATE TABLE IF NOT EXISTS public.delivery_batch_locks (
+  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
+  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
+);
+
+-- Trigger to ensure only one row exists
+CREATE OR REPLACE FUNCTION public.enforce_single_batch_lock()
+RETURNS TRIGGER
+LANGUAGE plpgsql
+AS $$
+BEGIN
+  IF (SELECT COUNT(*) FROM public.delivery_batch_locks) > 0 THEN
+    RETURN NULL; -- Prevent insert
+  END IF;
+  RETURN NEW;
+END;
+$$;
+
+CREATE TRIGGER enforce_single_batch_lock_trigger
+  BEFORE INSERT ON public.delivery_batch_locks
+  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_batch_lock();
```

```diff
--- /dev/null
+++ supabase/functions/_shared/cron-auth.ts
@@ -0,0 +1,11 @@
+/**
+ * Verify cron secret header for authentication
+ * Guards process-delivery and cleanup-logs from unauthorized invocation
+ */
+export function verifyCronSecret(request: Request): boolean {
+  const cronSecret = Deno.env.get('CRON_SECRET');
+  if (!cronSecret) {
+    return false;
+  }
+  return request.headers.get('x-cron-secret') === cronSecret;
+}
```

```diff
--- /dev/null
+++ supabase/functions/process-delivery/index.ts
@@ -0,0 +1,272 @@
+import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
+import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
+import { Resend } from 'https://esm.sh/resend@2.1.0';
+import { verifyCronSecret } from '../_shared/cron-auth.ts';
+
+const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);
+const BATCH_SIZE = 30;
+// 45s timeout with 15s buffer for 60s Edge Function limit.
+// BATCH_SIZE=30 leaves margin for DB/API latency at 1 msg/s rate.
+const TIMEOUT_MS = 45000;
+const RATE_LIMIT_DELAY_MS = 1000;
+
+class ValidationError extends Error {
+  constructor(message: string) {
+    super(message);
+    this.name = 'ValidationError';
+  }
+}
+
+interface Message {
+  id: string;
+  user_id: string;
+  message_text: string;
+  video_storage_path: string | null;
+  delivery_email: string;
+  scheduled_date: string;
+  delivery_token: string;
+}
+
+interface BatchResult {
+  processed: number;
+  delivered: number;
+  failed: number;
+  stoppedEarly: boolean;
+}
+
+/**
+ * Returns true if email contains '@' symbol
+ */
+function validateEmail(email: string): boolean {
+  return email?.includes('@') ?? false;
+}
+
+/**
+ * Build neo-brutalist HTML email.
+ * Throws ValidationError if delivery_email lacks '@' symbol.
+ * Null/undefined message_text defaults to empty string.
+ */
+function buildDeliveryEmail(
+  message: Message,
+  videoUrl?: string | null
+): { subject: string; html: string } {
+  if (!validateEmail(message.delivery_email)) {
+    throw new ValidationError(`Invalid delivery email: ${message.delivery_email}`);
+  }
+
+  const messageText = message.message_text ?? '';
+  const appUrl = Deno.env.get('APP_URL') || 'https://sendaway.app';
+
+  const subject = 'Your Sendaway message has arrived!';
+
+  const html = `
+<!DOCTYPE html>
+<html>
+<head>
+  <meta charset="utf-8">
+  <meta name="viewport" content="width=device-width, initial-scale=1.0">
+  <title>Your Sendaway Message</title>
+</head>
+<body style="margin: 0; padding: 0; background-color: #FFFDF7; font-family: 'Helvetica Neue', Arial, sans-serif;">
+  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FFFDF7; padding: 40px 20px;">
+    <tr>
+      <td align="center">
+        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #FFFFFF; border: 3px solid #000000; border-radius: 8px; box-shadow: 8px 8px 0px 0px #000000;">
+          <!-- Header -->
+          <tr>
+            <td style="background: #FDE68A; padding: 30px; border-bottom: 3px solid #000000; border-radius: 5px 5px 0 0;">
+              <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #000000; text-transform: uppercase;">
+                SENDAWAY
+              </h1>
+              <p style="margin: 10px 0 0 0; font-size: 16px; color: #333333;">
+                Your message from the past has arrived!
+              </p>
+            </td>
+          </tr>
+          <!-- Content -->
+          <tr>
+            <td style="padding: 30px;">
+              <div style="background: #F9F9F9; border: 2px solid #000000; border-radius: 8px; padding: 25px; margin-bottom: 20px;">
+                <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #000000; white-space: pre-wrap;">${messageText}</p>
+              </div>
+              ${videoUrl ? `
+              <div style="background: #BAE6FD; border: 2px solid #000000; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">
+                <p style="margin: 0 0 15px 0; font-weight: 700; color: #000000;">Video Message Attached</p>
+                <a href="${videoUrl}" style="display: inline-block; background: #BBF7D0; color: #000000; text-decoration: none; padding: 12px 24px; border: 2px solid #000000; border-radius: 8px; font-weight: 700; box-shadow: 4px 4px 0px 0px #000000;">
+                  Watch Video
+                </a>
+                <p style="margin: 15px 0 0 0; font-size: 12px; color: #555555;">
+                  Video link expires in 7 days
+                </p>
+              </div>
+              ` : ''}
+            </td>
+          </tr>
+          <!-- Footer -->
+          <tr>
+            <td style="background: #F5F5F5; padding: 20px 30px; border-top: 2px solid #000000; border-radius: 0 0 5px 5px;">
+              <p style="margin: 0; font-size: 14px; color: #555555; text-align: center;">
+                Sent with love from your past self via <a href="${appUrl}" style="color: #000000; font-weight: 700;">Sendaway</a>
+              </p>
+            </td>
+          </tr>
+        </table>
+      </td>
+    </tr>
+  </table>
+</body>
+</html>
+  `;
+
+  return { subject, html };
+}
+
+/**
+ * Returns true if delivery_logs contains 'delivered' status for message_id
+ */
+async function checkDeliveryIdempotency(
+  supabase: ReturnType<typeof createClient>,
+  messageId: string
+): Promise<boolean> {
+  const { data } = await supabase
+    .from('delivery_logs')
+    .select('id')
+    .eq('message_id', messageId)
+    .eq('status', 'delivered')
+    .single();
+
+  return data !== null;
+}
+
+/**
+ * Delays execution by RATE_LIMIT_DELAY_MS (1000ms) to respect Resend 1/s limit
+ */
+function delayForRateLimit(): Promise<void> {
+  return new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
+}
+
+interface SendMessageResult {
+  success: boolean;
+  emailProviderId?: string;
+  error?: string;
+}
+
+/**
+ * Send a single message via Resend.
+ * Returns success status and email provider ID on success, or error message on failure.
+ */
+async function sendMessage(
+  message: Message,
+  subject: string,
+  html: string,
+  fromEmail: string
+): Promise<SendMessageResult> {
+  try {
+    const { data: emailData, error: emailError } = await resend.emails.send({
+      from: fromEmail,
+      to: message.delivery_email,
+      subject,
+      html,
+    });
+
+    if (emailError) {
+      return { success: false, error: emailError.message };
+    }
+
+    return { success: true, emailProviderId: emailData?.id };
+  } catch (error) {
+    return {
+      success: false,
+      error: error instanceof Error ? error.message : 'Unknown error',
+    };
+  }
+}
+
+interface PrepareResult {
+  skip: boolean;
+  attemptNumber: number;
+}
+
+/**
+ * Performs idempotency check, calculates attempt number, inserts pending log.
+ * Returns skip=true if message already delivered, otherwise returns attempt number.
+ */
+async function prepareDelivery(
+  supabase: ReturnType<typeof createClient>,
+  messageId: string
+): Promise<PrepareResult> {
+  if (await checkDeliveryIdempotency(supabase, messageId)) {
+    return { skip: true, attemptNumber: 0 };
+  }
+
+  const { count } = await supabase
+    .from('delivery_logs')
+    .select('*', { count: 'exact', head: true })
+    .eq('message_id', messageId);
+
+  const attemptNumber = (count || 0) + 1;
+
+  const { error: insertError } = await supabase.from('delivery_logs').insert({
+    message_id: messageId,
+    attempt_number: attemptNumber,
+    status: 'pending',
+  });
+
+  if (insertError) {
+    throw new Error(`Failed to create delivery log: ${insertError.message}`);
+  }
+
+  return { skip: false, attemptNumber };
+}
+
+interface ComposedEmail {
+  subject: string;
+  html: string;
+}
+
+/**
+ * Generates signed video URL (if video exists) and builds HTML email
+ */
+async function composeDelivery(
+  supabase: ReturnType<typeof createClient>,
+  message: Message
+): Promise<ComposedEmail> {
+  let videoUrl: string | null = null;
+  if (message.video_storage_path) {
+    const { data: signedUrlData } = await supabase.storage
+      .from('message-videos')
+      .createSignedUrl(message.video_storage_path, 604800);
+    videoUrl = signedUrlData?.signedUrl ?? null;
+  }
+
+  return buildDeliveryEmail(message, videoUrl);
+}
+
+/**
+ * Sends email via Resend, updates delivery_logs and messages tables.
+ * Logs error if messages.status update fails but delivery succeeded.
+ */
+async function executeDelivery(
+  supabase: ReturnType<typeof createClient>,
+  message: Message,
+  email: ComposedEmail,
+  attemptNumber: number,
+  fromEmail: string
+): Promise<void> {
+  const sendResult = await sendMessage(message, email.subject, email.html, fromEmail);
+
+  if (!sendResult.success) {
+    throw new Error(sendResult.error || 'Failed to send email');
+  }
+
+  await supabase
+    .from('delivery_logs')
+    .update({
+      status: 'delivered',
+      email_provider_id: sendResult.emailProviderId,
+    })
+    .eq('message_id', message.id)
+    .eq('attempt_number', attemptNumber);
+
+  const { error: msgError } = await supabase
+    .from('messages')
+    .update({
+      status: 'delivered',
+      delivered_at: new Date().toISOString(),
+    })
+    .eq('id', message.id);
+
+  if (msgError) {
+    console.error(JSON.stringify({
+      event: 'MESSAGE_STATUS_UPDATE_FAILED',
+      message_id: message.id,
+      error: msgError.message,
+    }));
+  }
+}
+
+interface ProcessMessageResult {
+  status: 'delivered' | 'failed' | 'skipped';
+}
+
+/**
+ * Processes single message through prepare, compose, and execute phases.
+ * Returns status for batch aggregation (delivered/failed/skipped).
+ */
+async function processMessage(
+  supabase: ReturnType<typeof createClient>,
+  message: Message,
+  fromEmail: string
+): Promise<ProcessMessageResult> {
+  try {
+    const prep = await prepareDelivery(supabase, message.id);
+    if (prep.skip) {
+      return { status: 'skipped' };
+    }
+
+    const composed = await composeDelivery(supabase, message);
+    await executeDelivery(supabase, message, composed, prep.attemptNumber, fromEmail);
+
+    return { status: 'delivered' };
+  } catch (error) {
+    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
+
+    await supabase
+      .from('delivery_logs')
+      .update({
+        status: 'failed',
+        error_message: errorMessage,
+      })
+      .eq('message_id', message.id)
+      .order('created_at', { ascending: false })
+      .limit(1);
+
+    await supabase
+      .from('messages')
+      .update({ status: 'failed' })
+      .eq('id', message.id);
+
+    return { status: 'failed' };
+  }
+}
+
+/**
+ * Orchestrates sequential message processing with early termination on timeout.
+ * Aggregates delivered/failed counts and applies rate limiting between sends.
+ */
+async function processMessageBatch(
+  supabase: ReturnType<typeof createClient>,
+  messages: Message[],
+  startTime: number
+): Promise<BatchResult> {
+  const result: BatchResult = {
+    processed: 0,
+    delivered: 0,
+    failed: 0,
+    stoppedEarly: false,
+  };
+
+  const fromEmail = Deno.env.get('FROM_EMAIL') || 'Sendaway <noreply@sendaway.app>';
+
+  for (let i = 0; i < messages.length; i++) {
+    if (Date.now() - startTime > TIMEOUT_MS) {
+      result.stoppedEarly = true;
+      break;
+    }
+
+    const message = messages[i];
+    result.processed++;
+
+    const messageResult = await processMessage(supabase, message, fromEmail);
+
+    if (messageResult.status === 'delivered') {
+      result.delivered++;
+    } else if (messageResult.status === 'failed') {
+      result.failed++;
+    }
+
+    if (i < messages.length - 1) {
+      await delayForRateLimit();
+    }
+  }
+
+  return result;
+}
+
+serve(async (req: Request) => {
+  if (!verifyCronSecret(req)) {
+    return new Response(
+      JSON.stringify({ error: 'Unauthorized' }),
+      { status: 401, headers: { 'Content-Type': 'application/json' } }
+    );
+  }
+
+  const supabaseAdmin = createClient(
+    Deno.env.get('SUPABASE_URL')!,
+    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
+  );
+
+  let lockId: string | null = null;
+
+  try {
+    const { data: lockData } = await supabaseAdmin
+      .from('delivery_batch_locks')
+      .insert({ id: crypto.randomUUID() })
+      .select('id')
+      .single();
+
+    if (!lockData) {
+      return new Response(
+        JSON.stringify({ skipped: true, reason: 'concurrent execution' }),
+        { status: 200, headers: { 'Content-Type': 'application/json' } }
+      );
+    }
+
+    lockId = lockData.id;
+
+    const today = new Date().toISOString().split('T')[0];
+    const { data: messages, error: queryError } = await supabaseAdmin
+      .from('messages')
+      .select('*')
+      .lte('scheduled_date', today)
+      .eq('status', 'pending')
+      .limit(BATCH_SIZE);
+
+    if (queryError) {
+      throw new Error(`Failed to query messages: ${queryError.message}`);
+    }
+
+    if (!messages || messages.length === 0) {
+      return new Response(
+        JSON.stringify({ processed: 0, delivered: 0, failed: 0, stoppedEarly: false }),
+        { status: 200, headers: { 'Content-Type': 'application/json' } }
+      );
+    }
+
+    const startTime = Date.now();
+    const result = await processMessageBatch(supabaseAdmin, messages, startTime);
+
+    return new Response(
+      JSON.stringify(result),
+      { status: 200, headers: { 'Content-Type': 'application/json' } }
+    );
+  } catch (error) {
+    console.error('Process delivery error:', error);
+    return new Response(
+      JSON.stringify({ error: 'Internal server error' }),
+      { status: 500, headers: { 'Content-Type': 'application/json' } }
+    );
+  } finally {
+    if (lockId) {
+      try {
+        await supabaseAdmin.from('delivery_batch_locks').delete().eq('id', lockId);
+      } catch (error) {
+        console.error(JSON.stringify({
+          event: 'BATCH_LOCK_RELEASE_FAILED',
+          lock_id: lockId,
+          timestamp: new Date().toISOString(),
+          error: error instanceof Error ? error.message : 'Unknown error',
+        }));
+      }
+    }
+  }
+});
```

```diff
--- /dev/null
+++ supabase/functions/cleanup-logs/index.ts
@@ -0,0 +1,42 @@
+import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
+import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
+import { verifyCronSecret } from '../_shared/cron-auth.ts';
+
+serve(async (req: Request) => {
+  if (!verifyCronSecret(req)) {
+    return new Response(
+      JSON.stringify({ error: 'Unauthorized' }),
+      { status: 401, headers: { 'Content-Type': 'application/json' } }
+    );
+  }
+
+  const supabaseAdmin = createClient(
+    Deno.env.get('SUPABASE_URL')!,
+    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
+  );
+
+  try {
+    const cutoffDate = new Date();
+    cutoffDate.setDate(cutoffDate.getDate() - 90);
+
+    const { count, error } = await supabaseAdmin
+      .from('delivery_logs')
+      .delete()
+      .lt('created_at', cutoffDate.toISOString())
+      .select('*', { count: 'exact', head: true });
+
+    if (error) {
+      throw new Error(`Failed to delete logs: ${error.message}`);
+    }
+
+    return new Response(
+      JSON.stringify({ deleted: count || 0 }),
+      { status: 200, headers: { 'Content-Type': 'application/json' } }
+    );
+  } catch (error) {
+    console.error('Cleanup logs error:', error);
+    return new Response(
+      JSON.stringify({ error: 'Internal server error' }),
+      { status: 500, headers: { 'Content-Type': 'application/json' } }
+    );
+  }
+});
```

---

### Milestone 3: Your Messages Dashboard

**Files**:
- `src/utils/message-status.ts` (shared utility for unlock determination)
- `src/components/messages-dashboard.ts`
- `src/main.ts` (modification)
- `index.html` (modification)

**Flags**: `conformance`

**Requirements**:
- New dashboard component showing user's messages as cards
- Replaces landing page sections (How It Works, Pricing, FAQ) when logged in
- Message cards show: preview text, scheduled date, status (locked/delivered)
- Locked messages show lock icon, delivered messages show checkmark
- Cards are clickable to open detail view

**Acceptance Criteria**:
- Dashboard visible only when user is authenticated
- Landing sections hidden when dashboard is shown
- Messages sorted by scheduled_date ascending
- Each card displays first 100 chars of message text
- Locked card shows lock icon with scheduled date
- Delivered card shows checkmark with delivered date

**Tests**:
- **Test files**: Skip - UI component, tested via E2E
- **Skip reason**: User confirmed E2E with generated datasets; dashboard logic is straightforward display

**Code Intent**:
- `message-status.ts` (new shared utility):
  - isMessageUnlocked(message: Message): boolean - centralized logic for determining if message is viewable
  - Used by both messages-dashboard.ts and message-detail.ts to avoid logic duplication
- `messages-dashboard.ts`:
  - MessagesDashboard class with render(), fetchMessages(), loadMore(), createMessageCard() methods
  - Private offset: number = 0, hasMore: boolean = true for pagination state
  - fetchMessages(): Query messages table with LIMIT 10, ORDER BY scheduled_date ASC, OFFSET this.offset. Update hasMore based on result count < 10. Store offset for pagination. **On error, show toast notification to user.**
  - loadMore(): Increment offset by 10, call fetchMessages(), append new cards to existing list
  - render(): Include "Load More" button (shown when hasMore=true), wire to loadMore()
  - Subscribe to auth state changes, show/hide based on login status
  - Cards use neo-brutalist styling consistent with existing UI
  - **createMessageCard() uses isMessageUnlocked() from shared utility**
- `main.ts`: Import dashboard, initialize on auth state change, toggle visibility of landing sections
- `index.html`: Add container div for dashboard, add IDs to landing sections for toggle control

**Code Changes**:

```diff
--- /dev/null
+++ src/utils/message-status.ts
@@ -0,0 +1,15 @@
+import type { Message } from '../types/database';
+
+/**
+ * Returns true if scheduled_date <= today OR status='delivered'
+ */
+export function isMessageUnlocked(message: Message): boolean {
+  const scheduledDate = new Date(message.scheduled_date);
+  const today = new Date();
+  today.setHours(0, 0, 0, 0);
+  return scheduledDate <= today || message.status === 'delivered';
+}
```

```diff
--- /dev/null
+++ src/components/messages-dashboard.ts
@@ -0,0 +1,197 @@
+import { supabase } from '../config/supabase';
+import { authService } from '../services/auth.service';
+import { toast } from './toast';
+import { isMessageUnlocked } from '../utils/message-status';
+import type { Message } from '../types/database';
+
+const PAGE_SIZE = 10;
+
+class MessagesDashboard {
+  private container: HTMLElement | null = null;
+  private messages: Message[] = [];
+  private offset: number = 0;
+  private hasMore: boolean = true;
+  private isLoading: boolean = false;
+
+  /**
+   * Attaches auth state listener to show/hide dashboard based on login status
+   */
+  init(): void {
+    this.container = document.getElementById('messagesDashboard');
+
+    authService.onAuthStateChange((state) => {
+      if (state.user) {
+        this.show();
+      } else {
+        this.hide();
+      }
+    });
+  }
+
+  /**
+   * Displays dashboard, hides landing sections, fetches and renders messages
+   */
+  async show(): Promise<void> {
+    this.messages = [];
+    this.offset = 0;
+    this.hasMore = true;
+
+    document.getElementById('howItWorks')?.classList.add('hidden');
+    document.getElementById('pricingSection')?.classList.add('hidden');
+    document.getElementById('faqSection')?.classList.add('hidden');
+
+    if (this.container) {
+      this.container.classList.remove('hidden');
+    }
+
+    await this.fetchMessages();
+    this.render();
+  }
+
+  /**
+   * Hides dashboard, shows landing sections, clears container HTML
+   */
+  hide(): void {
+    document.getElementById('howItWorks')?.classList.remove('hidden');
+    document.getElementById('pricingSection')?.classList.remove('hidden');
+    document.getElementById('faqSection')?.classList.remove('hidden');
+
+    if (this.container) {
+      this.container.classList.add('hidden');
+      this.container.innerHTML = '';
+    }
+  }
+
+  /**
+   * Queries messages table with pagination, updates local state and hasMore flag
+   */
+  private async fetchMessages(): Promise<void> {
+    const user = authService.getUser();
+    if (!user) return;
+
+    this.isLoading = true;
+
+    const { data, error } = await supabase
+      .from('messages')
+      .select('*')
+      .eq('user_id', user.id)
+      .order('scheduled_date', { ascending: true })
+      .range(this.offset, this.offset + PAGE_SIZE - 1);
+
+    if (error) {
+      console.error('Error fetching messages:', error);
+      toast.error('Failed to load messages. Please refresh the page.');
+      this.isLoading = false;
+      return;
+    }
+
+    if (data) {
+      this.messages = [...this.messages, ...data];
+      this.hasMore = data.length === PAGE_SIZE;
+    }
+
+    this.isLoading = false;
+  }
+
+  /**
+   * Increments offset, fetches next page, re-renders dashboard
+   */
+  async loadMore(): Promise<void> {
+    if (this.isLoading || !this.hasMore) return;
+
+    this.offset += PAGE_SIZE;
+    await this.fetchMessages();
+    this.render();
+  }
+
+  /**
+   * Generates dashboard HTML, wires up event handlers for load more and card clicks
+   */
+  private render(): void {
+    if (!this.container) return;
+
+    const html = `
+      <div class="container" style="padding: 40px 20px;">
+        <h2 style="text-align: center; margin-bottom: 30px;">Your Messages</h2>
+        <div class="messages-grid" style="display: grid; gap: 20px; max-width: 800px; margin: 0 auto;">
+          ${this.messages.length === 0
+            ? '<p style="text-align: center; color: #555;">No messages yet. Create your first message above!</p>'
+            : this.messages.map((msg) => this.createMessageCard(msg)).join('')
+          }
+        </div>
+        ${this.hasMore ? `
+          <div style="text-align: center; margin-top: 30px;">
+            <button id="loadMoreBtn" class="btn btn-secondary" style="width: auto;">
+              ${this.isLoading ? 'Loading...' : 'Load More'}
+            </button>
+          </div>
+        ` : ''}
+      </div>
+    `;
+
+    this.container.innerHTML = html;
+
+    document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
+      this.loadMore();
+    });
+
+    this.container.querySelectorAll('.message-card').forEach((card) => {
+      card.addEventListener('click', () => {
+        const messageId = card.getAttribute('data-message-id');
+        const message = this.messages.find((m) => m.id === messageId);
+        if (message) {
+          import('./message-detail').then(({ messageDetailModal }) => {
+            messageDetailModal.show(message);
+          });
+        }
+      });
+    });
+  }
+
+  /**
+   * Generates HTML for single message card with status icon, preview text, and metadata
+   */
+  private createMessageCard(message: Message): string {
+    const isDelivered = message.status === 'delivered';
+    const isUnlocked = isMessageUnlocked(message);
+    const scheduledDate = new Date(message.scheduled_date);
+
+    const preview = message.message_text.substring(0, 100) + (message.message_text.length > 100 ? '...' : '');
+    const dateStr = scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
+
+    const statusIcon = isUnlocked
+      ? '<span style="color: #22c55e;">&#10003;</span>'
+      : '<span style="color: #666;">&#128274;</span>';
+
+    const statusText = isDelivered
+      ? `Delivered ${message.delivered_at ? new Date(message.delivered_at).toLocaleDateString() : ''}`
+      : isUnlocked
+        ? 'Ready to view'
+        : `Unlocks ${dateStr}`;
+
+    return `
+      <div class="message-card neo-box" data-message-id="${message.id}" style="padding: 20px; cursor: pointer;">
+        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
+          <div style="font-size: 1.5rem;">${statusIcon}</div>
+          <span style="font-size: 0.8rem; color: #555; background: ${isUnlocked ? 'var(--pastel-green)' : 'var(--pastel-yellow)'}; padding: 3px 8px; border: 1px solid black; border-radius: 4px;">
+            ${statusText}
+          </span>
+        </div>
+        <p style="margin: 0; color: ${isUnlocked ? '#000' : '#666'}; ${isUnlocked ? '' : 'filter: blur(2px);'}">
+          ${preview}
+        </p>
+        ${message.video_storage_path ? '<span style="font-size: 0.8rem; color: #555; margin-top: 10px; display: inline-block;">&#127909; Video attached</span>' : ''}
+      </div>
+    `;
+  }
+
+  /**
+   * Resets state and refetches messages from offset 0
+   */
+  async refresh(): Promise<void> {
+    this.messages = [];
+    this.offset = 0;
+    this.hasMore = true;
+    await this.fetchMessages();
+    this.render();
+  }
+}
+
+export const messagesDashboard = new MessagesDashboard();
```

```diff
--- src/main.ts
+++ src/main.ts
@@ -1,5 +1,6 @@
 import { authService } from './services/auth.service';
 import { formHandler } from './components/form-handler';
+import { messagesDashboard } from './components/messages-dashboard';
 import { toast } from './components/toast';

 // Initialize the application
@@ -7,6 +8,9 @@ function init(): void {
   // Initialize form handler
   formHandler.init();

+  messagesDashboard.init();
+
   // Update UI based on auth state
   authService.onAuthStateChange((state) => {
     updateAuthUI(state.user !== null, state.profile?.tier === 'pro');
```

```diff
--- index.html
+++ index.html
@@ -550,7 +550,11 @@
         </div>
     </section>

-    <section class="section-spacer">
+    <!-- Dashboard container (hidden by default) -->
+    <section id="messagesDashboard" class="section-spacer hidden">
+    </section>
+
+    <section id="howItWorks" class="section-spacer">
         <div class="container">
             <h2 style="text-align: center; font-size: 2.5rem; margin-bottom: 50px;">How it Works</h2>
             <div class="steps-grid">
@@ -574,7 +578,7 @@
         </div>
     </section>

-    <section class="pricing-section section-spacer">
+    <section id="pricingSection" class="pricing-section section-spacer">
         <div class="container">
             <h2 style="text-align: center; margin-bottom: 50px;">Simple Pricing</h2>
             <div class="pricing-grid">
@@ -601,7 +605,7 @@
         </div>
     </section>

-    <section class="section-spacer">
+    <section id="faqSection" class="section-spacer">
         <div class="container" style="max-width: 700px;">
             <h2 style="text-align: center; margin-bottom: 40px;">Questions?</h2>

@@ -631,6 +635,12 @@
         </div>
     </section>

+    <style>
+        .hidden {
+            display: none !important;
+        }
+    </style>
+
     <footer style="text-align: center; padding: 40px; border-top: 3px solid black; background: white;">
         <p style="font-weight: 700;">&copy; 2025 Sendaway</p>
     </footer>
```

---

### Milestone 4: Locked Message Detail View

**Files**:
- `src/components/message-detail.ts`
- `src/utils/countdown.ts`

**Flags**: `complex-algorithm`, `needs-rationale`

**Requirements**:
- Modal view matching reference design (img/Screenshot 2026-01-14...)
- Countdown timer: Days, Hours, Minutes, Seconds with colored boxes
- Display: Created date, Wait time (human readable), Unlocks date
- Delete button for pending messages only
- Back to dashboard button

**Acceptance Criteria**:
- Countdown updates every second
- Timer shows 0 when scheduled_date has passed
- Delete button calls messageService.cancelMessage()
- Modal closes on outside click or back button
- Styling matches neo-brutalist design: pastel colors (pink, peach, yellow, green), black borders, shadows

**Tests**:
- **Test files**: `src/utils/countdown.test.ts`
- **Test type**: property-based
- **Backing**: user-specified
- **Scenarios**:
  - Normal: Countdown to future date
  - Edge: Countdown to today (same day), countdown to past date (shows 0)
  - Property: For any future date, days + hours + minutes + seconds equals total difference

**Code Intent**:
- `countdown.ts`:
  - calculateCountdown(targetDate: Date): { days, hours, minutes, seconds }
  - Pure function: takes target date, returns time remaining
  - If targetDate <= now, return all zeros
  - Math: totalSeconds = (target - now) / 1000, then modular arithmetic for d/h/m/s

- `message-detail.ts`:
  - MessageDetailModal class
  - Private intervalId: number | null for cleanup (Decision: setInterval cleanup on modal close)
  - Private isVisible: boolean to track modal state
  - render(): Creates modal HTML matching reference design (lock icon, countdown boxes, metadata row, delete button)
  - startCountdown(): setInterval at 1000ms (Decision: 1-second countdown interval), updates DOM each tick
  - stopCountdown(): if intervalId, clearInterval(this.intervalId), set intervalId = null
  - handleDelete(): native confirm() dialog (Decision: Delete confirmation method), then messageService.cancelMessage(), then hide() and refresh dashboard
  - show(message): **Unconditionally call hide() to cleanup any existing interval (matches auth-modal.ts pattern)**. Set isVisible=true, store message reference, render, startCountdown, append to body
  - hide(): stopCountdown(), remove from DOM, set isVisible=false. **Note: Do NOT clear signedUrl or urlExpiresAt - these are instance-level cache that persists across hide/show calls.**
  - **Invariant**: Only one modal instance can be visible at a time. show() must call hide() before creating new modal to ensure interval cleanup.
  - Styling: CSS classes for pastel boxes (--pastel-pink, --pastel-yellow, --pastel-green), black borders, Space Grotesk font

**Code Changes**:

```diff
--- /dev/null
+++ src/utils/countdown.ts
@@ -0,0 +1,36 @@
+export interface CountdownResult {
+  days: number;
+  hours: number;
+  minutes: number;
+  seconds: number;
+}
+
+/**
+ * Returns time remaining until targetDate as {days, hours, minutes, seconds}.
+ * Returns all zeros if targetDate <= now.
+ */
+export function calculateCountdown(targetDate: Date): CountdownResult {
+  const now = new Date();
+  const diff = targetDate.getTime() - now.getTime();
+
+  if (diff <= 0) {
+    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
+  }
+
+  const totalSeconds = Math.floor(diff / 1000);
+
+  const days = Math.floor(totalSeconds / (24 * 60 * 60));
+  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
+  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
+  const seconds = totalSeconds % 60;
+
+  return { days, hours, minutes, seconds };
+}
+
+/**
+ * Formats date as "Mon DD, YYYY"
+ */
+export function formatDate(date: Date): string {
+  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
+}
```

```diff
--- /dev/null
+++ src/components/message-detail.ts
@@ -0,0 +1,227 @@
+import { messageService } from '../services/message.service';
+import { toast } from './toast';
+import { calculateCountdown, formatDate } from '../utils/countdown';
+import type { Message } from '../types/database';
+
+class MessageDetailModal {
+  private overlay: HTMLElement | null = null;
+  private message: Message | null = null;
+  private intervalId: number | null = null;
+  private isVisible: boolean = false;
+
+  /**
+   * Displays message detail modal (locked or unlocked view based on message state).
+   * Cleans up any existing modal instance before rendering.
+   */
+  show(message: Message): void {
+    this.hide();
+
+    this.message = message;
+    this.isVisible = true;
+    this.render();
+    this.startCountdown();
+  }
+
+  /**
+   * Hides modal, stops countdown timer, and removes overlay from DOM
+   */
+  hide(): void {
+    this.stopCountdown();
+
+    if (this.overlay) {
+      this.overlay.remove();
+      this.overlay = null;
+    }
+
+    this.isVisible = false;
+  }
+
+  /**
+   * Initializes 1-second interval timer for countdown display updates
+   */
+  private startCountdown(): void {
+    if (!this.message) return;
+
+    this.updateCountdown();
+
+    this.intervalId = window.setInterval(() => {
+      this.updateCountdown();
+    }, 1000);
+  }
+
+  /**
+   * Clears interval timer and resets intervalId to null
+   */
+  private stopCountdown(): void {
+    if (this.intervalId !== null) {
+      clearInterval(this.intervalId);
+      this.intervalId = null;
+    }
+  }
+
+  /**
+   * Recalculates countdown and updates DOM elements with current values
+   */
+  private updateCountdown(): void {
+    if (!this.message || !this.overlay) return;
+
+    const scheduledDate = new Date(this.message.scheduled_date);
+    scheduledDate.setUTCHours(8, 0, 0, 0);
+
+    const countdown = calculateCountdown(scheduledDate);
+
+    const daysEl = this.overlay.querySelector('#countdown-days');
+    const hoursEl = this.overlay.querySelector('#countdown-hours');
+    const minutesEl = this.overlay.querySelector('#countdown-minutes');
+    const secondsEl = this.overlay.querySelector('#countdown-seconds');
+
+    if (daysEl) daysEl.textContent = countdown.days.toString();
+    if (hoursEl) hoursEl.textContent = countdown.hours.toString();
+    if (minutesEl) minutesEl.textContent = countdown.minutes.toString();
+    if (secondsEl) secondsEl.textContent = countdown.seconds.toString();
+  }
+
+  /**
+   * Prompts confirmation, calls cancelMessage, closes modal and refreshes dashboard
+   */
+  private async handleDelete(): Promise<void> {
+    if (!this.message) return;
+
+    const confirmed = confirm('Are you sure you want to delete this message? This action cannot be undone.');
+    if (!confirmed) return;
+
+    const result = await messageService.cancelMessage(this.message.id);
+
+    if (result.success) {
+      toast.success('Message deleted');
+      this.hide();
+      import('./messages-dashboard').then(({ messagesDashboard }) => {
+        messagesDashboard.refresh();
+      });
+    } else {
+      toast.error(result.error || 'Failed to delete message');
+    }
+  }
+
+  /**
+   * Returns human-readable duration between created_at and scheduled_date
+   */
+  private getWaitTime(): string {
+    if (!this.message) return '';
+
+    const created = new Date(this.message.created_at);
+    const scheduled = new Date(this.message.scheduled_date);
+    const diffDays = Math.ceil((scheduled.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
+
+    if (diffDays === 0) return 'Same day';
+    if (diffDays === 1) return '1 day';
+    if (diffDays < 7) return `${diffDays} days`;
+    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? 's' : ''}`;
+    if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${diffDays >= 60 ? 's' : ''}`;
+    return `${Math.floor(diffDays / 365)} year${diffDays >= 730 ? 's' : ''}`;
+  }
+
+  /**
+   * Creates and appends overlay div with specified background color
+   */
+  private createOverlayBase(bgColor: string): HTMLDivElement {
+    const overlay = document.createElement('div');
+    overlay.className = 'message-detail-overlay';
+    overlay.style.background = bgColor;
+    document.body.appendChild(overlay);
+    return overlay;
+  }
+
+  /**
+   * Returns CSS string for modal buttons, cards, and headers shared by locked/unlocked views
+   */
+  private getSharedStyles(): string {
+    return `
+      .back-btn {
+        position: absolute;
+        top: 20px;
+        left: 20px;
+        background: white;
+        border: 2px solid black;
+        border-radius: 50px;
+        padding: 10px 20px;
+        font-family: inherit;
+        font-weight: 700;
+        cursor: pointer;
+        display: flex;
+        align-items: center;
+        gap: 8px;
+      }
+      .detail-card {
+        background: white;
+        border: 4px solid black;
+        border-radius: 12px;
+        box-shadow: 10px 10px 0px 0px black;
+        width: 100%;
+        max-width: 600px;
+        margin-top: 60px;
+        overflow: hidden;
+      }
+      .detail-header {
+        padding: 25px;
+        border-bottom: 3px solid black;
+        display: flex;
+        align-items: center;
+        gap: 15px;
+      }
+    `;
+  }
+
+  /**
+   * Generates locked message HTML with countdown timer and metadata
+   */
+  private render(): void {
+    if (!this.message) return;
+
+    const createdDate = formatDate(new Date(this.message.created_at));
+    const unlocksDate = formatDate(new Date(this.message.scheduled_date));
+    const waitTime = this.getWaitTime();
+    const isPending = this.message.status === 'pending';
+
+    this.overlay = this.createOverlayBase('#BAE6FD');
+    this.overlay.innerHTML = `
+      <style>
+        .message-detail-overlay {
+          position: fixed;
+          top: 0;
+          left: 0;
+          width: 100%;
+          height: 100%;
+          z-index: 1000;
+          display: flex;
+          flex-direction: column;
+          align-items: center;
+          padding: 20px;
+          overflow-y: auto;
+        }
+        ${this.getSharedStyles()}
+        .detail-header {
+          background: #FDE68A;
+        }
+        .lock-icon {
+          width: 50px;
+          height: 50px;
+          background: white;
+          border: 2px solid black;
+          border-radius: 50%;
+          display: flex;
+          align-items: center;
+          justify-content: center;
+          font-size: 24px;
+        }
+        .countdown-section {
+          padding: 30px;
+          text-align: center;
+        }
+        .countdown-label {
+          font-weight: 700;
+          text-transform: uppercase;
+          letter-spacing: 2px;
+          margin-bottom: 20px;
+          color: #333;
+        }
+        .countdown-boxes {
+          display: flex;
+          justify-content: center;
+          gap: 15px;
+          flex-wrap: wrap;
+        }
+        .countdown-box {
+          width: 100px;
+          height: 100px;
+          border: 3px solid black;
+          border-radius: 12px;
+          display: flex;
+          flex-direction: column;
+          align-items: center;
+          justify-content: center;
+        }
+        .countdown-box.pink { background: var(--pastel-pink); }
+        .countdown-box.peach { background: #FECACA; }
+        .countdown-box.yellow { background: var(--pastel-yellow); }
+        .countdown-box.green { background: var(--pastel-green); }
+        .countdown-number {
+          font-size: 2.5rem;
+          font-weight: 800;
+          line-height: 1;
+        }
+        .countdown-unit {
+          font-size: 0.75rem;
+          font-weight: 700;
+          text-transform: uppercase;
+          color: #555;
+          margin-top: 5px;
+        }
+        .meta-row {
+          display: flex;
+          justify-content: space-around;
+          padding: 20px;
+          gap: 10px;
+          flex-wrap: wrap;
+        }
+        .meta-item {
+          background: #F5F5F5;
+          border: 2px solid black;
+          border-radius: 8px;
+          padding: 15px 20px;
+          text-align: center;
+          flex: 1;
+          min-width: 120px;
+        }
+        .meta-label {
+          font-size: 0.75rem;
+          font-weight: 700;
+          text-transform: uppercase;
+          color: #666;
+          margin-bottom: 5px;
+        }
+        .meta-value {
+          font-weight: 700;
+        }
+        .delete-section {
+          padding: 20px;
+          border-top: 2px solid #eee;
+          text-align: center;
+        }
+        .delete-btn {
+          background: none;
+          border: none;
+          color: #666;
+          font-family: inherit;
+          font-size: 0.9rem;
+          cursor: pointer;
+          display: inline-flex;
+          align-items: center;
+          gap: 5px;
+        }
+        .delete-btn:hover {
+          color: #dc2626;
+        }
+      </style>

+      <button class="back-btn" id="backBtn">
+        <span>&larr;</span> Dashboard
+      </button>

+      <div class="detail-card">
+        <div class="detail-header">
+          <div class="lock-icon">&#128274;</div>
+          <div>
+            <h2 style="margin: 0; font-size: 1.5rem;">Message Locked</h2>
+            <p style="margin: 5px 0 0 0; color: #555;">Patience. Good things are waiting.</p>
+          </div>
+        </div>

+        <div class="countdown-section">
+          <div class="countdown-label">Unlocks In</div>
+          <div class="countdown-boxes">
+            <div class="countdown-box pink">
+              <span class="countdown-number" id="countdown-days">0</span>
+              <span class="countdown-unit">Days</span>
+            </div>
+            <div class="countdown-box peach">
+              <span class="countdown-number" id="countdown-hours">0</span>
+              <span class="countdown-unit">Hours</span>
+            </div>
+            <div class="countdown-box yellow">
+              <span class="countdown-number" id="countdown-minutes">0</span>
+              <span class="countdown-unit">Min</span>
+            </div>
+            <div class="countdown-box green">
+              <span class="countdown-number" id="countdown-seconds">0</span>
+              <span class="countdown-unit">Sec</span>
+            </div>
+          </div>
+        </div>

+        <div class="meta-row">
+          <div class="meta-item">
+            <div class="meta-label">Created</div>
+            <div class="meta-value">${createdDate}</div>
+          </div>
+          <div class="meta-item">
+            <div class="meta-label">Wait Time</div>
+            <div class="meta-value">${waitTime}</div>
+          </div>
+          <div class="meta-item">
+            <div class="meta-label">Unlocks</div>
+            <div class="meta-value">${unlocksDate}</div>
+          </div>
+        </div>

+        ${isPending ? `
+          <div class="delete-section">
+            <button class="delete-btn" id="deleteBtn">
+              <span>&#128465;</span> Delete message
+            </button>
+          </div>
+        ` : ''}
+      </div>
+    `;
+
+    this.overlay.querySelector('#backBtn')?.addEventListener('click', () => {
+      this.hide();
+    });

+    this.overlay.querySelector('#deleteBtn')?.addEventListener('click', () => {
+      this.handleDelete();
+    });
+  }
+}

+export const messageDetailModal = new MessageDetailModal();
```

---

### Milestone 5: Unlocked Message View

**Files**:
- `src/components/message-detail.ts` (modification)

**Requirements**:
- Show full message text when scheduled_date has passed
- Display video player if video_storage_path exists
- Generate signed URL for video via videoService (7-day expiry)
- Provide download button for video
- Show delivered date if status='delivered'
- Handle missing video gracefully (show "Video unavailable" message)

**Acceptance Criteria**:
- Full message text visible (scrollable if long)
- Video player loads signed URL with native controls
- Download button triggers browser download dialog
- Video URL generated on modal open (7-day expiry, regenerates if needed)
- No delete button for delivered messages
- Shows "Video unavailable" if video file missing from storage

**Tests**:
- **Test files**: `src/components/message-detail.test.ts`
- **Test type**: unit
- **Backing**: user-specified
- **Rationale**: Modal state management, conditional rendering, and error handling require unit testing. Video playback uses native HTML5 element (not custom-tested), but modal logic is custom.
- **Scenarios**:
  - Locked state shows countdown timer and hide button
  - Unlocked state shows full message text
  - Unlocked state with video shows video player element
  - Unlocked state with video shows download button
  - Unlocked state without video (no video_storage_path) shows no video section
  - Video URL error shows "Video unavailable" fallback
  - URL caching prevents redundant getSignedUrl() calls
- **Mocks**: Mock videoService.getSignedUrl() to isolate modal logic from Supabase SDK

**Code Intent**:
- Modify `message-detail.ts`:
  - **Use shared utility**: Import and use `isMessageUnlocked()` from `../utils/message-status` for locked/unlocked determination in both show() and render() methods
  - **URL caching state**: Store `signedUrl: string | null` and `urlExpiresAt: Date | null` as modal instance properties (NOT cleared in hide() method - cache persists for instance lifetime per Decision Log). Only reset on initial modal construction.
  - When unlocked:
    - Hide countdown timer section
    - Show full message text (scrollable container if long)
    - Show video element with native controls if video_storage_path exists
    - **URL regeneration flow**: Before rendering video, check if urlExpiresAt is null OR urlExpiresAt < now. If so, call videoService.getSignedUrl() with expiresIn = 604800 (7 days). Store returned URL and compute urlExpiresAt = now + 7 days. Cache in modal state to avoid regenerating on every render.
    - Add download button that uses same signedUrl with download attribute
    - Show "Video unavailable" message if getSignedUrl() throws error (video deleted from storage)
    - No delete button for delivered messages
  - renderUnlocked(): Separate method for unlocked state HTML generation
  - renderLocked(): Existing countdown rendering (now extracted to method)

**Code Changes**:

```diff
--- src/components/message-detail.ts
+++ src/components/message-detail.ts
@@ -1,5 +1,7 @@
 import { messageService } from '../services/message.service';
+import { videoService } from '../services/video.service';
 import { toast } from './toast';
 import { calculateCountdown, formatDate } from '../utils/countdown';
+import { isMessageUnlocked } from '../utils/message-status';
 import type { Message } from '../types/database';
@@ -9,6 +10,10 @@ class MessageDetailModal {
   private message: Message | null = null;
   private intervalId: number | null = null;
   private isVisible: boolean = false;
+  // Persists across hide/show calls; cleared only on app reload
+  private signedUrl: string | null = null;
+  private urlExpiresAt: Date | null = null;

   /**
    * Show the message detail modal
@@ -20,7 +25,14 @@ class MessageDetailModal {
     this.message = message;
     this.isVisible = true;
     this.render();
-    this.startCountdown();
+
+    if (!isMessageUnlocked(message)) {
+      this.startCountdown();
+    }
   }

   /**
@@ -30,6 +42,7 @@ class MessageDetailModal {
     this.stopCountdown();

     if (this.overlay) {
       this.overlay.remove();
       this.overlay = null;
     }

     this.isVisible = false;
   }

   /**
@@ -111,13 +124,38 @@ class MessageDetailModal {
   /**
    * Routes to renderLocked or renderUnlocked based on message state
    */
-  private render(): void {
+  private async render(): Promise<void> {
     if (!this.message) return;

-    const createdDate = formatDate(new Date(this.message.created_at));
-    const unlocksDate = formatDate(new Date(this.message.scheduled_date));
-    const waitTime = this.getWaitTime();
-    const isPending = this.message.status === 'pending';
+    if (isMessageUnlocked(this.message)) {
+      await this.renderUnlocked();
+    } else {
+      this.renderLocked();
+    }
+  }
+
+  /**
+   * Returns true if signedUrl is null or urlExpiresAt < now
+   */
+  private isUrlExpired(): boolean {
+    if (!this.signedUrl || !this.urlExpiresAt) {
+      return true;
+    }
+    return this.urlExpiresAt < new Date();
+  }
+
+  /**
+   * Generates locked message HTML with countdown timer and metadata
+   */
+  private renderLocked(): void {
+    if (!this.message) return;
+
+    const createdDate = formatDate(new Date(this.message.created_at));
+    const unlocksDate = formatDate(new Date(this.message.scheduled_date));
+    const waitTime = this.getWaitTime();
+    const isPending = this.message.status === 'pending';

     this.overlay = document.createElement('div');
     this.overlay.className = 'message-detail-overlay';
@@ -230,6 +268,175 @@ class MessageDetailModal {
     });
   }
+
+  /**
+   * Generates unlocked message HTML with text, video player (if video exists), and download button
+   */
+  private async renderUnlocked(): Promise<void> {
+    if (!this.message) return;
+
+    const deliveredDate = this.message.delivered_at
+      ? formatDate(new Date(this.message.delivered_at))
+      : formatDate(new Date(this.message.scheduled_date));
+
+    let videoError = false;
+    if (this.message.video_storage_path) {
+      if (this.isUrlExpired()) {
+        try {
+          const result = await videoService.getSignedUrl(
+            this.message.video_storage_path,
+            604800 // 7 days in seconds
+          );
+          if (result.url) {
+            this.signedUrl = result.url;
+            this.urlExpiresAt = new Date(Date.now() + 604800 * 1000);
+          } else {
+            videoError = true;
+          }
+        } catch (error) {
+          console.error('Failed to get signed URL:', error);
+          videoError = true;
+        }
+      }
+    }
+
+    this.overlay = this.createOverlayBase('#BBF7D0');
+    this.overlay.innerHTML = `
+      <style>
+        .message-detail-overlay {
+          position: fixed;
+          top: 0;
+          left: 0;
+          width: 100%;
+          height: 100%;
+          z-index: 1000;
+          display: flex;
+          flex-direction: column;
+          align-items: center;
+          padding: 20px;
+          overflow-y: auto;
+        }
+        ${this.getSharedStyles()}
+        .detail-header {
+          background: var(--pastel-green);
+        }
+        .unlock-icon {
+          width: 50px;
+          height: 50px;
+          background: white;
+          border: 2px solid black;
+          border-radius: 50%;
+          display: flex;
+          align-items: center;
+          justify-content: center;
+          font-size: 24px;
+        }
+        .message-content {
+          padding: 25px;
+          max-height: 300px;
+          overflow-y: auto;
+          white-space: pre-wrap;
+          line-height: 1.6;
+        }
+        .video-section {
+          padding: 20px 25px;
+          border-top: 2px solid #eee;
+        }
+        .video-player {
+          width: 100%;
+          border-radius: 8px;
+          border: 2px solid black;
+        }
+        .download-btn {
+          display: inline-flex;
+          align-items: center;
+          gap: 8px;
+          margin-top: 15px;
+          background: var(--pastel-blue);
+          border: 2px solid black;
+          border-radius: 8px;
+          padding: 10px 20px;
+          font-family: inherit;
+          font-weight: 700;
+          cursor: pointer;
+          text-decoration: none;
+          color: black;
+        }
+        .video-error {
+          padding: 20px;
+          background: #FEE2E2;
+          border: 2px solid black;
+          border-radius: 8px;
+          text-align: center;
+          color: #991B1B;
+        }
+        .delivered-badge {
+          padding: 15px 25px;
+          background: #F5F5F5;
+          border-top: 2px solid #eee;
+          font-size: 0.9rem;
+          color: #555;
+        }
+      </style>
+
+      <button class="back-btn" id="backBtn">
+        <span>&larr;</span> Dashboard
+      </button>
+
+      <div class="detail-card">
+        <div class="detail-header">
+          <div class="unlock-icon">&#10003;</div>
+          <div>
+            <h2 style="margin: 0; font-size: 1.5rem;">Message Unlocked</h2>
+            <p style="margin: 5px 0 0 0; color: #555;">Your message from the past has arrived.</p>
+          </div>
+        </div>
+
+        <div class="message-content">${this.message.message_text}</div>
+
+        ${this.message.video_storage_path ? `
+          <div class="video-section">
+            ${videoError ? `
+              <div class="video-error">
+                <p style="margin: 0;">&#9888; Video unavailable</p>
+                <p style="margin: 10px 0 0 0; font-size: 0.85rem;">The video file could not be loaded.</p>
+              </div>
+            ` : `
+              <video class="video-player" controls>
+                <source src="${this.signedUrl}" type="video/mp4">
+                Your browser does not support the video tag.
+              </video>
+              <a href="${this.signedUrl}" download class="download-btn">
+                <span>&#8595;</span> Download Video
+              </a>
+            `}
+          </div>
+        ` : ''}
+
+        <div class="delivered-badge">
+          Delivered on ${deliveredDate}
+        </div>
+      </div>
+    `;
+
+    this.overlay.querySelector('#backBtn')?.addEventListener('click', () => {
+      this.hide();
+    });
+  }
 }

 export const messageDetailModal = new MessageDetailModal();
```

---

### Milestone 6: Documentation

**Delegated to**: @agent-technical-writer (mode: post-implementation)

**Source**: `## Invisible Knowledge` section of this plan

**Files**:
- `supabase/functions/CLAUDE.md`
- `supabase/functions/README.md`
- `src/components/CLAUDE.md`
- `src/components/README.md`

**Requirements**:
- CLAUDE.md files with tabular index format
- README.md files capturing architecture decisions and data flows
- Setup instructions for external services (Stripe, Resend, cron-job.org)

**Acceptance Criteria**:
- CLAUDE.md is tabular index only
- README.md includes setup instructions for:
  - Stripe API keys and webhook configuration
  - Resend API key setup
  - cron-job.org configuration for daily trigger
  - Environment variables list

## Milestone Dependencies

```
M1 (Stripe) ─────┬──────> M3 (Dashboard) ──> M4 (Locked View) ──> M5 (Unlocked View)
                 │
M2 (Delivery) ───┘
                                                                          │
                                                                          v
                                                                    M6 (Docs)
```

M1 and M2 can execute in parallel (no dependencies).
M3 depends on M1 (payment flow triggers Pro status display).
M4 depends on M3 (dashboard provides navigation to detail).
M5 depends on M4 (extends same component).
M6 runs after all implementation milestones complete.
