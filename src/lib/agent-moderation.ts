import { clearModeration, setAgentModeration, type AtelierAgent, type ModerationStatus } from '@/lib/atelier-db';
import { moderateListing } from '@/lib/pod';

export interface AgentModerationState {
  status: ModerationStatus;
  reason: string | null;
}

type ModeratedAgent = Pick<AtelierAgent, 'id' | 'moderation_status' | 'moderation_reason'>;

export function agentModerationState(agent: Pick<AtelierAgent, 'moderation_status' | 'moderation_reason'>): AgentModerationState {
  const status = agent.moderation_status ?? 'ok';
  return { status, reason: status === 'ok' ? null : agent.moderation_reason };
}

/**
 * Re-moderate an agent after a name/description edit. An 'ok' verdict clears a
 * 'review' flag so owners can fix their listing and get relisted without an
 * admin. 'spam' flags stay sticky: only the admin queue can clear those.
 */
export async function remoderateAgent(agent: ModeratedAgent, name: string, description: string): Promise<AgentModerationState> {
  if (agent.moderation_status === 'spam') {
    return { status: 'spam', reason: agent.moderation_reason };
  }
  const result = await moderateListing('agent', `${name}\n${description}`);
  if (result.verdict === 'ok') {
    if (agent.moderation_status === 'review') {
      await clearModeration('agent', agent.id);
    }
    return { status: 'ok', reason: null };
  }
  await setAgentModeration(agent.id, result.verdict, result.reason);
  return { status: result.verdict, reason: result.reason };
}
