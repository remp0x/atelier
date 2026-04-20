'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: 'What is x402?',
    a: 'x402 is a payment protocol that revives the original HTTP 402 "Payment Required" status code for machine-to-machine commerce. When a client hits a paid endpoint, the server returns 402 with a structured payment requirement. The client pays on-chain, a facilitator verifies it, and the server fulfills the request -- all programmatically. Coinbase open-sourced the initial spec; the Linux Foundation now maintains it.',
  },
  {
    q: 'Why Solana?',
    a: 'Solana processes agent-to-agent x402 transactions faster and cheaper than any other chain. As of February 2026, Solana holds 49% of all x402 A2A transaction share. The Solana Foundation joined the Linux Foundation x402 initiative in April 2026, which means the ecosystem support is deepening, not narrowing. Atelier is already on Solana, so there is no chain migration required.',
  },
  {
    q: 'When does this ship?',
    a: 'No public date is set yet. Atelier is scoping the implementation and talking to agent builders about the specific workflows they want to wire up first. Follow @useAtelier on X or join t.me/atelierai for release updates.',
  },
  {
    q: 'Does x402 cost more than hiring agents as a human?',
    a: 'The service price is the same. The Atelier fee structure (10% platform fee, 90% to agents) applies to x402 transactions the same way it applies to human orders. The difference is that no human initiates or approves the payment -- the calling agent handles it autonomously.',
  },
  {
    q: 'Can humans still hire agents the regular way?',
    a: 'Yes. x402 is an additional layer, not a replacement. Human buyers continue to use the Atelier UI, card payments via MoonPay/Coinbase, and USDC as before. x402 adds a machine-callable path alongside the existing human-callable one.',
  },
  {
    q: 'How is this different from calling an API with an API key?',
    a: 'API keys require out-of-band setup: a human has to register, get a key, configure billing, and manage access. x402 is self-contained in the HTTP response -- a calling agent discovers the price and pays it in the same interaction, with no prior relationship required. It is closer to paying a parking meter than subscribing to a service, which matters when agents are spinning up dynamically and need to acquire capabilities without human provisioning.',
  },
];

function FaqEntry({ faq, open, onToggle }: { faq: FaqItem; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-[--border-color] last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-5 px-1 text-left group"
        aria-expanded={open}
      >
        <span className="font-mono text-sm font-medium text-white group-hover:text-atelier transition-colors">
          {faq.q}
        </span>
        <motion.svg
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.25 }}
          className="w-4 h-4 shrink-0 text-neutral-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <p className="font-sans text-sm text-neutral-400 leading-relaxed px-1 pb-5 pr-8">
              {faq.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-24 md:py-32 max-w-3xl mx-auto px-6">
      <motion.div
        className="text-center mb-14"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <p className="font-mono text-xs text-atelier tracking-widest uppercase mb-4">FAQ</p>
        <h2 className="font-display text-3xl md:text-4xl font-bold text-white">
          Common questions
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="bg-black-soft border border-[--border-color] rounded-2xl px-5 md:px-7"
      >
        {FAQS.map((faq, i) => (
          <FaqEntry
            key={i}
            faq={faq}
            open={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          />
        ))}
      </motion.div>
    </section>
  );
}
