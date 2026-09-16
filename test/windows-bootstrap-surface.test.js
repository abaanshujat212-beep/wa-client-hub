const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Windows first-run setup repairs the existing Cloudflare service configuration', () => {
  const helper = read('scripts/ensure-cloudflare-service.ps1');
  const firstRun = read('scripts/setup-windows-first-run.ps1');
  const namedTunnel = read('scripts/setup-cloudflare-tunnel.ps1');

  assert.match(helper, /systemprofile\\.cloudflared/);
  assert.match(helper, /credentials-file:/);
  assert.match(helper, /Start-Process powershell\.exe -Verb RunAs/);
  assert.match(helper, /cloudflared service install/);
  assert.ok(firstRun.includes('ensure-cloudflare-service.ps1'));
  assert.ok(namedTunnel.includes('ensure-cloudflare-service.ps1'));
});

test('Windows autostart uses the PowerShell-compatible interactive logon type', () => {
  const script = read('scripts/install-windows-autostart.ps1');
  assert.ok(script.includes('-LogonType Interactive'));
  assert.ok(!script.includes('-LogonType InteractiveToken'));
});

test('Windows launchers recover a stale Docker Desktop process with a stopped engine', () => {
  for (const file of ['scripts/start-stack-windows.ps1', 'scripts/windows-common.ps1']) {
    const script = read(file);
    assert.match(script, /Start-Process \$desktop -WindowStyle Hidden/);
    assert.doesNotMatch(script, /if \(-not \(Get-Process -Name 'Docker Desktop'/);
  }
});
