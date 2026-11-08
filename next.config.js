const path = require('path');

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  publicExcludes: ['!noprecache/**/*', '!averycorp-emblem.jpeg'],
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ request, url: { pathname }, sameOrigin }) =>
          request.headers.get('RSC') === '1' &&
          request.headers.get('Next-Router-Prefetch') === '1' &&
          sameOrigin &&
          !pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-rsc-prefetch',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          },
          plugins: [
            {
              handlerDidError: async ({ request }) =>
                fetch(request).catch(() => new Response('', { status: 204 })),
            },
          ],
        },
      },
      {
        urlPattern: ({ request, url: { pathname }, sameOrigin }) =>
          request.headers.get('RSC') === '1' &&
          sameOrigin &&
          !pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-rsc',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          },
          plugins: [
            {
              handlerDidError: async ({ request }) => fetch(request),
            },
          ],
        },
      },
      {
        urlPattern: ({ url: { pathname }, sameOrigin }) =>
          sameOrigin && !pathname.startsWith('/api/'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60,
          },
          plugins: [
            {
              handlerDidError: async ({ request }) => fetch(request),
            },
          ],
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.alias['@anthropic-ai/sdk'] = path.resolve(__dirname, 'lib/anthropic.ts');
      config.resolve.alias['@firebase/firestore'] = path.resolve(
        __dirname,
        'node_modules/@firebase/firestore/dist/index.esm2017.js',
      );
      config.resolve.alias['firebase/firestore'] = path.resolve(
        __dirname,
        'node_modules/firebase/firestore/dist/esm/index.esm.js',
      );
    }
    return config;
  },
};
module.exports = withPWA(nextConfig);

