import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

/**
 * Returns the Contentful CMA token to use for the current request.
 *
 * OAuth mode  (CONTENTFUL_OAUTH_CLIENT_ID is set):
 *   The user's personal token from their NextAuth session. The middleware
 *   has already verified the session is valid before the route handler runs,
 *   so a null return here means the cookie was somehow absent or malformed.
 *   Contentful's own RBAC enforces their permissions — a read-only member
 *   cannot write, regardless of what the UI offers.
 *
 *   Uses getToken() rather than getServerSession() because in Next.js 15 the
 *   cookies() API used internally by getServerSession() is async, causing it
 *   to silently return null in App Router route handlers.
 *
 * Local dev mode (no OAuth configured):
 *   Uses CONTENTFUL_MANAGEMENT_TOKEN from env directly. The token itself
 *   is the credential gate — no additional auth check is performed.
 *
 * Returns null when the caller should respond 401.
 */
export async function getContentfulToken(request: Request): Promise<string | null> {
  if (process.env.CONTENTFUL_OAUTH_CLIENT_ID) {
    const token = await getToken({
      req: request as NextRequest,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NEXTAUTH_URL?.startsWith('https://') ?? true,
    });
    return (token?.contentfulToken as string | undefined) ?? null;
  }

  // Local dev mode — no auth check, management token is the gate
  return process.env.CONTENTFUL_MANAGEMENT_TOKEN ?? null;
}
