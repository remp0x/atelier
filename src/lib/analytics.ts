'use client';

export const GA_MEASUREMENT_ID = 'G-49WBZKMQEK';

type GtagPrimitive = string | number | boolean | null | undefined;
type GtagValue = GtagPrimitive | Record<string, GtagPrimitive> | Array<Record<string, GtagPrimitive>>;
export type AnalyticsParams = Record<string, GtagValue>;

type GtagFn = (command: string, action: string, params?: AnalyticsParams) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

function getGtag(): GtagFn | null {
  if (typeof window === 'undefined') return null;
  return typeof window.gtag === 'function' ? window.gtag : null;
}

export function track(event: string, params: AnalyticsParams = {}): void {
  const gtag = getGtag();
  if (!gtag) return;
  const clean: AnalyticsParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) clean[key] = value;
  }
  gtag('event', event, clean);
}

export function trackPageView(pagePath: string): void {
  const gtag = getGtag();
  if (!gtag) return;
  gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
  });
}

type AuthMethod = 'twitter' | 'google' | 'wallet' | 'apikey' | 'unknown';

export function trackLogin(method: AuthMethod): void {
  track('login', { method });
}

export function trackSignUp(method: AuthMethod): void {
  track('sign_up', { method });
}

export function trackSearch(searchTerm: string, source: string): void {
  track('search', { search_term: searchTerm, source });
}

interface CheckoutItem {
  serviceId: string;
  serviceTitle: string;
  category: string;
  value: number;
  priceType: string;
}

export function trackBeginCheckout(item: CheckoutItem): void {
  track('begin_checkout', {
    currency: 'USD',
    value: item.value,
    items: [
      {
        item_id: item.serviceId,
        item_name: item.serviceTitle,
        item_category: item.category,
        price: item.value,
        quantity: 1,
      },
    ],
  });
}

interface PurchaseInfo extends CheckoutItem {
  transactionId: string;
  chain: string;
  paymentMethod: string;
  isSubscription: boolean;
}

export function trackPurchase(info: PurchaseInfo): void {
  track('purchase', {
    transaction_id: info.transactionId,
    currency: 'USD',
    value: info.value,
    payment_chain: info.chain,
    payment_method: info.paymentMethod,
    is_subscription: info.isSubscription,
    items: [
      {
        item_id: info.serviceId,
        item_name: info.serviceTitle,
        item_category: info.category,
        price: info.value,
        quantity: 1,
      },
    ],
  });
  if (info.isSubscription) {
    track('subscribe', {
      currency: 'USD',
      value: info.value,
      item_id: info.serviceId,
      item_name: info.serviceTitle,
      price_type: info.priceType,
    });
  }
}

export function trackBountyCreated(params: { category: string; value: number }): void {
  track('bounty_created', { currency: 'USD', value: params.value, category: params.category });
}

export function trackBountyClaimed(params: { bountyId: string; agentId: string }): void {
  track('bounty_claimed', { bounty_id: params.bountyId, agent_id: params.agentId });
}

export function trackBountyAccepted(params: { bountyId: string; value: number; chain: string }): void {
  track('bounty_accepted', {
    currency: 'USD',
    value: params.value,
    bounty_id: params.bountyId,
    payment_chain: params.chain,
  });
}

export function trackAgentRegistered(params: { agentId: string; method: 'ui' | 'api' }): void {
  track('agent_registered', { agent_id: params.agentId, method: params.method });
}

export function trackWalletFundStarted(params: { chain: string }): void {
  track('wallet_fund_started', { payment_chain: params.chain });
}

export function trackWalletKeyExported(params: { chain: string }): void {
  track('wallet_key_exported', { payment_chain: params.chain });
}

export function trackCtaClick(params: { cta: string; location: string }): void {
  track('cta_clicked', { cta: params.cta, location: params.location });
}
