const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");

class Store {
  constructor(rootDir) {
    this.dataDir = path.join(rootDir, "data");
    this.file = path.join(this.dataDir, "store.json");
    this.data = { users: [], accounts: [], audit: [] };
  }

  async init({ adminEmail, adminPassword }) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    }

    if (!this.data.users.some((user) => user.role === "admin")) {
      this.data.users.push({
        id: crypto.randomUUID(),
        name: "Administrator",
        email: adminEmail.toLowerCase(),
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: "admin",
        active: true,
        createdAt: new Date().toISOString()
      });
      this.persist();
    }
  }

  persist() {
    const tempFile = `${this.file}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tempFile, this.file);
  }

  publicUser(user) {
    const { passwordHash, ...safe } = user;
    return safe;
  }

  findUserByEmail(email) {
    return this.data.users.find((user) => user.email === email.toLowerCase());
  }

  findUser(id) {
    return this.data.users.find((user) => user.id === id);
  }

  listUsers() {
    return this.data.users.map((user) => this.publicUser(user));
  }

  async createClient({ name, email, password }) {
    if (this.findUserByEmail(email)) throw new Error("Email already exists");
    const user = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      role: "client",
      active: true,
      createdAt: new Date().toISOString()
    };
    this.data.users.push(user);
    this.persist();
    return this.publicUser(user);
  }


  async changePassword(id, currentPassword, newPassword) {
    const user = this.findUser(id);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) return false;
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    this.persist();
    return true;
  }

  async resetPassword(id, newPassword) {
    const user = this.findUser(id);
    if (!user || user.role === "admin") return null;
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    this.persist();
    return this.publicUser(user);
  }
  setUserActive(id, active) {
    const user = this.findUser(id);
    if (!user || user.role === "admin") return null;
    user.active = Boolean(active);
    this.persist();
    return this.publicUser(user);
  }

  listAccounts(user) {
    const rows = user.role === "admin"
      ? this.data.accounts
      : this.data.accounts.filter((account) => account.ownerId === user.id);
    return rows.map((account) => ({
      ...account,
      ownerName: this.findUser(account.ownerId)?.name || "Unknown"
    }));
  }

  findAccount(id) {
    return this.data.accounts.find((account) => account.id === id);
  }

  createAccount({ ownerId, label, phone }) {
    const owner = this.findUser(ownerId);
    if (!owner || owner.role !== "client") throw new Error("Valid client is required");
    const account = {
      id: crypto.randomUUID(),
      ownerId,
      label: label.trim(),
      phone: phone.trim(),
      createdAt: new Date().toISOString(),
      lastLaunchedAt: null
    };
    this.data.accounts.push(account);
    this.persist();
    return account;
  }


  deleteAccount(id) {
    const index = this.data.accounts.findIndex((account) => account.id === id);
    if (index === -1) return null;
    const account = this.data.accounts[index];
    this.data.accounts.splice(index, 1);
    this.persist();
    return account;
  }
  touchAccount(id) {
    const account = this.findAccount(id);
    if (!account) return null;
    account.lastLaunchedAt = new Date().toISOString();
    this.persist();
    return account;
  }


  listAudit(limit = 100) {
    return this.data.audit.slice(0, Math.min(Number(limit) || 100, 500)).map((row) => ({
      ...row,
      userName: this.findUser(row.userId)?.name || "Unknown"
    }));
  }
  addAudit(userId, action, details = {}) {
    this.data.audit.unshift({
      id: crypto.randomUUID(),
      userId,
      action,
      details,
      createdAt: new Date().toISOString()
    });
    this.data.audit = this.data.audit.slice(0, 500);
    this.persist();
  }
}

module.exports = Store;



