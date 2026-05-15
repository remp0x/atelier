import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import {
  SKILL_CATEGORIES,
  SKILL_EXAMPLES,
  SKILL_PACKS,
  getDownloadUrl,
  getSourceUrl,
  isExternalSkill,
  type SkillExample,
  type SkillPackId,
} from '@/components/atelier/market/marketData';
import { getSubmittedSkillBySlug } from '@/lib/atelier-db';
import { SkillGetButton } from './SkillGetButton';

interface PageProps {
  params: { pack: string; slug: string };
}

const CATEGORY_NAME_BY_SLUG = new Map(SKILL_CATEGORIES.map((c) => [c.slug, c.name]));

async function findSkill(pack: string, slug: string): Promise<SkillExample | undefined> {
  if (pack === 'community') {
    const row = await getSubmittedSkillBySlug(slug);
    if (!row || row.status !== 'live') return undefined;
    return {
      name: row.name,
      tagline: row.description,
      category: CATEGORY_NAME_BY_SLUG.get(row.category) ?? row.category,
      tools: ['Markdown'],
      kb: `Submitted ${new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
      price: row.pricing === 'free' ? 0 : row.price_usdc,
      pack: 'community',
      slug: row.slug,
      download_url: row.file_url,
      creator_wallet: row.creator_wallet,
    };
  }
  return SKILL_EXAMPLES.find((s) => s.pack === pack && s.slug === slug);
}

export function generateStaticParams() {
  return SKILL_EXAMPLES.map((s) => ({ pack: s.pack, slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const skill = await findSkill(params.pack, params.slug);
  if (!skill) return { title: 'Skill not found' };
  const title = `${skill.name} — Skill on Atelier`;
  return {
    title,
    description: skill.tagline,
    alternates: { canonical: `/skills/${skill.pack}/${skill.slug}` },
    openGraph: {
      title,
      description: skill.tagline,
      url: `/skills/${skill.pack}/${skill.slug}`,
    },
  };
}

const ANATOMY = [
  { label: 'Prompt', d: 'The system prompt and chain that makes it work.' },
  { label: 'Tools', d: 'API access, function calls, MCP servers, integrations.' },
  { label: 'Knowledge', d: 'Vector store, docs, reference material.' },
  { label: 'Evals', d: 'Tests the creator ran so you trust the output.' },
];

export default async function SkillDetailPage({ params }: PageProps) {
  const skill = await findSkill(params.pack, params.slug);
  if (!skill) notFound();

  const isFree = (skill.price ?? 0) === 0;
  const price = skill.price ?? 0;
  const pack = SKILL_PACKS[skill.pack as SkillPackId];
  const external = isExternalSkill(skill);
  const isCommunity = skill.pack === 'community';
  const sourceUrl = getSourceUrl(skill);

  return (
    <AtelierAppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link
          href="/skills"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-gray-500 dark:text-neutral-400 hover:text-atelier transition-colors mb-6"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to skills
        </Link>

        <div className="mb-8">
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <h1 className="text-3xl md:text-4xl font-extrabold text-black dark:text-white font-display tracking-[-0.02em]">
              {skill.name}
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] tracking-[0.14em] text-atelier border border-atelier/50 bg-atelier/10">
              SKILL
            </span>
          </div>
          <p className="text-base md:text-lg text-gray-600 dark:text-neutral-300 max-w-3xl leading-relaxed">
            {skill.tagline}
          </p>

          <div className="flex items-center flex-wrap gap-2 mt-5">
            <Pill>{skill.category}</Pill>
            {(!external || isCommunity) && <Pill>{pack.label}</Pill>}
            <Pill>{skill.tools.length} tool{skill.tools.length !== 1 ? 's' : ''}</Pill>
            <Pill highlight>{isFree ? 'Free' : `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`}</Pill>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 items-start">
          {/* LEFT — content */}
          <div className="space-y-6 min-w-0">
            <Panel>
              <PanelTitle>About</PanelTitle>
              <p className="text-sm md:text-[15px] leading-[1.65] text-gray-700 dark:text-neutral-300">
                {skill.tagline}
              </p>
              <p className="mt-3 text-sm md:text-[15px] leading-[1.65] text-gray-700 dark:text-neutral-300">
                Packaged as a Markdown skill — drop it into your agent runtime and the prompt,
                tool definitions, and evaluation hooks ship with it.
                {!external && (
                  <>
                    {' '}Authored and maintained by{' '}
                    <a
                      href={pack.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-atelier hover:text-atelier-bright"
                    >
                      {pack.label}
                    </a>
                    {' '}on GitHub.
                  </>
                )}
                {isCommunity && skill.creator_wallet && (
                  <>
                    {' '}Submitted by community wallet{' '}
                    <span className="font-mono text-atelier">
                      {`${skill.creator_wallet.slice(0, 4)}…${skill.creator_wallet.slice(-4)}`}
                    </span>
                    .
                  </>
                )}
              </p>
            </Panel>

            <Panel>
              <PanelTitle>Core capabilities</PanelTitle>
              <ul className="space-y-2.5">
                {skill.tools.map((tool) => (
                  <li key={tool} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-neutral-300">
                    <svg className="w-4 h-4 mt-0.5 text-atelier flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span>{tool}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelTitle>What&apos;s inside</PanelTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ANATOMY.map((part, i) => (
                  <div key={part.label}>
                    <div className="font-mono text-[10px] tracking-[0.18em] text-atelier mb-1.5">
                      {String(i + 1).padStart(2, '0')} · {part.label.toUpperCase()}
                    </div>
                    <p className="text-[13px] leading-[1.55] text-gray-600 dark:text-neutral-400">
                      {part.d}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* RIGHT — sticky purchase */}
          <aside className="lg:sticky lg:top-24 space-y-4">
            <Panel>
              <div className="font-mono text-[10px] tracking-[0.18em] text-gray-500 dark:text-neutral-500 mb-2">
                {isFree ? 'FREE DOWNLOAD' : 'ONE-TIME INSTALL'}
              </div>
              <div className="text-4xl font-bold font-display text-black dark:text-white mb-4">
                {isFree ? '$0' : `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`}
              </div>
              <SkillGetButton
                pack={skill.pack}
                slug={skill.slug}
                price={price}
                downloadUrl={getDownloadUrl(skill)}
                external={isExternalSkill(skill)}
              />
              <p className="mt-3 text-[11px] font-mono text-gray-500 dark:text-neutral-500 leading-[1.55]">
                Sign in with your wallet to download. Settled in USDC on Solana.
              </p>
            </Panel>

            {!external && (
              <Panel>
                <PanelTitle>Creator</PanelTitle>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-atelier/15 flex items-center justify-center text-atelier font-bold font-mono">
                    {pack.label.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-black dark:text-white truncate">
                      {pack.label}
                    </div>
                    <a
                      href={pack.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-2xs font-mono text-atelier hover:text-atelier-bright"
                    >
                      View pack ↗
                    </a>
                  </div>
                </div>
              </Panel>
            )}

            {isCommunity && skill.creator_wallet && (
              <Panel>
                <PanelTitle>Creator</PanelTitle>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-atelier/15 flex items-center justify-center text-atelier font-bold font-mono">
                    {skill.creator_wallet.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-black dark:text-white truncate font-mono">
                      {`${skill.creator_wallet.slice(0, 4)}…${skill.creator_wallet.slice(-4)}`}
                    </div>
                    <span className="text-2xs font-mono text-gray-500 dark:text-neutral-500">
                      Community submission
                    </span>
                  </div>
                </div>
              </Panel>
            )}

            <Panel>
              <PanelTitle>Details</PanelTitle>
              <dl className="space-y-2 text-xs font-mono">
                <Row label="Type" value="Skill" />
                <Row label="Category" value={skill.category} />
                {(!external || isCommunity) && <Row label="Pack" value={pack.label} />}
                <Row label="Price" value={isFree ? 'Free' : `$${price.toFixed(price % 1 === 0 ? 0 : 2)}`} />
                <Row label="Format" value="Markdown (.md)" />
                <Row label="License" value="One-time install" />
              </dl>
            </Panel>

            <Panel>
              <PanelTitle>Works with</PanelTitle>
              <div className="flex flex-wrap gap-1.5">
                {skill.tools.map((tool) => (
                  <span
                    key={tool}
                    className="px-2 py-1 rounded text-2xs font-mono bg-gray-100 dark:bg-neutral-800/60 text-gray-700 dark:text-neutral-300 border border-gray-200 dark:border-neutral-800"
                  >
                    {tool}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11px] font-mono text-gray-500 dark:text-neutral-500 leading-[1.55]">
                Compatible with Claude Code, OpenClaw, Cursor, and other instruction-friendly AI tools.
              </p>
            </Panel>

            {!external && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[11px] font-mono text-gray-500 dark:text-neutral-500 hover:text-atelier transition-colors py-2"
              >
                View source on GitHub ↗
              </a>
            )}
          </aside>
        </div>
      </div>
    </AtelierAppLayout>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white/70 dark:bg-black-soft/70 backdrop-blur-sm p-5">
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display font-bold text-sm tracking-[-0.01em] text-black dark:text-white mb-3">
      {children}
    </h2>
  );
}

function Pill({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md font-mono text-[10.5px] tracking-wide border ${
        highlight
          ? 'border-atelier/60 bg-atelier/10 text-atelier'
          : 'border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300'
      }`}
    >
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b last:border-b-0 border-gray-100 dark:border-neutral-800/60">
      <dt className="text-gray-500 dark:text-neutral-500 uppercase tracking-wide text-[10.5px]">
        {label}
      </dt>
      <dd className="text-gray-900 dark:text-white text-right truncate">
        {value}
      </dd>
    </div>
  );
}
