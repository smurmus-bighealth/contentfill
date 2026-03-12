import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Disable x-powered-by header (minor security hardening)
  poweredByHeader: false,
};

export default nextConfig;
