import path from 'path';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://api.contentful.com https://app.contentful.com",
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
