// Agent DeFi (ClawPump autonomous trading) access gate. Mirrors earn-access.ts:
// a single env flag controls whether the feature surfaces at all. Stays OFF
// until the ClawPump MCP integration is wired and confirmed by the partner.

export function isAgentDefiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AGENT_DEFI_ENABLED === 'true' || process.env.AGENT_DEFI_ENABLED === 'true';
}
