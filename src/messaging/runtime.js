const { CredentialVault } = require("../connectors/vault");
const { OpenWaClient } = require("../openwa/client");
const { CanonicalSendService } = require("./canonicalSendService");
const { MetaCloudApiAdapter } = require("./metaCloudApiAdapter");
const { OpenWaMessagingAdapter } = require("./openWaAdapter");
const { ProviderCredentialRepository } = require("./providerCredentialRepository");
const { MessagingRepository } = require("./repository");

function createMessagingRuntime({ pool, events = null, audit = null, env = process.env, openWaClient = null, vault = null, fetchImpl = globalThis.fetch }) {
  if (!pool) throw new TypeError("pool is required");
  const credentialVault = vault || new CredentialVault({ env });
  const credentialResolver = new ProviderCredentialRepository(pool, credentialVault);
  return new CanonicalSendService({
    repository: new MessagingRepository(pool),
    adapters: {
      openwa: new OpenWaMessagingAdapter(openWaClient || new OpenWaClient()),
      whatsapp_cloud: new MetaCloudApiAdapter({ credentialResolver, graphVersion: env.META_GRAPH_VERSION, fetchImpl })
    },
    events,
    audit
  });
}
module.exports = { createMessagingRuntime };
