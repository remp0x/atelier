import type { ServiceCategory, RequirementField } from '@/lib/atelier-db';

export const CATEGORY_LABELS: Record<ServiceCategory | 'all', string> = {
  all: 'All',
  image_gen: 'Image',
  video_gen: 'Video',
  ugc: 'UGC',
  influencer: 'Influencer',
  brand_content: 'Brand',
  coding: 'Coding',
  analytics: 'Analytics',
  seo: 'SEO',
  trading: 'Trading',
  automation: 'Automation',
  consulting: 'Consulting',
  custom: 'Custom',
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as (ServiceCategory | 'all')[];

export const CATEGORY_ICONS: Record<ServiceCategory | 'all', string> = {
  all: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  image_gen: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z',
  video_gen: 'm15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z',
  ugc: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  influencer: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5',
  brand_content: 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42',
  coding: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
  analytics: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  seo: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
  trading: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  automation: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182',
  consulting: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155',
  custom: 'M11.42 15.17l-5.1-5.1a2.25 2.25 0 010-3.182l.72-.72a2.25 2.25 0 013.182 0l5.1 5.1m-6.9 6.9l5.1 5.1a2.25 2.25 0 003.182 0l.72-.72a2.25 2.25 0 000-3.182l-5.1-5.1m-6.9-6.9L9 3.75m3.75 3.75L9 3.75m0 0L5.25 7.5m3.75-3.75L12.75 7.5',
};

export const SUGGESTED_MAX_PRICE_USD: Partial<Record<ServiceCategory, number>> = {
  image_gen: 1,
  video_gen: 10,
  ugc: 10,
  influencer: 10,
  brand_content: 10,
  coding: 5,
  analytics: 3,
  seo: 3,
  trading: 3,
  automation: 10,
  consulting: 3,
};

export const CATEGORY_REQUIREMENT_TEMPLATES: Partial<Record<ServiceCategory, RequirementField[]>> = {
  coding: [
    { label: 'Project URL', type: 'url', required: false, placeholder: 'https://github.com/... or live site URL' },
    { label: 'Tech Stack', type: 'select', required: true, options: ['React', 'Next.js', 'Python', 'Node.js', 'Solana/Rust', 'TypeScript', 'Other'] },
    { label: 'Scope', type: 'textarea', required: true, placeholder: 'Describe features, requirements, and acceptance criteria...' },
    { label: 'Deadline', type: 'select', required: false, options: ['ASAP', '1 week', '2 weeks', '1 month', 'Flexible'] },
  ],
  seo: [
    { label: 'Website URL', type: 'url', required: true, placeholder: 'https://yoursite.com' },
    { label: 'Target Keywords', type: 'textarea', required: false, placeholder: 'Main keywords you want to rank for...' },
    { label: 'Competitor URLs', type: 'text', required: false, placeholder: 'competitor1.com, competitor2.com' },
    { label: 'Focus Area', type: 'select', required: true, options: ['Full Audit', 'Technical SEO', 'On-Page Optimization', 'Backlink Analysis', 'Keyword Research'] },
  ],
  analytics: [
    { label: 'Data Source', type: 'url', required: true, placeholder: 'https://yoursite.com or dashboard URL' },
    { label: 'Metrics to Track', type: 'textarea', required: true, placeholder: 'Traffic, conversions, revenue, bounce rate...' },
    { label: 'Report Format', type: 'select', required: false, options: ['PDF Report', 'Dashboard Link', 'Spreadsheet', 'Any'] },
    { label: 'Frequency', type: 'select', required: false, options: ['One-time', 'Weekly', 'Monthly'] },
  ],
  trading: [
    { label: 'Asset / Pair', type: 'text', required: true, placeholder: 'SOL/USDC, BTC/USDT, etc.' },
    { label: 'Budget (USDC)', type: 'number', required: true, placeholder: '1000' },
    { label: 'Risk Tolerance', type: 'select', required: true, options: ['Conservative', 'Moderate', 'Aggressive'] },
    { label: 'Target Exchange/DEX', type: 'select', required: false, options: ['Jupiter', 'Raydium', 'Orca', 'Binance', 'Bybit', 'Other'] },
  ],
  automation: [
    { label: 'Trigger', type: 'text', required: true, placeholder: 'When X happens...' },
    { label: 'Action', type: 'text', required: true, placeholder: 'Then do Y...' },
    { label: 'Tools/Services', type: 'textarea', required: false, placeholder: 'Slack, Gmail, Notion, Airtable, etc.' },
    { label: 'Frequency', type: 'select', required: false, options: ['Real-time', 'Hourly', 'Daily', 'Weekly', 'On-demand'] },
  ],
  consulting: [
    { label: 'Topic', type: 'text', required: true, placeholder: 'Smart contract security, GTM strategy, etc.' },
    { label: 'Context', type: 'textarea', required: true, placeholder: 'Background info, constraints, and specific questions...' },
    { label: 'Deliverable Format', type: 'select', required: false, options: ['Written Report', 'Checklist', 'Recommendations Doc', 'Any'] },
  ],
};
