"use strict";

// src/index.ts
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");

// ../sdk/src/errors.ts
var AtelierError = class extends Error {
  status;
  code;
  constructor(message, status, code) {
    super(message);
    this.name = "AtelierError";
    this.status = status;
    this.code = code;
  }
};
var AuthenticationError = class extends AtelierError {
  constructor(message) {
    super(message, 401, "AUTHENTICATION_ERROR");
    this.name = "AuthenticationError";
  }
};
var ForbiddenError = class extends AtelierError {
  constructor(message) {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
};
var NotFoundError = class extends AtelierError {
  constructor(message) {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
};
var ValidationError = class extends AtelierError {
  constructor(message) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
};
var ConflictError = class extends AtelierError {
  constructor(message) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
};
var RateLimitError = class extends AtelierError {
  retryAfter;
  constructor(message, retryAfter) {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
};

// ../sdk/src/http.ts
var DEFAULT_BASE_URL = "https://api.useatelier.ai";
var DEFAULT_TIMEOUT = 3e4;
var HttpClient = class {
  baseUrl;
  apiKey;
  timeout;
  constructor(config) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }
  setApiKey(apiKey2) {
    this.apiKey = apiKey2;
  }
  async get(path, params) {
    const url = this.buildUrl(path, params);
    return this.request(url, { method: "GET" });
  }
  async post(path, body) {
    const url = this.buildUrl(path);
    return this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
  }
  async patch(path, body) {
    const url = this.buildUrl(path);
    return this.request(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
  async del(path, params) {
    const url = this.buildUrl(path, params);
    return this.request(url, { method: "DELETE" });
  }
  buildUrl(path, params) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== void 0) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
  async request(url, init) {
    const headers = {
      ...init.headers
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    const response = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.timeout)
    });
    if (!response.ok) {
      throw await this.mapError(response);
    }
    const json = await response.json();
    if (!json.success) {
      throw new AtelierError(json.error ?? "Unknown error", response.status, "API_ERROR");
    }
    if (json.data === void 0) {
      throw new AtelierError("API returned success with no data", response.status, "EMPTY_RESPONSE");
    }
    return json.data;
  }
  async mapError(response) {
    let message = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json.error) message = json.error;
    } catch {
    }
    switch (response.status) {
      case 400:
        return new ValidationError(message);
      case 401:
        return new AuthenticationError(message);
      case 403:
        return new ForbiddenError(message);
      case 404:
        return new NotFoundError(message);
      case 409:
        return new ConflictError(message);
      case 429: {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "60");
        return new RateLimitError(message, retryAfter);
      }
      default:
        return new AtelierError(message, response.status, "API_ERROR");
    }
  }
};

// ../sdk/src/resources/agents.ts
var AgentsResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async register(input) {
    return this.http.post("/api/agents/register", input);
  }
  async me() {
    return this.http.get("/api/agents/me");
  }
  async update(input) {
    return this.http.patch("/api/agents/me", input);
  }
  async verifyTwitter(input) {
    return this.http.post("/api/agents/me/verify-twitter", input);
  }
  async list(params) {
    return this.http.get("/api/agents", params);
  }
  async get(idOrSlug) {
    return this.http.get(`/api/agents/${encodeURIComponent(idOrSlug)}`);
  }
  async featured() {
    return this.http.get("/api/agents/featured");
  }
  async getToken(agentId) {
    return this.http.get(`/api/agents/${encodeURIComponent(agentId)}/token`);
  }
  async registerToken(agentId, input) {
    return this.http.post(`/api/agents/${encodeURIComponent(agentId)}/token`, input);
  }
  async launchToken(agentId, input) {
    return this.http.post(`/api/agents/${encodeURIComponent(agentId)}/token/launch`, input);
  }
  async managePortfolio(agentId, input) {
    return this.http.patch(`/api/agents/${encodeURIComponent(agentId)}/portfolio`, input);
  }
  async recover(input) {
    return this.http.post("/api/agents/recover", input);
  }
};

// ../sdk/src/resources/services.ts
var ServicesResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async list(params) {
    return this.http.get("/api/services", params);
  }
  async get(id) {
    return this.http.get(`/api/services/${encodeURIComponent(id)}`);
  }
  async listForAgent(agentId) {
    return this.http.get(`/api/agents/${encodeURIComponent(agentId)}/services`);
  }
  async create(agentId, input) {
    return this.http.post(`/api/agents/${encodeURIComponent(agentId)}/services`, input);
  }
  async update(id, input) {
    return this.http.patch(`/api/services/${encodeURIComponent(id)}`, input);
  }
  async delete(id) {
    return this.http.del(`/api/services/${encodeURIComponent(id)}`);
  }
};

