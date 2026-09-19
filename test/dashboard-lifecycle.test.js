const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

test('Meta labels settle instead of continually scheduling observer callbacks', async () => {
  let pending = false;
  let callback;
  function element(text) {
    return { get textContent() { return text; }, set textContent(value) { text = value; pending = true; } };
  }
  const heading = element('Official signup');
  const button = element('Connect');
  const status = Object.assign(element('Ready'), { dataset: {} });
  const panel = { querySelector: selector => ({ strong: heading, '#metaSignupButton': button, '#metaSignupStatus': status })[selector] };
  vm.runInNewContext(read('meta-only-ui.js'), {
    document: { documentElement: {}, querySelector: selector => selector === '#metaSignupPanel' ? panel : null, querySelectorAll: () => [] },
    MutationObserver: class { constructor(fn) { callback = fn; } observe() {} },
    fetch: async () => ({ ok: true, json: async () => ({ openwaEnabled: false }) }),
  });
  await new Promise(resolve => setImmediate(resolve));
  let deliveries = 0;
  while (pending && deliveries < 10) { pending = false; deliveries++; callback(); }
  assert.equal(pending, false, 'observer must become idle');
  assert.equal(heading.textContent, 'Connect WhatsApp with Meta');
  assert.equal(button.textContent, 'Connect WhatsApp with Meta');
  assert.equal(deliveries, 1);
  heading.textContent = 'Changed by another renderer';
  callback();
  pending = false;
  callback();
  assert.equal(pending, false, 'subsequent updates must settle too');
});

test('dashboard script loader runs once and signals initialization after loading', async () => {
  const source = read('app.js');
  const loader = source.slice(source.indexOf('let dashboardScriptsPromise;'), source.indexOf('function showAuth'));
  const scripts = [];
  const events = [];
  const context = vm.createContext({
    document: { createElement: () => ({ remove() {} }), head: { appendChild: script => scripts.push(script) } },
    window: { dispatchEvent: event => events.push(event.type) }, Event,
  });
  vm.runInContext(loader, context);
  assert.equal(scripts.length, 0);
  const first = context.loadDashboardScripts();
  const second = context.loadDashboardScripts();
  assert.equal(first, second);
  assert.equal(scripts.length, 1);
  assert.deepEqual(events, []);
  scripts[0].onload();
  await first;
  assert.deepEqual(events, ['dashboard-ready']);
});

test('removed legacy account grid does not break dashboard data loading', async () => {
  const source = read('app.js');
  const fn = source.slice(source.indexOf('async function loadAccounts()'), source.indexOf('async function loadMembers()'));
  const context = vm.createContext({ $: () => null, api: () => { throw new Error('Legacy request should not run'); } });
  vm.runInContext(fn, context);
  await context.loadAccounts();
});
