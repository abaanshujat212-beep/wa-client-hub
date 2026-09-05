require("dotenv").config();

const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const FileStoreFactory = require("session-file-store");
const PgStoreFactory = require("connect-pg-simple");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const { createStore } = require("./storeFactory");
const { createRuntimeDependencies } = require("./runtimeDependencies");
const { OpenWaClient } = require("./openwa/client");
const { OpenWaRepository } = require("./openwa/repository");
const { createOpenWaRouter } = require("./openwa/routes");
const { InboxRepository } = require("./inbox/repository");
const { InboxEvents } = require("./inbox/events");
const { createInboxRouter } = require("./inbox/routes");
const { CampaignRepository } = require("./campaigns/repository");
const { CampaignWorker } = require("./campaigns/worker");
const { createCampaignRouter } = require("./campaigns/routes");
const { isOptOut, normalizePhone } = require("./campaigns/policy");
const { CredentialVault } = require("./connectors/vault");
const { ConnectorRepository } = require("./connectors/repository");
const { ConnectorWorker } = require("./connectors/worker");
const { createConnectorRouter } = require("./connectors/routes");
const BrowserLauncher = require("./launcher");
const { assertSecurityConfig } = require("./security");
const { systemHealth } = require("./monitoring");
const { adminSummary } = require("./adminSummary");
const { accountSessionStatus, statusLabel } = require("./sessionStatus");
const { createSwichRouter } = require("./billing/swichRoutes");
const { createWhopRouter } = require("./billing/whopRoutes");
const { createStripeRouter } = require("./billing/stripeRoutes");

const rootDir = path.resolve(__dirname, "..");
const app = express();
const store = createStore(rootDir);
const launcher = new BrowserLauncher(rootDir);
const dependencies = createRuntimeDependencies();
const openWaClient = new OpenWaClient();
const openWaRepository = store.driver === "postgres" ? new OpenWaRepository(store.repository.pool) : null;
const inboxRepository = store.driver === "postgres" ? new InboxRepository(store.repository.pool) : null;
const inboxEvents = new InboxEvents();
const campaignRepository = store.driver === "postgres" ? new CampaignRepository(store.repository.pool) : null;
const campaignWorker = campaignRepository ? new CampaignWorker({ repository: campaignRepository, openWaRepository, openWaClient, redis: dependencies.redis, events: inboxEvents, workspaceLimit: Number(process.env.CAMPAIGN_WORKSPACE_PER_MINUTE || 20), numberLimit: Number(process.env.CAMPAIGN_NUMBER_PER_MINUTE || 10) }) : null;
const connectorRepository = store.driver === "postgres" ? new ConnectorRepository(store.repository.pool, new CredentialVault({ env: process.env })) : null;
const connectorWorker = connectorRepository ? new ConnectorWorker({ repository: connectorRepository }) : null;
const FileStore = FileStoreFactory(session);
const PgStore = PgStoreFactory(session);
const port = Number(process.env.PORT || 3131);
const sessionStore = store.driver === "postgres"
  ? new PgStore({ pool: store.repository.pool, tableName: "user_sessions", createTableIfMissing: true })
  : new FileStore({ path: path.join(rootDir, "data", "sessions"), ttl: 60 * 60 * 12, retries: 1 });

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb", verify: (req, _res, buffer) => { if (req.originalUrl === "/api/billing/stripe/webhook" || /^\/api\/connectors\/[^/]+\/webhook$/.test(req.originalUrl)) req.rawBody = Buffer.from(buffer); } }));
app.use(session({ store: sessionStore, name: "wa_hub_session", secret: process.env.SESSION_SECRET || "development-only-secret-change-this-now", resave: false, saveUninitialized: false, cookie: { httpOnly: true, secure: process.env.COOKIE_SECURE === "true" ? true : "auto", sameSite: "lax", maxAge: 1000 * 60 * 60 * 12 } }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });
function csrf(req, res, next) { if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString("hex"); const externalWebhook = req.path.startsWith("/api/billing/swich/webhook") || req.path.startsWith("/api/billing/whop/webhook") || req.path.startsWith("/api/billing/stripe/webhook") || req.path === "/api/openwa/webhook" || /^\/api\/connectors\/[^/]+\/webhook$/.test(req.path); if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && req.path !== "/api/invites/accept" && !externalWebhook && req.get("x-csrf-token") !== req.session.csrfToken) return res.status(403).json({ error: "Security token is invalid. Refresh and try again." }); next(); }
function requireAuth(req, res, next) { const user = req.session.userId && store.findUser(req.session.userId); if (!user || !user.active) return res.status(401).json({ error: "Please sign in" }); req.user = user; next(); }
function requireAdmin(req, res, next) { if (req.user.role !== "admin") return res.status(403).json({ error: "Administrator access required" }); next(); }
function billingAuth(router) { return [(req, res, next) => req.path === "/webhook" ? next() : requireAuth(req, res, () => requireAdmin(req, res, next)), router]; }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim()); }
function isValidPhone(phone) { return /^\+?[0-9][0-9\s().-]{7,20}$/.test(String(phone || "").trim()); }
function canAccess(user, account) { return account && store.canUseWorkspace(user, account.workspaceId); }
function canManage(user, workspaceId) { return store.canManageWorkspace(user, workspaceId); }
function remoteDesktopConfig() { return { enabled: Boolean(process.env.REMOTE_DESKTOP_URL), url: process.env.REMOTE_DESKTOP_URL || "", label: process.env.REMOTE_DESKTOP_LABEL || "Open Remote Desktop", help: process.env.REMOTE_DESKTOP_HELP || "Use secured RDP/Guacamole to access the Windows desktop." }; }
function decorateAccount(account) { const launchStatus = launcher.status(account); const sessionStatus = accountSessionStatus(account, launchStatus); return { ...account, ...launchStatus, sessionStatus, sessionStatusLabel: statusLabel(sessionStatus) }; }

