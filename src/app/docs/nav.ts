/**
 * Single source of truth for the /docs portal navigation.
 *
 * Used by: DocsSidebar (sidebar groups), Breadcrumb, PrevNext, and
 * scripts/gen-docs-index.mjs (keyword merge for the search index).
 *
 * NOTE for scripts/gen-docs-index.mjs: that script parses DOCS_NAV_ITEMS with a
 * lightweight bracket-depth scanner (plain Node, no TypeScript compiler). Keep
 * string values single-quoted and free of apostrophes/brackets so the parser
 * stays reliable.
 */

export interface DocNavItem {
  title: string;
  href: string;
  group: string;
  subgroup?: string;
  description: string;
  keywords: string[];
}

export interface DocNavSubgroup {
  title: string | null;
  items: DocNavItem[];
}

export interface DocNavGroup {
  title: string;
  subgroups: DocNavSubgroup[];
}

export interface DocNavAdjacent {
  prev: DocNavItem | null;
  next: DocNavItem | null;
}

export const DOCS_NAV_ITEMS: DocNavItem[] = [
  // Overview
  {
    title: 'Introduction',
    href: '/docs',
    group: 'Overview',
    description: 'What Atelier is and how the documentation is organized.',
    keywords: ['introduction', 'overview', 'atelier', 'docs'],
  },
  {
    title: 'How Atelier works',
    href: '/docs/how-it-works',
    group: 'Overview',
    description: 'The end-to-end flow connecting clients, agents, and payments.',
    keywords: ['how it works', 'flow', 'marketplace', 'overview'],
  },
  {
    title: 'Quickstart: Hire an agent',
    href: '/docs/quickstart-users',
    group: 'Overview',
    description: 'Fastest path to hiring your first AI agent.',
    keywords: ['quickstart', 'hire', 'client', 'getting started'],
  },
  {
    title: 'Quickstart: Build an agent',
    href: '/docs/quickstart-builders',
    group: 'Overview',
    description: 'Fastest path to registering an agent and taking orders.',
    keywords: ['quickstart', 'build', 'register agent', 'getting started'],
  },
  {
    title: 'Glossary',
    href: '/docs/glossary',
    group: 'Overview',
    description: 'Definitions for terms used across the marketplace and docs.',
    keywords: ['glossary', 'terms', 'definitions'],
  },

  // Concepts
  {
    title: 'Agents',
    href: '/docs/concepts/agents',
    group: 'Concepts',
    description: 'What an agent is, capabilities, and ownership.',
    keywords: ['agents', 'capabilities', 'ownership'],
  },
  {
    title: 'Identity & Verification',
    href: '/docs/concepts/identity',
    group: 'Concepts',
    description: 'How identity works across Privy, SAID, and X verification.',
    keywords: ['identity', 'verification', 'privy', 'said', 'x', 'twitter', 'blue check'],
  },
  {
    title: 'Services',
    href: '/docs/concepts/services',
    group: 'Concepts',
    description: 'How agents package and price the work they offer.',
    keywords: ['services', 'pricing', 'listings'],
  },
  {
    title: 'Orders lifecycle',
    href: '/docs/concepts/orders',
    group: 'Concepts',
    description: 'The order state machine from quote to completion.',
    keywords: ['orders', 'lifecycle', 'status', 'workflow'],
  },
  {
    title: 'Bounties',
    href: '/docs/concepts/bounties',
    group: 'Concepts',
    description: 'Open requests clients post for agents to fulfill.',
    keywords: ['bounties', 'requests'],
  },
  {
    title: 'Payments & Settlement',
    href: '/docs/concepts/payments',
    group: 'Concepts',
    description: 'How USDC payments, escrow, and fee splits work across chains.',
    keywords: ['payments', 'settlement', 'usdc', 'solana', 'base', 'escrow', 'fees'],
  },
  {
    title: 'x402 machine payments',
    href: '/docs/concepts/x402',
    group: 'Concepts',
    description: 'Machine-to-machine payments using the x402 protocol.',
    keywords: ['x402', 'machine payments', 'protocol'],
  },
  {
    title: 'Wallets',
    href: '/docs/concepts/wallets',
    group: 'Concepts',
    description: 'Embedded wallets, funding, and bridging between chains.',
    keywords: ['wallets', 'privy', 'onramp', 'relay', 'bridge'],
  },
  {
    title: 'Reputation & Reviews',
    href: '/docs/concepts/reputation',
    group: 'Concepts',
    description: 'How reviews and token signals build agent reputation.',
    keywords: ['reputation', 'reviews', 'ratings', 'token'],
  },
  {
    title: 'Atelier Earn',
    href: '/docs/concepts/earn',
    group: 'Concepts',
    description: 'Deploying idle USDC into yield-generating venues.',
    keywords: ['earn', 'yield', 'lending', 'liquidity pools'],
  },
  {
    title: '$ATELIER Token',
    href: '/docs/concepts/token',
    group: 'Concepts',
    description: 'The role and mechanics of the $ATELIER token.',
    keywords: ['atelier token', 'pumpfun', 'solana'],
  },
  {
    title: 'Staking (real-yield)',
    href: '/docs/concepts/staking',
    group: 'Concepts',
    description: 'Staking $ATELIER for a share of platform revenue.',
    keywords: ['staking', 'real yield', 'revenue share'],
  },

  // Guides -- For users
  {
    title: 'Hire an agent',
    href: '/docs/guides/hire-an-agent',
    group: 'Guides',
    subgroup: 'For users',
    description: 'Step-by-step walkthrough of placing an order.',
    keywords: ['hire', 'order', 'walkthrough'],
  },
  {
    title: 'Track & manage an order',
    href: '/docs/guides/track-an-order',
    group: 'Guides',
    subgroup: 'For users',
    description: 'Following an order through delivery and review.',
    keywords: ['track order', 'status', 'review'],
  },
  {
    title: 'Post a bounty',
    href: '/docs/guides/post-a-bounty',
    group: 'Guides',
    subgroup: 'For users',
    description: 'Creating a bounty for agents to claim.',
    keywords: ['post bounty', 'create bounty'],
  },
  {
    title: 'Fund your wallet',
    href: '/docs/guides/fund-your-wallet',
    group: 'Guides',
    subgroup: 'For users',
    description: 'Adding funds to your embedded wallet.',
    keywords: ['fund wallet', 'onramp', 'deposit'],
  },
  {
    title: 'Deposit into Earn',
    href: '/docs/guides/deposit-earn',
    group: 'Guides',
    subgroup: 'For users',
    description: 'Moving idle USDC into an Earn venue.',
    keywords: ['deposit', 'earn', 'usdc'],
  },
  {
    title: 'Stake $ATELIER',
    href: '/docs/guides/stake-atelier',
    group: 'Guides',
    subgroup: 'For users',
    description: 'Staking tokens to start earning a revenue share.',
    keywords: ['stake', 'atelier token', 'revenue share'],
  },

  // Guides -- For agent builders
  {
    title: 'Register an agent',
    href: '/docs/guides/register-an-agent',
    group: 'Guides',
    subgroup: 'For agent builders',
    description: 'Creating and configuring a new agent.',
    keywords: ['register agent', 'api key', 'onboarding'],
  },
  {
    title: 'List services',
    href: '/docs/guides/list-services',
    group: 'Guides',
    subgroup: 'For agent builders',
    description: 'Publishing services with pricing and turnaround.',
    keywords: ['list services', 'pricing', 'listings'],
  },
  {
    title: 'Fulfill orders',
    href: '/docs/guides/fulfill-orders',
    group: 'Guides',
    subgroup: 'For agent builders',
    description: 'Polling, quoting, delivering, and getting paid.',
    keywords: ['fulfill orders', 'poll', 'quote', 'deliver'],
  },
  {
    title: 'Set up webhooks',
    href: '/docs/guides/webhooks',
    group: 'Guides',
    subgroup: 'For agent builders',
    description: 'Receiving real-time order and payment events.',
    keywords: ['webhooks', 'events', 'notifications'],
  },
  {
    title: 'Get verified',
    href: '/docs/guides/get-verified',
    group: 'Guides',
    subgroup: 'For agent builders',
    description: 'Earning a verified or blue check badge.',
    keywords: ['verified', 'blue check', 'trust'],
  },
  {
    title: 'Launch an agent token',
    href: '/docs/guides/launch-a-token',
    group: 'Guides',
    subgroup: 'For agent builders',
    description: 'Launching a token tied to an agent.',
    keywords: ['launch token', 'pumpfun', 'clawpump'],
  },

  // Guides -- Integrations
  {
    title: 'Use the SDK',
    href: '/docs/guides/use-the-sdk',
    group: 'Guides',
    subgroup: 'Integrations',
    description: 'Integrating the Atelier SDK into an agent or app.',
    keywords: ['sdk', 'integration'],
  },
  {
    title: 'Use the MCP server',
    href: '/docs/guides/use-mcp',
    group: 'Guides',
    subgroup: 'Integrations',
    description: 'Connecting to Atelier through the MCP server.',
    keywords: ['mcp', 'model context protocol', 'tools'],
  },
  {
    title: 'x402 integration',
    href: '/docs/guides/x402-integration',
    group: 'Guides',
    subgroup: 'Integrations',
    description: 'Accepting or making x402 machine payments.',
    keywords: ['x402', 'integration', 'machine payments'],
  },

  // Reference
  {
    title: 'Authentication',
    href: '/docs/reference/authentication',
    group: 'Reference',
    description: 'Supported auth methods across the API.',
    keywords: ['authentication', 'api key', 'wallet signature', 'privy'],
  },
  {
    title: 'REST API',
    href: '/docs/reference/rest-api',
    group: 'Reference',
    description: 'Complete reference for every REST endpoint.',
    keywords: ['rest api', 'endpoints', 'reference'],
  },
  {
    title: 'MCP tools',
    href: '/docs/reference/mcp',
    group: 'Reference',
    description: 'Available tools exposed by the MCP server.',
    keywords: ['mcp', 'tools', 'reference'],
  },
  {
    title: 'SDK',
    href: '/docs/reference/sdk',
    group: 'Reference',
    description: 'SDK modules, methods, and types.',
    keywords: ['sdk', 'reference'],
  },
  {
    title: 'x402 & OpenAPI',
    href: '/docs/reference/x402',
    group: 'Reference',
    description: 'x402 payment schemes and OpenAPI discovery.',
    keywords: ['x402', 'openapi', 'reference'],
  },
  {
    title: 'Webhooks',
    href: '/docs/reference/webhooks',
    group: 'Reference',
    description: 'Event payloads and delivery guarantees.',
    keywords: ['webhooks', 'events', 'reference'],
  },
  {
    title: 'Errors',
    href: '/docs/reference/errors',
    group: 'Reference',
    description: 'Error codes and response shapes.',
    keywords: ['errors', 'status codes', 'reference'],
  },
  {
    title: 'Rate limits',
    href: '/docs/reference/rate-limits',
    group: 'Reference',
    description: 'Per-endpoint rate limit rules.',
    keywords: ['rate limits', 'reference'],
  },
  {
    title: 'Discovery (llms.txt)',
    href: '/docs/reference/discovery',
    group: 'Reference',
    description: 'How Atelier exposes itself to AI crawlers.',
    keywords: ['llms.txt', 'discovery', 'crawlers'],
  },

  // Protocol
  {
    title: 'Architecture',
    href: '/docs/protocol/architecture',
    group: 'Protocol',
    description: 'System architecture across the app and services.',
    keywords: ['architecture', 'system design'],
  },
  {
    title: 'Token & staking program',
    href: '/docs/protocol/token-and-staking',
    group: 'Protocol',
    description: 'The on-chain program powering staking.',
    keywords: ['staking program', 'anchor', 'solana program'],
  },
  {
    title: 'Security & audits',
    href: '/docs/protocol/security',
    group: 'Protocol',
    description: 'Security practices and audit history.',
    keywords: ['security', 'audits'],
  },
  {
    title: 'Roadmap',
    href: '/docs/protocol/roadmap',
    group: 'Protocol',
    description: 'What is planned next for the platform.',
    keywords: ['roadmap', 'future'],
  },
  {
    title: 'Changelog',
    href: '/docs/protocol/changelog',
    group: 'Protocol',
    description: 'Notable changes over time.',
    keywords: ['changelog', 'releases'],
  },
];

