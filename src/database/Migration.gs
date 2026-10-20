/**
 * @file Migration.gs
 * Migrasi berversi, idempoten, direkod dalam sheet MIGRATIONS.
 *
 * Menambah migrasi baharu:
 *   1. Tambah objek { id:'MIGRATION_00N', description, up: function(){...} } di hujung LIST.
 *   2. `up` MESTI idempoten (selamat jika dijalankan semula) dan TIDAK menulis ganti data sedia ada.
 *   3. Jalankan runMigration({dryRun:true}) dahulu, kemudian runMigration().
 */
const Migration = {
  LIST: [
    {
      id: 'MIGRATION_001',
      description: 'Cipta semua sheet & header asas',
      up: function () {
        return Object.keys(SCHEMA).map(function (k) { return SheetManager.ensure(k); });
      }
    },
    {
      id: 'MIGRATION_002',
      description: 'Seed kategori lalai',
      up: function () { return { added: SeedData.categories() }; }
    },
    {
      id: 'MIGRATION_003',
      description: 'Seed tetapan lalai',
      up: function () { return { added: SeedData.settings() }; }
    },
    {
      id: 'MIGRATION_004',
      description: 'DOAS: lajur prayed_at & sender_email (fungsi "telah dibacakan")',
      up: function () { return SheetManager.ensure('DOAS'); }
    },
    {
      id: 'MIGRATION_005',
      description: 'DOAS: lajur sender_phone (butang WhatsApp "telah dibacakan")',
      up: function () { return SheetManager.ensure('DOAS'); }
    },
    {
      id: 'MIGRATION_006',
      description: 'Kategori: hanya "Umum" aktif; kategori lain disembunyikan (boleh diaktifkan semula)',
      up: function () { return SeedData.onlyDefaultCategory(); }
    },
    {
      id: 'MIGRATION_007',
      description: 'Sheet PUSH_TOKENS (notifikasi telefon)',
      up: function () { return SheetManager.ensure('PUSH_TOKENS'); }
    },
    {
      id: 'MIGRATION_008',
      description: 'Planner Umrah: sheet UMRAH_SEMAK, UMRAH_BELANJA, UMRAH_JADUAL',
      up: function () { return ['UMRAH_SEMAK', 'UMRAH_BELANJA', 'UMRAH_JADUAL'].map(function (k) { return SheetManager.ensure(k); }); }
    },
    {
      id: 'MIGRATION_009',
      description: 'Planner Umrah: sheet UMRAH_PROFIL (tarikh berlepas) + lajur UMRAH_SEMAK.offset_hari',
      up: function () { return ['UMRAH_PROFIL', 'UMRAH_SEMAK'].map(function (k) { return SheetManager.ensure(k); }); }
    },
    {
      id: 'MIGRATION_010',
      description: 'Planner Umrah: lajur peringatan harian dalam UMRAH_PROFIL',
      up: function () { return SheetManager.ensure('UMRAH_PROFIL'); }
    }
  ],

  applied: function () {
    const ss = Database.open();
    if (!ss.getSheetByName(SCHEMA.MIGRATIONS.sheet)) return {};
    const out = {};
    Repo.of('MIGRATIONS').all().forEach(function (m) { out[m.migration_id] = m; });
    return out;
  },

  status: function () {
    try {
      const applied = Migration.applied();
      return Migration.LIST.map(function (m) {
        return { id: m.id, description: m.description, appliedAt: applied[m.id] ? applied[m.id].applied_at : '' };
      });
    } catch (e) {
      return [];
    }
  },

  /**
   * @param {{dryRun?:boolean}} options
   * @return {{applied:string[], pending:string[], log:Object[]}}
   */
  run: function (options) {
    const dryRun = !!(options && options.dryRun);
    // MIGRATIONS sheet sendiri mesti wujud dahulu
    if (!dryRun) SheetManager.ensure('MIGRATIONS');
    const done = Migration.applied();
    const pending = Migration.LIST.filter(function (m) { return !done[m.id]; });
    const log = [];
    if (dryRun) {
      return { applied: [], pending: pending.map(function (m) { return m.id; }), log: log, dryRun: true };
    }
    const actor = Migration.actor();
    const appliedIds = [];
    pending.forEach(function (m) {
      const started = Date.now();
      const result = Database.withLock(function () {
        Database.resetRequestCache(); // header mungkin berubah
        return m.up();
      });
      Repo.of('MIGRATIONS').insert({ migration_id: m.id, description: m.description, applied_at: DateUtils.nowIso(), applied_by: actor });
      log.push({ id: m.id, ms: Date.now() - started, result: result });
      AppLogger.info('Migrasi digunakan', { id: m.id, ms: Date.now() - started });
      AuditService.log({ role: 'SYSTEM' }, AUDIT_ACTIONS.MIGRATION_APPLIED, 'DATABASE', m.id, m.description);
      appliedIds.push(m.id);
    });
    // Sentiasa pastikan skema terkini (lajur baharu) walaupun tiada migrasi tertunda
    if (!pending.length) Object.keys(SCHEMA).forEach(function (k) { SheetManager.ensure(k); });
    Database.resetRequestCache();
    return { applied: appliedIds, pending: [], log: log };
  },

  actor: function () {
    try { return Session.getEffectiveUser().getEmail() || 'SYSTEM'; } catch (e) { return 'SYSTEM'; }
  }
};
