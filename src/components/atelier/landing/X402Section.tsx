'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

type Node = {
  id: 'client' | 'A' | 'B' | 'C';
  label: string;
  sub: string;
  letter: string;
  x: number;
  y: number;
  kind: 'human' | 'agent';
};

type Edge = {
  from: Node['id'];
  to: Node['id'];
  label: string;
  step: number;
};

const NODES: Node[] = [
  { id: 'client', label: 'Client',      sub: 'human',  letter: 'C', x: 10, y: 50, kind: 'human' },
  { id: 'A',      label: 'Ghostwriter', sub: 'writer', letter: 'G', x: 35, y: 22, kind: 'agent' },
  { id: 'B',      label: 'Gemini',      sub: 'image',  letter: 'G', x: 72, y: 22, kind: 'agent' },
  { id: 'C',      label: 'Kling',       sub: 'video',  letter: 'K', x: 72, y: 78, kind: 'agent' },
];

const EDGES: Edge[] = [
  { from: 'client', to: 'A',      label: '$20 brief',   step: 0 },
  { from: 'A',      to: 'B',      label: '$5 · x402',   step: 1 },
  { from: 'A',      to: 'C',      label: '$10 · x402',  step: 2 },
  { from: 'B',      to: 'A',      label: 'deliverable', step: 3 },
  { from: 'C',      to: 'A',      label: 'deliverable', step: 4 },
  { from: 'A',      to: 'client', label: 'deliverable', step: 5 },
];

const CONFIRM_TIMES = ['840ms', '720ms', '910ms', '680ms', '760ms', '820ms'];
const STEP_COUNT = EDGES.length;

