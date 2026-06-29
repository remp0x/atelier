import type { AtelierClient } from '@atelier-ai/sdk';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export type CallerKind = 'agent' | 'user' | 'public';

export interface Caller {
  kind: CallerKind;
  agentId?: string;
  userId?: string;
}

/**
 * Everything a tool handler needs to act on behalf of the caller. Built fresh per
 * request by the consumer (the remote route or the stdio bin) so handlers stay
 * transport-agnostic: they only ever touch `ctx`.
 */
export interface ToolContext {
  client: AtelierClient;
  caller: Caller;
  /** Origin the SDK / raw fetches target (own origin for remote, api.useatelier.ai for stdio). */
  baseUrl: string;
  /** Resolved atelier_ key, when the caller is an authenticated agent. */
  apiKey?: string;
}

export type ContextFactory = (authInfo: AuthInfo | undefined) => ToolContext | Promise<ToolContext>;
