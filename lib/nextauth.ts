import type { NextAuthOptions } from 'next-auth';

/**
 * NextAuth configuration with a custom Contentful OAuth 2.0 provider.
 *
 * After sign-in, the user's personal CMA access token is stored in the
 * encrypted JWT session cookie and used for all Contentful API calls.
 * This means Contentful's own RBAC enforces what the user can actually do —
 * a read-only member cannot write, regardless of what the UI exposes.
 *
 * ── Security posture notes ────────────────────────────────────────────────
 *
 * PKCE: Not applicable. Contentful's authorization server only documents the
 *   implicit grant (response_type=token). PKCE requires authorization code
 *   flow, which Contentful does not expose. We use response_type=code because
 *   NextAuth requires it for server-side token exchange; verify this works
 *   against your Contentful OAuth app's redirect URI before deploying.
 *
 * Refresh tokens: Not supported. Contentful does not issue refresh tokens
 *   (no offline_access scope, no documented token refresh endpoint). Sessions
 *   are hard-expired at maxAge (8 hours) and users must re-authenticate.
 *
 * Token scope: content_management_manage grants org-wide CMA access (not
 *   scoped to a single space). The token is stored only in an encrypted
 *   HttpOnly cookie; Contentful's RBAC is the enforcement boundary.
 *
 * ── Setup (one-time, per deployment) ─────────────────────────────────────
 *  1. Create an OAuth app at:
 *     https://app.contentful.com/account/profile/developers/applications/new
 *  2. Set Redirect URI to: {YOUR_URL}/api/auth/callback/contentful
 *  3. Set env vars: CONTENTFUL_OAUTH_CLIENT_ID, CONTENTFUL_OAUTH_CLIENT_SECRET,
 *     NEXTAUTH_SECRET (openssl rand -base64 32), NEXTAUTH_URL (your deploy URL)
 */
export const authOptions: NextAuthOptions = {
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
        async request({ tokens }) {
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
      clientId: process.env.CONTENTFUL_OAUTH_CLIENT_ID!,
      clientSecret: process.env.CONTENTFUL_OAUTH_CLIENT_SECRET!,
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
     * This runs once on sign-in before the session is created.
     *
     * Note: GET /spaces/{id} returns 200 for any member role (including
     * read-only). Contentful's API does not allow checking a user's specific
     * role without admin access to /space_members. Write permissions are
     * enforced naturally by Contentful's CMA when the user attempts mutations.
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
     * Contentful does not issue refresh tokens, so this callback only stores
     * the token on initial sign-in and enforces expiry on every subsequent
     * request. When the session's maxAge elapses, NextAuth invalidates it and
     * the middleware redirects to /login.
     *
     * C1 fix: always set expiresAt so the expiry check never short-circuits.
     * Default to 4 hours if Contentful's token endpoint doesn't return expires_at
     * (conservative — well within the 8-hour session maxAge).
     */
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          contentfulToken: account.access_token!,
          // Default to 4 h if expires_at is absent — prevents perpetually valid tokens
          expiresAt: account.expires_at ?? Math.floor(Date.now() / 1000) + 4 * 60 * 60,
        };
      }

      // Session maxAge handles the outer boundary; this inner check catches
      // tokens that expire sooner than the session window.
      if (Date.now() >= token.expiresAt * 1000) {
        // Contentful has no refresh mechanism — force re-login
        return { ...token, error: 'RefreshTokenError' as const };
      }

      return token;
    },

    async session({ session, token }) {
      session.contentfulToken = token.contentfulToken;
      if (token.error) {
        (session as unknown as Record<string, unknown>).error = token.error;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
};