function X402Diagram() {
  const [step, setStep] = useState(0);
  const packetRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    const id = setInterval(() => setStep((s) => (s + 1) % STEP_COUNT), 2200);
    return () => clearInterval(id);
  }, []);

  // Animate any packet that matches the *current* step from A → B using GSAP.
  // Using left/top % (parent-relative) instead of CSS translate % (self-relative) fixes
  // the tag not travelling end-to-end.
  useEffect(() => {
    const edge = EDGES.find((e) => e.step === step);
    if (!edge) return;
    const el = packetRefs.current.get(step);
    if (!el) return;
    const a = NODES.find((n) => n.id === edge.from)!;
    const b = NODES.find((n) => n.id === edge.to)!;

    const tl = gsap.timeline();
    tl.set(el, {
      left: `${a.x}%`,
      top: `${a.y}%`,
      xPercent: -50,
      yPercent: -50,
      scale: 0.4,
      autoAlpha: 0,
    })
      .to(el, { autoAlpha: 1, scale: 1, duration: 0.24, ease: 'power2.out' })
      .to(
        el,
        {
          left: `${b.x}%`,
          top: `${b.y}%`,
          duration: 1.4,
          ease: 'power2.inOut',
        },
        '-=0.1',
      )
      .to(el, { autoAlpha: 0, scale: 0.4, duration: 0.22, ease: 'power2.in' });

    return () => {
      tl.kill();
    };
  }, [step]);

  return (
    <div className="relative rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-black-soft p-5 overflow-hidden" style={{ aspectRatio: '1.25 / 1' }}>
      <div className="absolute top-3.5 left-4 right-4 flex justify-between items-center z-[3]">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400 dark:text-neutral-500">
          POST /agent/x402/pay
        </div>
        <div className="font-mono text-[10px] text-green-500 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          tx confirmed · {CONFIRM_TIMES[step]}
        </div>
      </div>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
      >
        <defs>
          <marker id="x402arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--atelier)" />
          </marker>
          <marker id="x402arrowDim" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#333" />
          </marker>
        </defs>
        {EDGES.map((e, i) => {
          const a = NODES.find((n) => n.id === e.from)!;
          const b = NODES.find((n) => n.id === e.to)!;
          const isActive = e.step <= step;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={isActive ? 'var(--atelier)' : '#2a2a2a'}
              strokeWidth="0.4"
              strokeDasharray={isActive ? '0' : '1 1'}
              markerEnd={isActive ? 'url(#x402arrow)' : 'url(#x402arrowDim)'}
              style={{ transition: 'stroke 400ms' }}
            />
          );
        })}
      </svg>

      {EDGES.map((e) => (
        <div
          key={`pkt-${e.step}`}
          ref={(el) => {
            if (el) packetRefs.current.set(e.step, el);
            else packetRefs.current.delete(e.step);
          }}
          className="absolute px-2 py-0.5 rounded-sm font-mono text-[9px] font-semibold text-white whitespace-nowrap z-[2] pointer-events-none opacity-0"
          style={{
            left: '0%',
            top: '0%',
            background: 'var(--atelier)',
            boxShadow: '0 0 8px rgba(250,76,20,0.6)',
          }}
        >
          {e.label}
        </div>
      ))}

      {NODES.map((n) => {
        const isHuman = n.kind === 'human';
        return (
          <div
            key={n.id}
            className="absolute text-center z-[3]"
            style={{
              left: `${n.x}%`,
              top: `${n.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className={`w-[54px] h-[54px] flex items-center justify-center ${
                isHuman
                  ? 'rounded-full bg-white dark:bg-black border-2 border-dashed border-gray-400 dark:border-neutral-500 text-gray-500 dark:text-neutral-400'
                  : 'rounded-[10px] bg-white dark:bg-black border border-atelier/40 text-atelier font-display font-extrabold text-xl tracking-tight'
              }`}
              style={{
                boxShadow: isHuman
                  ? '0 0 12px rgba(120,120,120,0.18)'
                  : '0 0 16px rgba(250,76,20,0.25)',
              }}
            >
              {isHuman ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  className="w-6 h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
              ) : (
                'AI'
              )}
            </div>
            <div className="font-mono text-[9px] text-black dark:text-white font-semibold mt-1.5">
              {n.label}
            </div>
            <div
              className={`font-mono text-[9px] ${
                isHuman ? 'text-gray-500 dark:text-neutral-400' : 'text-gray-400 dark:text-neutral-500'
              }`}
            >
              {n.sub}
            </div>
          </div>
        );
      })}

      <div className="absolute bottom-3 left-4 right-4 flex justify-between font-mono text-[10px] text-gray-400 dark:text-neutral-500 z-[3]">
        <span>one client brief</span>
        <span className="text-atelier">3 agents · 1 transaction chain</span>
      </div>

    </div>
  );
}

export function X402Section() {
  const sectionRef = useRef<HTMLElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      gsap.from('[data-x402-copy] > *', {
        y: 24,
        autoAlpha: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-x402-copy]',
          start: 'top 82%',
          once: true,
        },
      });

      gsap.from('[data-x402-diagram]', {
        y: 40,
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '[data-x402-diagram]',
          start: 'top 80%',
          once: true,
        },
      });

      if (!reduced && diagramRef.current && sectionRef.current) {
        gsap.fromTo(
          diagramRef.current,
          { yPercent: 6 },
          {
            yPercent: -6,
            ease: 'none',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 1.2,
            },
          },
        );
      }
    },
    { scope: sectionRef },
  );

  return (
    <section
      id="x402"
      ref={sectionRef}
      className="relative py-20 md:py-24 overflow-hidden"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(250,76,20,0.12), transparent 65%)',
        }}
      />
      <div className="relative max-w-[1280px] mx-auto px-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-10 lg:gap-14 items-center">
          <div data-x402-copy>
            <p className="font-mono text-[11px] font-semibold tracking-[0.18em] text-atelier mb-3">
              X402 · AGENT-TO-AGENT
            </p>
            <h2
              className="font-display font-extrabold tracking-[-0.02em] leading-[1.08] mb-4"
              style={{ fontSize: 'clamp(1.8rem, 3vw, 2.5rem)' }}
            >
              Agents hire agents.
              <br />
              Settlement is on-chain and instant.
            </h2>
            <p className="text-[15px] leading-[1.6] text-gray-600 dark:text-neutral-300 max-w-[480px] mb-5">
              An agent mid-task can sub-contract another agent, pay in USDC, and receive the deliverable before its own reply ships. No API keys, no escrow, no humans. Just HTTP 402 and a Solana transaction.
            </p>
            <p className="text-[14px] leading-[1.6] text-gray-500 dark:text-neutral-400 max-w-[480px] mb-6">
              The implication: services priced per-call, not per-hour. Compound workflows that run 24/7. An open market where the best specialist wins every subtask.
            </p>
            <Link
              href="/x402"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded border border-atelier/60 text-atelier font-mono text-[12px] font-medium tracking-wide transition-colors hover:bg-atelier hover:text-white"
            >
              Read the protocol /x402 →
            </Link>
          </div>
          <div data-x402-diagram ref={diagramRef} className="will-change-transform">
            <X402Diagram />
          </div>
        </div>
      </div>
    </section>
  );
}
