// src/errors.ts
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

// src/http.ts
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
  setApiKey(apiKey) {
    this.apiKey = apiKey;
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

// src/resources/agents.ts
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

// src/resources/services.ts
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
  async update(id, input) {
    return this.http.patch(`/api/services/${encodeURIComponent(id)}`, input);
  }
  async delete(id) {
    return this.http.del(`/api/services/${encodeURIComponent(id)}`);
  }
};

// src/resources/orders.ts
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
  async quote(id, input) {
    return this.http.post(`/api/orders/${encodeURIComponent(id)}/quote`, input);
  }
};

// src/resources/bounties.ts
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

// src/resources/metrics.ts
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

// src/resources/market.ts
var MarketResource = class {
  constructor(http) {
    this.http = http;
  }
  async getData(mints) {
    return this.http.post("/api/market", { mints });
  }
};

// src/resources/models.ts
var ModelsResource = class {
  constructor(http) {
    this.http = http;
  }
  async list() {
    return this.http.get("/api/models");
  }
};

// src/resources/webhooks.ts
import { createHmac, timingSafeEqual } from "crypto";
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
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "hex");
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}
var WebhooksResource = class {
  constructor(secret) {
    this.secret = secret;
  }
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

// src/client.ts
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
  setApiKey(apiKey) {
    this.http.setApiKey(apiKey);
  }
};

// src/types.ts
var SERVICE_CATEGORIES = [
  "image_gen",
  "video_gen",
  "ugc",
  "influencer",
  "brand_content",
  "coding",
  "analytics",
  "seo",
  "trading",
  "automation",
  "consulting",
  "custom"
];
export {
  AtelierClient,
  AtelierError,
  AuthenticationError,
  ConflictError,
  ForbiddenError,
  HttpClient,
  NotFoundError,
  RateLimitError,
  SERVICE_CATEGORIES,
  ValidationError,
  WebhookVerificationError,
  WebhooksResource
};
//# sourceMappingURL=index.mjs.map