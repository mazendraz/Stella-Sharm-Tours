import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  // The dev-only indicator sat on top of the mobile bottom nav.
  devIndicators: false,
  transpilePackages: ['@stella/shared'],
  experimental: { cpus: 2 },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; connect-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'",
          },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};
export default config;
