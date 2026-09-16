function millisecondsSince(startedAt, now = process.hrtime.bigint()) {
  return Math.max(0, Number(now - startedAt) / 1e6);
}

function createServerTiming({ clock = () => process.hrtime.bigint() } = {}) {
  return function serverTiming(req, res, next) {
    const startedAt = clock();
    const originalWriteHead = res.writeHead;

    res.writeHead = function writeHeadWithServerTiming(...args) {
      if (!res.headersSent) {
        const duration = millisecondsSince(startedAt, clock()).toFixed(1);
        const current = res.getHeader('Server-Timing');
        const metric = `app;dur=${duration};desc="Application"`;
        res.setHeader('Server-Timing', current ? `${current}, ${metric}` : metric);
      }
      return originalWriteHead.apply(this, args);
    };

    next();
  };
}

module.exports = { createServerTiming, millisecondsSince };
