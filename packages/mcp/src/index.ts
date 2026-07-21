import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AtelierClient } from '@useatelier/sdk';
import { registerTools, type ToolContext } from '../../mcp-core/src/index';

const apiKey = process.env.ATELIER_API_KEY;
const baseUrl = process.env.ATELIER_BASE_URL || 'https://api.useatelier.ai';

const client = new AtelierClient({ apiKey, baseUrl });

const server = new McpServer({ name: 'atelier', version: '0.5.1' });

// Stdio is a trusted local context controlled by the operator: every tool is available;
// the single shared registry (mcp-core) is the source of truth for both transports.
registerTools(server, (): ToolContext => ({
  client,
  caller: { kind: 'agent' },
  baseUrl,
  apiKey,
}));

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