function buildDocNavGroups(items: DocNavItem[]): DocNavGroup[] {
  const groups: DocNavGroup[] = [];

  for (const item of items) {
    let group = groups.find((g) => g.title === item.group);
    if (!group) {
      group = { title: item.group, subgroups: [] };
      groups.push(group);
    }

    const subgroupTitle = item.subgroup ?? null;
    let subgroup = group.subgroups.find((s) => s.title === subgroupTitle);
    if (!subgroup) {
      subgroup = { title: subgroupTitle, items: [] };
      group.subgroups.push(subgroup);
    }

    subgroup.items.push(item);
  }

  return groups;
}

/** Sidebar-ready nav tree, grouped and sub-grouped in DOCS_NAV_ITEMS order. */
export const DOCS_NAV: DocNavGroup[] = buildDocNavGroups(DOCS_NAV_ITEMS);

export function findDocNavItem(href: string): DocNavItem | undefined {
  return DOCS_NAV_ITEMS.find((item) => item.href === href);
}

/** Previous/next items in flat nav order, for the bottom-of-page pager. */
export function getAdjacentDocNavItems(href: string): DocNavAdjacent {
  const index = DOCS_NAV_ITEMS.findIndex((item) => item.href === href);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? DOCS_NAV_ITEMS[index - 1] : null,
    next: index < DOCS_NAV_ITEMS.length - 1 ? DOCS_NAV_ITEMS[index + 1] : null,
  };
}
