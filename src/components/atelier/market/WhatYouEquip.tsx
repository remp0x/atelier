'use client';

import Link from 'next/link';
import {
  ANTHROPIC_SKILLS,
  MEDICAL_SKILLS,
  getDownloadUrl,
  getPackLabel,
  getSourceUrl,
  type SkillExample,
  type SkillPackId,
} from './marketData';

const ROW_LIMIT = 3;

type LandingPack = {
  id: SkillPackId;
  title: string;
  description: string;
  sourceLabel: string;
  sourceHref: string;
  skills: SkillExample[];
};

const LANDING_PACKS: LandingPack[] = [
  {
    id: 'anthropic',
    title: 'Anthropic Official',
    description: 'The full library of skills published by Anthropic — document toolkits (PDF, DOCX, PPTX, XLSX), design utilities, the MCP builder, Claude API patterns, and the skill-creator itself. Drop any of these into your agent.',
    sourceLabel: 'Source · anthropics/skills ↗',
    sourceHref: 'https://github.com/anthropics/skills/tree/main/skills',
    skills: ANTHROPIC_SKILLS,
  },
  {
    id: 'medical',
    title: 'Medical Pack',
    description: 'Ten core clinical-research skills curated from the OpenClaw Medical Skills library — literature search, clinical documentation, guidelines lookup, drug research, and trial matching. All free at launch.',
    sourceLabel: 'Source · OpenClaw ↗',
    sourceHref: 'https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills',
    skills: MEDICAL_SKILLS,
  },
];

const ANATOMY = [
  { label: 'Prompt',     d: 'The system prompt and chain behind the workflow.' },
  { label: 'Tools',      d: 'API access, function calls, MCP servers, integrations.' },
  { label: 'Knowledge',  d: 'Vector store, docs, reference material. Optional.' },
  { label: 'Evals',      d: 'Tests the creator ran so you can verify quality.' },
] as const;

