const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSecurityConfig, assertSecurityConfig } = require("../src/security");

test("security config allows local development defaults", () => {
  const issues = validateSecurityConfig({ NODE_ENV: "development", SESSION_SECRET: "short", COOKIE_SECURE: "false" });
  assert.deepEqual(issues, []);
});

test("security config rejects weak production session secret", () => {
  const issues = validateSecurityConfig({ NODE_ENV: "production", SESSION_SECRET: "short", COOKIE_SECURE: "true" });
  assert.ok(issues.some((issue) => issue.includes("SESSION_SECRET")));
});

test("security config requires secure cookies in production", () => {
  const issues = validateSecurityConfig({ NODE_ENV: "production", SESSION_SECRET: "a-secure-random-secret-longer-than-32-characters", COOKIE_SECURE: "false" });
  assert.ok(issues.some((issue) => issue.includes("COOKIE_SECURE")));
});

test("security config requires https remote desktop url in production", () => {
  const issues = validateSecurityConfig({ NODE_ENV: "production", SESSION_SECRET: "a-secure-random-secret-longer-than-32-characters", COOKIE_SECURE: "true", REMOTE_DESKTOP_URL: "http://rdp.example.com" });
  assert.ok(issues.some((issue) => issue.includes("REMOTE_DESKTOP_URL")));
});

test("security config passes strong production setup", () => {
  assert.doesNotThrow(() => assertSecurityConfig({ NODE_ENV: "production", SESSION_SECRET: "a-secure-random-secret-longer-than-32-characters", COOKIE_SECURE: "true", REMOTE_DESKTOP_URL: "https://rdp.example.com" }));
});
