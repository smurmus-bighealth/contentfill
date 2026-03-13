import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    contentfulToken: string;
    error?: 'RefreshTokenError';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    contentfulToken?: string;
    /** Unix timestamp (seconds). Always set on sign-in; defaults to +4 h if
     *  Contentful's token endpoint omits expires_at. */
    expiresAt?: number;
    error?: 'RefreshTokenError';
  }
}
