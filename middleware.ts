import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SECRET = process.env.ADMIN_SECRET;

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();
  if (!SECRET) return NextResponse.next(); // dev: no secret = open

  const token =
    request.headers.get('x-admin-secret') ??
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (token !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
