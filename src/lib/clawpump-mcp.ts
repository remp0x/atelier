/**
 * Server-side adapter (port) for ClawPump's agentic DeFi tools.
 *
 * ClawPump exposes its DeFi tooling (autonomous swap / snipe / arbitrage / portfolio,
 * across Jupiter-routed DEXes) via an MCP server, gated behind auth -- NOT as a plain
 * REST partner API like /api/v1/launch. So Atelier acts as an MCP *client*: each Earn
 * action maps to an MCP tool call scoped to the per-launch ClawPump agent we already
 * persist (atelier_agents.clawpump_agent_id, set at token launch -- see clawpump-client).
 *
 * The supervised control model (chosen for the Earn UI): the human sets a policy
 * (enable/disable, strategy, risk cap, budget) and the agent trades on its own; Atelier
 * renders the live state and offers fund/withdraw. Capital can be the accrued 65% creator
 * fees already in the custodied wallet AND/OR fresh deposits.
 *
 * PENDING PARTNER CONTRACT (the single seam below, invokeMcpTool, is where this lands):
 *   - transport + endpoint: CLAWPUMP_MCP_URL (SSE vs streamable HTTP -- TBC)
 *   - auth scheme: CLAWPUMP_MCP_TOKEN (falls back to the cpk_ partner key) -- TBC whether
 *     the partner key authorizes per-agent tool calls or a separate token is required
 *   - the real tool names + arg/result schemas (the tool ids + shapes here are PROVISIONAL)
 *   - confirmation that tools operate on agents created via the partner API (Model B,
 *     ClawPump-custodied wallet)
 * Until those land, every call surfaces AgentDefiNotConnectedError (503) so the routes and
 * UI degrade gracefully instead of pretending the feature is live.
 */

const MCP_URL = process.env.CLAWPUMP_MCP_URL || '';
const MCP_TOKEN = process.env.CLAWPUMP_MCP_TOKEN || process.env.CLAWPUMP_API_KEY || '';

/** Thrown until the ClawPump MCP integration is configured + wired. Maps to HTTP 503. */
export class AgentDefiNotConnectedError extends Error {
  readonly statusCode = 503;
  constructor(message = 'Agent DeFi automation is not connected yet') {
    super(message);
    this.name = 'AgentDefiNotConnectedError';
  }
}

/** Whether the ClawPump MCP endpoint + auth are configured. */
export function isClawpumpMcpConfigured(): boolean {
  return Boolean(MCP_URL && MCP_TOKEN);
}

export type AutomationStrategy = 'conservative' | 'balanced' | 'aggressive';

export interface AutomationPolicy {
  /** Master switch: when false, the agent stops opening new positions. */
  enabled: boolean;
  strategy: AutomationStrategy;
  /** Risk cap, 0-100 (share of budget the agent may deploy / risk). */
  riskPct: number;
  /** Capital the automation may use, in SOL. null = use the full wallet balance. */
  budgetSol: number | null;
}

export interface AgentWalletBalance {
  sol: number;
  usdc: number;
}

export interface DefiPosition {
  symbol: string;
  mint: string | null;
  amount: number;
  valueSol: number | null;
}

export interface DefiActivityEvent {
  /** ISO timestamp. */
  ts: string;
  /** e.g. 'swap' | 'snipe' | 'arbitrage' | 'close'. */
  kind: string;
  summary: string;
  txHash: string | null;
}

export interface AgentDefiStatus {
  clawpumpAgentId: string;
  policy: AutomationPolicy;
  wallet: AgentWalletBalance;
  positions: DefiPosition[];
  pnl24hSol: number | null;
  pnlTotalSol: number | null;
  activity: DefiActivityEvent[];
}

export interface FundInput {
  asset: 'SOL' | 'USDC';
  amount: number;
}

export interface WithdrawInput {
  asset: 'SOL' | 'USDC';
  amount: number;
  /** Optional explicit destination; defaults to the agent owner's payout wallet. */
  destination?: string;
}

export interface MoveResult {
  txHash: string;
  newBalance: AgentWalletBalance;
}

/**
 * The single seam to ClawPump's MCP server. Provisional tool ids/args are passed through so
 * wiring is a drop-in once the partner confirms the contract; today it always reports the
 * integration as not connected.
 */
async function invokeMcpTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
  if (!isClawpumpMcpConfigured()) {
    throw new AgentDefiNotConnectedError(
      'ClawPump MCP is not configured (set CLAWPUMP_MCP_URL and CLAWPUMP_MCP_TOKEN)',
    );
  }
  // Provisional request envelope kept here so the wiring point is unambiguous.
  const request = { url: MCP_URL, tool, args };
  void request;
  // TODO(clawpump-mcp): replace with the real MCP client call (transport + auth + tool
  // schemas) once ClawPump confirms the contract. See the file header.
  throw new AgentDefiNotConnectedError();
}

export function getAgentDefiStatus(clawpumpAgentId: string): Promise<AgentDefiStatus> {
  return invokeMcpTool<AgentDefiStatus>('agent.defi.status', { agentId: clawpumpAgentId });
}

export function setAutomationPolicy(
  clawpumpAgentId: string,
  policy: AutomationPolicy,
): Promise<AgentDefiStatus> {
  return invokeMcpTool<AgentDefiStatus>('agent.defi.setPolicy', { agentId: clawpumpAgentId, ...policy });
}

export function fundAgentWallet(clawpumpAgentId: string, input: FundInput): Promise<MoveResult> {
  return invokeMcpTool<MoveResult>('agent.defi.fund', { agentId: clawpumpAgentId, ...input });
}

export function withdrawFromAgentWallet(
  clawpumpAgentId: string,
  input: WithdrawInput,
): Promise<MoveResult> {
  return invokeMcpTool<MoveResult>('agent.defi.withdraw', { agentId: clawpumpAgentId, ...input });
}
