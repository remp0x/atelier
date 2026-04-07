import type { Metadata } from 'next';
import { resolveAgent, getServicesByAgent, getAgentOrderCounts } from '@/lib/atelier-db';

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const agent = await resolveAgent(id);

  if (!agent) {
    return { title: 'Agent Not Found' };
  }

  const services = await getServicesByAgent(agent.id);
  const prices = services.map((s) => parseFloat(s.price_usd)).filter((p) => !isNaN(p));
  const priceRange = prices.length > 0
    ? prices.length === 1
      ? `$${prices[0]}`
      : `$${Math.min(...prices)}–$${Math.max(...prices)}`
    : null;

  const title = agent.name;
  const description = [
    agent.description || `AI agent on Atelier`,
    priceRange ? `Starting at ${priceRange}.` : null,
    agent.avg_rating ? `${agent.avg_rating.toFixed(1)}/5 rating.` : null,
    'Hire on Atelier — instant Solana payments.',
  ].filter(Boolean).join(' ');

  const slug = agent.slug || agent.id;

  return {
    title,
    description,
    alternates: { canonical: `/agents/${slug}` },
    openGraph: {
      title: `${agent.name} | Atelier`,
      description,
      url: `/agents/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${agent.name} | Atelier`,
      description,
    },
  };
}

function buildProductJsonLd(agent: {
  name: string;
  description: string | null;
  slug: string;
  id: string;
  avatar_url: string | null;
  avg_rating: number | null;
}, services: { price_usd: string }[], completedOrders: number): string {
  const prices = services.map((s) => parseFloat(s.price_usd)).filter((p) => !isNaN(p));
  const slug = agent.slug || agent.id;

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: agent.name,
    description: agent.description || 'AI agent on Atelier',
    url: `https://atelierai.xyz/agents/${slug}`,
    brand: { '@type': 'Organization', '@id': 'https://atelierai.xyz/#organization' },
    category: 'AI Agent',
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://atelierai.xyz' },
        { '@type': 'ListItem', position: 2, name: 'Agents', item: 'https://atelierai.xyz/agents' },
        { '@type': 'ListItem', position: 3, name: agent.name, item: `https://atelierai.xyz/agents/${slug}` },
      ],
    },
  };

  if (agent.avatar_url) jsonLd.image = agent.avatar_url;

  if (prices.length > 0) {
    jsonLd.offers = {
      '@type': 'AggregateOffer',
      lowPrice: String(Math.min(...prices)),
      highPrice: String(Math.max(...prices)),
      priceCurrency: 'USD',
      offerCount: services.length,
      availability: 'https://schema.org/InStock',
    };
  }

  if (agent.avg_rating && completedOrders > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: agent.avg_rating.toFixed(1),
      bestRating: '5',
      worstRating: '1',
      ratingCount: completedOrders,
    };
  }

  return JSON.stringify(jsonLd);
}

export default async function AgentLayout({ params, children }: Props) {
  const { id } = await params;
  const agent = await resolveAgent(id);

  if (!agent) return <>{children}</>;

  const [services, orderCounts] = await Promise.all([
    getServicesByAgent(agent.id),
    getAgentOrderCounts(agent.id),
  ]);

  const jsonLdString = buildProductJsonLd(agent, services, orderCounts.completed);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString }} />
      {children}
    </>
  );
}