app.use(csrf);
app.get("/api/session", (req, res) => { const user = req.session.userId && store.findUser(req.session.userId); res.json({ authenticated: Boolean(user && user.active), user: user && user.active ? store.publicUser(user) : null, csrfToken: req.session.csrfToken, appName: process.env.APP_NAME || "WA Client Hub" }); });
app.post("/api/login", loginLimiter, async (req, res) => { const email = String(req.body.email || "").trim().toLowerCase(); const password = String(req.body.password || ""); const user = store.findUserByEmail(email); if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) { await store.addAudit(user?.id || "anonymous", "login.failed", { email, ip: req.ip }); return res.status(401).json({ error: "Email or password is incorrect" }); } req.session.regenerate(async (error) => { if (error) return res.status(500).json({ error: "Could not start session" }); req.session.userId = user.id; req.session.csrfToken = crypto.randomBytes(24).toString("hex"); await store.addAudit(user.id, "login", { ip: req.ip }); res.json({ user: store.publicUser(user), csrfToken: req.session.csrfToken }); }); });
app.post("/api/logout", requireAuth, (req, res) => { const userId = req.user.id; req.session.destroy(async () => { await store.addAudit(userId, "logout"); res.json({ ok: true }); }); });

app.use("/api/billing/swich", ...billingAuth(createSwichRouter({ store })));
app.use("/api/billing/whop", ...billingAuth(createWhopRouter({ store })));
app.use("/api/billing/stripe", ...billingAuth(createStripeRouter({ store })));
if (openWaRepository) app.use("/api/openwa", createOpenWaRouter({ store, repository: openWaRepository, client: openWaClient, events: inboxEvents, requireAuth, requireManage: canManage, onInbound: async ({ workspaceId, message }) => { if (!message.fromMe && isOptOut(message.body)) { const phone=normalizePhone(message.from); if(phone){await campaignRepository.suppress({workspaceId,phone,scope:"workspace",reason:"recipient_opt_out"});await store.addAudit("system","contact.opted_out",{workspaceId,phone});} } }, onCanonicalEvent: async ({workspaceId,event,result}) => { if(event==="ack.changed"&&result)await campaignRepository.syncDelivery(workspaceId,result.externalMessageId,result.status); } }));
if (inboxRepository) app.use("/api/inbox", createInboxRouter({ store, repository: inboxRepository, events: inboxEvents, requireAuth, remoteDesktopConfig }));
if (campaignRepository) app.use("/api/campaigns", createCampaignRouter({ store, repository: campaignRepository, requireAuth }));
if (connectorRepository) app.use("/api/connectors", createConnectorRouter({ store, repository: connectorRepository, requireAuth }));

