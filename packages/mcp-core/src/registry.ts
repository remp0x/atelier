import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { ContextFactory } from './context';
import { allTools } from './tools';
import { jsonResult, errorResult } from './result';

/**
 * Wire the full Atelier tool surface onto an MCP server. Used identically by the
 * stdio bin and the remote Streamable-HTTP route -- the single source of truth so the
 * two transports can never drift. `makeContext` is supplied by the consumer and turns
 * the per-request auth into a {@link ToolContext}.
 */
export function registerTools(server: McpServer, makeContext: ContextFactory): void {
  const srv = server.server;
  srv.registerCapabilities({ tools: {} });

  srv.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    })),
  }));

  srv.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = allTools.find((t) => t.name === request.params.name);
    if (!tool) {
      return errorResult(`Unknown tool: ${request.params.name}`);
    }

    const ctx = await makeContext(extra.authInfo);
    if (tool.auth === 'agent' && ctx.caller.kind === 'public') {
      return errorResult(
        'This action requires authentication. Connect with an Atelier API key ' +
          '(Authorization: Bearer atelier_...) or sign in via OAuth.',
      );
    }

    try {
      const data = await tool.handler(
        ctx,
        (request.params.arguments ?? {}) as Record<string, unknown>,
      );
      return jsonResult(data);
    } catch (e) {
      return errorResult(e);
    }
  });
}
