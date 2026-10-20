/**
 * @file SettingModel.gs
 * Definisi tetapan runtime. `minRole` = peranan minimum untuk MENGUBAH tetapan.
 * Tetapan kritikal keselamatan hanya boleh diubah SUPER_ADMIN.
 * `public: true` → didedahkan kepada frontend (tiada rahsia di sini).
 */
const SETTINGS_DEFS = Object.freeze({
  SYSTEM_NAME: { type: 'string', default: 'Kirim Doa', max: 60, minRole: 'ADMIN', public: true, description: 'Nama sistem' },
  SYSTEM_TAGLINE: { type: 'string', default: 'Doa anda, cahaya hati', max: 120, minRole: 'ADMIN', public: true, description: 'Slogan' },
  LANDING_MESSAGE: {
    type: 'text', default: 'Anda bakal jemaah Haji/Umrah? Daftar dan agihkan pautan anda kepada orang tersayang sebelum berangkat ke Tanah Suci.',
    max: 400, minRole: 'ADMIN', public: true, description: 'Mesej halaman utama'
  },
  ORG_NAME: { type: 'string', default: '', max: 120, minRole: 'ADMIN', public: true, description: 'Nama organisasi (footer)' },
  ALLOW_REGISTRATION: { type: 'bool', default: true, minRole: 'SUPER_ADMIN', public: true, description: 'Benarkan pendaftaran baharu' },
  ALLOW_ANONYMOUS: { type: 'bool', default: true, minRole: 'SUPER_ADMIN', public: true, description: 'Benarkan doa tanpa nama' },
  ALLOW_PUBLIC_SUBMISSION: { type: 'bool', default: true, minRole: 'SUPER_ADMIN', public: true, description: 'Benarkan orang awam hantar doa melalui pautan Kumpul Doa' },
  MAINTENANCE_MODE: { type: 'bool', default: false, minRole: 'SUPER_ADMIN', public: true, description: 'Mod penyelenggaraan (hanya admin boleh akses)' },
  MAX_ATTACHMENT_MB: { type: 'int', default: 5, min: 1, max: 20, minRole: 'SUPER_ADMIN', public: true, description: 'Saiz maksimum setiap lampiran (MB)' },
  MAX_ATTACHMENTS_PER_DOA: { type: 'int', default: 3, min: 0, max: 5, minRole: 'SUPER_ADMIN', public: true, description: 'Bilangan lampiran maksimum setiap doa' },
  ALLOWED_MIME_TYPES: {
    type: 'string', default: 'image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/mp4,audio/x-m4a',
    max: 400, minRole: 'SUPER_ADMIN', public: true, description: 'Jenis fail dibenarkan (dipisah koma)'
  },
  DOA_MIN_LENGTH: { type: 'int', default: 10, min: 1, max: 200, minRole: 'ADMIN', public: true, description: 'Panjang minimum isi doa' },
  DOA_MAX_LENGTH: { type: 'int', default: 2000, min: 100, max: 10000, minRole: 'ADMIN', public: true, description: 'Panjang maksimum isi doa' },
  DEFAULT_PAGE_SIZE: { type: 'int', default: 20, min: 5, max: 100, minRole: 'ADMIN', public: true, description: 'Saiz halaman senarai' },
  KADAR_SAR_RM: { type: 'string', default: '1.18', max: 10, minRole: 'ADMIN', public: true, description: 'Planner Umrah: kadar tukaran 1 SAR = ? RM (anggaran perbelanjaan)' },
  NOTIFY_EMAIL_ENABLED: { type: 'bool', default: false, minRole: 'ADMIN', public: false, description: 'Hantar email apabila doa diterima melalui pautan' },
  ADMIN_EMAIL: { type: 'string', default: '', max: 254, minRole: 'SUPER_ADMIN', public: false, description: 'Email pentadbir untuk maklum balas & amaran' }
});

const SettingModel = {
  /** Tukar nilai string sheet kepada jenis sebenar. */
  parse: function (def, raw) {
    if (raw === undefined || raw === null || raw === '') return def.default;
    if (def.type === 'bool') return String(raw).toUpperCase() === 'TRUE';
    if (def.type === 'int') {
      const n = parseInt(raw, 10);
      return isFinite(n) ? n : def.default;
    }
    return String(raw);
  },

  serialize: function (def, value) {
    if (def.type === 'bool') return value ? 'TRUE' : 'FALSE';
    return String(value);
  },

  /** Peraturan Validator untuk satu tetapan. */
  rule: function (key, def) {
    if (def.type === 'bool') return { type: 'boolean', label: key };
    if (def.type === 'int') return { type: 'int', min: def.min, max: def.max, label: key };
    return { type: def.type === 'text' ? 'text' : 'string', max: def.max, label: key };
  }
};
