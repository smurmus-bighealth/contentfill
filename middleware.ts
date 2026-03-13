import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl;

  // ── Local dev mode (no OAuth configured) ─────────────────────────────────
  // CONTENTFUL_MANAGEMENT_TOKEN is the credential gate: only allow access if
  // the token is actually configured.
  if (!process.env.CONTENTFUL_OAUTH_CLIENT_ID) {
    if (!process.env.CONTENTFUL_MANAGEMENT_TOKEN) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    return NextResponse.next();
  }

  // ── OAuth mode ────────────────────────────────────────────────────────────
  // Auth.js v5 passes /api/auth/** routes through to the route handler without
  // calling this callback, so sign-in/callback routes are never blocked here.
  const session = req.auth;
  if (!session || session.error === 'RefreshTokenError') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|contentfill\\.png|logo\\.png).*)'],
};
