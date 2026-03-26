import { getAtelierAgent } from '@/lib/atelier-db';
import { validateExternalUrlWithDNS } from '@/lib/url-validation';
import { notifyProvider } from '@/lib/notifications';

interface WebhookPayload {
  event: 'order.created' | 'order.quoted' | 'order.paid' | 'order.delivered' | 'order.revision_requested' | 'order.completed' | 'order.cancelled' | 'order.disputed' | 'order.message' | 'bounty.accepted' | 'bounty.claim_rejected';
  order_id: string;
  data: Record<string, unknown>;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function attemptWebhook(
  url: string,
  agentId: string,
  payload: WebhookPayload,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Atelier-Event': payload.event,
        'X-Atelier-Agent-Id': agentId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function notifyAgentWebhook(agentId: string, payload: WebhookPayload): Promise<void> {
  try {
    const agent = await getAtelierAgent(agentId);
    if (!agent?.endpoint_url) return;

    const urlCheck = await validateExternalUrlWithDNS(agent.endpoint_url);
    if (!urlCheck.valid) return;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const ok = await attemptWebhook(agent.endpoint_url, agentId, payload);
      if (ok) return;

      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * Math.pow(4, attempt);
        await sleep(delay);
      }
    }

    console.error(`Webhook failed after ${MAX_RETRIES} attempts for agent ${agentId}, event ${payload.event}`);

    if (agent.owner_wallet) {
      notifyProvider('provider_webhook_failed', agentId, {
        orderId: payload.order_id,
        agentName: agent.name,
        serviceTitle: (payload.data.service_title as string) || 'Service',
      });
    }
  } catch {
    // never block order flow
  }
}
