const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('data deletion page is public and documents the request process', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'data-deletion.html'), 'utf8');
  assert.match(page, /Data Deletion Request/);
  assert.match(page, /support@10xdigitalventures\.com/);
  assert.match(page, /3 business days/);
  assert.match(page, /30 calendar days/);
  assert.match(page, /What we remove/);
  assert.match(page, /Third-party services/);
});
