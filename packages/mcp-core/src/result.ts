import { AtelierError } from '@useatelier/sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type McpToolResult = CallToolResult;

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(error: unknown): CallToolResult {
  const message =
    error instanceof AtelierError
      ? `${error.name}: ${error.message} (${error.status})`
      : error instanceof Error
        ? error.message
        : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}