app.get("/api/users", requireAuth, requireAdmin, (req, res) => res.json({ users: store.listUsers() }));
app.get("/api/admin/summary", requireAuth, requireAdmin, (req, res) => res.json(adminSummary(store, launcher)));
app.get("/api/plans", requireAuth, (req, res) => res.json({ plans: store.data.plans }));
app.get("/api/remote-desktop", requireAuth, (req, res) => res.json({ remoteDesktop: remoteDesktopConfig() }));
app.get("/api/audit", requireAuth, requireAdmin, (req, res) => res.json({ audit: store.listAudit(req.query.limit) }));
app.get("/api/monitoring", requireAuth, requireAdmin, (req, res) => res.json({ health: systemHealth(store, launcher) }));
app.post("/api/users", requireAuth, requireAdmin, async (req, res) => { const name = String(req.body.name || "").trim(); const email = String(req.body.email || "").trim(); const password = String(req.body.password || ""); if (name.length < 2 || !isValidEmail(email) || password.length < 10) return res.status(400).json({ error: "Enter a valid name, email, and password of at least 10 characters" }); try { const user = await store.createClient({ name, email, password }); await store.addAudit(req.user.id, "client.created", { clientId: user.id }); res.status(201).json({ user }); } catch (error) { res.status(409).json({ error: error.message }); } });
app.post("/api/me/password", requireAuth, async (req, res) => { const currentPassword = String(req.body.currentPassword || ""); const newPassword = String(req.body.newPassword || ""); if (newPassword.length < 10) return res.status(400).json({ error: "New password must be at least 10 characters" }); const changed = await store.changePassword(req.user.id, currentPassword, newPassword); if (!changed) return res.status(400).json({ error: "Current password is incorrect" }); await store.addAudit(req.user.id, "password.changed"); res.json({ ok: true }); });
app.post("/api/users/:id/password", requireAuth, requireAdmin, async (req, res) => { const newPassword = String(req.body.newPassword || ""); if (newPassword.length < 10) return res.status(400).json({ error: "New password must be at least 10 characters" }); const user = await store.resetPassword(req.params.id, newPassword); if (!user) return res.status(404).json({ error: "Client not found" }); await store.addAudit(req.user.id, "client.password.reset", { clientId: user.id }); res.json({ user }); });
app.patch("/api/users/:id", requireAuth, requireAdmin, async (req, res) => { const user = await store.setUserActive(req.params.id, req.body.active); if (!user) return res.status(404).json({ error: "Client not found" }); await store.addAudit(req.user.id, "client.status", { clientId: user.id, active: user.active }); res.json({ user }); });

