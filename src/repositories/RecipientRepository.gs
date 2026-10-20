/**
 * @file RecipientRepository.gs
 * Halaman "Kumpul Doa" (pautan kongsi untuk menerima doa).
 */
const RecipientRepository = {
  base: function () { return Repo.of('RECIPIENTS'); },

  findById: function (id) { return RecipientRepository.base().findById(id); },

  findByCode: function (code) {
    const c = String(code || '').toUpperCase();
    return RecipientRepository.base().findOne(function (r) { return r.share_code === c; });
  },

  byOwner: function (userId) {
    return RecipientRepository.base().find(function (r) { return r.owner_user_id === userId; });
  },

  all: function () { return RecipientRepository.base().all(); },

  insert: function (row) { return RecipientRepository.base().insert(row); },

  update: function (id, patch) {
    patch.updated_at = DateUtils.nowIso();
    return RecipientRepository.base().update(id, patch);
  }
};
