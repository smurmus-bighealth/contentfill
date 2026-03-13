import NextAuth from 'next-auth';
import { authOptions } from '@/lib/nextauth';
import type { NextRequest } from 'next/server';

// Next.js 15 made route handler params a Promise — NextAuth v4 doesn't await
// them, which silently breaks session cookie writing after the OAuth callback
// even though the callback logic (token exchange, profile fetch) succeeds.
// Wrapping the handler and awaiting params fixes this.

const handler = NextAuth(authOptions);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nextauth: string[] }> },
) {
  return handler(req, { params: await params });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nextauth: string[] }> },
) {
  return handler(req, { params: await params });
}
