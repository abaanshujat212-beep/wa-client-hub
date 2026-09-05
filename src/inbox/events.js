const { EventEmitter } = require("node:events");

class InboxEvents {
  constructor() { this.emitter = new EventEmitter(); this.emitter.setMaxListeners(0); }
  publish(workspaceId, type, data = {}) { this.emitter.emit(String(workspaceId), { type, workspaceId, data, at: new Date().toISOString() }); }
  subscribe(workspaceIds, listener) {
    const ids = [...new Set(workspaceIds.map(String))];
    ids.forEach((id) => this.emitter.on(id, listener));
    return () => ids.forEach((id) => this.emitter.off(id, listener));
  }
}

module.exports = { InboxEvents };
