import { getServerSession } from 'next-auth';
import { authOptions } from './nextauth';

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
 * Local dev mode (no OAuth configured):
 *   Uses CONTENTFUL_MANAGEMENT_TOKEN from env directly. The token itself
 *   is the credential gate — no additional auth check is performed.
 *
 * Returns null when the caller should respond 401.
 */
export async function getContentfulToken(request: Request): Promise<string | null> {
  if (process.env.CONTENTFUL_OAUTH_CLIENT_ID) {
    const session = await getServerSession(authOptions);
    return session?.contentfulToken ?? null;
  }

  // Local dev mode — no auth check, management token is the gate
  return process.env.CONTENTFUL_MANAGEMENT_TOKEN ?? null;
}
