import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@stella/shared', '@stella/ui'],
  poweredByHeader: false,
  experimental: { cpus: 2 },
  images: {
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
    // These are the actual immutable widths produced by the media worker.
    // Default Next widths would label a 768px file as 640w, for example.
    deviceSizes: [480, 768, 1200, 1920],
    imageSizes: [160],
  },
  async headers() {
    return [
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
export default createNextIntlPlugin('./src/i18n/request.ts')(config);
