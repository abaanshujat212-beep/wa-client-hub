const crypto = require("node:crypto");
const { validState } = require("./metaSignupStateRepository");
const PUBLIC_ERRORS = new Map([
  ["META_SIGNUP_INVALID", [400, "Valid Meta signup details are required"]],
  ["META_INSTALL_INVALID", [400, "Valid Meta connection details are required"]],
  ["META_SIGNUP_NOT_CONFIGURED", [503, "Meta Embedded Signup is not configured"]],
  ["META_CODE_EXCHANGE_FAILED", [502, "Meta code exchange failed"]],
  ["META_CODE_EXCHANGE_INVALID", [502, "Meta code exchange returned an invalid response"]],
  ["META_NUMBER_VERIFICATION_FAILED", [502, "Meta number verification failed"]],
  ["META_NUMBER_MAPPING_INVALID", [422, "Meta phone number does not match the selected business account"]],
  ["META_PHONE_ALREADY_CONNECTED", [409, "Meta phone number is already connected"]],
  ["WORKSPACE_NOT_FOUND", [404, "Workspace not found"]],
]);
function sendFailure(res, error) {
  const known = PUBLIC_ERRORS.get(error?.code);
  const [status, message] = known || [503, "Meta signup could not be completed; start a new signup"];
  return res.status(status).json({ error: message, code: known ? error.code : "META_SIGNUP_FAILED" });
}
function authenticated(req) {
  return Boolean(req.session && typeof req.sessionID === "string" && req.sessionID &&
    typeof req.user?.id === "string" && req.user.id && req.user.active !== false);
}
function invalidState(res) {
  return res.status(409).json({ error: "Meta signup session is invalid or expired", code: "META_SIGNUP_STATE_INVALID" });
}
function createMetaSignupHandlers({ store, signupService, connectionRepository, stateRepository, ttlMs = 600000 }) {
  if (!store || !signupService || !connectionRepository || !stateRepository) {
    throw new TypeError("Meta signup dependencies, including durable state storage, are required");
  }
  async function start(req, res) {
    if (!authenticated(req)) return res.status(401).json({ error: "Please sign in" });
    const { workspaceId, label: inputLabel } = req.body || {};
    const label = typeof inputLabel === "string" ? inputLabel.trim() : "";
    if (typeof workspaceId !== "string" || !workspaceId || label.length < 2 || label.length > 200) {
      return res.status(400).json({ error: "Valid workspace and number label are required" });
    }
    try {
      if (!await store.canManageWorkspace(req.user, workspaceId)) return res.status(404).json({ error: "Workspace not found" });
      const state = crypto.randomBytes(32).toString("base64url");
      const { expiresAt } = await stateRepository.create({ state, sessionId: req.sessionID, actorId: req.user.id, workspaceId, label, ttlMs });
      return res.status(201).json({ state, expiresAt });
    } catch (error) { return sendFailure(res, error); }
  }
  async function complete(req, res) {
    if (!authenticated(req)) return res.status(401).json({ error: "Please sign in" });
    const body = req.body || {};
    if (!validState(body.state)) return invalidState(res);
    try {
      // Session objects are not the replay authority: claim commits before external I/O.
      const pending = await stateRepository.consume({ state: body.state, sessionId: req.sessionID, actorId: req.user.id });
      if (!pending) return invalidState(res);
      if (!await store.canManageWorkspace(req.user, pending.workspaceId)) return res.status(404).json({ error: "Workspace not found" });
      const verified = await signupService.exchangeAndVerify({ code: body.code, businessAccountId: body.businessAccountId, phoneNumberId: body.phoneNumberId });
      if (!verified.displayPhoneNumber) return res.status(422).json({ error: "Meta did not return a display phone number", code: "META_DISPLAY_PHONE_MISSING" });
      const installed = await connectionRepository.install({
        workspaceId: pending.workspaceId, label: pending.label, actorId: req.user.id,
        phone: verified.displayPhoneNumber, phoneNumberId: verified.phoneNumberId,
        businessAccountId: verified.businessAccountId, accessToken: verified.accessToken,
      });
      // Audit is atomic inside install(), never via the legacy snapshot store.
      return res.status(201).json({
        connection: { id: installed.connection.id, workspaceId: pending.workspaceId,
          provider: "whatsapp_cloud", label: pending.label, status: installed.connection.status, hasCredentials: true },
        number: { id: installed.number.id, workspaceId: pending.workspaceId, label: pending.label,
          phone: installed.number.phone, providerConnectionId: installed.connection.id, automationEnabled: false },
      });
    } catch (error) { return sendFailure(res, error); }
  }
  return { start, complete };
}
module.exports = { createMetaSignupHandlers };
