const state = { csrf: "", user: null, users: [], accounts: [] };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", "x-csrf-token": state.csrf, ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3000);
}

function showAuth(authenticated) {
  $("#loginView").classList.toggle("hidden", authenticated);
  $("#appView").classList.toggle("hidden", !authenticated);
}

function applyUser() {
  const admin = state.user.role === "admin";
  $("#userName").textContent = state.user.name;
  $("#userRole").textContent = state.user.role;
  $("#userInitial").textContent = state.user.name.charAt(0).toUpperCase();
  $$(".admin-only").forEach((el) => el.classList.toggle("hidden", !admin));
}

function switchView(name) {
  $$(".view").forEach((view) => view.classList.add("hidden"));
  $(`#${name}View`).classList.remove("hidden");
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  const titles = { accounts: "WhatsApp workspaces", clients: "Client access", audit: "Audit log", guide: "Calling setup" };
  $("#pageTitle").textContent = titles[name];
  $(".sidebar").classList.remove("open");
}

async function loadUsers() {
  if (state.user.role !== "admin") return;
  const body = await api("/api/users");
  state.users = body.users;
  const clients = state.users.filter((user) => user.role === "client");
  $("#ownerSelect").innerHTML = clients.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("");
  $("#clientsList").innerHTML = clients.length ? clients.map((user) => `
    <div class="client-row">
      <div><strong>${escapeHtml(user.name)}</strong><small>Created ${formatDate(user.createdAt)}</small></div>
      <span>${escapeHtml(user.email)}</span>
      <span class="badge ${user.active ? "" : "off"}">${user.active ? "Active" : "Disabled"}</span>
      <button class="button secondary" data-reset-pass="${user.id}" type="button">Reset password</button>
      <button class="button ${user.active ? "danger" : "secondary"}" data-toggle-user="${user.id}" data-active="${!user.active}" type="button">${user.active ? "Disable" : "Enable"}</button>
    </div>`).join("") : `<div class="empty">No clients yet.</div>`;
}

async function loadAccounts() {
  const body = await api("/api/accounts");
  state.accounts = body.accounts;
  $("#accountsGrid").innerHTML = state.accounts.length ? state.accounts.map((account) => `
    <article class="workspace-card">
      <div class="workspace-head"><span class="wa-icon">W</span><span class="live-dot">${account.running ? "Running" : "Closed"}</span></div>
      <h4>${escapeHtml(account.label)}</h4>
      <div class="phone">${escapeHtml(account.phone)}</div>
      ${state.user.role === "admin" ? `<div class="owner">Client: ${escapeHtml(account.ownerName)}</div>` : ""}
      <div class="workspace-actions">
        <button class="button primary" data-launch="${account.id}">${account.profileCreated ? "Open WhatsApp" : "Link account"}</button>
        ${account.running ? `<button class="button danger" data-close="${account.id}">Close</button>` : ""}
        <button class="button secondary" data-remove-account="${account.id}" type="button">Remove</button>
      </div>
    </article>`).join("") : `<div class="empty"><strong>No WhatsApp workspace yet.</strong><br>Add one to create an isolated browser profile.</div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
function formatDate(value) { return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value)); }

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const body = await api("/api/login", { method: "POST", body: JSON.stringify(data) });
    state.user = body.user; state.csrf = body.csrfToken; showAuth(true); applyUser();
    await Promise.all([loadUsers(), loadAccounts()]);
  } catch (error) { toast(error.message); }
});

$("#logoutButton").addEventListener("click", async () => { await api("/api/logout", { method: "POST" }); location.reload(); });
$("#showAccountForm").addEventListener("click", () => $("#accountForm").classList.toggle("hidden"));
$("#showClientForm").addEventListener("click", () => $("#clientForm").classList.toggle("hidden"));
$("#refreshAccounts").addEventListener("click", loadAccounts);
$("#menuButton").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
document.querySelectorAll('.nav-item').forEach(function(item){ item.addEventListener("click", function(){ switchView(item.dataset.view); }); });

$("#accountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api("/api/accounts", { method: "POST", body: JSON.stringify(data) });
    event.currentTarget.reset(); event.currentTarget.classList.add("hidden"); await loadAccounts(); toast("Workspace created");
  } catch (error) { toast(error.message); }
});

$("#clientForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api("/api/users", { method: "POST", body: JSON.stringify(data) });
    event.currentTarget.reset(); event.currentTarget.classList.add("hidden"); await loadUsers(); toast("Client login created");
  } catch (error) { toast(error.message); }
});

document.addEventListener("click", async (event) => {
  const launch = event.target.closest("[data-launch]");
  const close = event.target.closest("[data-close]");
  const toggle = event.target.closest("[data-toggle-user]");
  const remove = event.target.closest("[data-remove-account]");
  const resetPass = event.target.closest("[data-reset-pass]");
  try {
    if (launch) { launch.disabled = true; await api(`/api/accounts/${launch.dataset.launch}/launch`, { method: "POST" }); toast("WhatsApp opened on the Windows desktop"); await loadAccounts(); }
    if (close) { await api(`/api/accounts/${close.dataset.close}/close`, { method: "POST" }); await loadAccounts(); }
    if (remove) { if (!confirm("Remove this workspace and browser profile?")) return; await api("/api/accounts/" + remove.dataset.removeAccount, { method: "DELETE" }); toast("Workspace removed"); await loadAccounts(); }
    if (toggle) { await api(`/api/users/${toggle.dataset.toggleUser}`, { method: "PATCH", body: JSON.stringify({ active: toggle.dataset.active === "true" }) }); await loadUsers(); }
    if (resetPass) { const newPassword = prompt("New client password - minimum 10 characters"); if(!newPassword) return; await api("/api/users/" + resetPass.dataset.resetPass + "/password", { method: "POST", body: JSON.stringify({ newPassword }) }); toast("Client password reset"); }
  } catch (error) { toast(error.message); if (launch) launch.disabled = false; }
});

(async function boot() {
  try {
    const body = await api("/api/session");
    state.csrf = body.csrfToken; state.user = body.user; $("#brandName").textContent = body.appName;
    showAuth(body.authenticated);
    if (body.authenticated) { applyUser(); await Promise.all([loadUsers(), loadAccounts()]); }
  } catch (error) { showAuth(false); toast("Could not connect to server"); }
})();



async function loadAudit(){
  if(!state.user || state.user.role !== "admin") return;
  const body = await api("/api/audit?limit=100");
  const rows = body.audit || [];
  const target = document.querySelector("#auditList");
  if(!target) return;
  target.innerHTML = rows.length ? rows.map(function(row){
    return "<div class=\"client-row audit-row\"><div><strong>" + escapeHtml(row.action) + "</strong><small>" + formatDate(row.createdAt) + " - " + escapeHtml(row.userName || row.userId || "system") + "</small></div><span class=\"audit-details\">" + escapeHtml(JSON.stringify(row.details || {})) + "</span></div>";
  }).join("") : "<div class=\"empty\">No audit logs yet.</div>";
}

document.querySelector("#refreshAudit")?.addEventListener("click", loadAudit);
document.querySelector("#changePasswordButton")?.addEventListener("click", async function(){ const currentPassword = prompt("Current password"); if(!currentPassword) return; const newPassword = prompt("New password - minimum 10 characters"); if(!newPassword) return; try { await api("/api/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }); toast("Password changed"); } catch(error){ toast(error.message); } });
document.querySelectorAll(".nav-item").forEach(function(item){ item.addEventListener("click", function(){ if(item.dataset.view === "audit") loadAudit(); }); });
