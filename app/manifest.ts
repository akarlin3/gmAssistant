import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gamemaster Assistant',
    short_name: 'GM Assist',
    description: 'TTRPG campaign prep — Lazy DM · CCD · Proactive Roleplaying',
    start_url: '/campaign',
    display: 'standalone',
    background_color: '#f5ecd7',
    theme_color: '#b1201e',
    icons: [
      {
        src: '/averycorp-emblem.jpeg',
        sizes: '192x192',
        type: 'image/jpeg',
        purpose: 'any',
      },
      {
        src: '/averycorp-emblem.jpeg',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'maskable',
      },
      {
        src: '/averycorp-emblem-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/averycorp-emblem-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
