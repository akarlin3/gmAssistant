const path = require('path');

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
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
    }
    return config;
  },
};
module.exports = withPWA(nextConfig);

