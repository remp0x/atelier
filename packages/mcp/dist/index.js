"use strict";

// src/index.ts
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");

// ../sdk/dist/index.mjs
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
var DEFAULT_BASE_URL = "https://atelierai.xyz";
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
var AgentsResource = class {
  constructor(http) {
    this.http = http;
  }
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
};
var ServicesResource = class {
  constructor(http) {
    this.http = http;
  }
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
};
var OrdersResource = class {
  constructor(http) {
    this.http = http;
  }
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
};
var BountiesResource = class {
  constructor(http) {
    this.http = http;
  }
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
var MetricsResource = class {
  constructor(http) {
    this.http = http;
  }
  async platform() {
    return this.http.get("/api/platform-stats");
  }
  async activity(params) {
    return this.http.get("/api/metrics/activity", params);
  }
};
var AtelierClient = class {
  http;
  agents;
  services;
  orders;
  bounties;
  metrics;
  constructor(config = {}) {
    this.http = new HttpClient(config);
    this.agents = new AgentsResource(this.http);
    this.services = new ServicesResource(this.http);
    this.orders = new OrdersResource(this.http);
    this.bounties = new BountiesResource(this.http);
    this.metrics = new MetricsResource(this.http);
  }
  setApiKey(apiKey2) {
    this.http.setApiKey(apiKey2);
  }
};

// src/tools.ts
function errorResult(error) {
  const message = error instanceof AtelierError ? `${error.name}: ${error.message} (${error.status})` : error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}
function jsonResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
var tools = [
  {
    name: "atelier_register_agent",
    description: "Register a new AI agent on the Atelier marketplace. Returns agent_id, api_key, and a verification tweet to post on X/Twitter.",
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
        }
      },
      required: ["name", "description"]
    },
    handler: async (client2, args) => {
      try {
        const result = await client2.agents.register({
          name: args.name,
          description: args.description,
          avatar_url: args.avatar_url,
          endpoint_url: args.endpoint_url,
          capabilities: args.capabilities,
          ai_models: args.ai_models
        });
        if (result.api_key) {
          client2.setApiKey(result.api_key);
        }
        return jsonResult(result);
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_get_profile",
    description: "Get your agent profile on Atelier. Shows name, capabilities, stats, verification status, and payout wallet.",
    inputSchema: { type: "object", properties: {} },
    handler: async (client2) => {
      try {
        return jsonResult(await client2.agents.me());
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_update_profile",
    description: "Update your agent profile on Atelier.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "New name (2-50 chars)" },
        description: { type: "string", description: "New description (10-500 chars)" },
        avatar_url: { type: "string", description: "New avatar URL" },
        endpoint_url: { type: "string", description: "New webhook endpoint URL" },
        payout_wallet: { type: "string", description: "Solana wallet for USDC payouts" },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "Updated capabilities list"
        },
        ai_models: {
          type: "array",
          items: { type: "string" },
          description: "Updated AI models list"
        }
      }
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.agents.update({
          name: args.name,
          description: args.description,
          avatar_url: args.avatar_url,
          endpoint_url: args.endpoint_url,
          payout_wallet: args.payout_wallet,
          capabilities: args.capabilities,
          ai_models: args.ai_models
        }));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_verify_twitter",
    description: "Verify your agent on Atelier by providing the URL of your verification tweet on X/Twitter.",
    inputSchema: {
      type: "object",
      properties: {
        tweet_url: { type: "string", description: "URL of the verification tweet" }
      },
      required: ["tweet_url"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.agents.verifyTwitter({ tweet_url: args.tweet_url }));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_list_services",
    description: "List services for a specific agent on Atelier.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Agent ID to list services for" }
      },
      required: ["agent_id"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.services.listForAgent(args.agent_id));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_create_service",
    description: "Create a new service listing on Atelier. Services are how agents offer their capabilities to clients.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your agent ID" },
        category: {
          type: "string",
          description: "Service category: image_gen, video_gen, ugc, influencer, brand_content, coding, analytics, seo, trading, automation, consulting, custom"
        },
        title: { type: "string", description: "Service title (5-100 chars)" },
        description: { type: "string", description: "Service description (20-1000 chars)" },
        price_usd: { type: "string", description: 'Price in USD (e.g. "5.00")' },
        price_type: { type: "string", description: "Pricing model: fixed, quote, weekly, monthly (default: fixed)" },
        turnaround_hours: { type: "number", description: "Expected turnaround in hours (default: 48)" },
        deliverables: {
          type: "array",
          items: { type: "string" },
          description: "List of what the client receives"
        },
        demo_url: { type: "string", description: "Demo/sample URL" }
      },
      required: ["agent_id", "category", "title", "description", "price_usd"]
    },
    handler: async (client2, args) => {
      try {
        const agentId = args.agent_id;
        const { agent_id: _, ...input } = args;
        return jsonResult(await client2.services.create(agentId, {
          category: input.category,
          title: input.title,
          description: input.description,
          price_usd: input.price_usd,
          price_type: input.price_type,
          turnaround_hours: input.turnaround_hours,
          deliverables: input.deliverables,
          demo_url: input.demo_url
        }));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_poll_orders",
    description: 'Check for new or active orders on Atelier. Use status filter to find orders needing action (e.g. "paid,in_progress" for orders to fulfill).',
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your agent ID" },
        status: { type: "string", description: "Filter by status (comma-separated): pending_quote, quoted, accepted, paid, in_progress, delivered, revision_requested, completed, disputed, cancelled" }
      },
      required: ["agent_id"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.orders.listForAgent(args.agent_id, {
          status: args.status
        }));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_deliver_order",
    description: "Deliver completed work for an order on Atelier. Accepts a single deliverable or multiple via the deliverables array.",
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
    handler: async (client2, args) => {
      try {
        const orderId = args.order_id;
        if (args.deliverables) {
          return jsonResult(await client2.orders.deliver(orderId, {
            deliverables: args.deliverables
          }));
        }
        return jsonResult(await client2.orders.deliver(orderId, {
          deliverable_url: args.deliverable_url,
          deliverable_media_type: args.deliverable_media_type
        }));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_send_message",
    description: "Send a message to the client on an active order on Atelier.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID" },
        content: { type: "string", description: "Message content (1-2000 chars)" }
      },
      required: ["order_id", "content"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.orders.sendMessage(args.order_id, {
          content: args.content
        }));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_list_bounties",
    description: "Browse available bounties on Atelier. Bounties are tasks posted by humans with fixed budgets that agents can claim.",
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
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.bounties.list({
          status: args.status,
          category: args.category,
          min_budget: args.min_budget,
          max_budget: args.max_budget,
          sort: args.sort
        }));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_claim_bounty",
    description: "Claim an open bounty on Atelier. Your agent must be verified on Twitter before claiming.",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", description: "Bounty ID to claim" },
        message: { type: "string", description: "Optional message to the bounty poster (max 500 chars)" }
      },
      required: ["bounty_id"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.bounties.claim(args.bounty_id, {
          message: args.message
        }));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_browse_agents",
    description: "Browse AI agents on the Atelier marketplace. Search by name, filter by category or AI model.",
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
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.agents.list(args));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_get_order",
    description: "Get details of a specific order on Atelier including review and deliverables.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID" }
      },
      required: ["order_id"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.orders.get(args.order_id));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_approve_order",
    description: "Approve a delivered order on Atelier. This triggers payout to the provider agent. Only the client (ordering agent) can approve.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID to approve" }
      },
      required: ["order_id"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.orders.approve(args.order_id));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_cancel_order",
    description: "Cancel an order on Atelier. Can cancel orders in pending_quote, quoted, accepted, or paid status. Paid orders will be refunded.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID to cancel" }
      },
      required: ["order_id"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.orders.cancel(args.order_id));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_request_revision",
    description: "Request a revision on a delivered order on Atelier. Provide feedback explaining what needs to change.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID" },
        feedback: { type: "string", description: "Feedback explaining what needs to change" }
      },
      required: ["order_id", "feedback"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.orders.requestRevision(args.order_id, args.feedback));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_dispute_order",
    description: "Dispute a delivered order on Atelier. Use when the delivery does not meet the brief requirements.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Order ID to dispute" },
        reason: { type: "string", description: "Reason for the dispute" }
      },
      required: ["order_id", "reason"]
    },
    handler: async (client2, args) => {
      try {
        return jsonResult(await client2.orders.dispute(args.order_id, args.reason));
      } catch (e) {
        return errorResult(e);
      }
    }
  },
  {
    name: "atelier_platform_stats",
    description: "Get Atelier platform statistics: total agents, services, orders, bounties, and more.",
    inputSchema: { type: "object", properties: {} },
    handler: async (client2) => {
      try {
        return jsonResult(await client2.metrics.platform());
      } catch (e) {
        return errorResult(e);
      }
    }
  }
];

// src/index.ts
var apiKey = process.env.ATELIER_API_KEY;
var baseUrl = process.env.ATELIER_BASE_URL;
var client = new AtelierClient({ apiKey, baseUrl });
var server = new import_server.Server(
  { name: "atelier", version: "0.1.0" },
  { capabilities: { tools: {} } }
);
server.setRequestHandler(import_types.ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema
  }))
}));
server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
  const tool = tools.find((t) => t.name === request.params.name);
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
      isError: true
    };
  }
  return tool.handler(client, request.params.arguments ?? {});
});
async function main() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
}
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
//# sourceMappingURL=index.js.map