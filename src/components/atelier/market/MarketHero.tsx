'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { SKILL_EXAMPLES, getDownloadUrl, type SkillExample } from './marketData';

gsap.registerPlugin(useGSAP, ScrollTrigger);

const POPULAR_QUERIES = ['pdf', 'mcp', 'pubmed', 'frontend', 'xlsx', 'clinical'];

function matchesSkill(skill: SkillExample, q: string): boolean {
  if (!q.trim()) return false;
  const needle = q.toLowerCase().trim();
  const haystack = [
    skill.name,
    skill.tagline,
    skill.category,
    ...skill.tools,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function MarketHero(): JSX.Element {
  const sectionRef = useRef<HTMLElement>(null);
  const auroraRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');

  const matchedSkills = useMemo(
    () => SKILL_EXAMPLES.filter((s) => matchesSkill(s, query)),
    [query],
  );

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        gsap.set('[data-mhero-word], [data-mhero-reveal]', { autoAlpha: 1, y: 0 });
        return;
      }
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('[data-mhero-reveal="eyebrow"]', { y: 14, autoAlpha: 0, duration: 0.6 })
        .from('[data-mhero-word]', { y: 50, autoAlpha: 0, stagger: 0.06, duration: 0.9 }, '-=0.3')
        .from('[data-mhero-reveal="sub"]', { y: 18, autoAlpha: 0, duration: 0.6 }, '-=0.45')
        .from('[data-mhero-reveal="ctas"]', { y: 18, autoAlpha: 0, duration: 0.55 }, '-=0.35')
        .from('[data-mhero-reveal="stats"]', { y: 18, autoAlpha: 0, duration: 0.55 }, '-=0.4')
        .from('[data-mhero-reveal="search"]', { y: 24, autoAlpha: 0, duration: 0.7 }, '-=0.55');

      if (auroraRef.current && sectionRef.current) {
        gsap.to(auroraRef.current, {
          yPercent: 18,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: 1,
          },
        });
      }
    },
    { scope: sectionRef },
  );

  const line1 = 'Build a smarter agent'.split(' ');
  const line2 = 'in one click.'.split(' ');

  return (
    <section ref={sectionRef} className="relative overflow-hidden pt-32 md:pt-40 pb-16 md:pb-20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          ref={auroraRef}
          className="absolute -inset-[10%] will-change-transform"
          style={{
            filter: 'blur(10px)',
            background: `
              radial-gradient(ellipse 55% 55% at 18% 8%,  rgba(201,58,10,0.38), transparent 55%),
              radial-gradient(ellipse 45% 45% at 82% 18%, rgba(255,122,61,0.27), transparent 55%),
              radial-gradient(ellipse 70% 55% at 50% 100%, rgba(250,76,20,0.32), transparent 62%)
            `,
          }}
        />
      </div>
      <div
        className="absolute left-0 right-0 bottom-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(250,76,20,0.35), transparent)' }}
      />

      <div className="relative max-w-[1280px] mx-auto px-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16 items-center">
          {/* LEFT */}
          <div>
            <div
              data-mhero-reveal="eyebrow"
              className="flex items-center gap-2.5 mb-5 font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier flex-wrap"
            >
              <span>SKILLS MARKETPLACE</span>
            </div>

            <h1
              className="font-display font-extrabold tracking-[-0.03em] leading-[1.02] mb-6"
              style={{ fontSize: 'clamp(2.25rem, 5.2vw, 4.25rem)' }}
            >
              <span className="block">
                {line1.map((word, i) => (
                  <span key={`l1-${i}`} data-mhero-word className="inline-block">
                    {word}
                    {i < line1.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </span>
              <span className="block">
                {line2.map((word, i) => (
                  <span key={`l2-${i}`} data-mhero-word className="inline-block text-gradient-atelier">
                    {word}
                    {i < line2.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </span>
            </h1>

            <p
              data-mhero-reveal="sub"
              className="text-[18px] leading-[1.55] text-gray-600 dark:text-neutral-300 max-w-[560px] mb-8"
            >
              Browse skills that make your agent better at real work. Free or paid, built by
              people who actually use them.
            </p>

            <div data-mhero-reveal="ctas" className="flex gap-3 flex-wrap">
              <Link
                href="/skills"
                className="inline-flex items-center gap-1.5 px-5 py-3.5 rounded bg-atelier text-white font-mono text-[13px] font-medium tracking-wide transition-all hover:bg-atelier-bright hover:shadow-[0_0_20px_rgba(250,76,20,0.4)]"
              >
                Browse Skills →
              </Link>
              <Link
                href="#become-a-creator"
                className="inline-flex items-center gap-1.5 px-5 py-3.5 rounded border border-gray-300 dark:border-neutral-700 text-black dark:text-white font-mono text-[13px] font-medium tracking-wide transition-all hover:border-atelier hover:text-atelier"
              >
                Publish a Skill
              </Link>
            </div>

            <div
              data-mhero-reveal="stats"
              className="mt-10 flex flex-wrap items-center gap-6 sm:gap-10"
            >
              <Stat value={String(SKILL_EXAMPLES.length)} label="Skills" />
            </div>
          </div>

          {/* RIGHT: SEARCH ONLY */}
          <div data-mhero-reveal="search" className="relative z-30">
            <SearchCard
              value={query}
              onChange={setQuery}
              matches={matchedSkills}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }): JSX.Element {
  return (
    <div>
      <div
        className={`font-display font-bold text-2xl md:text-[28px] tracking-[-0.02em] ${
          accent ? 'text-atelier' : 'text-black dark:text-white'
        }`}
      >
        {value}
      </div>
      {label && (
        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-neutral-500">
          {label}
        </div>
      )}
    </div>
  );
}

function SearchCard({
  value,
  onChange,
  matches,
}: {
  value: string;
  onChange: (v: string) => void;
  matches: SkillExample[];
}): JSX.Element {
  const hasQuery = value.trim().length > 0;

  return (
    <div
      className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black-soft/70 backdrop-blur-md p-4 md:p-5"
      style={{ boxShadow: '0 8px 24px -8px rgba(0,0,0,0.8)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-neutral-500">
          Describe a job — match a skill
        </p>
        {hasQuery && (
          <p className="font-mono text-[10px] tracking-[0.12em] text-atelier">
            {matches.length} MATCH{matches.length === 1 ? '' : 'ES'}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-neutral-800 bg-white dark:bg-black/50 px-3 py-3 focus-within:border-atelier/60 transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-400 dark:text-neutral-500 shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="pdf, mcp, frontend, pubmed, xlsx…"
          className="flex-1 bg-transparent outline-none font-mono text-[13px] text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-600"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="font-mono text-[10px] text-gray-400 dark:text-neutral-500 hover:text-atelier"
          >
            clear
          </button>
        )}
      </div>

      {/* Results / suggestions */}
      <div className="mt-4 min-h-[64px]">
        {!hasQuery && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-gray-400 dark:text-neutral-600">Try:</span>
            {POPULAR_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onChange(q)}
                className="px-2.5 py-0.5 rounded-full font-mono text-[10px] text-gray-500 dark:text-neutral-400 border border-gray-200 dark:border-neutral-800 hover:border-atelier/40 hover:text-atelier transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {hasQuery && matches.length > 0 && (
          <div className="space-y-1.5">
            {matches.slice(0, 4).map((m) => (
              <a
                key={m.name}
                href={getDownloadUrl(m)}
                download={`${m.slug}.md`}
                className="block"
                aria-label={`Download ${m.name} as Markdown`}
              >
                <div className="flex items-center justify-between px-3 py-2 rounded-md border border-atelier/40 bg-atelier/[0.06] transition-colors hover:bg-atelier/[0.10]">
                  <span className="font-display font-semibold text-[13px] text-atelier truncate">
                    {m.name}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-atelier shrink-0 ml-2">
                    {m.price === 0 ? 'Free · .md ↓' : m.category}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
        {hasQuery && matches.length === 0 && (
          <div className="px-3 py-3 rounded-md border border-dashed border-gray-200 dark:border-neutral-800">
            <p className="font-mono text-[11px] text-gray-500 dark:text-neutral-500 leading-relaxed">
              No skill matches yet.{' '}
              <a
                href="#become-a-creator"
                className="text-atelier hover:text-atelier-bright underline-offset-2 hover:underline"
              >
                Build it →
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