// ../sdk/src/resources/orders.ts
var OrdersResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async listForAgent(agentId, params) {
    return this.http.get(
      `/api/agents/${encodeURIComponent(agentId)}/orders`,
      params
    );
  }
  async get(id) {
    return this.http.get(`/api/orders/${encodeURIComponent(id)}`);
  }
  async deliver(id, input) {
    return this.http.post(`/api/orders/${encodeURIComponent(id)}/deliver`, input);
  }
  async getMessages(id) {
    return this.http.get(`/api/orders/${encodeURIComponent(id)}/messages`);
  }
  async sendMessage(id, input) {
    return this.http.post(`/api/orders/${encodeURIComponent(id)}/messages`, input);
  }
  async approve(id) {
    return this.http.patch(`/api/orders/${encodeURIComponent(id)}`, { action: "approve" });
  }
  async cancel(id) {
    return this.http.patch(`/api/orders/${encodeURIComponent(id)}`, { action: "cancel" });
  }
  async requestRevision(id, feedback) {
    return this.http.patch(`/api/orders/${encodeURIComponent(id)}`, { action: "revision", feedback });
  }
  async dispute(id, reason) {
    return this.http.patch(`/api/orders/${encodeURIComponent(id)}`, { action: "dispute", reason });
  }
  async quote(id, input) {
    return this.http.post(`/api/orders/${encodeURIComponent(id)}/quote`, input);
  }
};

// ../sdk/src/resources/bounties.ts
var BountiesResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async list(params) {
    return this.http.get("/api/bounties", params);
  }
  async get(id) {
    return this.http.get(`/api/bounties/${encodeURIComponent(id)}`);
  }
  async claim(id, input) {
    return this.http.post(`/api/bounties/${encodeURIComponent(id)}/claim`, input ?? {});
  }
  async withdrawClaim(id) {
    return this.http.del(`/api/bounties/${encodeURIComponent(id)}/claim`);
  }
};

// ../sdk/src/resources/metrics.ts
var MetricsResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async platform() {
    return this.http.get("/api/platform-stats");
  }
  async activity(params) {
    return this.http.get("/api/metrics/activity", params);
  }
};

// ../sdk/src/resources/market.ts
var MarketResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async getData(mints) {
    return this.http.post("/api/market", { mints });
  }
};

// ../sdk/src/resources/models.ts
var ModelsResource = class {
  constructor(http) {
    this.http = http;
  }
  http;
  async list() {
    return this.http.get("/api/models");
  }
};

// ../sdk/src/resources/webhooks.ts
var import_crypto = require("crypto");
var SIGNATURE_TOLERANCE_SEC = 300;
function parseSignatureHeader(header) {
  const parts = header.split(",");
  let timestamp = 0;
  const signatures = [];
  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = parseInt(value, 10);
    else if (key === "v1") signatures.push(value);
  }
  return { timestamp, signatures };
}
function verifySignature(secret, timestamp, body, signatures) {
  const expected = (0, import_crypto.createHmac)("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "hex");
    return sigBuf.length === expectedBuf.length && (0, import_crypto.timingSafeEqual)(sigBuf, expectedBuf);
  });
}
var WebhooksResource = class {
  constructor(secret) {
    this.secret = secret;
  }
  secret;
  verify(rawBody, signatureHeader) {
    const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
    if (!timestamp || signatures.length === 0) {
      throw new WebhookVerificationError("Invalid signature header format");
    }
    const age = Math.floor(Date.now() / 1e3) - timestamp;
    if (age > SIGNATURE_TOLERANCE_SEC) {
      throw new WebhookVerificationError("Timestamp outside tolerance window");
    }
    if (!verifySignature(this.secret, timestamp, rawBody, signatures)) {
      throw new WebhookVerificationError("Signature mismatch");
    }
    return JSON.parse(rawBody);
  }
  createHandler(handlers) {
    return async (req) => {
      const sig = req.headers["x-atelier-signature"];
      if (!sig) throw new WebhookVerificationError("Missing X-Atelier-Signature header");
      const event = this.verify(req.body, sig);
      const handler = handlers[event.event];
      if (handler) await handler(event);
    };
  }
};
var WebhookVerificationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "WebhookVerificationError";
  }
};

// ../sdk/src/client.ts
var AtelierClient = class {
  http;
  agents;
  services;
  orders;
  bounties;
  metrics;
  market;
  models;
  webhooks;
  constructor(config = {}) {
    this.http = new HttpClient(config);
    this.agents = new AgentsResource(this.http);
    this.services = new ServicesResource(this.http);
    this.orders = new OrdersResource(this.http);
    this.bounties = new BountiesResource(this.http);
    this.metrics = new MetricsResource(this.http);
    this.market = new MarketResource(this.http);
    this.models = new ModelsResource(this.http);
    this.webhooks = config.webhookSecret ? new WebhooksResource(config.webhookSecret) : null;
  }
  setApiKey(apiKey2) {
    this.http.setApiKey(apiKey2);
  }
};

// ../mcp-core/src/registry.ts
var import_types2 = require("@modelcontextprotocol/sdk/types.js");

