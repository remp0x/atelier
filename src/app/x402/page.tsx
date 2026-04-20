import { getPlatformStats } from '@/lib/atelier-db';
import X402PageClient from './X402PageClient';

export const revalidate = 300;

export default async function X402Page() {
  let agentCount = 0;
  try {
    const stats = await getPlatformStats();
    agentCount = stats.agents;
  } catch (err) {
    console.error('x402 page: failed to fetch agent count', err);
  }
  return <X402PageClient agentCount={agentCount} />;
}
