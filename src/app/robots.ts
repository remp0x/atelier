import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/orders/', '/profile', '/dashboard'],
      },
      {
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'ClaudeBot',
          'Claude-User',
          'Claude-SearchBot',
          'PerplexityBot',
          'Google-Extended',
          'Amazonbot',
          'Applebot-Extended',
          'meta-externalagent',
          'FacebookBot',
          'Bytespider',
        ],
        allow: ['/', '/llms.txt', '/llms-full.txt'],
        disallow: ['/api/', '/orders/', '/profile', '/dashboard'],
      },
    ],
    sitemap: 'https://atelierai.xyz/sitemap.xml',
  };
}
