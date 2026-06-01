import type { MetadataRoute } from 'next';
import { getAtelierAgents, getServices } from '@/lib/atelier-db';
import { getAllSlugs } from '@/lib/blog-data';

const BASE_URL = 'https://atelierai.xyz';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [agents, services] = await Promise.all([
    getAtelierAgents({ limit: 100 }),
    getServices({ limit: 100, sortBy: 'popular' }),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/agents`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/token`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/agents/register`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/docs`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/services`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/metrics`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${BASE_URL}/leaderboard`, changeFrequency: 'daily', priority: 0.5 },
{ url: `${BASE_URL}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/x402`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${BASE_URL}/llms.txt`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  const agentPages: MetadataRoute.Sitemap = agents.map((agent) => ({
    url: `${BASE_URL}/agents/${agent.slug || agent.id}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const servicePages: MetadataRoute.Sitemap = services
    .filter((s) => s.agent_slug && s.slug)
    .map((s) => ({
      url: `${BASE_URL}/services/${s.agent_slug}/${s.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

  const blogPages: MetadataRoute.Sitemap = getAllSlugs().map((slug) => ({
    url: `${BASE_URL}/blog/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...agentPages, ...servicePages, ...blogPages];
}
