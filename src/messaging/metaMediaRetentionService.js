class MetaMediaRetentionService {
  constructor({ repository, mediaService, maxBatch = 100 } = {}) {
    if (!repository || typeof repository.listMediaCleanupCandidates !== 'function' || typeof repository.markMediaCleanupDeleted !== 'function' || typeof repository.markMediaCleanupFailure !== 'function') throw new TypeError('media retention repository is required');
    if (!mediaService || typeof mediaService.remove !== 'function') throw new TypeError('media service is required');
    this.repository = repository;
    this.mediaService = mediaService;
    this.maxBatch = Math.min(Math.max(Number(maxBatch) || 100, 1), 100);
  }

  async cleanup({ limit = this.maxBatch, now = new Date() } = {}) {
    const candidates = await this.repository.listMediaCleanupCandidates({ limit: Math.min(Math.max(Number(limit) || this.maxBatch, 1), this.maxBatch), now });
    let deleted = 0;
    let failed = 0;
    for (const candidate of candidates) {
      if (!candidate.accessToken) {
        await this.repository.markMediaCleanupFailure({ attachmentId: candidate.attachmentId, code: 'META_CREDENTIALS_UNAVAILABLE' });
        failed += 1;
        continue;
      }
      try {
        await this.mediaService.remove({ accessToken: candidate.accessToken, mediaId: candidate.providerMediaId });
        await this.repository.markMediaCleanupDeleted({ attachmentId: candidate.attachmentId });
        deleted += 1;
      } catch (error) {
        await this.repository.markMediaCleanupFailure({ attachmentId: candidate.attachmentId, code: error?.code || 'META_MEDIA_CLEANUP_FAILED' });
        failed += 1;
      }
    }
    return { examined: candidates.length, deleted, failed };
  }
}

module.exports = { MetaMediaRetentionService };
