import type { Metadata } from 'next';
import { resolveServiceByAgentSlug } from '@/lib/atelier-db';
import { CATEGORY_LABELS } from '@/components/atelier/constants';
import { getAppOrigin } from '@/lib/origins';

interface Props {
  params: Promise<{ agentSlug: string; serviceSlug: string }>;
  children: React.ReactNode;
}

function formatPrice(priceType: string, priceUsd: string): string {
  if (priceType === 'fixed') return `$${priceUsd}`;
  if (priceType === 'weekly') return `$${priceUsd}/week`;
  if (priceType === 'monthly') return `$${priceUsd}/month`;
  return 'custom quote';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { agentSlug, serviceSlug } = await params;
  const service = await resolveServiceByAgentSlug(agentSlug, serviceSlug);

  if (!service) {
    return { title: 'Service Not Found' };
  }

  const category = CATEGORY_LABELS[service.category] || 'Service';
  const price = formatPrice(service.price_type, service.price_usd);
  const title = service.title;
  const description = [
    service.description?.slice(0, 160) || `${category} service on Atelier`,
    `By ${service.agent_name}.`,
    `${price.charAt(0).toUpperCase()}${price.slice(1)}.`,
    service.avg_rating ? `${service.avg_rating.toFixed(1)}/5 rating.` : null,
    'Hire on Atelier — instant USDC payments on Solana or Base.',
  ].filter(Boolean).join(' ');

  const path = `/services/${agentSlug}/${serviceSlug}`;
  const ogImage = `/api/og/service?agent=${encodeURIComponent(agentSlug)}&service=${encodeURIComponent(serviceSlug)}`;

  return {
    title,
    description,
    metadataBase: new URL(getAppOrigin()),
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | Atelier`,
      description,
      url: path,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Atelier`,
      description,
      images: [ogImage],
    },
  };
}

function buildServiceJsonLd(
  service: {
    title: string;
    description: string;
    price_usd: string;
    agent_name: string;
    avg_rating: number | null;
    completed_orders: number;
    category: string;
  },
  agentSlug: string,
  serviceSlug: string,
): string {
  const url = `${getAppOrigin()}/services/${agentSlug}/${serviceSlug}`;
  const price = parseFloat(service.price_usd);

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: service.title,
    description: service.description || `${service.category} service on Atelier`,
    url,
    category: CATEGORY_LABELS[service.category as keyof typeof CATEGORY_LABELS] || 'AI Service',
    brand: { '@type': 'Organization', '@id': 'https://useatelier.ai/#organization' },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://useatelier.ai' },
        { '@type': 'ListItem', position: 2, name: 'Services', item: `${getAppOrigin()}/services` },
        { '@type': 'ListItem', position: 3, name: service.title, item: url },
      ],
    },
  };

  if (!isNaN(price)) {
    jsonLd.offers = {
      '@type': 'Offer',
      price: String(price),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: service.agent_name },
    };
  }

  if (service.avg_rating && service.completed_orders > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: service.avg_rating.toFixed(1),
      bestRating: '5',
      worstRating: '1',
      ratingCount: service.completed_orders,
    };
  }

  return JSON.stringify(jsonLd).replace(/</g, '\\u003c');
}

export default async function ServiceDetailLayout({ params, children }: Props) {
  const { agentSlug, serviceSlug } = await params;
  const service = await resolveServiceByAgentSlug(agentSlug, serviceSlug);

  if (!service) return <>{children}</>;

  const jsonLdString = buildServiceJsonLd(service, agentSlug, serviceSlug);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString }} />
      {children}
    </>
  );
}
