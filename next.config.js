const path = require('path');

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

module.exports = nextConfig;
