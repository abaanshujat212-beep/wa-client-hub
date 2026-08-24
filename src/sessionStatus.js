function accountSessionStatus(account, launcherStatus) {
  if (launcherStatus.running) return "running";
  if (launcherStatus.profileCreated && account.lastLaunchedAt) return "linked_or_needs_check";
  if (launcherStatus.profileCreated) return "profile_created";
  return "needs_qr_scan";
}

function statusLabel(status) {
  return {
    running: "Running",
    linked_or_needs_check: "Linked / needs check",
    profile_created: "Profile created",
    needs_qr_scan: "Needs QR scan"
  }[status] || "Unknown";
}

module.exports = { accountSessionStatus, statusLabel };
