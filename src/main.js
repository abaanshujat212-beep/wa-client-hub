require('dotenv').config();
const serverModule = require('./server');
const { createMetaSignupRuntime } = require('./messaging/metaSignupRuntime');

// POST routes remain behind the factory's exact default-off switch. They are
// appended after the legacy GET fallback, which cannot consume these POSTs.
const metaSignup = createMetaSignupRuntime({ env: process.env, store: serverModule.store });
serverModule.app.use('/api/meta/signup', metaSignup.router);
// The legacy app parses JSON before this late composition point. Sanitize only
// signup parser failures here; preserve existing error behavior elsewhere.
serverModule.app.use((error, req, res, next) => {
  if (!req.path.startsWith('/api/meta/signup/')) return next(error);
  const large = error?.type === 'entity.too.large';
  return res.status(large ? 413 : 400).json({ error: large ? 'Signup request is too large' : 'Invalid signup request' });
});

async function runMain() {
  const server = await serverModule.start();
  metaSignup.start();
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    metaSignup.stop();
    await new Promise(resolve => server.close(resolve));
    await serverModule.dependencies.close();
    if (typeof serverModule.store.close === 'function') await serverModule.store.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}
if (require.main === module) runMain().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { ...serverModule, metaSignup, runMain };
