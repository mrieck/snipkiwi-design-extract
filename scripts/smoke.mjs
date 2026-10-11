#!/usr/bin/env node
// Smoke test: start the MCP server over stdio, run initialize + tools/list, and
// check the four tools are advertised. No browser is launched.
//   node scripts/smoke.mjs
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED = ['extract_css_convert_tailwind', 'list_page_elements', 'screenshot_page', 'compare_to_reference'];

const server = spawn(process.execPath, [resolve(root, 'dist/mcp-server.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
let out = '', err = '';
server.stdout.on('data', (d) => (out += d));
server.stderr.on('data', (d) => (err += d));

const send = (msg) => server.stdin.write(JSON.stringify(msg) + '\n');
send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

const deadline = Date.now() + 10000;
while (Date.now() < deadline && !out.includes('"id":2')) await new Promise((r) => setTimeout(r, 50));
server.kill();

const lines = out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const init = lines.find((m) => m.id === 1);
const list = lines.find((m) => m.id === 2);
if (!init || !list) {
  console.error('No response from server.\nstdout:', out, '\nstderr:', err);
  process.exit(1);
}
const names = list.result.tools.map((t) => t.name);
const missing = EXPECTED.filter((n) => !names.includes(n));
const extra = names.filter((n) => !EXPECTED.includes(n));
console.log(`server: ${init.result.serverInfo.name} ${init.result.serverInfo.version}`);
console.log(`tools:  ${names.join(', ')}`);
if (missing.length || extra.length) {
  console.error('tool list mismatch', { missing, extra });
  process.exit(1);
}
console.log('smoke OK');