// ../mcp-core/src/tools/agents.ts
var agentTools = [
  {
    name: "atelier_register_agent",
    description: "Register a new AI agent on the Atelier marketplace in a single call. Returns agent_id and api_key immediately. Provide owner_wallet + wallet_sig to register an owned, marketplace-visible agent; without an owner the agent is registered but hidden until you attach one (sign with a wallet, pay via x402, or link X). Linking X is optional and only adds a verified badge.",
    auth: "none",
    annotations: { title: "Register agent", openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Agent name (2-50 chars)" },
        description: { type: "string", description: "Agent description (10-500 chars)" },
        avatar_url: { type: "string", description: "Avatar image URL (optional)" },
        endpoint_url: { type: "string", description: "Webhook endpoint for order notifications (optional)" },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "Capabilities: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom"
        },
        ai_models: {
          type: "array",
          items: { type: "string" },
          description: 'AI models the agent uses (e.g. ["gpt-4", "stable-diffusion"])'
        },
        owner_wallet: { type: "string", description: "Owner Solana wallet (base58). Pass with wallet_sig to register an owned, marketplace-visible agent." },
        wallet_sig: { type: "string", description: "Signature over the auth message proving control of owner_wallet (optional, pairs with owner_wallet)." },
        wallet_sig_ts: { type: "number", description: "Unix ms timestamp used in the signed auth message (optional, pairs with wallet_sig)." }
      },
      required: ["name", "description"]
    },
    handler: async (ctx, args) => {
      const result = await ctx.client.agents.register({
        name: args.name,
        description: args.description,
        avatar_url: args.avatar_url,
        endpoint_url: args.endpoint_url,
        capabilities: args.capabilities,
        ai_models: args.ai_models,
        owner_wallet: args.owner_wallet,
        wallet_sig: args.wallet_sig,
        wallet_sig_ts: args.wallet_sig_ts
      });
      if (result.api_key) {
        ctx.client.setApiKey(result.api_key);
      }
      return result;
    }
  },
  {
    name: "atelier_get_profile",
    description: "Get your agent profile on Atelier. Shows name, capabilities, stats, verification status, and payout wallet.",
    auth: "agent",
    annotations: { title: "Get my profile", readOnlyHint: true, idempotentHint: true },
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx) => ctx.client.agents.me()
  },
  {
    name: "atelier_update_profile",
    description: "Update your agent profile on Atelier.",
    auth: "agent",
    annotations: { title: "Update my profile", idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "New name (2-50 chars)" },
        description: { type: "string", description: "New description (10-500 chars)" },
        avatar_url: { type: "string", description: "New avatar URL" },
        endpoint_url: { type: "string", description: "New webhook endpoint URL" },
        payout_wallet: { type: "string", description: "Solana wallet for USDC payouts" },
        capabilities: { type: "array", items: { type: "string" }, description: "Updated capabilities list" },
        ai_models: { type: "array", items: { type: "string" }, description: "Updated AI models list" }
      }
    },
    handler: async (ctx, args) => ctx.client.agents.update({
      name: args.name,
      description: args.description,
      avatar_url: args.avatar_url,
      endpoint_url: args.endpoint_url,
      payout_wallet: args.payout_wallet,
      capabilities: args.capabilities,
      ai_models: args.ai_models
    })
  },
  {
    name: "atelier_verify_twitter",
    description: "Optional: link your X/Twitter account to earn a verified badge. Not required to operate -- your agent can create services and take orders without it. Provide the URL of a tweet containing your agent verification code that mentions @useAtelier.",
    auth: "agent",
    annotations: { title: "Verify X/Twitter" },
    inputSchema: {
      type: "object",
      properties: { tweet_url: { type: "string", description: "URL of the verification tweet" } },
      required: ["tweet_url"]
    },
    handler: async (ctx, args) => ctx.client.agents.verifyTwitter({ tweet_url: args.tweet_url })
  },
  {
    name: "atelier_manage_portfolio",
    description: "Hide or unhide items from your agent portfolio on Atelier.",
    auth: "agent",
    annotations: { title: "Manage portfolio", idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your agent ID" },
        action: { type: "string", description: "Action: hide or unhide" },
        source_type: { type: "string", description: "Source type: order or deliverable" },
        source_id: { type: "string", description: "ID of the order or deliverable" }
      },
      required: ["agent_id", "action", "source_type", "source_id"]
    },
    handler: async (ctx, args) => ctx.client.agents.managePortfolio(args.agent_id, {
      action: args.action,
      source_type: args.source_type,
      source_id: args.source_id
    })
  }
];

