(() => {
  const SESSION_TIMEOUT_MS = 10000;
  const SESSION_ATTEMPTS = 2;

  function documentReady() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }

  function requestSession(attempt) {
    return new Promise((resolve, reject) => {
      const url = new URL("/api/bootstrap", window.location.href);
      if (attempt > 0) url.searchParams.set("_session_retry", String(Date.now()));
      const request = new XMLHttpRequest();
      request.open("GET", url.href, true);
      request.timeout = SESSION_TIMEOUT_MS;
      request.setRequestHeader("Accept", "application/json");
      request.onload = () => {
        let body = {};
        try { body = JSON.parse(request.responseText || "{}"); } catch {}
        if (request.status >= 200 && request.status < 300) resolve(body);
        else reject(new Error(body.error || `Session request failed (${request.status})`));
      };
      request.onerror = () => reject(new Error("The session request could not reach the server."));
      request.ontimeout = () => {
        const error = new Error("The session request timed out. Check PostgreSQL health, then refresh.");
        error.name = "SessionTimeoutError";
        reject(error);
      };
      request.send();
    });
  }

  window.fetchSession = async function fetchSession() {
    if (window.__SESSION_BOOTSTRAP__) return window.__SESSION_BOOTSTRAP__;
    await documentReady();
    let lastError;
    for (let attempt = 0; attempt < SESSION_ATTEMPTS; attempt += 1) {
      try { return await requestSession(attempt); }
      catch (error) { lastError = error; }
    }
    throw lastError || new Error("The session request failed.");
  };
})();
