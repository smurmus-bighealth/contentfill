import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-compatible Auth.js config subset.
 *
 * Middleware runs in the Next.js Edge runtime, which does not support Node.js
 * APIs. The full auth.ts config (OAuth provider, userinfo fetch, etc.) cannot
 * run there. Auth.js v5 solves this with a split-config pattern:
 *
 *   auth.config.ts  ← this file — pages + authorized callback only (Edge-safe)
 *   auth.ts         ← full config with providers (Node.js runtime only)
 *   middleware.ts   ← imports from auth.config.ts (Edge-safe)
 *
 * See: https://authjs.dev/getting-started/migrating-to-v5#edge-compatibility
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },

  providers: [],
  // Providers are intentionally empty here. Auth.js requires the field but
  // the actual OAuth provider is only needed in auth.ts (Node.js runtime).

  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      // Local dev mode — CONTENTFUL_MANAGEMENT_TOKEN is the credential gate.
      if (!process.env.CONTENTFUL_OAUTH_CLIENT_ID) return true;

      // auth is null when there is no valid session.
      const session = auth as (typeof auth & { error?: string }) | null;

      if (!session || session.error === 'RefreshTokenError') {
        // API routes return 401; page routes redirect to /login via pages.signIn.
        if (pathname.startsWith('/api/')) {
          // Returning a Response directly from authorized() sends it as-is.
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return false; // Auth.js redirects to pages.signIn
      }

      return true;
    },
  },
};
