require("dotenv").config();

const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const FileStoreFactory = require("session-file-store");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Store = require("./store");
const BrowserLauncher = require("./launcher");

const rootDir = path.resolve(__dirname, "..");
const app = express();
const store = new Store(rootDir);
const launcher = new BrowserLauncher(rootDir);
const FileStore = FileStoreFactory(session);
const port = Number(process.env.PORT || 3131);
const production = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "50kb" }));
app.use(session({
  store: new FileStore({ path: path.join(rootDir, "data", "sessions"), ttl: 60 * 60 * 12, retries: 1 }),
  name: "wa_hub_session",
  secret: process.env.SESSION_SECRET || "development-only-secret-change-this-now",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true" ? true : "auto",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 12
  }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && req.get("x-csrf-token") !== req.session.csrfToken) {
    return res.status(403).json({ error: "Security token is invalid. Refresh and try again." });
  }
  next();
}

function requireAuth(req, res, next) {
  const user = req.session.userId && store.findUser(req.session.userId);
  if (!user || !user.active) return res.status(401).json({ error: "Please sign in" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  next();
}

function canAccess(user, account) {
  return user.role === "admin" || account.ownerId === user.id;
}

app.use(csrf);

app.get("/api/session", (req, res) => {
  const user = req.session.userId && store.findUser(req.session.userId);
  res.json({
    authenticated: Boolean(user && user.active),
    user: user && user.active ? store.publicUser(user) : null,
    csrfToken: req.session.csrfToken,
    appName: process.env.APP_NAME || "WA Client Hub"
  });
});

app.post("/api/login", loginLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = store.findUserByEmail(email);
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: "Could not start session" });
    req.session.userId = user.id;
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
    store.addAudit(user.id, "login");
    res.json({ user: store.publicUser(user), csrfToken: req.session.csrfToken });
  });
});

app.post("/api/logout", requireAuth, (req, res) => {
  const userId = req.user.id;
  req.session.destroy(() => {
    store.addAudit(userId, "logout");
    res.json({ ok: true });
  });
});

app.get("/api/users", requireAuth, requireAdmin, (req, res) => res.json({ users: store.listUsers() }));

app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const password = String(req.body.password || "");
  if (name.length < 2 || !email.includes("@") || password.length < 10) {
    return res.status(400).json({ error: "Enter a valid name, email, and password of at least 10 characters" });
  }
  try {
    const user = await store.createClient({ name, email, password });
    store.addAudit(req.user.id, "client.created", { clientId: user.id });
    res.status(201).json({ user });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.patch("/api/users/:id", requireAuth, requireAdmin, (req, res) => {
  const user = store.setUserActive(req.params.id, req.body.active);
  if (!user) return res.status(404).json({ error: "Client not found" });
  store.addAudit(req.user.id, "client.status", { clientId: user.id, active: user.active });
  res.json({ user });
});

app.get("/api/accounts", requireAuth, (req, res) => {
  const accounts = store.listAccounts(req.user).map((account) => ({ ...account, ...launcher.status(account) }));
  res.json({ accounts });
});

app.post("/api/accounts", requireAuth, (req, res) => {
  const label = String(req.body.label || "").trim();
  const phone = String(req.body.phone || "").trim();
  const ownerId = req.user.role === "admin" ? String(req.body.ownerId || "") : req.user.id;
  if (label.length < 2 || phone.length < 7) return res.status(400).json({ error: "Enter an account name and phone number" });
  try {
    const account = store.createAccount({ ownerId, label, phone });
    store.addAudit(req.user.id, "account.created", { accountId: account.id, ownerId });
    res.status(201).json({ account: { ...account, ...launcher.status(account) } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/accounts/:id/launch", requireAuth, (req, res) => {
  const account = store.findAccount(req.params.id);
  if (!account || !canAccess(req.user, account)) return res.status(404).json({ error: "Account not found" });
  try {
    const result = launcher.launch(account);
    store.touchAccount(account.id);
    store.addAudit(req.user.id, "account.launched", { accountId: account.id });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post("/api/accounts/:id/close", requireAuth, async (req, res) => {
  const account = store.findAccount(req.params.id);
  if (!account || !canAccess(req.user, account)) return res.status(404).json({ error: "Account not found" });
  try {
    const closed = await launcher.close(account.id);
    store.addAudit(req.user.id, "account.closed", { accountId: account.id });
    res.json({ ok: true, closed });
  } catch (error) {
    res.status(500).json({ error: "Could not close browser session" });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true, platform: process.platform, time: new Date().toISOString() }));
app.use(express.static(path.join(rootDir, "public"), { extensions: ["html"] }));
app.get("/{*path}", (req, res) => res.sendFile(path.join(rootDir, "public", "index.html")));

async function start() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMeNow123!";
  if (production && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  await store.init({ adminEmail, adminPassword });
  app.listen(port, "0.0.0.0", () => console.log(`WA Client Hub running at http://localhost:${port}`));
}

if (require.main === module) start().catch((error) => { console.error(error); process.exit(1); });

module.exports = { app, store, launcher, start };
