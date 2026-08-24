const fs = require("node:fs");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");

class BrowserLauncher {
  constructor(rootDir) {
    this.profileRoot = path.join(rootDir, "runtime", "chrome-profiles");
    this.instances = new Map();
    fs.mkdirSync(this.profileRoot, { recursive: true });
  }

  browserPath() {
    const candidates = [
      process.env.BROWSER_PATH,
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe")
    ].filter(Boolean);
    return candidates.find((candidate) => fs.existsSync(candidate));
  }

  profilePath(ownerId, accountId) {
    return path.join(this.profileRoot, ownerId, accountId);
  }

  status(account) {
    const instance = this.instances.get(account.id);
    return {
      running: Boolean(instance && !instance.exited),
      profileCreated: fs.existsSync(this.profilePath(account.ownerId, account.id))
    };
  }

  launch(account) {
    if (process.env.MOCK_BROWSER === "1") {
      this.instances.set(account.id, { pid: 99999, exited: false, mock: true });
      return { pid: 99999, mocked: true };
    }
    if (process.platform !== "win32") {
      throw new Error("WhatsApp browser launching is supported on Windows only");
    }
    const executable = this.browserPath();
    if (!executable) throw new Error("Google Chrome or Microsoft Edge was not found");

    const existing = this.instances.get(account.id);
    if (existing && !existing.exited) return { pid: existing.pid, alreadyRunning: true };

    const profileDir = this.profilePath(account.ownerId, account.id);
    fs.mkdirSync(profileDir, { recursive: true });
    const child = spawn(executable, [
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--start-maximized",
      "--app=https://web.whatsapp.com/"
    ], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    const instance = { pid: child.pid, exited: false };
    child.once("exit", () => { instance.exited = true; });
    child.unref();
    this.instances.set(account.id, instance);
    return { pid: child.pid };
  }


  async removeProfile(account) {
    await this.close(account.id).catch(() => false);
    const profileDir = this.profilePath(account.ownerId, account.id);
    fs.rmSync(profileDir, { recursive: true, force: true });
    this.instances.delete(account.id);
    return true;
  }
  async close(accountId) {
    const instance = this.instances.get(accountId);
    if (!instance || instance.exited) return false;
    if (instance.mock) {
      instance.exited = true;
      return true;
    }
    await new Promise((resolve, reject) => {
      if (process.platform === "win32") {
        execFile("taskkill", ["/PID", String(instance.pid), "/T", "/F"], (error) => error ? reject(error) : resolve());
      } else {
        try { process.kill(-instance.pid, "SIGTERM"); resolve(); } catch (error) { reject(error); }
      }
    });
    instance.exited = true;
    return true;
  }
}

module.exports = BrowserLauncher;