export function WhatYouEquip(): JSX.Element {
  return (
    <section className="relative overflow-hidden border-t border-gray-200 dark:border-neutral-900 py-20 md:py-28">
      <div className="relative max-w-[1280px] mx-auto px-7">
        <div className="max-w-[640px] mb-12 md:mb-16">
          <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-5">
            WHAT YOU CAN EQUIP
          </p>
          <h2
            className="font-display font-extrabold tracking-[-0.03em] leading-[1.05] mb-5"
            style={{ fontSize: 'clamp(1.875rem, 4vw, 3rem)' }}
          >
            <span className="text-gradient-atelier">Skills</span> are workflows{' '}
            <span className="text-gray-500 dark:text-neutral-500">that ship.</span>
          </h2>
          <p className="text-[16px] md:text-[17px] leading-[1.55] text-gray-600 dark:text-neutral-300">
            Prompt, tools, knowledge, evals, all packaged by builders who run them in production.
            Personas are coming next.
          </p>
        </div>

        {LANDING_PACKS.map((p) => (
          <Pack
            key={p.id}
            packId={p.id}
            title={p.title}
            countLabel={`${p.skills.length} · FREE`}
            sourceLabel={p.sourceLabel}
            sourceHref={p.sourceHref}
            description={p.description}
            skills={p.skills.slice(0, ROW_LIMIT)}
            totalCount={p.skills.length}
          />
        ))}

        {/* ANATOMY */}
        <div className="mb-20 md:mb-24 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50/60 dark:bg-black-soft/60 backdrop-blur-md p-6 md:p-7">
          <div className="flex items-baseline justify-between mb-5 flex-wrap gap-2">
            <h4 className="font-display font-bold text-lg tracking-[-0.02em]">
              What&apos;s inside a skill?
            </h4>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-neutral-500">
              Anatomy
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {ANATOMY.map((part, i) => (
              <div key={part.label} className="relative">
                <div className="font-mono text-[10px] tracking-[0.18em] text-atelier mb-2">
                  {String(i + 1).padStart(2, '0')} · {part.label.toUpperCase()}
                </div>
                <p className="text-[13px] leading-[1.55] text-gray-600 dark:text-neutral-400">
                  {part.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Pack({
  packId,
  title,
  countLabel,
  sourceLabel,
  sourceHref,
  description,
  skills,
  totalCount,
}: {
  packId: SkillPackId;
  title: string;
  countLabel: string;
  sourceLabel: string;
  sourceHref: string;
  description: string;
  skills: SkillExample[];
  totalCount: number;
}): JSX.Element {
  const hasMore = totalCount > skills.length;
  return (
    <div className="mb-16 md:mb-20">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 className="font-display font-bold text-xl md:text-2xl tracking-[-0.02em]">
            {title}
          </h3>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[9.5px] tracking-[0.14em] text-atelier border border-atelier/40 bg-atelier/[0.08]">
            {countLabel}
          </span>
        </div>
        <a
          href={sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-neutral-500 hover:text-atelier transition-colors"
        >
          {sourceLabel}
        </a>
      </div>
      <p className="text-[15px] leading-[1.55] text-gray-600 dark:text-neutral-400 max-w-[640px] mb-8">
        {description}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map((skill) => (
          <SkillExampleCard key={skill.name} skill={skill} />
        ))}
      </div>
      {hasMore && (
        <div className="mt-6">
          <Link
            href={`/skills?pack=${packId}`}
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-atelier hover:text-atelier-bright transition-colors"
          >
            View all {totalCount} skills →
          </Link>
        </div>
      )}
    </div>
  );
}

function SkillExampleCard({ skill }: { skill: SkillExample }): JSX.Element {
  const isFree = skill.price === 0;
  const hasPrice = typeof skill.price === 'number';

  return (
    <div className="group relative rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50/60 dark:bg-black-soft/60 backdrop-blur-md p-5 transition-all hover:border-atelier/40 hover:shadow-[0_0_24px_-8px_rgba(250,76,20,0.3)] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[9.5px] tracking-[0.14em] text-atelier border border-atelier/40 bg-atelier/[0.06]">
          {skill.category.toUpperCase()}
        </span>
        {hasPrice && (
          <span
            className={`font-mono text-[9.5px] tracking-[0.14em] uppercase ${
              isFree ? 'text-atelier' : 'text-gray-500 dark:text-neutral-400'
            }`}
          >
            {isFree ? 'FREE' : `$${skill.price}`}
          </span>
        )}
      </div>
      <h4 className="font-display font-bold text-[17px] tracking-[-0.02em] mb-1.5 text-black dark:text-white">
        {skill.name}
      </h4>
      <p className="text-[13.5px] leading-[1.5] text-gray-600 dark:text-neutral-300 mb-4 flex-1">
        {skill.tagline}
      </p>
      <div className="pt-3 border-t border-gray-200 dark:border-neutral-800 space-y-1.5">
        <Row label="Tools" value={skill.tools.join(' · ')} />
        <Row label="KB" value={skill.kb} />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <a
          href={getDownloadUrl(skill)}
          download={`${skill.slug}.md`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded bg-atelier text-white font-mono text-[12px] font-medium tracking-wide transition-all hover:bg-atelier-bright hover:shadow-[0_0_16px_rgba(250,76,20,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-atelier/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black-soft"
          aria-label={`Download ${skill.name} as Markdown`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          Download .md
        </a>
        <a
          href={getSourceUrl(skill)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center h-9 px-2.5 rounded border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-300 font-mono text-[11px] hover:border-atelier/40 hover:text-atelier transition-colors"
          aria-label={`View ${skill.name} source on ${getPackLabel(skill)}`}
        >
          Source ↗
        </a>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono">
      <span className="text-gray-400 dark:text-neutral-600 tracking-[0.14em] uppercase shrink-0">
        {label}
      </span>
      <span className="text-gray-600 dark:text-neutral-400 truncate">{value}</span>
    </div>
  );
}
