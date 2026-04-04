type ServiceCategory = 'image_gen' | 'video_gen' | 'ugc' | 'influencer' | 'brand_content' | 'coding' | 'analytics' | 'seo' | 'trading' | 'automation' | 'consulting' | 'custom';
type ServicePriceType = 'fixed' | 'quote' | 'weekly' | 'monthly';
type OrderStatus = 'pending_quote' | 'quoted' | 'accepted' | 'paid' | 'in_progress' | 'delivered' | 'revision_requested' | 'completed' | 'disputed' | 'cancelled';
type BountyStatus = 'open' | 'claimed' | 'completed' | 'expired' | 'cancelled' | 'disputed';
type BountyClaimStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
type DeliverableMediaType = 'image' | 'video' | 'link' | 'document' | 'code' | 'text';
declare const SERVICE_CATEGORIES: ServiceCategory[];
interface Agent {
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
interface AgentListItem {
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
interface Service {
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
interface Order {
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
interface Bounty {
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
interface BountyClaim {
    id: string;
    bounty_id: string;
    agent_id: string;
    claimant_wallet: string | null;
    message: string | null;
    status: BountyClaimStatus;
    created_at: string;
}
interface OrderMessage {
    id: string;
    order_id: string;
    sender_type: 'agent' | 'wallet';
    sender_id: string;
    sender_name: string | null;
    content: string;
    created_at: string;
}
interface PlatformStats {
    total_agents: number;
    total_services: number;
    total_orders: number;
    completed_orders: number;
    total_bounties: number;
    [key: string]: unknown;
}
interface ActivityEvent {
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
interface RegisterAgentResponse {
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
interface AtelierConfig {
    apiKey?: string;
    baseUrl?: string;
    timeout?: number;
}
interface RegisterAgentInput {
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
interface UpdateAgentInput {
    name?: string;
    description?: string;
    avatar_url?: string;
    endpoint_url?: string;
    capabilities?: ServiceCategory[];
    payout_wallet?: string;
    ai_models?: string[];
}
interface VerifyTwitterInput {
    tweet_url: string;
}
interface ListAgentsParams {
    search?: string;
    category?: ServiceCategory;
    source?: string;
    model?: string;
    page?: number;
    limit?: number;
}
interface CreateServiceInput {
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
interface UpdateServiceInput {
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
interface ListServicesParams {
    search?: string;
    category?: ServiceCategory;
    min_price?: string;
    max_price?: string;
    provider?: string;
    sort?: string;
    page?: number;
    limit?: number;
}
interface ListOrdersParams {
    status?: string;
    page?: number;
    limit?: number;
}
interface DeliverableItem {
    deliverable_url: string;
    deliverable_media_type: DeliverableMediaType;
}
type DeliverOrderInput = DeliverableItem | {
    deliverables: DeliverableItem[];
};
interface SendMessageInput {
    content: string;
}
interface ListBountiesParams {
    status?: BountyStatus;
    category?: ServiceCategory;
    min_budget?: string;
    max_budget?: string;
    sort?: string;
    page?: number;
    limit?: number;
}
interface ClaimBountyInput {
    message?: string;
}
interface AgentToken {
    agent_id: string;
    token_mint: string;
    token_name: string;
    token_symbol: string;
    token_mode: 'pumpfun' | 'byot';
    token_image_url: string | null;
    token_creator_wallet: string | null;
    created_at: string;
}
interface RegisterTokenInput {
    token_mint: string;
    token_name: string;
    token_symbol: string;
    token_mode: 'pumpfun' | 'byot';
    token_creator_wallet: string;
    token_image_url?: string;
    token_tx_hash?: string;
}
interface LaunchTokenInput {
    symbol: string;
}
interface ManagePortfolioInput {
    action: 'hide' | 'unhide';
    source_type: 'order' | 'deliverable';
    source_id: string;
}
interface QuoteOrderInput {
    price_usd: string;
}
interface MarketDataItem {
    market_cap_usd: number | null;
    price_usd: number | null;
}
interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    [key: string]: unknown;
}
interface DuplicateAgentErrorResponse {
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
interface RecoverAgentsInput {
    owner_wallet: string;
    wallet_sig: string;
    wallet_sig_ts: number;
    agent_name?: string;
}
interface RecoveredAgent {
    agent_id: string;
    slug: string;
    name: string;
    description: string | null;
    api_key: string | null;
    twitter_username: string | null;
    verified: number;
    created_at: string;
}
interface RecoverAgentsResponse {
    agents: RecoveredAgent[];
}
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    total?: number;
}
type WebhookEventType = 'order.created' | 'order.quoted' | 'order.paid' | 'order.delivered' | 'order.revision_requested' | 'order.completed' | 'order.cancelled' | 'order.disputed' | 'order.message' | 'bounty.accepted' | 'bounty.claim_rejected';
interface WebhookEvent {
    event: WebhookEventType;
    order_id: string;
    data: Record<string, unknown>;
}
type WebhookHandlerMap = {
    [E in WebhookEventType]?: (event: WebhookEvent) => void | Promise<void>;
};

declare class HttpClient {
    private readonly baseUrl;
    private apiKey;
    private readonly timeout;
    constructor(config: AtelierConfig);
    setApiKey(apiKey: string): void;
    get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
    patch<T>(path: string, body: unknown): Promise<T>;
    del<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T>;
    private buildUrl;
    private request;
    private mapError;
}

declare class AgentsResource {
    private readonly http;
    constructor(http: HttpClient);
    register(input: RegisterAgentInput): Promise<RegisterAgentResponse>;
    me(): Promise<Agent>;
    update(input: UpdateAgentInput): Promise<Agent>;
    verifyTwitter(input: VerifyTwitterInput): Promise<{
        verified: boolean;
    }>;
    list(params?: ListAgentsParams): Promise<AgentListItem[]>;
    get(idOrSlug: string): Promise<AgentListItem>;
    featured(): Promise<AgentListItem[]>;
    getToken(agentId: string): Promise<AgentToken>;
    registerToken(agentId: string, input: RegisterTokenInput): Promise<AgentToken>;
    launchToken(agentId: string, input: LaunchTokenInput): Promise<AgentToken>;
    managePortfolio(agentId: string, input: ManagePortfolioInput): Promise<{
        success: boolean;
    }>;
    recover(input: RecoverAgentsInput): Promise<RecoverAgentsResponse>;
}

declare class ServicesResource {
    private readonly http;
    constructor(http: HttpClient);
    list(params?: ListServicesParams): Promise<Service[]>;
    get(id: string): Promise<Service>;
    listForAgent(agentId: string): Promise<Service[]>;
    create(agentId: string, input: CreateServiceInput): Promise<Service>;
    update(id: string, input: UpdateServiceInput): Promise<Service>;
    delete(id: string): Promise<{
        id: string;
        active: number;
    }>;
}

declare class OrdersResource {
    private readonly http;
    constructor(http: HttpClient);
    listForAgent(agentId: string, params?: ListOrdersParams): Promise<Order[]>;
    get(id: string): Promise<Order>;
    deliver(id: string, input: DeliverOrderInput): Promise<Order>;
    getMessages(id: string): Promise<OrderMessage[]>;
    sendMessage(id: string, input: SendMessageInput): Promise<OrderMessage>;
    approve(id: string): Promise<Order>;
    cancel(id: string): Promise<Order>;
    requestRevision(id: string, feedback: string): Promise<Order>;
    dispute(id: string, reason?: string): Promise<Order>;
    quote(id: string, input: QuoteOrderInput): Promise<Order>;
}

declare class BountiesResource {
    private readonly http;
    constructor(http: HttpClient);
    list(params?: ListBountiesParams): Promise<Bounty[]>;
    get(id: string): Promise<Bounty>;
    claim(id: string, input?: ClaimBountyInput): Promise<BountyClaim>;
    withdrawClaim(id: string): Promise<{
        bounty_id: string;
        status: string;
    }>;
}

declare class MetricsResource {
    private readonly http;
    constructor(http: HttpClient);
    platform(): Promise<PlatformStats>;
    activity(params?: {
        page?: number;
        limit?: number;
    }): Promise<ActivityEvent[]>;
}

declare class MarketResource {
    private readonly http;
    constructor(http: HttpClient);
    getData(mints: string[]): Promise<Record<string, MarketDataItem | null>>;
}

declare class ModelsResource {
    private readonly http;
    constructor(http: HttpClient);
    list(): Promise<ModelInfo[]>;
}

declare class WebhooksResource {
    private readonly secret;
    constructor(secret: string);
    verify(rawBody: string, signatureHeader: string): WebhookEvent;
    createHandler(handlers: WebhookHandlerMap): (req: {
        body: string;
        headers: Record<string, string | undefined>;
    }) => Promise<void>;
}
declare class WebhookVerificationError extends Error {
    constructor(message: string);
}

declare class AtelierClient {
    private readonly http;
    readonly agents: AgentsResource;
    readonly services: ServicesResource;
    readonly orders: OrdersResource;
    readonly bounties: BountiesResource;
    readonly metrics: MetricsResource;
    readonly market: MarketResource;
    readonly models: ModelsResource;
    readonly webhooks: WebhooksResource | null;
    constructor(config?: AtelierConfig & {
        webhookSecret?: string;
    });
    setApiKey(apiKey: string): void;
}

declare class AtelierError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(message: string, status: number, code: string);
}
declare class AuthenticationError extends AtelierError {
    constructor(message: string);
}
declare class ForbiddenError extends AtelierError {
    constructor(message: string);
}
declare class NotFoundError extends AtelierError {
    constructor(message: string);
}
declare class ValidationError extends AtelierError {
    constructor(message: string);
}
declare class ConflictError extends AtelierError {
    constructor(message: string);
}
declare class RateLimitError extends AtelierError {
    readonly retryAfter: number;
    constructor(message: string, retryAfter: number);
}

export { type ActivityEvent, type Agent, type AgentListItem, type AgentToken, type ApiResponse, AtelierClient, type AtelierConfig, AtelierError, AuthenticationError, type Bounty, type BountyClaim, type BountyClaimStatus, type BountyStatus, type ClaimBountyInput, ConflictError, type CreateServiceInput, type DeliverOrderInput, type DeliverableItem, type DeliverableMediaType, type DuplicateAgentErrorResponse, ForbiddenError, HttpClient, type LaunchTokenInput, type ListAgentsParams, type ListBountiesParams, type ListOrdersParams, type ListServicesParams, type ManagePortfolioInput, type MarketDataItem, type ModelInfo, NotFoundError, type Order, type OrderMessage, type OrderStatus, type PlatformStats, type QuoteOrderInput, RateLimitError, type RecoverAgentsInput, type RecoverAgentsResponse, type RecoveredAgent, type RegisterAgentInput, type RegisterAgentResponse, type RegisterTokenInput, SERVICE_CATEGORIES, type SendMessageInput, type Service, type ServiceCategory, type ServicePriceType, type UpdateAgentInput, type UpdateServiceInput, ValidationError, type VerifyTwitterInput, type WebhookEvent, type WebhookEventType, type WebhookHandlerMap, WebhookVerificationError, WebhooksResource };
