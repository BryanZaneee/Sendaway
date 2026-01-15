import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response(
      JSON.stringify({ error: 'Missing stripe-signature header' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      endpointSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response(
      JSON.stringify({ error: 'Invalid signature' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response(
      JSON.stringify({ received: true, ignored: event.type }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId;
  const checkoutSessionId = session.id;
  const paymentIntentId = session.payment_intent as string;

  if (!userId) {
    console.error('Missing userId in session metadata');
    return new Response(
      JSON.stringify({ error: 'Missing userId in metadata' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: existingPayment } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('stripe_checkout_session_id', checkoutSessionId)
    .single();

  if (existingPayment) {
    if (existingPayment.status === 'completed') {
      console.log('Payment already processed:', checkoutSessionId);
      return new Response(
        JSON.stringify({ received: true, status: 'already_processed' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    const { error: insertError } = await supabaseAdmin
      .from('payments')
      .insert({
        user_id: userId,
        stripe_payment_intent_id: paymentIntentId,
        stripe_checkout_session_id: checkoutSessionId,
        amount_cents: 900,
        currency: 'usd',
        product_type: 'pro_upgrade',
        status: 'pending',
      });

    if (insertError) {
      console.error('Failed to insert payment record:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to record payment' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      tier: 'pro',
      storage_limit_bytes: 2147483648,
    })
    .eq('id', userId);

  if (profileError) {
    console.error('Failed to update profile:', profileError);
    // Returning 500 triggers Stripe's automatic webhook retry (exponential backoff, up to 3 days).
    // Payment remains pending; tier upgrade is idempotent on retry.
    await supabaseAdmin
      .from('payments')
      .update({
        status: 'failed',
        error_message: profileError.message
      })
      .eq('stripe_checkout_session_id', checkoutSessionId);

    return new Response(
      JSON.stringify({ error: 'Failed to provision Pro tier' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { error: paymentError } = await supabaseAdmin
    .from('payments')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_checkout_session_id', checkoutSessionId);

  if (paymentError) {
    console.error('Failed to update payment status:', paymentError);
    // Payment status must match profile state for audit trail.
    // Returning 500 triggers Stripe retry; profile update is idempotent.
    return new Response(
      JSON.stringify({ error: 'Failed to update payment status' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ received: true, status: 'completed' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
