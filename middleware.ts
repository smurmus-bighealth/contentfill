import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const IS_OAUTH_MODE = !!process.env.CONTENTFUL_OAUTH_CLIENT_ID;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow the NextAuth routes and the login page through
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // ── OAuth mode ────────────────────────────────────────────────────────────
  if (IS_OAUTH_MODE) {
    // C2 fix: pass secret explicitly — don't rely on implicit env var resolution
    // in the Next.js Edge runtime, where variable lookup order is less predictable.
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
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

  // ── Local / simple mode (no OAuth configured) ─────────────────────────────
  // Mirrors the original behaviour: open if ADMIN_SECRET is unset, otherwise
  // require the secret header on API routes.
  if (!pathname.startsWith('/api/')) return NextResponse.next();

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return NextResponse.next();

  const provided =
    request.headers.get('x-admin-secret') ??
    // M1 fix: case-insensitive match for the Bearer prefix (RFC 7230 §3.2)
    request.headers.get('authorization')?.replace(/^Bearer /i, '');

  if (provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
