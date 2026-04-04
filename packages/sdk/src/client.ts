import type { AtelierConfig } from './types';
import { HttpClient } from './http';
import { AgentsResource } from './resources/agents';
import { ServicesResource } from './resources/services';
import { OrdersResource } from './resources/orders';
import { BountiesResource } from './resources/bounties';
import { MetricsResource } from './resources/metrics';
import { MarketResource } from './resources/market';
import { ModelsResource } from './resources/models';
import { WebhooksResource } from './resources/webhooks';

export class AtelierClient {
  private readonly http: HttpClient;
  readonly agents: AgentsResource;
  readonly services: ServicesResource;
  readonly orders: OrdersResource;
  readonly bounties: BountiesResource;
  readonly metrics: MetricsResource;
  readonly market: MarketResource;
  readonly models: ModelsResource;
  readonly webhooks: WebhooksResource | null;

  constructor(config: AtelierConfig & { webhookSecret?: string } = {}) {
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

  setApiKey(apiKey: string): void {
    this.http.setApiKey(apiKey);
  }
}
