/**
 * @file Controllers.gs
 * Pengawal NIPIS: terima (payload, ctx) → panggil service → pulang data.
 * Tiada logik perniagaan, tiada akses Sheets di sini. Kebenaran (RBAC) dikuatkuasa oleh Router
 * SEBELUM pengawal dipanggil; semakan pemilikan (IDOR) dibuat dalam service.
 */

const PublicController = {
  config: function () { return SettingsService.publicConfig(); },
  categories: function () { return CategoryService.listActive(); },
  feedback: function (p, ctx) { return FeedbackService.submit(ctx, p); }
};

const AuthController = {
  register: function (p, ctx) { return AuthService.register(p, ctx); },
  login: function (p, ctx) { return AuthService.login(p, ctx); },
  logout: function (p, ctx) { return AuthService.logout(ctx); },
  me: function (p, ctx) {
    return { user: UserService.me(ctx), unreadNotifications: NotificationService.unreadCount(ctx.userId) };
  },
  changePassword: function (p, ctx) { return AuthService.changePassword(ctx, p); },
  requestReset: function (p, ctx) { return AuthService.requestPasswordReset(p, ctx, false); },
  resetPassword: function (p, ctx) { return AuthService.resetPassword(p, ctx); }
};

const UserController = {
  updateProfile: function (p, ctx) { return UserService.updateProfile(ctx, p); },
  dashboard: function (p, ctx) { return DoaService.dashboard(ctx); }
};

const DoaController = {
  list: function (p, ctx) { return DoaService.list(ctx, p); },
  get: function (p, ctx) { return DoaService.get(ctx, p); },
  create: function (p, ctx) { return DoaService.create(ctx, p); },
  update: function (p, ctx) { return DoaService.update(ctx, p); },
  remove: function (p, ctx) { return DoaService.remove(ctx, p); },
  favorite: function (p, ctx) { return DoaService.toggleFavorite(ctx, p); },
  markRead: function (p, ctx) { return DoaService.markRead(ctx, p); },
  markPrayed: function (p, ctx) { return DoaService.markPrayed(ctx, p); },
  attachment: function (p, ctx) { return DoaService.getAttachment(ctx, p); }
};

const PushController = {
  status: function (p, ctx) { return PushService.status(ctx); },
  register: function (p, ctx) { return PushService.register(ctx, p); },
  unregister: function (p, ctx) { return PushService.unregister(ctx, p); },
  test: function (p, ctx) { return PushService.test(ctx); }
};

const RecipientController = {
  mine: function (p, ctx) { return RecipientService.listMine(ctx); },
  create: function (p, ctx) { return RecipientService.create(ctx, p); },
  update: function (p, ctx) { return RecipientService.update(ctx, p); },
  getPublic: function (p) { return RecipientService.getPublic(p); },
  submit: function (p, ctx) { return RecipientService.submit(ctx, p); }
};

/** Planner Umrah (1.7.0): senarai semak, perbelanjaan, jadual — semua data milik pengguna sendiri. */
const UmrahController = {
  semakList: function (p, ctx) { return UmrahService.semakList(ctx); },
  semakSeed: function (p, ctx) { return UmrahService.semakSeed(ctx, p); },
  semakSave: function (p, ctx) { return UmrahService.semakSave(ctx, p); },
  semakToggle: function (p, ctx) { return UmrahService.semakToggle(ctx, p); },
  semakDelete: function (p, ctx) { return UmrahService.remove(ctx, 'UMRAH_SEMAK', p); },
  berlepasSet: function (p, ctx) { return UmrahService.berlepasSet(ctx, p); },
  peringatanSet: function (p, ctx) { return UmrahService.peringatanSet(ctx, p); },
  peringatanTest: function (p, ctx) { return UmrahService.peringatanTest(ctx); },
  belanjaList: function (p, ctx) { return UmrahService.belanjaList(ctx); },
  belanjaSave: function (p, ctx) { return UmrahService.belanjaSave(ctx, p); },
  belanjaDelete: function (p, ctx) { return UmrahService.remove(ctx, 'UMRAH_BELANJA', p); },
  jadualList: function (p, ctx) { return UmrahService.jadualList(ctx); },
  jadualSave: function (p, ctx) { return UmrahService.jadualSave(ctx, p); },
  jadualDelete: function (p, ctx) { return UmrahService.remove(ctx, 'UMRAH_JADUAL', p); }
};

const NotificationController = {
  list: function (p, ctx) { return NotificationService.list(ctx, p); },
  markRead: function (p, ctx) { return NotificationService.markRead(ctx, p); },
  markAllRead: function (p, ctx) { return NotificationService.markAllRead(ctx); }
};

const ExportController = {
  pdf: function (p, ctx) { return PdfService.exportDoas(ctx, p); }
};

const AdminController = {
  stats: function () { return DashboardService.adminStats(); },
  report: function (p, ctx) { return DashboardService.report(ctx, p); },

  users: function (p) { return UserService.list(p); },
  userStatus: function (p, ctx) { return UserService.setStatus(ctx, p); },
  userRole: function (p, ctx) { return UserService.setRole(ctx, p); },
  userRevokeSessions: function (p, ctx) { return UserService.revokeSessions(ctx, p); },
  userSendReset: function (p, ctx) { return UserService.sendReset(ctx, p); },

  doas: function (p, ctx) { return DoaService.adminList(ctx, p); },
  doaStatus: function (p, ctx) { return DoaService.adminSetStatus(ctx, p); },

  categories: function () { return CategoryService.listAll(); },
  categoryCreate: function (p, ctx) { return CategoryService.create(ctx, p); },
  categoryUpdate: function (p, ctx) { return CategoryService.update(ctx, p); },

  broadcast: function (p, ctx) { return NotificationService.broadcast(ctx, p); },
  broadcastHistory: function () { return NotificationService.broadcastHistory(); },

  audit: function (p) { return AuditService.list(p); },

  feedback: function (p) { return FeedbackService.list(p); },
  feedbackStatus: function (p, ctx) { return FeedbackService.setStatus(ctx, p); },

  settings: function (p, ctx) { return SettingsService.listForAdmin(ctx.role); },
  settingsUpdate: function (p, ctx) { return SettingsService.update(ctx, p && p.changes); },

  health: function () { return HealthService.check(); },
  backup: function (p, ctx) { return BackupService.run(ctx); },
  migrationStatus: function () { return Migration.status(); },
  systemLogs: function () {
    return SystemLogRepository.recent(50).map(function (l) {
      return { errorId: l.error_id, level: l.level, action: l.action, message: l.message, createdAt: l.created_at };
    });
  }
};
