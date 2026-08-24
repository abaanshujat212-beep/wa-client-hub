const os = require("node:os");

function systemHealth(store, launcher) {
  const accounts = store.data.accounts || [];
  const runningAccounts = accounts.filter((account) => launcher.status(account).running).length;
  return {
    ok: true,
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    platform: process.platform,
    memory: {
      rss: process.memoryUsage().rss,
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      freeSystem: os.freemem(),
      totalSystem: os.totalmem()
    },
    counts: {
      users: store.data.users.length,
      workspaces: store.data.workspaces.length,
      whatsappNumbers: accounts.length,
      runningWhatsappNumbers: runningAccounts,
      invites: (store.data.invites || []).length,
      auditEvents: store.data.audit.length
    }
  };
}

module.exports = { systemHealth };
