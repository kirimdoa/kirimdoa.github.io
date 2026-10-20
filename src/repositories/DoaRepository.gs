/**
 * @file DoaRepository.gs
 * Akses data doa, lampiran dan kegemaran.
 */
const DoaRepository = {
  base: function () { return Repo.of('DOAS'); },

  all: function () { return DoaRepository.base().all(); },

  findById: function (id) { return DoaRepository.base().findById(id); },

  /** Doa yang boleh dilihat pengguna: dihantar olehnya ATAU diterima olehnya. */
  visibleTo: function (userId, includeStatuses) {
    const statuses = includeStatuses || [DOA_STATUS.ACTIVE];
    return DoaRepository.base().find(function (d) {
      return statuses.indexOf(d.status) >= 0 && (d.sender_user_id === userId || d.recipient_user_id === userId);
    });
  },

  insert: function (doa) { return DoaRepository.base().insert(doa); },

  update: function (id, patch) {
    patch.updated_at = DateUtils.nowIso();
    return DoaRepository.base().update(id, patch);
  },

  updateMany: function (patchById) { return DoaRepository.base().updateMany(patchById); },

  count: function () { return DoaRepository.base().count(); }
};

const AttachmentRepository = {
  base: function () { return Repo.of('ATTACHMENTS'); },

  findById: function (id) { return AttachmentRepository.base().findById(id); },

  /** @param {string[]} doaIds */
  byDoaIds: function (doaIds) {
    const set = {};
    doaIds.forEach(function (id) { set[id] = true; });
    return AttachmentRepository.base().find(function (a) { return set[a.doa_id] && a.status === 'ACTIVE'; });
  },

  insertMany: function (rows) { return AttachmentRepository.base().insertMany(rows); }
};

const FavoriteRepository = {
  base: function () { return Repo.of('FAVORITES'); },

  byUser: function (userId) {
    return FavoriteRepository.base().find(function (f) { return f.user_id === userId; });
  },

  /** Set doa_id kegemaran pengguna. */
  doaIdSet: function (userId) {
    const set = {};
    FavoriteRepository.byUser(userId).forEach(function (f) { set[f.doa_id] = true; });
    return set;
  },

  find: function (userId, doaId) {
    return FavoriteRepository.base().findOne(function (f) { return f.user_id === userId && f.doa_id === doaId; });
  },

  /**
   * Togol kegemaran di bawah kunci — gabungan user_id+doa_id sentiasa unik.
   * @return {boolean} status kegemaran selepas togol
   */
  toggle: function (userId, doaId) {
    const repo = FavoriteRepository.base();
    return Database.withLock(function () {
      repo.invalidate(); // baca segar dalam kunci
      const existing = FavoriteRepository.find(userId, doaId);
      if (existing) {
        repo.hardDelete(existing.favorite_id);
        return false;
      }
      repo.insert({ favorite_id: IdUtils.generate('F'), user_id: userId, doa_id: doaId, created_at: DateUtils.nowIso() });
      return true;
    });
  }
};
