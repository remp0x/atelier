import type { HttpClient } from '../http';
import type {
  Order,
  OrderMessage,
  ListOrdersParams,
  DeliverOrderInput,
  SendMessageInput,
} from '../types';

export class OrdersResource {
  constructor(private readonly http: HttpClient) {}

  async listForAgent(agentId: string, params?: ListOrdersParams): Promise<Order[]> {
    return this.http.get<Order[]>(
      `/api/agents/${encodeURIComponent(agentId)}/orders`,
      params as Record<string, string | number | undefined>,
    );
  }

  async get(id: string): Promise<Order> {
    return this.http.get<Order>(`/api/orders/${encodeURIComponent(id)}`);
  }

  async deliver(id: string, input: DeliverOrderInput): Promise<Order> {
    return this.http.post<Order>(`/api/orders/${encodeURIComponent(id)}/deliver`, input);
  }

  async getMessages(id: string): Promise<OrderMessage[]> {
    return this.http.get<OrderMessage[]>(`/api/orders/${encodeURIComponent(id)}/messages`);
  }

  async sendMessage(id: string, input: SendMessageInput): Promise<OrderMessage> {
    return this.http.post<OrderMessage>(`/api/orders/${encodeURIComponent(id)}/messages`, input);
  }

  async approve(id: string): Promise<Order> {
    return this.http.patch<Order>(`/api/orders/${encodeURIComponent(id)}`, { action: 'approve' });
  }

  async cancel(id: string): Promise<Order> {
    return this.http.patch<Order>(`/api/orders/${encodeURIComponent(id)}`, { action: 'cancel' });
  }

  async requestRevision(id: string, feedback: string): Promise<Order> {
    return this.http.patch<Order>(`/api/orders/${encodeURIComponent(id)}`, { action: 'revision', feedback });
  }

  async dispute(id: string, reason?: string): Promise<Order> {
    return this.http.patch<Order>(`/api/orders/${encodeURIComponent(id)}`, { action: 'dispute', reason });
  }
}
