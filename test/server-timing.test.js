const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createServerTiming, millisecondsSince } = require('../src/serverTiming');

test('duration conversion is monotonic milliseconds', () => {
  assert.equal(millisecondsSince(1_000_000n, 3_500_000n), 2.5);
  assert.equal(millisecondsSince(3_500_000n, 1_000_000n), 0);
});

test('Server-Timing exposes safe application time on responses', async () => {
  const ticks = [1_000_000n, 13_340_000n];
  const app = express();
  app.use(createServerTiming({ clock: () => ticks.shift() }));
  app.get('/probe', (_req, res) => res.json({ ok: true }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/probe`);
    assert.equal(response.headers.get('server-timing'), 'app;dur=12.3;desc="Application"');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
