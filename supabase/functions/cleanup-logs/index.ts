import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts';

serve(async (req: Request) => {
  if (!verifyCronSecret(req)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    const { count, error } = await supabaseAdmin
      .from('delivery_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw new Error(`Failed to delete logs: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ deleted: count || 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Cleanup logs error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
