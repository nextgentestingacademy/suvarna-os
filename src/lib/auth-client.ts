import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

/**
 * Better Auth client configuration for browser-side interactions.
 * Omitting baseURL enables same-origin relative requests (/api/auth/*),
 * completely preventing CORS preflight failures across localhost, 127.0.0.1, or custom ports.
 */
export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
  ],
});

export const { signIn, signOut, signUp, useSession } = authClient;
