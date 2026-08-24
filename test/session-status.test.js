const test = require("node:test");
const assert = require("node:assert/strict");
const { accountSessionStatus, statusLabel } = require("../src/sessionStatus");

test("session status detects needs QR scan", () => {
  assert.equal(accountSessionStatus({ lastLaunchedAt: null }, { running: false, profileCreated: false }), "needs_qr_scan");
});

test("session status detects profile created", () => {
  assert.equal(accountSessionStatus({ lastLaunchedAt: null }, { running: false, profileCreated: true }), "profile_created");
});

test("session status detects linked or needs check", () => {
  assert.equal(accountSessionStatus({ lastLaunchedAt: "2026-01-01T00:00:00Z" }, { running: false, profileCreated: true }), "linked_or_needs_check");
});

test("session status detects running", () => {
  assert.equal(accountSessionStatus({ lastLaunchedAt: null }, { running: true, profileCreated: false }), "running");
});

test("status labels are user-facing", () => {
  assert.equal(statusLabel("needs_qr_scan"), "Needs QR scan");
  assert.equal(statusLabel("running"), "Running");
});
