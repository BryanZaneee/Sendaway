import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { productType, userId } = await req.json();

    if (!productType || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing productType or userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (productType !== 'pro_upgrade') {
      return new Response(
        JSON.stringify({ error: 'Invalid product type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (profile.tier === 'pro') {
      return new Response(
        JSON.stringify({ error: 'User is already Pro' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'FtrMsg Pro',
              description: 'Unlimited messages, video support, 2GB storage',
            },
            unit_amount: 900,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        productType,
      },
      success_url: `${appUrl}?success=true`,
      cancel_url: `${appUrl}?canceled=true`,
    });

    // Payment record enables webhook idempotency and refund processing
    const { error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        user_id: userId,
        stripe_checkout_session_id: session.id,
        amount_cents: 900,
        currency: 'usd',
        product_type: 'pro_upgrade',
        status: 'pending',
      });

    if (paymentError) {
      console.error('Failed to create payment record:', paymentError);
      // Webhook handles record creation if this insert fails
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Checkout error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create checkout session' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
