function validateSecurityConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const sessionSecret = env.SESSION_SECRET || "";
  const issues = [];

  if (production && sessionSecret.length < 32) issues.push("SESSION_SECRET must be at least 32 characters in production");
  if (production && sessionSecret.includes("replace-with") || production && sessionSecret.includes("development-only")) issues.push("SESSION_SECRET must be unique and not the example value");
  if (production && env.COOKIE_SECURE !== "true") issues.push("COOKIE_SECURE=true is required in production");
  if (production && env.REMOTE_DESKTOP_URL && !env.REMOTE_DESKTOP_URL.startsWith("https://")) issues.push("REMOTE_DESKTOP_URL must use HTTPS in production");

  return issues;
}

function assertSecurityConfig(env = process.env) {
  const issues = validateSecurityConfig(env);
  if (issues.length) throw new Error("Security configuration error: " + issues.join("; "));
}

module.exports = { validateSecurityConfig, assertSecurityConfig };
