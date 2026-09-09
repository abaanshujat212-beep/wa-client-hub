require('dotenv').config();
const serverModule = require('./server');
const { createMetaSignupRuntime } = require('./messaging/metaSignupRuntime');

const metaSignup = createMetaSignupRuntime({ env: process.env, store: serverModule.store });
serverModule.app.use('/api/meta/signup', metaSignup.router);
serverModule.app.use('/api/meta/connections', metaSignup.connectionsRouter);
serverModule.app.use((error, req, res, next) => {
  if (!req.path.startsWith('/api/meta/signup/') && !req.path.startsWith('/api/meta/connections/')) return next(error);
  const large = error?.type === 'entity.too.large';
  return res.status(large ? 413 : 400).json({ error: large ? 'Meta request is too large' : 'Invalid Meta request' });
});
async function runMain() {
  const server = await serverModule.start(); metaSignup.start(); let closing = false;
  const shutdown = async () => { if (closing) return; closing = true; metaSignup.stop(); await new Promise(resolve => server.close(resolve)); await serverModule.dependencies.close(); if (typeof serverModule.store.close === 'function') await serverModule.store.close(); process.exit(0); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown); return server;
}
if (require.main === module) runMain().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { ...serverModule, metaSignup, runMain };
