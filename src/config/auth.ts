import { createAuthClient } from 'better-auth/client';
import { genericOAuthClient } from 'better-auth/client/plugins';
import { jwtClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [genericOAuthClient(), jwtClient()],
});
