import type { DefaultSession, DefaultJWT } from 'next-auth';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    contentfulToken: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    contentfulToken: string;
    /** Unix timestamp (seconds). Always set on sign-in; defaults to +4 h if
     *  Contentful's token endpoint omits expires_at. */
    expiresAt: number;
    error?: 'RefreshTokenError';
  }
}
