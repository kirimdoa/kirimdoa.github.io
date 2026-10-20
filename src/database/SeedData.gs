/**
 * @file SeedData.gs
 * Data awal: kategori & tetapan lalai. Idempoten — hanya menambah yang tiada.
 */
const SeedData = {
  /** Kategori lalai (1.5.0): hanya "Umum" aktif — lihat MIGRATION_006. Lain-lain disimpan untuk diaktifkan semula oleh admin. */
  DEFAULT_CATEGORY: 'Umum',
  CATEGORIES: [
    ['Umum', 'General', 'hands'],
    ['Kesihatan', 'Health', 'heart'],
    ['Keluarga', 'Family', 'home'],
    ['Rezeki', 'Sustenance', 'coins'],
    ['Perjalanan', 'Travel', 'plane'],
    ['Ibadah', 'Worship', 'mosque'],
    ['Pelajaran', 'Education', 'book'],
    ['Kerjaya', 'Career', 'briefcase'],
    ['Perkahwinan', 'Marriage', 'rings'],
    ['Umrah / Haji', 'Umrah / Hajj', 'kaaba'],
    ['Untuk Sahabat', 'For Friends', 'users'],
    ['Untuk Ibu Bapa', 'For Parents', 'parents'],
    ['Lain-lain', 'Others', 'star']
  ],

  /** @return {number} bilangan kategori ditambah */
  /**
   * MIGRATION_006: pastikan "Umum" wujud & aktif; sembunyikan (INACTIVE) kategori lain.
   * Tiada data dipadam — doa lama kekal dengan kategori asal; admin boleh mengaktifkan semula di Panel → Kategori.
   */
  onlyDefaultCategory: function () {
    const name = SeedData.DEFAULT_CATEGORY.toLowerCase();
    const all = CategoryRepository.base().all();
    let umum = all.filter(function (c) { return c.name_ms.toLowerCase() === name; })[0];
    const now = DateUtils.nowIso();
    if (!umum) {
      umum = { category_id: IdUtils.generate('C'), name_ms: SeedData.DEFAULT_CATEGORY, name_en: 'General', description: 'Doa umum',
        icon: 'hands', sort_order: 5, status: CATEGORY_STATUS.ACTIVE, created_at: now, updated_at: now };
      CategoryRepository.base().insert(umum);
    }
    const patch = {};
    const hidden = [];
    all.forEach(function (c) {
      if (c.category_id === umum.category_id) {
        if (c.status !== CATEGORY_STATUS.ACTIVE) patch[c.category_id] = { status: CATEGORY_STATUS.ACTIVE, updated_at: now };
      } else if (c.status === CATEGORY_STATUS.ACTIVE) {
        patch[c.category_id] = { status: CATEGORY_STATUS.INACTIVE, updated_at: now };
        hidden.push(c.name_ms);
      }
    });
    CategoryRepository.base().updateMany(patch);
    AppCache.remove(CategoryRepository.CACHE_KEY);
    return { defaultCategory: umum.category_id, hidden: hidden };
  },

  categories: function () {
    const existing = {};
    CategoryRepository.base().all().forEach(function (c) { existing[c.name_ms.toLowerCase()] = true; });
    const now = DateUtils.nowIso();
    const rows = [];
    SeedData.CATEGORIES.forEach(function (c, i) {
      if (existing[c[0].toLowerCase()]) return;
      rows.push({
        category_id: IdUtils.generate('C'),
        name_ms: c[0], name_en: c[1], description: '', icon: c[2],
        sort_order: (i + 1) * 10, status: CATEGORY_STATUS.ACTIVE, created_at: now, updated_at: now
      });
    });
    CategoryRepository.insertMany(rows);
    return rows.length;
  },

  /** @return {number} bilangan tetapan ditambah */
  settings: function () {
    const existing = {};
    SettingsRepository.rows().forEach(function (r) { existing[r.setting_key] = true; });
    const values = {};
    const desc = {};
    Object.keys(SETTINGS_DEFS).forEach(function (k) {
      if (existing[k]) return;
      values[k] = SettingModel.serialize(SETTINGS_DEFS[k], SETTINGS_DEFS[k].default);
      desc[k] = SETTINGS_DEFS[k].description;
    });
    if (Object.keys(values).length) SettingsRepository.setMany(values, 'SYSTEM', desc);
    return Object.keys(values).length;
  }
};
