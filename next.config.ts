import path from 'path';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // HSTS: browsers will enforce HTTPS for 2 years. Vercel sets this too,
  // but being explicit ensures it's present in all deployment targets.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Disable browser features this app has no use for.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      // All Contentful API calls are server-side; the client only calls its own
      // API routes. Contentful domains are not needed here.
      "connect-src 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Pin the project root explicitly so Next.js doesn't walk up to a parent
  // workspace directory and get confused by other lockfiles there.
  outputFileTracingRoot: path.join(__dirname),
  // Disable x-powered-by header (minor security hardening)
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
