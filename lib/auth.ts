import { decode } from 'next-auth/jwt';
import { cookies } from 'next/headers';

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
 *   Uses next/headers cookies() + next-auth/jwt decode() rather than
 *   getServerSession() or getToken(req) because in Next.js 15 the App Router
 *   cookies() API is async and must be awaited — both getServerSession() and
 *   getToken(req) use synchronous cookie access internally and return null in
 *   Node.js route handler contexts.
 *
 * Local dev mode (no OAuth configured):
 *   Uses CONTENTFUL_MANAGEMENT_TOKEN from env directly. The token itself
 *   is the credential gate — no additional auth check is performed.
 *
 * Returns null when the caller should respond 401.
 */
export async function getContentfulToken(_request?: Request): Promise<string | null> {
  if (process.env.CONTENTFUL_OAUTH_CLIENT_ID) {
    const isSecure = process.env.NEXTAUTH_URL?.startsWith('https://') ?? true;
    const cookieName = isSecure
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token';

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(cookieName)?.value;
    if (!sessionToken) return null;

    const token = await decode({
      token: sessionToken,
      secret: process.env.NEXTAUTH_SECRET!,
    });

    return (token?.contentfulToken as string | undefined) ?? null;
  }

  // Local dev mode — no auth check, management token is the gate
  return process.env.CONTENTFUL_MANAGEMENT_TOKEN ?? null;
}
