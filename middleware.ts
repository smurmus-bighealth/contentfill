import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

// Use the Edge-compatible config subset (no OAuth provider, no Node.js APIs).
// The authorized() callback in authConfig handles all access control logic.
// See auth.config.ts for details on the split-config pattern.
export default NextAuth(authConfig).auth;

export const config = {
  // Exclude Next.js internals and known public assets.
  // Each public/ file must be explicitly listed here — intentionally narrow
  // so that adding a new file requires a conscious decision to allow it through.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|contentfill\\.png|logo\\.png).*)'],
};
