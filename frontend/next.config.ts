import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';
const backendOrigin = apiBase.replace(/\/api\/v1\/?$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async rewrites() {
    // Proxy uploaded assets (banner images) from the backend during dev.
    return [{ source: '/uploads/:path*', destination: `${backendOrigin}/uploads/:path*` }];
  },
};

export default withNextIntl(nextConfig);
