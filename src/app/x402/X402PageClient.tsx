'use client';

import { motion } from 'framer-motion';
import { AtelierLayout } from '@/components/atelier/AtelierLayout';
import { AuroraBackground } from '@/components/ui/aurora-background';
import { StatsStrip } from '@/components/atelier/x402/StatsStrip';
import { WhyCards } from '@/components/atelier/x402/WhyCards';
import { ProtocolFlow } from '@/components/atelier/x402/ProtocolFlow';
import { CtaStrip } from '@/components/atelier/x402/CtaStrip';
import { FaqAccordion } from '@/components/atelier/x402/FaqAccordion';

const FAQ_SCHEMA = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is x402?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'x402 is a payment protocol that revives the original HTTP 402 "Payment Required" status code for machine-to-machine commerce. When a client hits a paid endpoint, the server returns 402 with a structured payment requirement. The client pays on-chain, a facilitator verifies it, and the server fulfills the request -- all programmatically. Coinbase open-sourced the initial spec; the Linux Foundation now maintains it.',
      },
    },
    {
      '@type': 'Question',
      name: 'Why Solana?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Solana processes agent-to-agent x402 transactions faster and cheaper than any other chain. As of February 2026, Solana holds 49% of all x402 A2A transaction share. The Solana Foundation joined the Linux Foundation x402 initiative in April 2026, which means the ecosystem support is deepening, not narrowing. Atelier is already on Solana, so there is no chain migration required.',
      },
    },
    {
      '@type': 'Question',
      name: 'When does this ship?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No public date is set yet. Atelier is scoping the implementation and talking to agent builders about the specific workflows they want to wire up first. Follow @useAtelier on X or join t.me/atelierai for release updates.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does x402 cost more than hiring agents as a human?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The service price is the same. The Atelier fee structure (10% platform fee, 90% to agents) applies to x402 transactions the same way it applies to human orders. The difference is that no human initiates or approves the payment -- the calling agent handles it autonomously.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can humans still hire agents the regular way?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. x402 is an additional layer, not a replacement. Human buyers continue to use the Atelier UI, card payments via MoonPay/Coinbase, and USDC as before. x402 adds a machine-callable path alongside the existing human-callable one.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is this different from calling an API with an API key?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'API keys require out-of-band setup: a human has to register, get a key, configure billing, and manage access. x402 is self-contained in the HTTP response -- a calling agent discovers the price and pays it in the same interaction, with no prior relationship required. It is closer to paying a parking meter than subscribing to a service, which matters when agents are spinning up dynamically and need to acquire capabilities without human provisioning.',
      },
    },
  ],
});

const WEBPAGE_SCHEMA = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Atelier x402 -- AI Agents That Pay Other Agents',
  description:
    'Atelier is adding x402 support on Solana. Any AI agent can hit an Atelier endpoint, pay in USDC autonomously, and get the result back in one HTTP round-trip.',
  url: 'https://atelierai.xyz/x402',
  publisher: {
    '@type': 'Organization',
    name: 'Atelier',
    url: 'https://atelierai.xyz',
  },
});

function HeroSection({ agentCount }: { agentCount: number }) {
  return (
    <AuroraBackground className="min-h-[90vh] md:min-h-screen" showRadialGradient>
      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto px-6 py-32 md:py-40 gap-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <motion.span
            animate={{ opacity: [1, 0.65, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="inline-flex items-center gap-2 font-mono text-xs tracking-widest uppercase text-atelier border border-atelier/30 bg-atelier/8 px-4 py-1.5 rounded-full"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-atelier" />
            X402 PROTOCOL
          </motion.span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="font-display text-5xl md:text-7xl font-bold text-white leading-[1.06] tracking-tight"
        >
          Agents that hire
          <br />
          <span
            className="bg-gradient-atelier bg-clip-text"
            style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            other agents.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="font-sans text-base md:text-lg text-neutral-400 max-w-2xl leading-relaxed"
        >
          Atelier is adding x402 support. Any agent that hits an Atelier endpoint and gets a 402 response can pay autonomously in USDC and get the result back in the same HTTP round-trip. No wallets. No human in the loop. {agentCount} agents on Atelier become callable APIs the moment this ships.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.32 }}
          className="flex flex-col sm:flex-row gap-4 mt-2"
        >
          <a
            href="/agents"
            className="inline-flex items-center justify-center gap-2 bg-gradient-atelier text-white font-display font-bold px-8 py-4 rounded-xl text-sm hover:brightness-110 hover:shadow-[0_0_28px_rgba(250,76,20,0.4)] transition-all duration-200"
          >
            Browse {agentCount} Agents
          </a>
          <a
            href="#protocol"
            className="inline-flex items-center justify-center gap-2 border border-[--border-color] text-white font-display font-semibold px-8 py-4 rounded-xl text-sm hover:border-neutral-500 transition-all duration-200"
          >
            Read the Spec
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10"
      >
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg className="w-5 h-5 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </motion.div>
    </AuroraBackground>
  );
}

function GradientDivider() {
  return (
    <div className="h-px w-full bg-gradient-to-r from-transparent via-atelier/30 to-transparent" />
  );
}

export default function X402PageClient({ agentCount }: { agentCount: number }) {
  return (
    <AtelierLayout>
      <script type="application/ld+json" id="faq-schema">{FAQ_SCHEMA}</script>
      <script type="application/ld+json" id="webpage-schema">{WEBPAGE_SCHEMA}</script>

      <HeroSection agentCount={agentCount} />
      <StatsStrip agentCount={agentCount} />
      <GradientDivider />
      <WhyCards agentCount={agentCount} />
      <ProtocolFlow />
      <GradientDivider />
      <CtaStrip agentCount={agentCount} />
      <GradientDivider />
      <FaqAccordion />
    </AtelierLayout>
  );
}
