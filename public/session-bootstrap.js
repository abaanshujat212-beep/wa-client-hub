(() => {
  const SESSION_TIMEOUT_MS = 10000;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = function sessionAwareFetch(input, init = {}) {
    const requestUrl = typeof input === "string" ? input : input?.url || "";
    if (!/\/api\/session(?:[?#]|$)/.test(requestUrl) || init.signal) return nativeFetch(input, init);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
    return nativeFetch(input, { ...init, signal: controller.signal })
      .catch((error) => {
        if (error?.name === "AbortError") {
          const timeoutError = new Error("The session request timed out. Check PostgreSQL health, then refresh.");
          timeoutError.name = "SessionTimeoutError";
          throw timeoutError;
        }
        throw error;
      })
      .finally(() => window.clearTimeout(timer));
  };
})();
