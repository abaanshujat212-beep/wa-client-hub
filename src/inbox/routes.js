const express = require('express');
const { createCanonicalSendHandler } = require('../messaging/http');
const { CanonicalSendService } = require('../messaging/canonicalSendService');
const { MessagingRepository } = require('../messaging/repository');
const { OpenWaMessagingAdapter } = require('../messaging/openWaAdapter');
const { OpenWaClient } = require('../openwa/client');

function createInboxRouter({ store, repository, events, requireAuth, sendService = null }) {
  const router = express.Router();
  const workspaceIds = (req) => store.listWorkspaces(req.user).map((workspace) => workspace.id);
  const fail = (res, error) => res.status(error.status || 400).json({ error: error.message });
  const canonicalSendService = sendService || new CanonicalSendService({
    repository: new MessagingRepository(repository.pool),
    adapters: { openwa: new OpenWaMessagingAdapter(new OpenWaClient()) },
    events,
    audit: (actorId, action, metadata) => store.addAudit(actorId, action, metadata)
  });

  router.use(requireAuth);

  router.get('/conversations', async (req, res) => {
    try {
      res.json(await repository.listConversations({ workspaceIds: workspaceIds(req), workspaceId: req.query.workspaceId, limit: req.query.limit, cursor: req.query.cursor, search: req.query.search, assignedUserId: req.query.assignedUserId, assignedTeamId: req.query.assignedTeamId, tag: req.query.tag, unreadOnly: req.query.unreadOnly === 'true', includeClosed: req.query.includeClosed === 'true' }));
    } catch (error) { fail(res, error); }
  });

  router.get('/conversations/:id/messages', async (req, res) => {
    try {
      res.json(await repository.getThread({ workspaceIds: workspaceIds(req), conversationId: req.params.id, limit: req.query.limit, before: req.query.before, after: req.query.after }));
    } catch (error) { fail(res, error); }
  });

  router.post('/conversations/:id/messages', createCanonicalSendHandler({ sendService: canonicalSendService, workspaceIds }));

  router.post('/conversations/:id/read', async (req, res) => {
    try {
      const result = await repository.markRead({ workspaceIds: workspaceIds(req), conversationId: req.params.id, userId: req.user.id, lastReadMessageId: req.body.lastReadMessageId });
      events.publish(result.workspace_id, 'conversation.read', { conversationId: result.id, userId: req.user.id });
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  });

  router.post('/conversations/:id/assignment', async (req, res) => {
    try {
      const result = await repository.assign({ workspaceIds: workspaceIds(req), conversationId: req.params.id, actorId: req.user.id, assignedUserId: req.body.assignedUserId, assignedTeamId: req.body.assignedTeamId });
      await store.addAudit(req.user.id, 'inbox.assignment.changed', { conversationId: req.params.id });
      events.publish(result.workspace_id, 'conversation.assignment', { conversationId: result.id });
      res.json(result);
    } catch (error) { fail(res, error); }
  });

  router.post('/conversations/:id/notes', async (req, res) => {
    try {
      const note = await repository.addNote({ workspaceIds: workspaceIds(req), conversationId: req.params.id, authorUserId: req.user.id, body: req.body.body });
      await store.addAudit(req.user.id, 'inbox.note.created', { conversationId: req.params.id, noteId: note.id });
      events.publish(note.workspace_id, 'conversation.note', { conversationId: note.conversation_id, noteId: note.id });
      res.status(201).json(note);
    } catch (error) { fail(res, error); }
  });

  router.post('/conversations/:id/tags', async (req, res) => {
    try {
      const tags = await repository.setTags({ workspaceIds: workspaceIds(req), conversationId: req.params.id, tags: req.body.tags, actorId: req.user.id });
      events.publish(tags[0]?.workspace_id || req.body.workspaceId, 'conversation.tags', { conversationId: req.params.id });
      res.json(tags);
    } catch (error) { fail(res, error); }
  });

  router.delete('/conversations/:id/tags/:tag', async (req, res) => {
    try {
      await repository.removeTag({ workspaceIds: workspaceIds(req), conversationId: req.params.id, tag: req.params.tag });
      res.status(204).end();
    } catch (error) { fail(res, error); }
  });

  router.post('/conversations/:id/manual-handoff', async (req, res) => {
    try {
      const result = await repository.setManualHandoff({ workspaceIds: workspaceIds(req), conversationId: req.params.id, manualHandoff: Boolean(req.body.manualHandoff) });
      await store.addAudit(req.user.id, 'inbox.manual_handoff.changed', { conversationId: req.params.id, manualHandoff: result.manual_handoff });
      events.publish(result.workspace_id, 'conversation.handoff', { conversationId: result.id, manualHandoff: result.manual_handoff });
      res.json(result);
    } catch (error) { fail(res, error); }
  });

  router.get('/events', (req, res) => {
    const ids = workspaceIds(req);
    if (req.query.workspaceId && !ids.includes(req.query.workspaceId)) return res.status(404).end();
    const requested = req.query.workspaceId ? [req.query.workspaceId] : ids;
    return events.subscribe(req, res, requested);
  });

  return router;
}

module.exports = { createInboxRouter };
