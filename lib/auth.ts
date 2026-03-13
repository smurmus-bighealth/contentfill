import { getServerSession } from 'next-auth';
import { authOptions } from './nextauth';

/**
 * Returns the Contentful CMA token to use for the current request.
 *
 * OAuth mode  (CONTENTFUL_OAUTH_CLIENT_ID is set):
 *   The user's personal token from their NextAuth session.
 *   Contentful's own RBAC enforces their permissions — a read-only member
 *   cannot write, regardless of what the UI offers.
 *
 * Local / simple mode (no OAuth configured):
 *   Falls back to CONTENTFUL_MANAGEMENT_TOKEN from env, optionally gated
 *   by ADMIN_SECRET (the previous behaviour for local dev / simple deploys).
 *
 * Returns null when the caller should respond 401.
 */
export async function getContentfulToken(request: Request): Promise<string | null> {
  if (process.env.CONTENTFUL_OAUTH_CLIENT_ID) {
    // Middleware already verified the session; getServerSession just retrieves it.
    const session = await getServerSession(authOptions);
    return session?.contentfulToken ?? null;
  }

  // Legacy / local mode
  const secret = process.env.ADMIN_SECRET;
  if (secret && request.headers.get('x-admin-secret') !== secret) {
    return null;
  }
  return process.env.CONTENTFUL_MANAGEMENT_TOKEN ?? null;
}

// Keep the old name around for the generate-transform route (no token needed there).
export function checkAuth(request: Request): boolean {
  if (process.env.CONTENTFUL_OAUTH_CLIENT_ID) {
    // In OAuth mode the middleware handles auth; route-level check is not used.
    return true;
  }
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return true;
  return request.headers.get('x-admin-secret') === secret;
}
