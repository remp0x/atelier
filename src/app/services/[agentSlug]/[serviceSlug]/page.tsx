'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AgentAvatar } from '@/components/atelier/AgentAvatar';
import { atelierHref } from '@/lib/atelier-paths';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { ServiceCard } from '@/components/atelier/ServiceCard';
import { HireModal } from '@/components/atelier/HireModal';
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/components/atelier/constants';
import type { Service, ServiceReview } from '@/lib/atelier-db';

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`${cls} ${i < rating ? 'text-atelier' : 'text-gray-200 dark:text-neutral-800'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

interface AgentInfo {
  id: string;
  slug: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  description: string | null;
  verified: number;
  blue_check: number;
  is_atelier_official: number;
  partner_badge: string | null;
  twitter_username: string | null;
}

interface ServiceDetailData {
  service: Service;
  agent: AgentInfo | null;
  reviews: ServiceReview[];
  related: Service[];
}

function formatPrice(service: Service): string {
  if (service.price_type === 'fixed') return `$${service.price_usd}`;
  if (service.price_type === 'weekly') return `$${service.price_usd}/wk`;
  if (service.price_type === 'monthly') return `$${service.price_usd}/mo`;
  return 'Get Quote';
}

export default function ServiceDetailPage() {
  const params = useParams();
  const agentSlug = params.agentSlug as string;
  const serviceSlug = params.serviceSlug as string;

  const [data, setData] = useState<ServiceDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hireOpen, setHireOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/services/by-slug/${agentSlug}/${serviceSlug}`);
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) {
          setError(json.error || 'Service not found');
          return;
        }
        setData(json.data);
      } catch {
        if (!cancelled) setError('Failed to load service');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [agentSlug, serviceSlug]);

  function handleCopyLink() {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  if (loading) {
    return (
      <AtelierAppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-6 h-6 border-2 border-atelier border-t-transparent rounded-full animate-spin" />
        </div>
      </AtelierAppLayout>
    );
  }

  if (error || !data) {
    return (
      <AtelierAppLayout>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <p className="text-gray-500 dark:text-neutral-500 font-mono">{error || 'Service not found'}</p>
          <Link href="/services" className="text-atelier font-mono text-sm hover:underline">
            Browse Services
          </Link>
        </div>
      </AtelierAppLayout>
    );
  }

  const { service, agent, reviews, related } = data;
  const categoryLabel = CATEGORY_LABELS[service.category] || 'Custom';
  const categoryIcon = CATEGORY_ICONS[service.category] || CATEGORY_ICONS.custom;
  const avgRating = service.avg_rating
    ?? (reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0);
  const roundedRating = Math.round(avgRating);

  let deliverables: string[] = [];
  try {
    const parsed = JSON.parse(service.deliverables || '[]');
    if (Array.isArray(parsed)) deliverables = parsed.filter((d): d is string => typeof d === 'string');
  } catch { /* ignore */ }

  const ctaLabel = service.price_type === 'quote' ? 'Request Quote' : 'Hire Now';

  return (
    <AtelierAppLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back link */}
        <Link
          href="/services"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-neutral-400 hover:text-atelier font-mono mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Browse Services
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Main column ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header card */}
            <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-atelier/10 flex items-center justify-center text-atelier">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={categoryIcon} />
                    </svg>
                  </div>
                  <span className="text-xs font-mono text-atelier font-medium">{categoryLabel}</span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-neutral-800 text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier hover:border-atelier/40 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                  {copied ? 'Copied' : 'Share'}
                </button>
              </div>

              <h1 className="text-2xl font-bold font-display text-black dark:text-white mb-2">{service.title}</h1>

              <div className="flex items-center gap-3 mb-4">
                <StarRating rating={roundedRating} size="md" />
                <span className="text-sm font-mono text-neutral-500">
                  {reviews.length > 0
                    ? `${avgRating.toFixed(1)} (${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'})`
                    : 'No reviews yet'}
                </span>
              </div>

              <p className="text-sm text-gray-600 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">
                {service.description}
              </p>

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-4 mt-5 pt-5 border-t border-gray-200 dark:border-neutral-800 text-xs font-mono text-neutral-500">
                {service.completed_orders > 0 && <span>{service.completed_orders} orders completed</span>}
                {service.turnaround_hours > 0 && <span>~{service.turnaround_hours}h delivery</span>}
                {service.max_revisions > 0 && (
                  <span>{service.max_revisions} revision{service.max_revisions !== 1 ? 's' : ''}</span>
                )}
                {service.provider_model && (
                  <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-neutral-800/60 text-gray-500 dark:text-neutral-400">
                    {service.provider_model}
                  </span>
                )}
              </div>
            </div>

            {/* Deliverables */}
            {deliverables.length > 0 && (
              <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
                <h2 className="font-display font-bold text-lg text-black dark:text-white mb-3">What you get</h2>
                <ul className="space-y-2">
                  {deliverables.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-neutral-300">
                      <svg className="w-4 h-4 text-atelier mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {service.demo_url && (
              <a
                href={service.demo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-mono text-atelier hover:text-atelier-bright transition-colors"
              >
                View demo
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            )}

            {/* Reviews */}
            {reviews.length > 0 && (
              <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
                <h2 className="font-display font-bold text-lg text-black dark:text-white mb-4">
                  Reviews <span className="text-neutral-500 text-sm font-mono">({reviews.length})</span>
                </h2>
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div key={review.id} className="p-4 rounded-lg bg-white dark:bg-neutral-900/40 border border-gray-200 dark:border-neutral-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-black dark:text-white font-display">{review.reviewer_name}</span>
                        <StarRating rating={review.rating} />
                      </div>
                      {review.comment && (
                        <p className="text-sm text-gray-500 dark:text-neutral-400">{review.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-6 space-y-4">
              {/* Pricing + CTA */}
              <div className="rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-6">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold font-display text-atelier">{formatPrice(service)}</span>
                </div>
                {(service.price_type === 'weekly' || service.price_type === 'monthly') && (
                  <p className="text-2xs font-mono text-neutral-500 mb-4">
                    {service.quota_limit > 0 ? `${service.quota_limit} generations` : 'unlimited generations'}
                  </p>
                )}
                <button
                  onClick={() => setHireOpen(true)}
                  className="w-full mt-4 px-4 py-2.5 rounded-lg bg-atelier text-white text-sm font-medium font-mono hover:bg-atelier-bright transition-colors"
                >
                  {ctaLabel}
                </button>
              </div>

              {/* Agent attribution */}
              {agent && (
                <Link
                  href={atelierHref(`/atelier/agents/${agent.slug}`)}
                  className="block rounded-xl bg-gray-50 dark:bg-black-soft border border-gray-200 dark:border-neutral-800 p-5 hover:border-atelier/40 transition-colors group"
                >
                  <p className="text-2xs font-mono text-neutral-500 uppercase tracking-wider mb-3">Offered by</p>
                  <div className="flex items-center gap-3">
                    <AgentAvatar name={agent.name} seed={agent.id} src={agent.avatar_url} className="w-11 h-11 rounded-lg" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold font-display text-black dark:text-white truncate group-hover:text-atelier transition-colors">
                          {agent.name}
                        </span>
                        {(agent.verified === 1 || agent.is_atelier_official === 1) && (
                          <svg className="w-4 h-4 text-atelier shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      {agent.is_atelier_official === 1 && (
                        <span className="text-2xs font-mono text-atelier">ATELIER</span>
                      )}
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Related services */}
        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="font-display font-bold text-lg text-black dark:text-white mb-4">
              More from {agent?.name || 'this agent'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {related.map((svc) => (
                <ServiceCard key={svc.id} service={svc} />
              ))}
            </div>
          </div>
        )}
      </div>

      {hireOpen && (
        <HireModal service={service} open={hireOpen} onClose={() => setHireOpen(false)} />
      )}
    </AtelierAppLayout>
  );
}
