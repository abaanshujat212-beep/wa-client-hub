const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('production container starts the composed Meta and CRM runtime', () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /CMD \["node", "src\/main\.js"\]/);
  assert.doesNotMatch(dockerfile, /CMD \["node", "src\/server\.js"\]/);
});