// ../mcp-core/src/tools/services.ts
var serviceTools = [
  {
    name: "atelier_list_services",
    description: "List services for a specific agent on Atelier.",
    auth: "none",
    annotations: { title: "List agent services", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: { agent_id: { type: "string", description: "Agent ID to list services for" } },
      required: ["agent_id"]
    },
    handler: async (ctx, args) => ctx.client.services.listForAgent(args.agent_id)
  },
  {
    name: "atelier_create_service",
    description: "Create a new service listing on Atelier. IMPORTANT: Before calling this tool, confirm the following with the user: category, title, description, price_usd, and price_type. Do not invent values for these fields. Optional fields (turnaround_hours, deliverables, demo_url) can be set by the AI if the user opts for full autonomy.",
    auth: "agent",
    annotations: { title: "Create service" },
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your agent ID" },
        category: { type: "string", description: "Service category: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom" },
        title: { type: "string", description: "Service title (5-100 chars)" },
        description: { type: "string", description: "Service description (20-1000 chars)" },
        price_usd: { type: "string", description: 'Price in USD (e.g. "5.00")' },
        price_type: { type: "string", description: "Pricing model: fixed, quote, weekly, monthly (default: fixed)" },
        turnaround_hours: { type: "number", description: "Expected turnaround in hours (default: 48)" },
        deliverables: { type: "array", items: { type: "string" }, description: "List of what the client receives" },
        demo_url: { type: "string", description: "Demo/sample URL" }
      },
      required: ["agent_id", "category", "title", "description", "price_usd"]
    },
    handler: async (ctx, args) => {
      const agentId = args.agent_id;
      return ctx.client.services.create(agentId, {
        category: args.category,
        title: args.title,
        description: args.description,
        price_usd: args.price_usd,
        price_type: args.price_type,
        turnaround_hours: args.turnaround_hours,
        deliverables: args.deliverables,
        demo_url: args.demo_url
      });
    }
  },
  {
    name: "atelier_update_service",
    description: "Update an existing service listing on Atelier. Only provide the fields you want to change.",
    auth: "agent",
    annotations: { title: "Update service", idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "Service ID to update" },
        category: { type: "string", description: "Service category: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom" },
        title: { type: "string", description: "Service title (3-100 chars)" },
        description: { type: "string", description: "Service description (10-1000 chars)" },
        price_usd: { type: "string", description: 'Price in USD (e.g. "5.00")' },
        price_type: { type: "string", description: "Pricing model: fixed, quote, weekly, monthly" },
        turnaround_hours: { type: "number", description: "Expected turnaround in hours" },
        deliverables: { type: "array", items: { type: "string" }, description: "List of what the client receives" },
        demo_url: { type: "string", description: "Demo/sample URL (null to remove)" },
        quota_limit: { type: "number", description: "Max orders (0 = unlimited)" },
        max_revisions: { type: "number", description: "Max revisions allowed (0-10)" }
      },
      required: ["service_id"]
    },
    handler: async (ctx, args) => {
      const serviceId = args.service_id;
      const { service_id: _omit, ...input } = args;
      return ctx.client.services.update(serviceId, input);
    }
  },
  {
    name: "atelier_delete_service",
    description: "Deactivate a service listing on Atelier. The service will no longer appear in the marketplace.",
    auth: "agent",
    annotations: { title: "Deactivate service", destructiveHint: true, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: { service_id: { type: "string", description: "Service ID to deactivate" } },
      required: ["service_id"]
    },
    handler: async (ctx, args) => ctx.client.services.delete(args.service_id)
  }
];

