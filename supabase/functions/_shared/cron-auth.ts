/**
 * Verify cron secret header for authentication
 * Guards process-delivery and cleanup-logs from unauthorized invocation
 */
export function verifyCronSecret(request: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    return false;
  }
  return request.headers.get('x-cron-secret') === cronSecret;
}
