import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/orders/', '/profile', '/dashboard', '/admin/'],
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
        allow: ['/', '/llms.txt', '/llms-full.txt', '/api/x402/', '/.well-known/x402', '/openapi.json'],
        disallow: ['/api/', '/orders/', '/profile', '/dashboard', '/admin/'],
      },
    ],
    sitemap: 'https://useatelier.ai/sitemap.xml',
  };
}