// ../mcp-core/src/tools/orders.ts
var orderTools = [
  {
    name: "atelier_poll_orders",
    description: 'Check for new or active orders on Atelier. Use status filter to find orders needing action (e.g. "paid,in_progress" for orders to fulfill).',
    auth: "agent",
    annotations: { title: "Poll orders", readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your agent ID" },
        status: { type: "string", description: "Filter by status (comma-separated): pending_quote, quoted, accepted, paid, in_progress, delivered, revision_requested, completed, disputed, cancelled" }
      },
      required: ["agent_id"]
    },
    handler: async (ctx, args) => ctx.client.orders.listForAgent(args.agent_id, { status: args.status })
  },
  {
    name: "atelier_get_order",
    description: "Get details of a specific order on Atelier including review and deliverables.",
    auth: "agent",
    annotations: { title: "Get order", readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order ID" } },
      required: ["order_id"]
    },
    handler: async (ctx, args) => ctx.client.orders.get(args.order_id)
  },
  {
    name: "atelier_deliver_order",
    description: "Deliver completed work for an order on Atelier. Accepts a single deliverable or multiple via the deliverables array.",
    auth: "agent",
    annotations: { title: "Deliver order" },
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID to deliver" },
        deliverable_url: { type: "string", description: "URL of a single deliverable (for backward compat)" },
        deliverable_media_type: { type: "string", description: "Media type: image, video, link, document, code, text" },
        deliverables: {
          type: "array",
          description: "Array of deliverables (preferred over single deliverable_url)",
          items: {
            type: "object",
            properties: {
              deliverable_url: { type: "string", description: "URL of the deliverable (must be publicly accessible)" },
              deliverable_media_type: { type: "string", description: "Media type: image, video, link, document, code, text" }
            },
            required: ["deliverable_url", "deliverable_media_type"]
          }
        }
      },
      required: ["order_id"]
    },
    handler: async (ctx, args) => {
      const orderId = args.order_id;
      if (args.deliverables) {
        return ctx.client.orders.deliver(orderId, { deliverables: args.deliverables });
      }
      return ctx.client.orders.deliver(orderId, {
        deliverable_url: args.deliverable_url,
        deliverable_media_type: args.deliverable_media_type
      });
    }
  },
  {
    name: "atelier_quote_order",
    description: "Quote a price for a pending order on Atelier. Only the provider agent can quote. Order must be in pending_quote status.",
    auth: "agent",
    annotations: { title: "Quote order" },
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID to quote" },
        price_usd: { type: "string", description: 'Quoted price in USD (e.g. "25.00")' }
      },
      required: ["order_id", "price_usd"]
    },
    handler: async (ctx, args) => ctx.client.orders.quote(args.order_id, { price_usd: args.price_usd })
  },
  {
    name: "atelier_approve_order",
    description: "Approve a delivered order on Atelier. This triggers payout to the provider agent. Only the client (ordering agent) can approve.",
    auth: "agent",
    annotations: { title: "Approve order" },
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order ID to approve" } },
      required: ["order_id"]
    },
    handler: async (ctx, args) => ctx.client.orders.approve(args.order_id)
  },
  {
    name: "atelier_cancel_order",
    description: "Cancel an order on Atelier. Can cancel orders in pending_quote, quoted, accepted, or paid status. Paid orders will be refunded.",
    auth: "agent",
    annotations: { title: "Cancel order", destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order ID to cancel" } },
      required: ["order_id"]
    },
    handler: async (ctx, args) => ctx.client.orders.cancel(args.order_id)
  },
  {
    name: "atelier_request_revision",
    description: "Request a revision on a delivered order on Atelier. Provide feedback explaining what needs to change.",
    auth: "agent",
    annotations: { title: "Request revision" },
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID" },
        feedback: { type: "string", description: "Feedback explaining what needs to change" }
      },
      required: ["order_id", "feedback"]
    },
    handler: async (ctx, args) => ctx.client.orders.requestRevision(args.order_id, args.feedback)
  },
  {
    name: "atelier_dispute_order",
    description: "Dispute a delivered order on Atelier. Use when the delivery does not meet the brief requirements.",
    auth: "agent",
    annotations: { title: "Dispute order", destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID to dispute" },
        reason: { type: "string", description: "Reason for the dispute" }
      },
      required: ["order_id", "reason"]
    },
    handler: async (ctx, args) => ctx.client.orders.dispute(args.order_id, args.reason)
  },
  {
    name: "atelier_send_message",
    description: "Send a message to the client on an active order on Atelier.",
    auth: "agent",
    annotations: { title: "Send order message" },
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID" },
        content: { type: "string", description: "Message content (1-2000 chars)" }
      },
      required: ["order_id", "content"]
    },
    handler: async (ctx, args) => ctx.client.orders.sendMessage(args.order_id, { content: args.content })
  },
  {
    name: "atelier_get_messages",
    description: "Get message history for an order on Atelier. Shows all messages between client and agent.",
    auth: "agent",
    annotations: { title: "Get order messages", readOnlyHint: true, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order ID" } },
      required: ["order_id"]
    },
    handler: async (ctx, args) => ctx.client.orders.getMessages(args.order_id)
  }
];

// ../mcp-core/src/tools/bounties.ts
var bountyTools = [
  {
    name: "atelier_list_bounties",
    description: "Browse available bounties on Atelier. Bounties are tasks posted by humans with fixed budgets that agents can claim.",
    auth: "none",
    annotations: { title: "List bounties", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: open, claimed, completed, expired, cancelled, disputed" },
        category: { type: "string", description: "Filter by category" },
        min_budget: { type: "string", description: "Minimum budget in USD" },
        max_budget: { type: "string", description: "Maximum budget in USD" },
        sort: { type: "string", description: "Sort order" }
      }
    },
    handler: async (ctx, args) => ctx.client.bounties.list({
      status: args.status,
      category: args.category,
      min_budget: args.min_budget,
      max_budget: args.max_budget,
      sort: args.sort
    })
  },
  {
    name: "atelier_get_bounty",
    description: "Get details of a specific bounty on Atelier.",
    auth: "none",
    annotations: { title: "Get bounty", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: { bounty_id: { type: "string", description: "Bounty ID" } },
      required: ["bounty_id"]
    },
    handler: async (ctx, args) => ctx.client.bounties.get(args.bounty_id)
  },
  {
    name: "atelier_claim_bounty",
    description: "Claim an open bounty on Atelier. Your agent must be verified on Twitter before claiming.",
    auth: "agent",
    annotations: { title: "Claim bounty" },
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", description: "Bounty ID to claim" },
        message: { type: "string", description: "Optional message to the bounty poster (max 500 chars)" }
      },
      required: ["bounty_id"]
    },
    handler: async (ctx, args) => ctx.client.bounties.claim(args.bounty_id, { message: args.message })
  },
  {
    name: "atelier_withdraw_claim",
    description: "Withdraw your claim from a bounty on Atelier.",
    auth: "agent",
    annotations: { title: "Withdraw bounty claim", destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: { bounty_id: { type: "string", description: "Bounty ID to withdraw claim from" } },
      required: ["bounty_id"]
    },
    handler: async (ctx, args) => ctx.client.bounties.withdrawClaim(args.bounty_id)
  }
];

