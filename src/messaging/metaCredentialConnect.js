const { MetaGraphClient } = require('./metaGraphClient');

function validCredentials(body) {
  return Boolean(body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).every(key => ['workspaceId', 'phoneNumberId', 'businessAccountId', 'accessToken'].includes(key)) &&
    typeof body.workspaceId === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(body.workspaceId) &&
    ['phoneNumberId', 'businessAccountId'].every(key => typeof body[key] === 'string' && /^\d{1,64}$/.test(body[key])) &&
    typeof body.accessToken === 'string' && /^[\x21-\x7e]{20,4096}$/.test(body.accessToken));
}

class MetaCredentialConnect {
  constructor({ authorization, repository, graphClient, graphVersion }) {
    this.authorization = authorization;
    this.repository = repository;
    this.graph = graphClient || new MetaGraphClient({ graphVersion });
  }
  async connect(actor, body) {
    if (!validCredentials(body)) throw Object.assign(new Error('Enter the phone number ID, business account ID and access token.'), { status: 400 });
    if (!await this.authorization.canManageWorkspace(actor, body.workspaceId)) throw Object.assign(new Error('Workspace not found'), { status: 404 });
    // Verify membership through Meta, never trust a phone ID supplied by the browser.
    let after;
    let phone;
    for (let page = 0; page < 100; page++) {
      const result = await this.graph.request({ path: [body.businessAccountId, 'phone_numbers'], accessToken: body.accessToken,
        query: { fields: 'id,display_phone_number,verified_name', limit: 100, after } });
      phone = result?.data?.find(item => String(item.id) === body.phoneNumberId);
      if (phone) break;
      if (!result?.paging?.next || !result?.paging?.cursors?.after) break;
      if (after === result.paging.cursors.after) break;
      after = result.paging.cursors.after;
    }
    if (!phone) throw Object.assign(new Error('This phone number does not belong to the supplied WhatsApp Business Account, or the token cannot access it.'), { status: 400 });
    return this.repository.install({ ...body, actorId: actor.id, phone: phone.display_phone_number,
      label: phone.verified_name || 'WhatsApp connection', verifiedName: phone.verified_name });
  }
}
module.exports = { MetaCredentialConnect, validCredentials };
