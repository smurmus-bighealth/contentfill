import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth(function middleware(req) {
  // Local dev mode: CONTENTFUL_MANAGEMENT_TOKEN is the only credential gate.
  if (!process.env.CONTENTFUL_OAUTH_CLIENT_ID) {
    return process.env.CONTENTFUL_MANAGEMENT_TOKEN
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/login', req.url));
  }

  // OAuth mode: req.auth is the decrypted session, null if unauthenticated.
  if (!req.auth || req.auth.error === 'RefreshTokenError') {
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run on all routes except:
    //   _next/static, _next/image  — Next.js internals
    //   favicon.ico, *.png         — static assets
    //   login                      — public page; must never be blocked or it loops
    //   api/auth                   — Auth.js route handler; middleware must not intercept
    '/((?!_next/static|_next/image|favicon\\.ico|contentfill\\.png|logo\\.png|login|api/auth).*)',
  ],
};