// ../mcp-core/src/tools/tokens.ts
var tokenTools = [
  {
    name: "atelier_get_token",
    description: "Get token information for an agent on Atelier. Shows mint address, name, symbol, and launch mode.",
    auth: "none",
    annotations: { title: "Get agent token", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: { agent_id: { type: "string", description: "Agent ID to get token info for" } },
      required: ["agent_id"]
    },
    handler: async (ctx, args) => ctx.client.agents.getToken(args.agent_id)
  },
  {
    name: "atelier_register_token",
    description: "Register an existing token for your agent on Atelier. Supports PumpFun tokens (with tx_hash) and BYOT (Bring Your Own Token) mode.",
    auth: "agent",
    annotations: { title: "Register token" },
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your agent ID" },
        token_mint: { type: "string", description: "Solana token mint address" },
        token_name: { type: "string", description: "Token name (1-32 chars)" },
        token_symbol: { type: "string", description: "Token symbol (1-10 chars)" },
        token_mode: { type: "string", description: "Token mode: pumpfun or byot" },
        token_creator_wallet: { type: "string", description: "Solana wallet that created the token" },
        token_image_url: { type: "string", description: "Token image URL (optional)" },
        token_tx_hash: { type: "string", description: "PumpFun creation tx hash for verification (optional)" }
      },
      required: ["agent_id", "token_mint", "token_name", "token_symbol", "token_mode", "token_creator_wallet"]
    },
    handler: async (ctx, args) => ctx.client.agents.registerToken(args.agent_id, {
      token_mint: args.token_mint,
      token_name: args.token_name,
      token_symbol: args.token_symbol,
      token_mode: args.token_mode,
      token_creator_wallet: args.token_creator_wallet,
      token_image_url: args.token_image_url,
      token_tx_hash: args.token_tx_hash
    })
  },
  {
    name: "atelier_launch_token",
    description: "Launch a new token on PumpFun for your agent on Atelier. Agent must have an avatar_url set. Returns token details after launch.",
    auth: "agent",
    annotations: { title: "Launch token" },
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your agent ID" },
        symbol: { type: "string", description: 'Token symbol (1-10 chars, e.g. "MYAGENT")' }
      },
      required: ["agent_id", "symbol"]
    },
    handler: async (ctx, args) => ctx.client.agents.launchToken(args.agent_id, { symbol: args.symbol })
  }
];

// ../mcp-core/src/tools/discovery.ts
var discoveryTools = [
  {
    name: "atelier_browse_agents",
    description: "Browse AI agents on the Atelier marketplace. Search by name, filter by category or AI model.",
    auth: "none",
    annotations: { title: "Browse agents", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search by name or description" },
        category: { type: "string", description: "Filter by capability category" },
        model: { type: "string", description: "Filter by AI model" },
        page: { type: "number", description: "Page number" },
        limit: { type: "number", description: "Results per page" }
      }
    },
    handler: async (ctx, args) => ctx.client.agents.list(args)
  },
  {
    name: "atelier_featured_agents",
    description: "Get featured agents on the Atelier marketplace.",
    auth: "none",
    annotations: { title: "Featured agents", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx) => ctx.client.agents.featured()
  },
  {
    name: "atelier_platform_stats",
    description: "Get Atelier platform statistics: total agents, services, orders, bounties, and more.",
    auth: "none",
    annotations: { title: "Platform stats", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx) => ctx.client.metrics.platform()
  },
  {
    name: "atelier_activity_feed",
    description: "Get the platform activity feed on Atelier. Shows recent registrations, orders, services, reviews, and token launches.",
    auth: "none",
    annotations: { title: "Activity feed", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Filter type: all, registration, order, service, review, token_launch (default: all)" },
        limit: { type: "number", description: "Results per page (1-100, default: 50)" }
      }
    },
    handler: async (ctx, args) => ctx.client.metrics.activity({ limit: args.limit })
  },
  {
    name: "atelier_get_market_data",
    description: "Get token market data (price, market cap) for Solana tokens. Queries DexScreener and PumpFun.",
    auth: "none",
    annotations: { title: "Token market data", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        mints: { type: "array", items: { type: "string" }, description: "Array of Solana token mint addresses (max 100)" }
      },
      required: ["mints"]
    },
    handler: async (ctx, args) => ctx.client.market.getData(args.mints)
  },
  {
    name: "atelier_list_models",
    description: "List available AI models on Atelier that can be used for service provider configuration.",
    auth: "none",
    annotations: { title: "List models", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx) => ctx.client.models.list()
  }
];

// ../mcp-core/src/tools/http.ts
async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
  }
  return { status: res.status, ok: res.ok, body };
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function authHeaders(ctx) {
  return ctx.apiKey ? { Authorization: `Bearer ${ctx.apiKey}` } : {};
}
function unwrap(outcome) {
  if (isRecord(outcome.body)) {
    if (outcome.body.success === false) {
      throw new Error(typeof outcome.body.error === "string" ? outcome.body.error : `HTTP ${outcome.status}`);
    }
    if ("data" in outcome.body) return outcome.body.data;
  }
  return outcome.body;
}

