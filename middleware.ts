import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl;

  // ── Local dev mode (no OAuth configured) ─────────────────────────────────
  // Open — CONTENTFUL_MANAGEMENT_TOKEN in .env is the credential gate.
  if (!process.env.CONTENTFUL_OAUTH_CLIENT_ID) {
    return NextResponse.next();
  }

  // ── OAuth mode ────────────────────────────────────────────────────────────
  // req.auth is populated by Auth.js v5 from the encrypted session cookie.
  // Auth.js v5 automatically passes through /api/auth/** routes.
  if (!req.auth || req.auth.error === 'RefreshTokenError') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Exclude Next.js internals and known public assets.
  // Each public/ file must be explicitly listed here — intentionally narrow
  // so that adding a new file requires a conscious decision to allow it through.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|contentfill\\.png|logo\\.png).*)'],
};