app.get("/api/workspaces", requireAuth, (req, res) => res.json({ workspaces: store.listWorkspaces(req.user) }));
app.post("/api/workspaces", requireAuth, async (req, res) => { const name = String(req.body.name || "").trim(); const ownerId = req.user.role === "admin" ? String(req.body.ownerId || "") : req.user.id; const planId = req.user.role === "admin" ? String(req.body.planId || "team") : "team"; if (name.length < 2) return res.status(400).json({ error: "Enter a workspace name" }); try { const workspace = await store.createWorkspace({ ownerId, name, planId }); await store.addAudit(req.user.id, "workspace.created", { workspaceId: workspace.id, ownerId, planId }); res.status(201).json({ workspace }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.patch("/api/workspaces/:id", requireAuth, async (req, res) => { if (!canManage(req.user, req.params.id)) return res.status(404).json({ error: "Workspace not found" }); const workspace = await store.updateWorkspace(req.params.id, req.body); if (!workspace) return res.status(404).json({ error: "Workspace not found" }); await store.addAudit(req.user.id, "workspace.updated", { workspaceId: workspace.id }); res.json({ workspace }); });
app.get("/api/workspaces/:id/members", requireAuth, (req, res) => { if (!store.canViewWorkspace(req.user, req.params.id)) return res.status(404).json({ error: "Workspace not found" }); res.json({ members: store.listWorkspaceMembers(req.params.id) }); });
app.post("/api/workspaces/:id/members", requireAuth, async (req, res) => { if (!canManage(req.user, req.params.id)) return res.status(404).json({ error: "Workspace not found" }); try { const member = await store.addWorkspaceMember({ workspaceId: req.params.id, userId: String(req.body.userId || ""), role: String(req.body.role || "agent") }); await store.addAudit(req.user.id, "workspace.member.added", { workspaceId: req.params.id, userId: member.userId, role: member.role }); res.status(201).json({ member }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.delete("/api/workspaces/:id/members/:userId", requireAuth, async (req, res) => { if (!canManage(req.user, req.params.id)) return res.status(404).json({ error: "Workspace not found" }); const member = await store.removeWorkspaceMember({ workspaceId: req.params.id, userId: req.params.userId }); if (!member) return res.status(404).json({ error: "Member not found" }); await store.addAudit(req.user.id, "workspace.member.removed", { workspaceId: req.params.id, userId: req.params.userId }); res.json({ ok: true, member }); });
app.get("/api/workspaces/:id/invites", requireAuth, (req, res) => { if (!canManage(req.user, req.params.id)) return res.status(404).json({ error: "Workspace not found" }); res.json({ invites: store.listInvites(req.params.id) }); });
app.post("/api/workspaces/:id/invites", requireAuth, async (req, res) => { if (!canManage(req.user, req.params.id)) return res.status(404).json({ error: "Workspace not found" }); const email = String(req.body.email || "").trim(); const name = String(req.body.name || "").trim(); if (!isValidEmail(email) || name.length < 2) return res.status(400).json({ error: "Enter a valid name and email" }); try { const result = await store.createInvite({ workspaceId: req.params.id, email, name, role: String(req.body.role || "agent"), createdBy: req.user.id }); await store.addAudit(req.user.id, "invite.created", { workspaceId: req.params.id, inviteId: result.invite.id, email }); res.status(201).json({ invite: result.invite, acceptUrl: `/invite.html?token=${result.token}`, token: result.token }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.post("/api/invites/accept", async (req, res) => { const token = String(req.body.token || ""); const password = String(req.body.password || ""); const name = String(req.body.name || ""); if (!token || password.length < 10) return res.status(400).json({ error: "Invite token and password are required" }); try { const user = await store.acceptInvite({ token, password, name }); await store.addAudit(user.id, "invite.accepted", { email: user.email }); res.json({ user }); } catch (error) { res.status(400).json({ error: error.message }); } });

app.get("/api/accounts", requireAuth, (req, res) => { const accounts = store.listAccounts(req.user, req.query.workspaceId).map(decorateAccount); res.json({ accounts }); });
app.post("/api/accounts", requireAuth, async (req, res) => { const label = String(req.body.label || "").trim(); const phone = String(req.body.phone || "").trim(); let workspaceId = String(req.body.workspaceId || ""); const ownerId = req.user.role === "admin" ? String(req.body.ownerId || "") : req.user.id; if (!workspaceId) { let workspace = store.listWorkspaces(req.user)[0]; if (!workspace && req.user.role !== "admin") workspace = await store.createWorkspace({ ownerId: req.user.id, name: "Default workspace", planId: "team" }); workspaceId = workspace?.id || ""; } if (!canManage(req.user, workspaceId)) return res.status(404).json({ error: "Workspace not found" }); if (label.length < 2 || !isValidPhone(phone)) return res.status(400).json({ error: "Enter an account name and phone number" }); try { const account = await store.createAccount({ ownerId, workspaceId, label, phone }); await store.addAudit(req.user.id, "account.created", { accountId: account.id, ownerId: account.ownerId, workspaceId }); res.status(201).json({ account: decorateAccount(account) }); } catch (error) { res.status(400).json({ error: error.message }); } });
app.delete("/api/accounts/:id", requireAuth, async (req, res) => { const account = store.findAccount(req.params.id); if (!account || !canManage(req.user, account.workspaceId)) return res.status(404).json({ error: "Account not found" }); await launcher.removeProfile(account); const deleted = await store.deleteAccount(account.id); await store.addAudit(req.user.id, "account.deleted", { accountId: account.id, ownerId: account.ownerId, workspaceId: account.workspaceId }); res.json({ ok: true, account: deleted }); });
app.post("/api/accounts/:id/launch", requireAuth, async (req, res) => { const account = store.findAccount(req.params.id); if (!account || !canAccess(req.user, account)) return res.status(404).json({ error: "Account not found" }); try { const result = launcher.launch(account); await store.touchAccount(account.id); await store.addAudit(req.user.id, "account.launched", { accountId: account.id, workspaceId: account.workspaceId }); res.json({ ok: true, ...result }); } catch (error) { res.status(503).json({ error: error.message }); } });
app.post("/api/accounts/:id/close", requireAuth, async (req, res) => { const account = store.findAccount(req.params.id); if (!account || !canAccess(req.user, account)) return res.status(404).json({ error: "Account not found" }); try { const closed = await launcher.close(account.id); await store.addAudit(req.user.id, "account.closed", { accountId: account.id, workspaceId: account.workspaceId }); res.json({ ok: true, closed }); } catch (error) { res.status(500).json({ error: "Could not close browser session" }); } });

app.get("/api/health", (req, res) => res.json({ ok: true, platform: process.platform, time: new Date().toISOString() }));
app.get("/api/ready", async (_req, res) => {
  const readiness = await dependencies.readiness(store);
  res.status(readiness.ok ? 200 : 503).json({ ...readiness, time: new Date().toISOString() });
});
app.use(express.static(path.join(rootDir, "public"), { extensions: ["html"] }));
app.get("/{*path}", (req, res) => res.sendFile(path.join(rootDir, "public", "index.html")));
async function start() { const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com"; const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMeNow123!"; assertSecurityConfig(process.env); await store.init({ adminEmail, adminPassword }); await dependencies.connect(); campaignWorker?.start(); connectorWorker?.start(); return app.listen(port, "0.0.0.0", () => console.log(`WA Client Hub running at http://localhost:${port} using ${store.driver} storage`)); }
async function runMain() { const server = await start(); let closing = false; const shutdown = async () => { if (closing) return; closing = true; campaignWorker?.stop(); connectorWorker?.stop(); await new Promise((resolve) => server.close(resolve)); await dependencies.close(); if (typeof store.close === "function") await store.close(); process.exit(0); }; process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown); }
if (require.main === module) runMain().catch((error) => { console.error(error); process.exit(1); });
module.exports = { app, store, launcher, dependencies, start };