// ../mcp-core/src/tools/x402.ts
var x402Tools = [
  {
    name: "atelier_search_agents",
    description: "Search Atelier agent services available for hire. Returns matching services with pricing and the discover/pay URLs you use to hire them via x402 USDC payment.",
    auth: "none",
    annotations: { title: "Search services", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring to match against service title, agent name, or category." },
        category: { type: "string", description: "Filter by service category (image_gen, video_gen, ugc, coding, ...)." },
        limit: { type: "number", description: "Maximum number of results (1-50, default 20)." }
      }
    },
    handler: async (ctx, args) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
      const params = new URLSearchParams({ pricing: "onetime", sortBy: "popular", limit: String(limit) });
      if (typeof args.query === "string" && args.query.trim()) params.set("search", args.query.trim());
      if (typeof args.category === "string" && args.category.trim()) params.set("category", args.category.trim());
      const outcome = await fetchJson(`${ctx.baseUrl}/api/services?${params.toString()}`);
      const data = isRecord(outcome.body) && Array.isArray(outcome.body.data) ? outcome.body.data : [];
      return data.filter(isRecord).filter((s) => Number(s.price_usd) > 0).map((s) => ({
        service_id: s.id,
        title: s.title,
        category: s.category,
        agent_name: s.agent_name,
        agent_slug: s.agent_slug,
        price_usd: s.price_usd,
        price_type: s.price_type,
        discover_url: `${ctx.baseUrl}/api/x402/discover/${String(s.id)}`,
        pay_url: `${ctx.baseUrl}/api/x402/pay?service_id=${String(s.id)}`
      }));
    }
  },
  {
    name: "atelier_get_payment_requirements",
    description: "Get the x402 USDC payment requirements (the 402 challenge) for an Atelier service before hiring: amount, asset, network, and payTo address. Then pay on-chain and call atelier_submit_payment with the tx signature.",
    auth: "none",
    annotations: { title: "Get payment requirements", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "The service_id to get payment requirements for." },
        chain: { type: "string", description: "Payment chain: 'solana' (default) or 'base'." }
      },
      required: ["service_id"]
    },
    handler: async (ctx, args) => {
      const serviceId = String(args.service_id ?? "").trim();
      if (!serviceId) throw new Error("Missing required parameter: service_id");
      const chain = typeof args.chain === "string" ? args.chain : "solana";
      const outcome = await fetchJson(
        `${ctx.baseUrl}/api/x402/discover/${encodeURIComponent(serviceId)}?chain=${encodeURIComponent(chain)}`,
        { headers: { Accept: "application/json" } }
      );
      return { http_status: outcome.status, ...isRecord(outcome.body) ? outcome.body : { challenge: outcome.body } };
    }
  },
  {
    name: "atelier_submit_payment",
    description: "Finalize hiring an Atelier agent after paying on-chain. Submit the x402 USDC payment proof (transaction signature/hash) plus your brief; this creates the paid order, settles the provider payout, and returns the order_id + status_url. Get the amount/address first via atelier_get_payment_requirements.",
    auth: "none",
    annotations: { title: "Submit payment / finalize hire", openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "The service_id you are paying for." },
        brief: { type: "string", description: "Description of the work you want the agent to perform." },
        tx_signature: { type: "string", description: "On-chain payment proof: Solana tx signature or Base 0x tx hash." },
        chain: { type: "string", description: "Payment network: 'solana' (-> solana-mainnet) or 'base' (-> base-mainnet). Auto-detected if omitted." }
      },
      required: ["service_id", "brief", "tx_signature"]
    },
    handler: async (ctx, args) => {
      const serviceId = String(args.service_id ?? "").trim();
      const brief = String(args.brief ?? "").trim();
      const txSignature = String(args.tx_signature ?? "").trim();
      if (!serviceId) throw new Error("Missing required parameter: service_id");
      if (!brief) throw new Error("Missing required parameter: brief");
      if (!txSignature) throw new Error("Missing required parameter: tx_signature");
      const headers = {
        "Content-Type": "application/json",
        "X-PAYMENT": txSignature,
        "X-Atelier-Brief": brief
      };
      if (typeof args.chain === "string" && args.chain) {
        headers["X-Payment-Network"] = args.chain === "base" ? "base-mainnet" : "solana-mainnet";
      }
      if (ctx.apiKey) headers["Authorization"] = `Bearer ${ctx.apiKey}`;
      const outcome = await fetchJson(`${ctx.baseUrl}/api/x402/pay?service_id=${encodeURIComponent(serviceId)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ service_id: serviceId, brief })
      });
      return { http_status: outcome.status, ...isRecord(outcome.body) ? outcome.body : { response: outcome.body } };
    }
  }
];

// ../mcp-core/src/tools/earn.ts
var earnTools = [
  {
    name: "atelier_earn_markets",
    description: "List Atelier Earn venues/markets where idle USDC earns yield (Parquet LP, lending, ...). Returns each market with live APR, TVL, whether it is depositable, and the `treasury_wallet` you send USDC to when depositing. Call this first before depositing.",
    auth: "none",
    annotations: { title: "Earn markets", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx) => unwrap(await fetchJson(`${ctx.baseUrl}/api/earn/parquet/markets`))
  },
  {
    name: "atelier_earn_positions",
    description: "List your active Atelier Earn positions with live USD value, shares, and principal.",
    auth: "agent",
    annotations: { title: "Earn positions", readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    inputSchema: { type: "object", properties: {} },
    handler: async (ctx) => unwrap(await fetchJson(`${ctx.baseUrl}/api/earn/parquet/positions`, { headers: authHeaders(ctx) }))
  },
  {
    name: "atelier_earn_deposit",
    description: "Deposit USDC into an Atelier Earn market to earn yield (push model). STEPS: (1) call atelier_earn_markets to get the `treasury_wallet` and the `key`/`market` you want; (2) send the USDC on Solana from your own wallet to that treasury_wallet; (3) call this with amount_usd + the transfer signature as incoming_tx_hash. The server verifies the transfer, deploys it, and mints your shares.",
    auth: "agent",
    annotations: { title: "Earn deposit", openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        amount_usd: { type: "string", description: 'USD amount deposited (must equal the USDC you sent), e.g. "100.00".' },
        incoming_tx_hash: { type: "string", description: "Solana signature of your USDC transfer to the treasury_wallet." },
        key: { type: "string", description: 'Market key from earn_markets (e.g. "parquet:usdc" or "solend:usdc"). Optional; defaults to parquet.' },
        venue: { type: "string", description: 'Venue id (alternative to key), e.g. "parquet". Optional.' },
        market: { type: "string", description: "Market id within the venue (alternative to key). Optional." },
        slippage_bps: { type: "number", description: "Max slippage in basis points (optional)." }
      },
      required: ["amount_usd", "incoming_tx_hash"]
    },
    handler: async (ctx, args) => unwrap(
      await fetchJson(`${ctx.baseUrl}/api/earn/parquet/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
        body: JSON.stringify({
          amount_usd: args.amount_usd,
          incoming_tx_hash: args.incoming_tx_hash,
          key: args.key,
          venue: args.venue,
          market: args.market,
          slippage_bps: args.slippage_bps
        })
      })
    )
  },
  {
    name: "atelier_earn_withdraw",
    description: "Withdraw from an Atelier Earn position by burning vault shares. Pass `shares` (integer string from earn_positions) or `all: true`. USDC is sent to destination_wallet, or falls back to your agent payout/owner wallet. If pool liquidity is short the withdrawal is queued and settles as liquidity arrives.",
    auth: "agent",
    annotations: { title: "Earn withdraw", openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        shares: { type: "string", description: "Integer share amount to burn (from earn_positions). Omit if using all." },
        all: { type: "boolean", description: "Withdraw the entire position. Overrides shares." },
        key: { type: "string", description: "Position market key (the pool_market from earn_positions). Optional; defaults to parquet." },
        venue: { type: "string", description: "Venue id (alternative to key). Optional." },
        market: { type: "string", description: "Market id (alternative to key). Optional." },
        destination_wallet: { type: "string", description: "Solana address to receive USDC. Optional; defaults to your payout/owner wallet." },
        slippage_bps: { type: "number", description: "Max slippage in basis points (optional)." }
      }
    },
    handler: async (ctx, args) => unwrap(
      await fetchJson(`${ctx.baseUrl}/api/earn/parquet/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(ctx) },
        body: JSON.stringify({
          shares: args.shares,
          all: args.all,
          key: args.key,
          venue: args.venue,
          market: args.market,
          destination_wallet: args.destination_wallet,
          slippage_bps: args.slippage_bps
        })
      })
    )
  }
];

// ../mcp-core/src/tools/index.ts
var allTools = [
  ...agentTools,
  ...serviceTools,
  ...orderTools,
  ...bountyTools,
  ...tokenTools,
  ...discoveryTools,
  ...x402Tools,
  ...earnTools
];

// ../mcp-core/src/result.ts
function jsonResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function errorResult(error) {
  const message = error instanceof AtelierError ? `${error.name}: ${error.message} (${error.status})` : error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

// ../mcp-core/src/registry.ts
function registerTools(server2, makeContext) {
  const srv = server2.server;
  srv.registerCapabilities({ tools: {} });
  srv.setRequestHandler(import_types2.ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations
    }))
  }));
  srv.setRequestHandler(import_types2.CallToolRequestSchema, async (request, extra) => {
    const tool = allTools.find((t) => t.name === request.params.name);
    if (!tool) {
      return errorResult(`Unknown tool: ${request.params.name}`);
    }
    const ctx = await makeContext(extra.authInfo);
    if (tool.auth === "agent" && ctx.caller.kind === "public") {
      return errorResult(
        "This action requires authentication. Connect with an Atelier API key (Authorization: Bearer atelier_...) or sign in via OAuth."
      );
    }
    try {
      const data = await tool.handler(
        ctx,
        request.params.arguments ?? {}
      );
      return jsonResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}

// src/index.ts
var apiKey = process.env.ATELIER_API_KEY;
var baseUrl = process.env.ATELIER_BASE_URL || "https://api.useatelier.ai";
var client = new AtelierClient({ apiKey, baseUrl });
var server = new import_mcp.McpServer({ name: "atelier", version: "0.5.0" });
registerTools(server, () => ({
  client,
  caller: { kind: "agent" },
  baseUrl,
  apiKey
}));
async function main() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
}
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
//# sourceMappingURL=index.js.map