function adminSummary(store, launcher) {
  const workspaces = store.data.workspaces || [];
  const accounts = store.data.accounts || [];
  const users = store.data.users || [];
  return {
    clients: users.filter((user) => user.role === "client").map((user) => {
      const ownedWorkspaces = workspaces.filter((workspace) => workspace.ownerId === user.id);
      const workspaceIds = new Set(ownedWorkspaces.map((workspace) => workspace.id));
      const clientAccounts = accounts.filter((account) => workspaceIds.has(account.workspaceId));
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        active: user.active,
        workspaces: ownedWorkspaces.length,
        whatsappNumbers: clientAccounts.length,
        runningWhatsappNumbers: clientAccounts.filter((account) => launcher.status(account).running).length,
        lastLaunchAt: clientAccounts.map((account) => account.lastLaunchedAt).filter(Boolean).sort().at(-1) || null,
        plans: [...new Set(ownedWorkspaces.map((workspace) => workspace.planId))]
      };
    })
  };
}

module.exports = { adminSummary };
