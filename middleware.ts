import { decode } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const IS_OAUTH_MODE = !!process.env.CONTENTFUL_OAUTH_CLIENT_ID;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow: NextAuth routes, login page, and public/ static assets.
  // Each public/ file must be explicitly listed here — intentionally narrow
  // so that adding a new file requires a conscious decision to allow it through.
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login') ||
    pathname === '/contentfill.png' ||
    pathname === '/logo.png'
  ) {
    return NextResponse.next();
  }

  // ── OAuth mode ────────────────────────────────────────────────────────────
  if (IS_OAUTH_MODE) {
    // Use decode() directly rather than getToken(). getToken() internally calls
    // decode() after reading the cookie — the two steps are equivalent.
    // getToken() fails in the Next.js 15 Edge runtime even when the cookie is
    // present (likely an internal cookie-resolution issue); doing both steps
    // manually avoids this while preserving the same security properties:
    //   • decode() uses jose jwtDecrypt, which validates the NEXTAUTH_SECRET,
    //     exp claim, and nbf claim — forged or expired tokens are rejected.
    //   • Tokens with RefreshTokenError are treated as invalid (re-auth required).
    const isSecure = process.env.NEXTAUTH_URL?.startsWith('https://') ?? true;
    const cookieName = isSecure
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token';

    const rawToken = request.cookies.get(cookieName)?.value;
    let token: Awaited<ReturnType<typeof decode>> = null;
    if (rawToken) {
      try {
        token = await decode({
          token: rawToken,
          secret: process.env.NEXTAUTH_SECRET!,
        });
      } catch {
        token = null;
      }
    }

    if (!token || token.error === 'RefreshTokenError') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // ── Local dev mode (no OAuth configured) ─────────────────────────────────
  // Open — CONTENTFUL_MANAGEMENT_TOKEN in .env is the credential gate.
  return NextResponse.next();
}

export const config = {
  // Exclude Next.js internals and the two known public/ assets by exact name.
  // Each public/ file must be explicitly listed here — intentionally narrow
  // so that adding a new file requires a conscious decision to allow it through.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|contentfill\\.png|logo\\.png).*)'],
};
