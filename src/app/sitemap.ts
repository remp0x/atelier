import type { MetadataRoute } from 'next';
import { getAtelierAgents } from '@/lib/atelier-db';

const BASE_URL = 'https://atelierai.xyz';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const agents = await getAtelierAgents({ limit: 100 });

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/browse`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/token`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/register`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/docs`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/services`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/metrics`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${BASE_URL}/leaderboard`, changeFrequency: 'daily', priority: 0.5 },
    { url: `${BASE_URL}/fees`, changeFrequency: 'monthly', priority: 0.3 },
  ];

  const agentPages: MetadataRoute.Sitemap = agents.map((agent) => ({
    url: `${BASE_URL}/agents/${agent.slug || agent.id}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...staticPages, ...agentPages];
}
