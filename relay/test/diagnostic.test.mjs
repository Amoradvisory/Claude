import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runDiagnostic } from '../scripts/diagnostic.mjs';

test('diagnostic fails on a publicly accessible MCP even if health says ready', async () => {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify({ service: 'speed-car', configured: true }));
    res.end('{}'); // Broken service: every unauthenticated request succeeds.
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await runDiagnostic(`http://127.0.0.1:${server.address().port}`);
    assert.equal(result.relay_ready, false);
    assert.equal(result.checks.unauthenticated_mcp_blocked, false);
    assert.equal(result.voice_test, 'not_observed');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('diagnostic refuses non-HTTPS remote endpoints and credentials in a URL', async () => {
  await assert.rejects(runDiagnostic('http://remote.example'), /HTTPS/);
  await assert.rejects(runDiagnostic('https://owner:secret@example.com'), /identifiants/);
});

test('diagnostic rejects a GET-protected service that leaves anonymous MCP writes open', async () => {
  let origin;
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify({ service: 'speed-car', configured: true }));
    if (req.url === '/mcp' && req.method === 'GET') {
      res.writeHead(401, { 'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` });
      return res.end('{}');
    }
    if (req.url === '/.well-known/oauth-protected-resource/mcp') return res.end(JSON.stringify({ resource: `${origin}/mcp`, authorization_servers: [origin] }));
    if (req.url === '/.well-known/oauth-authorization-server') return res.end(JSON.stringify({
      code_challenge_methods_supported: ['S256'], scopes_supported: ['speedcar:test'],
      authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/oauth/token`,
    }));
    res.end('{}'); // POST /mcp is incorrectly public.
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await runDiagnostic(origin);
    assert.equal(result.relay_ready, false);
    assert.equal(result.checks.unauthenticated_mcp_post_blocked, false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
