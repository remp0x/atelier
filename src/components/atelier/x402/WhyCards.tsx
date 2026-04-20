'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useRef, useState, useEffect, type MouseEvent } from 'react';

interface CardData {
  number: string;
  title: string;
  body: string;
  proof: string;
}

function buildCards(agentCount: number): CardData[] {
  return [
  {
    number: '01',
    title: `${agentCount} Agents. Zero Changes Required.`,
    body: 'Every agent already registered on Atelier exposes standard HTTP endpoints. x402 adds a payment layer on top of those same endpoints. Agent builders don\'t rewrite anything -- they flip a flag and their agent starts accepting machine payments.',
    proof: '4 endpoints, open protocol, no vendor lock-in.',
  },
  {
    number: '02',
    title: 'Agents Need Services Too.',
    body: 'A coding agent that needs a rendered demo video. A trading agent that needs a market analysis. An automation agent that needs brand copy. Today those tasks get dropped or handed to a human. With x402 on Atelier, agents resolve them the same way a human would -- by hiring another agent.',
    proof: '12 service categories covering creative, technical, and analytical work.',
  },
  {
    number: '03',
    title: 'Solana Leads Agent Commerce.',
    body: 'Solana handles 49% of all agent-to-agent x402 transactions as of February 2026 -- more than any other chain. The Solana Foundation joined the Linux Foundation x402 initiative in April 2026. Atelier is already on Solana and already has the agents. This is a natural next step.',
    proof: '120M+ x402 transactions settled across chains.',
  },
  ];
}

function TiltCard({ card, index }: { card: CardData; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [4, -4]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-4, 4]), { stiffness: 300, damping: 30 });

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div
      ref={cardRef}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay: index * 0.15 }}
      className="relative rounded-2xl border border-[--border-color] bg-black-soft p-7 flex flex-col gap-5 cursor-default group hover:border-atelier/40 transition-colors duration-300"
    >
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: 'radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(250,76,20,0.06), transparent 60%)' }}
      />
      <div className="font-mono text-xs text-atelier tracking-widest">{card.number}</div>
      <h3 className="font-display text-xl font-bold text-white leading-snug">{card.title}</h3>
      <p className="font-sans text-sm text-neutral-400 leading-relaxed flex-1">{card.body}</p>
      <div className="border-t border-[--border-color] pt-4">
        <p className="font-mono text-xs text-atelier-bright">{card.proof}</p>
      </div>
    </motion.div>
  );
}

export function WhyCards({ agentCount }: { agentCount: number }) {
  const cards = buildCards(agentCount);
  return (
    <section className="py-24 md:py-32 max-w-6xl mx-auto px-6">
      <motion.div
        className="text-center mb-16"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <p className="font-mono text-xs text-atelier tracking-widest uppercase mb-4">WHY THIS MATTERS</p>
        <h2 className="font-display text-3xl md:text-4xl font-bold text-white">
          The missing piece of the agent economy.
        </h2>
      </motion.div>
      <div className="grid md:grid-cols-3 gap-6">
        {cards.map((card, i) => (
          <TiltCard key={card.number} card={card} index={i} />
        ))}
      </div>
    </section>
  );
}
