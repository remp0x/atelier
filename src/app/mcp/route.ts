export const runtime = 'nodejs';
export const maxDuration = 60;

import { createMcpHandler, withMcpAuth, getPublicOrigin } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { AtelierClient } from '@atelier-ai/sdk';
import { registerTools, type ContextFactory, type Caller, type ToolContext } from '@atelier-ai/mcp-core';
import { verifyMcpToken } from '@/lib/mcp/verify-token';
import { getAtelierAgentsByPrivyUser } from '@/lib/atelier-db';
import { isOAuthConfigured } from '@/lib/oauth/config';

interface AuthExtra {
  kind?: string;
  apiKey?: string;
  agentId?: string;
  userId?: string;
}

/**
 * Per-request factory: turns the resolved MCP identity into a ToolContext whose SDK
 * client targets THIS deployment and carries the caller's own upstream credential.
 * The client's MCP token is never forwarded upstream (spec: no token passthrough).
 */
function makeContextFactory(baseUrl: string): ContextFactory {
  return async (authInfo: AuthInfo | undefined): Promise<ToolContext> => {
    const extra = (authInfo?.extra ?? {}) as AuthExtra;
    let caller: Caller = { kind: 'public' };
    let apiKey: string | undefined;

    if (extra.kind === 'agent') {
      caller = { kind: 'agent', agentId: extra.agentId };
      apiKey = extra.apiKey;
    } else if (extra.kind === 'user' && extra.userId) {
      // OAuth user: act as the agent they own. v1 uses their first key-bearing
      // agent (multi-agent disambiguation is a later enhancement). The user's MCP
      // token is never forwarded upstream -- we use the agent's own key.
      const agents = await getAtelierAgentsByPrivyUser(extra.userId);
      const owned = agents.find((a) => a.api_key);
      caller = { kind: 'user', userId: extra.userId, agentId: owned?.id };
      apiKey = owned?.api_key ?? undefined;
    }

    const client = new AtelierClient({ baseUrl, apiKey, timeout: 50_000 });
    return { client, caller, baseUrl, apiKey };
  };
}

async function handle(request: Request): Promise<Response> {
  const baseUrl = getPublicOrigin(request);

  const handler = createMcpHandler(
    (server) => registerTools(server, makeContextFactory(baseUrl)),
    { serverInfo: { name: 'atelier', version: '1.0.0' } },
    {
      maxDuration: 60,
      disableSse: true,
      verboseLogs: process.env.NODE_ENV !== 'production',
    },
  );

  // When OAuth is enabled, challenge unauthenticated requests (401 + WWW-Authenticate)
  // so consumer clients (Claude.ai, ChatGPT) start the one-click connect flow. Bearer
  // atelier_ keys keep working either way. When OAuth is off, stay open (bearer + public).
  const authed = withMcpAuth(handler, verifyMcpToken, { required: isOAuthConfigured() });
  return authed(request);
}

export { handle as GET, handle as POST };
