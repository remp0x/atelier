import type { ToolContext } from './context';

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * `none`  -- callable by anyone (discovery / public reads / x402 pay flow).
 * `agent` -- requires an authenticated identity (atelier_ key or OAuth user).
 */
export type ToolAuth = 'none' | 'agent';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  auth: ToolAuth;
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
}
