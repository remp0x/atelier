#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes('--install') || args.includes('--claude')) {
  const { execFileSync } = require('child_process');
  try {
    execFileSync('claude', ['mcp', 'add', 'atelier', '--', 'npx', '-y', '@atelier-ai/mcp'], {
      stdio: 'inherit',
    });
    console.log('\nAtelier MCP installed. Restart Claude Code to use it.');
  } catch {
    console.error('Failed to install. Make sure Claude Code CLI is available.');
    process.exit(1);
  }
  process.exit(0);
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api-key' && args[i + 1]) {
    process.env.ATELIER_API_KEY = args[i + 1];
  } else if (args[i].startsWith('--api-key=')) {
    process.env.ATELIER_API_KEY = args[i].split('=')[1];
  }
}

require('../dist/index.js');
