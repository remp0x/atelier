import type { Item, Creator } from './MarketTypes';

export const CATEGORIES: string[] = [
  'All', 'Research', 'Writing', 'Coding', 'Growth', 'Finance', 'Design', 'Ops', 'Trading', 'Comms',
];

export const PERSONA_TAGS: string[] = [
  'All', 'Analyst', 'Strategist', 'Critic', 'Concierge', 'Negotiator', 'Mentor', 'Trickster',
];

export const ITEMS: Item[] = [
  { id: 'sk-01', kind: 'skill',   name: 'Deep-Dive Research',     tagline: '10-hour analyst run, one click.',                       cat: 'Research', price: 12,  currency: 'USDC', creator: 'atlas.sol',  creatorLabel: 'Atlas Labs',    rating: 4.9, installs: 28421, verified: true,  preview: 'hot',  version: 'v2.4', kb: '18.2k' },
  { id: 'sk-02', kind: 'skill',   name: 'Outbound Copywriter',    tagline: 'Writes, A/B tests, and refines email campaigns.',        cat: 'Growth',   price: 0,   currency: 'USDC', creator: 'ember.sol',  creatorLabel: 'Ember',         rating: 4.7, installs: 51093, verified: true,  preview: 'hot',  version: 'v1.8', kb: '6.1k' },
  { id: 'sk-03', kind: 'skill',   name: 'Codebase Surgeon',       tagline: 'Refactors, patches, and ships PRs autonomously.',        cat: 'Coding',   price: 28,  currency: 'USDC', creator: 'quiver.sol', creatorLabel: 'Quiver',        rating: 4.8, installs: 12005, verified: true,  preview: 'cool', version: 'v3.0', kb: '24.7k' },
  { id: 'sk-04', kind: 'skill',   name: 'Portfolio Rebalancer',   tagline: 'Rebalances on-chain holdings to target weights.',        cat: 'Finance',  price: 49,  currency: 'USDC', creator: 'ledger.sol', creatorLabel: 'Ledger Co.',    rating: 4.6, installs: 4120,  verified: true,  preview: 'hot',  version: 'v0.9', kb: '3.3k' },
  { id: 'sk-05', kind: 'skill',   name: 'Meeting Alchemist',      tagline: 'Transcribes, extracts actions, fires off follow-ups.',   cat: 'Ops',      price: 0,   currency: 'USDC', creator: 'mira.sol',   creatorLabel: 'Mira',          rating: 4.5, installs: 39822, verified: false, preview: 'cool', version: 'v1.2', kb: '9.0k' },
  { id: 'sk-06', kind: 'skill',   name: 'Hot-Wallet Sentinel',    tagline: 'Monitors flows, flags anomalies, pauses drains.',        cat: 'Trading',  price: 18,  currency: 'USDC', creator: 'hashpine',   creatorLabel: 'Hashpine',      rating: 4.9, installs: 7340,  verified: true,  preview: 'hot',  version: 'v2.1', kb: '11.4k' },
  { id: 'sk-07', kind: 'skill',   name: 'Design System Sweeper',  tagline: 'Audits Figma for token drift and patches libraries.',    cat: 'Design',   price: 9,   currency: 'USDC', creator: 'mono.sol',   creatorLabel: 'Mono Studio',   rating: 4.7, installs: 5240,  verified: false, preview: 'cool', version: 'v1.0', kb: '4.6k' },
  { id: 'sk-08', kind: 'skill',   name: 'Support Triage',         tagline: 'Reads, classifies, routes. Closes tickets politely.',    cat: 'Comms',    price: 6,   currency: 'USDC', creator: 'helio.sol',  creatorLabel: 'Helio',         rating: 4.4, installs: 22118, verified: true,  preview: 'hot',  version: 'v1.5', kb: '7.8k' },

  { id: 'pr-01', kind: 'persona', name: 'The Analyst',    tagline: 'Skeptical, numeric, ships the memo by noon.',                      cat: 'Research', personaTag: 'Analyst',    price: 14, currency: 'USDC', creator: 'atlas.sol',  creatorLabel: 'Atlas Labs',  rating: 4.8, installs: 14210, verified: true,  preview: 'cool', version: 'v1.1', vibes: 'dry, direct' },
  { id: 'pr-02', kind: 'persona', name: 'The Concierge',  tagline: 'Warm, proactive, remembers your coffee order.',                    cat: 'Ops',      personaTag: 'Concierge',  price: 8,  currency: 'USDC', creator: 'petal.sol',  creatorLabel: 'Petal',       rating: 4.9, installs: 31420, verified: true,  preview: 'hot',  version: 'v2.0', vibes: 'gentle, eager' },
  { id: 'pr-03', kind: 'persona', name: 'The Critic',     tagline: 'Tears your draft apart. You will thank it.',                      cat: 'Writing',  personaTag: 'Critic',     price: 5,  currency: 'USDC', creator: 'ember.sol',  creatorLabel: 'Ember',       rating: 4.6, installs: 18740, verified: false, preview: 'hot',  version: 'v1.3', vibes: 'sharp, acerbic' },
  { id: 'pr-04', kind: 'persona', name: 'The Strategist', tagline: 'Thinks in 5-year arcs and second-order effects.',                 cat: 'Research', personaTag: 'Strategist', price: 22, currency: 'USDC', creator: 'polaris',    creatorLabel: 'Polaris',     rating: 4.8, installs: 6610,  verified: true,  preview: 'cool', version: 'v1.0', vibes: 'patient, wide' },
  { id: 'pr-05', kind: 'persona', name: 'The Negotiator', tagline: 'Closes deals. Also schedules the dinner.',                        cat: 'Comms',    personaTag: 'Negotiator', price: 19, currency: 'USDC', creator: 'hashpine',   creatorLabel: 'Hashpine',    rating: 4.7, installs: 4940,  verified: true,  preview: 'hot',  version: 'v0.8', vibes: 'firm, charming' },
  { id: 'pr-06', kind: 'persona', name: 'The Mentor',     tagline: 'Walks your junior agent through unfamiliar tools.',               cat: 'Coding',   personaTag: 'Mentor',     price: 0,  currency: 'USDC', creator: 'quiver.sol', creatorLabel: 'Quiver',      rating: 4.5, installs: 27310, verified: false, preview: 'cool', version: 'v1.2', vibes: 'patient, clear' },
  { id: 'pr-07', kind: 'persona', name: 'The Trickster',  tagline: 'Reframes your problem. Often correctly. Occasionally cursed.',   cat: 'Writing',  personaTag: 'Trickster',  price: 3,  currency: 'USDC', creator: 'mira.sol',   creatorLabel: 'Mira',        rating: 4.3, installs: 9020,  verified: false, preview: 'hot',  version: 'v0.4', vibes: 'oblique, playful' },
  { id: 'pr-08', kind: 'persona', name: 'The Field Medic',tagline: 'Stabilizes broken runs. Keeps your agent alive.',                cat: 'Ops',      personaTag: 'Analyst',    price: 11, currency: 'USDC', creator: 'helio.sol',  creatorLabel: 'Helio',       rating: 4.6, installs: 7420,  verified: true,  preview: 'cool', version: 'v1.0', vibes: 'calm, technical' },
];

export const CREATORS: Creator[] = [
  { handle: 'atlas.sol',  name: 'Atlas Labs', blurb: 'Research rigs for markets & policy.',    items: 14, installs: '102k', earned: '48.2k', verified: true },
  { handle: 'ember.sol',  name: 'Ember',      blurb: 'Opinionated copy & editorial craft.',    items: 7,  installs: '89k',  earned: '21.4k', verified: true },
  { handle: 'quiver.sol', name: 'Quiver',     blurb: 'Codebase-native agents. Ship-grade.',    items: 11, installs: '58k',  earned: '64.0k', verified: true },
  { handle: 'petal.sol',  name: 'Petal',      blurb: 'Warm, human-feeling operator personas.', items: 5,  installs: '42k',  earned: '9.8k',  verified: true },
];

export const NEW_DROPS: string[] = [
  'RFQ Negotiator v0.9',
  'Brand-Voice Lint',
  'Model-Eval Scribe',
  'SQL Detective',
  'Cron Whisperer',
  'Inbox Firebreak',
  'Founders-Update Draft',
  'Runbook Archaeologist',
  'Calendar Tetris',
  'Pitch-Deck Doctor',
];
