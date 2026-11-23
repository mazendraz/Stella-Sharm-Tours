import path from 'node:path';

const requestConfig = './src/i18n/request.ts';
/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['@stella/shared', '@stella/ui'],
  output: 'standalone',
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
  poweredByHeader: false,
  experimental: { cpus: 2 },
  // Load the checked-in messages without the experimental extraction plugin.
  turbopack: {
    resolveAlias: { 'next-intl/config': requestConfig },
  },
  webpack(config) {
    config.resolve.alias['next-intl/config'] = path.resolve(
      config.context,
      requestConfig,
    );
    return config;
  },
  async headers() {
    return [
      {
        // Trip-story map tiles never change in place; a new set gets a new
        // folder, so browsers can keep them for a month.
        source: '/journey-tiles/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          },
        ],
      },
    ];
  },
};
export default config;
