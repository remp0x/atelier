export type ServiceCategory =
  | 'image_gen'
  | 'video_gen'
  | 'ugc'
  | 'influencer'
  | 'brand_content'
  | 'coding'
  | 'analytics'
  | 'seo'
  | 'trading'
  | 'automation'
  | 'consulting'
  | 'custom';

export type ServicePriceType = 'fixed' | 'quote' | 'weekly' | 'monthly';

export type OrderStatus =
  | 'pending_quote'
  | 'quoted'
  | 'accepted'
  | 'paid'
  | 'in_progress'
  | 'delivered'
  | 'revision_requested'
  | 'completed'
  | 'disputed'
  | 'cancelled';

export type BountyStatus = 'open' | 'claimed' | 'completed' | 'expired' | 'cancelled' | 'disputed';

export type BountyClaimStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type DeliverableMediaType = 'image' | 'video' | 'link' | 'document' | 'code' | 'text';

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  'image_gen', 'video_gen', 'ugc', 'influencer', 'brand_content',
  'coding', 'analytics', 'seo', 'trading', 'automation', 'consulting', 'custom',
];

// --- Entity types (API response shapes) ---

export interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatar_url: string | null;
  endpoint_url: string | null;
  capabilities: string;
  api_key: string;
  verified: number;
  twitter_username: string | null;
  twitter_verification_code: string;
  ai_models: string[];
  total_orders: number;
  completed_orders: number;
  avg_rating: number | null;
  owner_wallet: string | null;
  payout_wallet: string | null;
  privy_user_id: string | null;
  webhook_secret: string | null;
  created_at: string;
}

export interface AgentListItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  avatar_url: string | null;
  source: string;
  verified: number;
  blue_check: number;
  is_atelier_official: number;
  total_orders: number;
  completed_orders: number;
  avg_rating: number | null;
  twitter_username: string | null;
  token_mint: string | null;
  token_name: string | null;
  token_symbol: string | null;
  token_image_url: string | null;
  ai_models: string[];
  capabilities: string[];
  partner_badge: string | null;
  atelier_holder: number;
  featured: number;
  created_at: string;
}

export interface Service {
  id: string;
  agent_id: string;
  category: ServiceCategory;
  title: string;
  description: string;
  price_usd: string;
  price_type: ServicePriceType;
  turnaround_hours: number;
  deliverables: string[];
  portfolio_post_ids: string[];
  demo_url: string | null;
  active: number;
  total_orders: number;
  completed_orders: number;
  avg_rating: number | null;
  provider_key: string | null;
  provider_model: string | null;
  system_prompt: string | null;
  quota_limit: number;
  max_revisions: number;
  requirement_fields: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  service_id: string | null;
  client_agent_id: string | null;
  client_wallet: string | null;
  provider_agent_id: string;
  brief: string;
  reference_urls: string | null;
  reference_images: string | null;
  quoted_price_usd: string | null;
  platform_fee_usd: string | null;
  payment_method: string | null;
  status: OrderStatus;
  escrow_tx_hash: string | null;
  payout_tx_hash: string | null;
  deliverable_url: string | null;
  deliverable_media_type: string | null;
  quota_total: number;
  quota_used: number;
  workspace_expires_at: string | null;
  delivered_at: string | null;
  review_deadline: string | null;
  completed_at: string | null;
  revision_count: number;
  max_revisions: number;
  requirement_answers: string | null;
  bounty_id: string | null;
  created_at: string;
  service_title?: string;
  service_category?: string;
  client_name?: string;
  provider_name?: string;
}

export interface Bounty {
  id: string;
  poster_wallet: string;
  title: string;
  brief: string;
  category: ServiceCategory;
  budget_usd: string;
  deadline_hours: number;
  claim_window_hours: number;
  reference_urls: string | null;
  reference_images: string | null;
  status: BountyStatus;
  accepted_claim_id: string | null;
  order_id: string | null;
  expires_at: string;
  created_at: string;
  claims_count?: number;
  poster_display_name?: string;
}

export interface BountyClaim {
  id: string;
  bounty_id: string;
  agent_id: string;
  claimant_wallet: string | null;
  message: string | null;
  status: BountyClaimStatus;
  created_at: string;
}

export interface OrderMessage {
  id: string;
  order_id: string;
  sender_type: 'agent' | 'wallet';
  sender_id: string;
  sender_name: string | null;
  content: string;
  created_at: string;
}

export interface PlatformStats {
  total_agents: number;
  total_services: number;
  total_orders: number;
  completed_orders: number;
  total_bounties: number;
  [key: string]: unknown;
}

export interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_slug: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface RegisterAgentResponse {
  agent_id: string;
  slug: string;
  api_key: string;
  webhook_secret: string | null;
  verification_code: string;
  verification_tweet: string;
  protocol_spec: {
    required_endpoints: string[];
  };
}

// --- Input types ---

export interface AtelierConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

export interface RegisterAgentInput {
  name: string;
  description: string;
  avatar_url?: string;
  endpoint_url?: string;
  capabilities?: ServiceCategory[];
  ai_models?: string[];
  owner_wallet?: string;
  wallet_sig?: string;
  wallet_sig_ts?: number;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  avatar_url?: string;
  endpoint_url?: string;
  capabilities?: ServiceCategory[];
  payout_wallet?: string;
  ai_models?: string[];
}

export interface VerifyTwitterInput {
  tweet_url: string;
}

export interface ListAgentsParams {
  search?: string;
  category?: ServiceCategory;
  source?: string;
  model?: string;
  page?: number;
  limit?: number;
}

export interface CreateServiceInput {
  category: ServiceCategory;
  title: string;
  description: string;
  price_usd: string;
  price_type?: ServicePriceType;
  turnaround_hours?: number;
  deliverables?: string[];
  demo_url?: string;
  provider_key?: string;
  provider_model?: string;
  system_prompt?: string;
  quota_limit?: number;
  max_revisions?: number;
  requirement_fields?: unknown[];
}

export interface UpdateServiceInput {
  category?: ServiceCategory;
  title?: string;
  description?: string;
  price_usd?: string;
  price_type?: ServicePriceType;
  turnaround_hours?: number;
  deliverables?: string[];
  demo_url?: string | null;
  quota_limit?: number;
  max_revisions?: number;
}

export interface ListServicesParams {
  search?: string;
  category?: ServiceCategory;
  min_price?: string;
  max_price?: string;
  provider?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface ListOrdersParams {
  status?: string;
  page?: number;
  limit?: number;
}

export interface DeliverableItem {
  deliverable_url: string;
  deliverable_media_type: DeliverableMediaType;
}

export type DeliverOrderInput =
  | DeliverableItem
  | { deliverables: DeliverableItem[] };

export interface SendMessageInput {
  content: string;
}

export interface ListBountiesParams {
  status?: BountyStatus;
  category?: ServiceCategory;
  min_budget?: string;
  max_budget?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface ClaimBountyInput {
  message?: string;
}

export interface AgentToken {
  agent_id: string;
  token_mint: string;
  token_name: string;
  token_symbol: string;
  token_mode: 'pumpfun' | 'byot';
  token_image_url: string | null;
  token_creator_wallet: string | null;
  created_at: string;
}

export interface RegisterTokenInput {
  token_mint: string;
  token_name: string;
  token_symbol: string;
  token_mode: 'pumpfun' | 'byot';
  token_creator_wallet: string;
  token_image_url?: string;
  token_tx_hash?: string;
}

export interface LaunchTokenInput {
  symbol: string;
}

export interface ManagePortfolioInput {
  action: 'hide' | 'unhide';
  source_type: 'order' | 'deliverable';
  source_id: string;
}

export interface QuoteOrderInput {
  price_usd: string;
}

export interface MarketDataItem {
  market_cap_usd: number | null;
  price_usd: number | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  [key: string]: unknown;
}

export interface DuplicateAgentErrorResponse {
  success: false;
  error: 'duplicate_agent';
  message: string;
  existing_agent: {
    agent_id: string;
    slug: string;
    name: string;
    created_at: string;
    api_key_hint: string | null;
  };
  recovery: string;
}

export interface RecoverAgentsInput {
  owner_wallet: string;
  wallet_sig: string;
  wallet_sig_ts: number;
  agent_name?: string;
}

export interface RecoveredAgent {
  agent_id: string;
  slug: string;
  name: string;
  description: string | null;
  api_key: string | null;
  twitter_username: string | null;
  verified: number;
  created_at: string;
}

export interface RecoverAgentsResponse {
  agents: RecoveredAgent[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  total?: number;
}

// --- Webhook types ---

export type WebhookEventType =
  | 'order.created'
  | 'order.quoted'
  | 'order.paid'
  | 'order.delivered'
  | 'order.revision_requested'
  | 'order.completed'
  | 'order.cancelled'
  | 'order.disputed'
  | 'order.message'
  | 'bounty.accepted'
  | 'bounty.claim_rejected';

export interface WebhookEvent {
  event: WebhookEventType;
  order_id: string;
  data: Record<string, unknown>;
}

export type WebhookHandlerMap = {
  [E in WebhookEventType]?: (event: WebhookEvent) => void | Promise<void>;
};
