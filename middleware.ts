import { getToken } from 'next-auth/jwt';
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
    // Pass secret and secureCookie explicitly.
    // The Edge runtime may detect the protocol differently from the Node.js API
    // route that set the cookie, causing getToken() to look for the wrong cookie
    // name. NEXTAUTH_URL starting with https means the __Secure- prefix is used.
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NEXTAUTH_URL?.startsWith('https://') ?? true,
    });

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
