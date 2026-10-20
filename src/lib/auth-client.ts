import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

/**
 * Better Auth client configuration for browser-side interactions.
 * Connects to Next.js route handler at /api/auth/*
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  plugins: [
    organizationClient(),
  ],
});

export const { signIn, signOut, signUp, useSession } = authClient;
