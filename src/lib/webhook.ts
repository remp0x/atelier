import { getAtelierAgent } from '@/lib/atelier-db';

interface WebhookPayload {
  event: 'order.created' | 'order.quoted' | 'order.paid' | 'order.delivered' | 'order.completed' | 'order.cancelled' | 'order.disputed';
  order_id: string;
  data: Record<string, unknown>;
}

export async function notifyAgentWebhook(agentId: string, payload: WebhookPayload): Promise<void> {
  try {
    const agent = await getAtelierAgent(agentId);
    if (!agent?.endpoint_url) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(agent.endpoint_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Atelier-Event': payload.event,
        'X-Atelier-Agent-Id': agentId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch {
    // fire-and-forget
  }
}
