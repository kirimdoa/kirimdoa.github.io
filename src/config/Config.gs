/**
 * @file Config.gs
 * Konfigurasi aplikasi yang TIDAK sensitif. Satu sumber kebenaran.
 *
 * Rahsia (Spreadsheet ID, folder ID, pepper, form secret) TIDAK disimpan di sini —
 * lihat Environment.gs (PropertiesService).
 * Tetapan yang boleh diubah admin semasa runtime ada dalam SETTINGS_DEFS (models/SettingModel.gs).
 */
const CONFIG = Object.freeze({
  APP_NAME: 'Kirim Doa',
  TAGLINE: 'Doa anda, cahaya hati',
  VERSION: '1.7.1',
  TIMEZONE_FALLBACK: 'Asia/Kuala_Lumpur',

  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // Sesi
  SESSION_TTL_HOURS: 12,
  SESSION_REMEMBER_DAYS: 14,
  SESSION_CACHE_SECONDS: 21600, // had maksimum CacheService (6 jam)

  // Kata laluan (PBKDF2-HMAC-SHA256 + pepper). Boleh dinaikkan melalui Script Property PBKDF2_ITERATIONS.
  PBKDF2_ITERATIONS_DEFAULT: 20000,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  LOGIN_MAX_FAILS: 5,
  LOGIN_LOCK_MINUTES: 15,
  RESET_CODE_TTL_MINUTES: 15,
  RESET_MAX_ATTEMPTS: 5,

  // Cache (saat)
  CACHE_TTL: Object.freeze({
    SETTINGS: 300,
    CATEGORIES: 600,
    PUBLIC_STATS: 300,
    USER: 300,
    ADMIN_STATS: 120,
    FOLDER: 21600
  }),

  LOCK_TIMEOUT_MS: 20000,
  IDEMPOTENCY_TTL_SECONDS: 600,
  MAX_REQUEST_CHARS: 30 * 1024 * 1024, // ~30MB JSON (lampiran base64)

  // Had perniagaan
  MAX_ACTIVE_RECIPIENT_LINKS: 5,
  EXPORT_MAX_DOAS: 300,
  TITLE_MAX: 120,
  NAME_MAX: 80,
  MESSAGE_MAX: 500,
  FEEDBACK_MAX: 1500,

  // Borang awam (anti-spam)
  PUBLIC_FORM_MIN_SECONDS: 3,
  PUBLIC_FORM_MAX_HOURS: 6,

  // Penyelenggaraan
  BACKUP_RETENTION: 30,
  SENDER_EMAIL_RETENTION_DAYS: 180,
  SENDER_PHONE_AFTER_PRAYED_DAYS: 30, // no. WhatsApp disimpan 30 hari selepas ditanda (untuk hantar semula) // email pilihan pengirim awam dipadam jika doa tidak ditanda dibacakan
  SYSTEM_LOG_MAX_ROWS: 5000,

  /**
   * Had kadar: [bilangan, tetingkap_saat]. Kunci identiti ditentukan oleh Router/Service.
   * Tiada alamat IP dalam GAS, jadi had dibuat per-email / per-pengguna / per-pautan + global.
   */
  RATE_LIMITS: Object.freeze({
    'auth.login': [10, 600],
    'auth.login.global': [300, 600],
    'auth.register': [5, 3600],
    'auth.register.global': [100, 3600],
    'auth.requestReset': [3, 3600],
    'auth.resetPassword': [10, 3600],
    'recipient.submit': [30, 3600],
    'recipient.submit.global': [300, 3600],
    'doa.create': [40, 3600],
    'public.feedback': [5, 3600],
    'public.feedback.global': [100, 3600],
    'export.pdf': [10, 3600],
    'umrah.write': [400, 3600],
    'attachment.get': [120, 3600],
    'push.register': [20, 3600],
    'push.test': [10, 3600]
  })
});
