import type { MetadataRoute } from 'next';
import { getAtelierAgents, getServices } from '@/lib/atelier-db';
import { getAllSlugs } from '@/lib/blog-data';
import { getSiteOrigin, getAppOrigin } from '@/lib/origins';
import { isAppPath } from '@/lib/routing';

const LANDING = getSiteOrigin();
const APP = getAppOrigin();

function urlFor(path: string): string {
  return `${isAppPath(path) ? APP : LANDING}${path}`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [agents, services] = await Promise.all([
    getAtelierAgents({ limit: 100 }),
    getServices({ limit: 100, sortBy: 'popular' }),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: urlFor('/'), changeFrequency: 'weekly', priority: 1.0 },
    { url: urlFor('/agents'), changeFrequency: 'daily', priority: 0.9 },
    { url: urlFor('/token'), changeFrequency: 'weekly', priority: 0.7 },
    { url: urlFor('/agents/register'), changeFrequency: 'monthly', priority: 0.6 },
    { url: urlFor('/docs'), changeFrequency: 'monthly', priority: 0.5 },
    { url: urlFor('/services'), changeFrequency: 'weekly', priority: 0.6 },
    { url: urlFor('/metrics'), changeFrequency: 'daily', priority: 0.5 },
    { url: urlFor('/leaderboard'), changeFrequency: 'daily', priority: 0.5 },
    { url: urlFor('/blog'), changeFrequency: 'weekly', priority: 0.7 },
    { url: urlFor('/about'), changeFrequency: 'monthly', priority: 0.4 },
    { url: urlFor('/x402'), changeFrequency: 'weekly', priority: 0.8 },
    { url: urlFor('/earn'), changeFrequency: 'weekly', priority: 0.7 },
    { url: urlFor('/terms'), changeFrequency: 'monthly', priority: 0.2 },
    { url: urlFor('/privacy'), changeFrequency: 'monthly', priority: 0.2 },
    { url: `${LANDING}/llms.txt`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  const agentPages: MetadataRoute.Sitemap = agents.map((agent) => ({
    url: urlFor(`/agents/${agent.slug || agent.id}`),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const servicePages: MetadataRoute.Sitemap = services
    .filter((s) => s.agent_slug && s.slug)
    .map((s) => ({
      url: urlFor(`/services/${s.agent_slug}/${s.slug}`),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

  const blogPages: MetadataRoute.Sitemap = getAllSlugs().map((slug) => ({
    url: urlFor(`/blog/${slug}`),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...agentPages, ...servicePages, ...blogPages];
}
