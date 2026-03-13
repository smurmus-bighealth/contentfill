import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';

/**
 * Auth.js v5 configuration with a custom Contentful OAuth 2.0 provider.
 *
 * After sign-in, the user's personal CMA access token is stored in the
 * encrypted JWT session cookie and used for all Contentful API calls.
 * Contentful's own RBAC enforces what each user can actually do —
 * a read-only member cannot write regardless of what the UI exposes.
 *
 * ── Security posture ─────────────────────────────────────────────────────
 *
 * PKCE: Contentful's authorization server does not support PKCE, so we use
 *   plain authorization_code flow without a code_challenge.
 *
 * Refresh tokens: Not supported. Contentful does not issue refresh tokens.
 *   Sessions hard-expire at maxAge (8 hours) and users must re-authenticate.
 *
 * Token scope: content_management_manage grants org-wide CMA access.
 *   The token is stored only in an encrypted HttpOnly cookie (AUTH_SECRET).
 *   Contentful's RBAC is the enforcement boundary.
 *
 * ── Setup (one-time, per deployment) ─────────────────────────────────────
 *  1. Create an OAuth app at:
 *     https://app.contentful.com/account/profile/developers/applications/new
 *  2. Set Redirect URI to: {YOUR_URL}/api/auth/callback/contentful
 *  3. Set env vars: CONTENTFUL_OAUTH_CLIENT_ID, CONTENTFUL_OAUTH_CLIENT_SECRET,
 *     AUTH_SECRET (openssl rand -base64 32), AUTH_URL (your deploy URL)
 */
const config: NextAuthConfig = {
  providers: [
    {
      id: 'contentful',
      name: 'Contentful',
      type: 'oauth',
      authorization: {
        url: 'https://be.contentful.com/oauth/authorize',
        params: {
          scope: 'content_management_manage',
          response_type: 'code',
        },
      },
      token: 'https://be.contentful.com/oauth/token',
      userinfo: {
        url: 'https://api.contentful.com/users/me',
        async request({ tokens }: { tokens: { access_token?: string } }) {
          const res = await fetch('https://api.contentful.com/users/me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          return res.json();
        },
      },
      profile(profile) {
        return {
          id: profile.sys.id,
          name: `${profile.firstName} ${profile.lastName}`.trim() || profile.email,
          email: profile.email,
          image: profile.avatarUrl ?? null,
        };
      },
      clientId: process.env.CONTENTFUL_OAUTH_CLIENT_ID,
      clientSecret: process.env.CONTENTFUL_OAUTH_CLIENT_SECRET,
    },
  ],

  session: {
    strategy: 'jwt',
    // Contentful does not support token refresh (no refresh_token issued).
    // Hard-expire the session so stale tokens don't persist indefinitely.
    maxAge: 8 * 60 * 60, // 8 hours
  },

  callbacks: {
    /**
     * Verify the user is a member of the configured Contentful space.
     * Runs once on sign-in before the session is created.
     */
    async signIn({ account }) {
      if (!account?.access_token) return false;

      const spaceId = process.env.CONTENTFUL_SPACE_ID;
      if (!spaceId) return false;

      try {
        const res = await fetch(`https://api.contentful.com/spaces/${spaceId}`, {
          headers: { Authorization: `Bearer ${account.access_token}` },
        });
        // Return a generic error code — don't leak which specific check failed
        if (!res.ok) return '/login?error=AccessDenied';
        return true;
      } catch {
        return '/login?error=AccessDenied';
      }
    },

    /**
     * Persist the Contentful CMA token into the encrypted JWT.
     *
     * Only stores the token on initial sign-in; enforces expiry on every
     * subsequent request. When maxAge elapses, Auth.js invalidates the session
     * and middleware redirects to /login.
     */
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          contentfulToken: account.access_token!,
          // Default to 4 h if Contentful's token endpoint omits expires_at.
          expiresAt: account.expires_at ?? Math.floor(Date.now() / 1000) + 4 * 60 * 60,
        };
      }

      // session.maxAge handles the outer boundary; this inner check catches
      // tokens that expire sooner than the session window.
      if (typeof token.expiresAt === 'number' && Date.now() >= token.expiresAt * 1000) {
        return { ...token, error: 'RefreshTokenError' as const };
      }

      return token;
    },

    async session({ session, token }) {
      return {
        ...session,
        contentfulToken: token.contentfulToken as string,
        ...(token.error ? { error: token.error } : {}),
      };
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  // Set AUTH_LOG_LEVEL=debug in Vercel env vars to enable verbose logging.
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
