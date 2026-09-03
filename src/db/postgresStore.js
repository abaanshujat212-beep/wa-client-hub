const fs = require('node:fs');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { AsyncLocalStorage } = require('node:async_hooks');
const Store = require('../store');
const PostgresRepository = require('./postgresRepository');

class PostgresStore extends Store {
  constructor(rootDir, options = {}) {
    super(rootDir);
    this.repository = options.repository || new PostgresRepository(options);
    this._initializing = false;
    this.mutationContext = new AsyncLocalStorage();
    this.mutationTail = Promise.resolve();
    this.driver = 'postgres';
  }

  persist() {
    if (!this._initializing && !this.mutationContext.getStore()) throw new Error('Direct persist is not supported by PostgreSQL store');
  }

  async init({ adminEmail, adminPassword }) {
    await this.repository.init();
    this.data = await this.repository.loadLegacyState();
    this._initializing = true;
    try { await super.migrate(); } finally { this._initializing = false; }

    if (!this.data.users.length && fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this._initializing = true;
      try { await super.migrate(); } finally { this._initializing = false; }
    }
    if (!this.data.users.some((user) => user.role === 'admin')) {
      this.data.users.push({ id: crypto.randomUUID(), name: 'Administrator', email: adminEmail.toLowerCase(), passwordHash: await bcrypt.hash(adminPassword, 12), role: 'admin', active: true, createdAt: new Date().toISOString() });
    }
    await this.repository.replaceLegacyState(this.data, { requireEmpty: false });
  }

  async close() { await this.repository.close(); }

  async _mutate(method, args) {
    if (this.mutationContext.getStore()) return Store.prototype[method].apply(this, args);
    const operation = this.mutationTail.then(() => this.mutationContext.run(true, async () => {
      const before = structuredClone(this.data);
      try {
        const result = await Store.prototype[method].apply(this, args);
        await this.repository.replaceLegacyState(this.data, { requireEmpty: false });
        return result;
      } catch (error) {
        this.data = before;
        throw error;
      }
    }));
    this.mutationTail = operation.catch(() => {});
    return operation;
  }
}

for (const method of ['createClient', 'changePassword', 'resetPassword', 'setUserActive', 'createWorkspace', 'updateWorkspace', 'addWorkspaceMember', 'updateWorkspaceMember', 'removeWorkspaceMember', 'createInvite', 'acceptInvite', 'createAccount', 'deleteAccount', 'touchAccount', 'addAudit']) {
  PostgresStore.prototype[method] = function(...args) { return this._mutate(method, args); };
}

module.exports = PostgresStore;
