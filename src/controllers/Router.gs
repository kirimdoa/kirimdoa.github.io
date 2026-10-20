/**
 * @file Router.gs
 * Satu-satunya pintu masuk API: api(request) di Code.gs → Router.dispatch().
 *
 * Setiap laluan MENGISYTIHARKAN peranan minimum. Router menguatkuasa:
 *   1. bentuk permintaan & saiz
 *   2. pengesahan sesi (token)
 *   3. RBAC
 *   4. mod penyelenggaraan
 *   5. pengendalian ralat seragam (tiada stack trace kepada pengguna)
 */
const Router = {
  routes: null,

  table: function () {
    if (Router.routes) return Router.routes;
    const P = ROLES.PUBLIC, U = ROLES.USER, A = ROLES.ADMIN, S = ROLES.SUPER_ADMIN;
    // allowInMaintenance: laluan yang tetap dibenarkan semasa mod penyelenggaraan
    Router.routes = {
      'public.config': { role: P, fn: PublicController.config, allowInMaintenance: true },
      'public.categories': { role: P, fn: PublicController.categories },
      'public.feedback': { role: P, fn: PublicController.feedback },

      'auth.register': { role: P, fn: AuthController.register },
      'auth.login': { role: P, fn: AuthController.login, allowInMaintenance: true },
      'auth.logout': { role: U, fn: AuthController.logout, allowInMaintenance: true },
      'auth.me': { role: U, fn: AuthController.me, allowInMaintenance: true },
      'auth.changePassword': { role: U, fn: AuthController.changePassword },
      'auth.requestReset': { role: P, fn: AuthController.requestReset },
      'auth.resetPassword': { role: P, fn: AuthController.resetPassword },

      'user.updateProfile': { role: U, fn: UserController.updateProfile },
      'user.dashboard': { role: U, fn: UserController.dashboard },
      'user.home': { role: U, fn: UserController.home },

      'doa.list': { role: U, fn: DoaController.list },
      'doa.get': { role: U, fn: DoaController.get },
      'doa.create': { role: U, fn: DoaController.create },
      'doa.update': { role: U, fn: DoaController.update },
      'doa.delete': { role: U, fn: DoaController.remove },
      'doa.favorite': { role: U, fn: DoaController.favorite },
      'doa.markRead': { role: U, fn: DoaController.markRead },
      'doa.markPrayed': { role: U, fn: DoaController.markPrayed },
      'push.status': { role: U, fn: PushController.status, allowInMaintenance: true },
      'push.register': { role: U, fn: PushController.register, allowInMaintenance: true },
      'push.unregister': { role: U, fn: PushController.unregister, allowInMaintenance: true },
      'push.test': { role: U, fn: PushController.test },
      'doa.attachment': { role: U, fn: DoaController.attachment },

      'recipient.mine': { role: U, fn: RecipientController.mine },
      'recipient.create': { role: U, fn: RecipientController.create },
      'recipient.update': { role: U, fn: RecipientController.update },
      'recipient.public': { role: P, fn: RecipientController.getPublic },
      'recipient.submit': { role: P, fn: RecipientController.submit },

      'umrah.semak.list': { role: U, fn: UmrahController.semakList },
      'umrah.semak.seed': { role: U, fn: UmrahController.semakSeed },
      'umrah.semak.save': { role: U, fn: UmrahController.semakSave },
      'umrah.semak.toggle': { role: U, fn: UmrahController.semakToggle },
      'umrah.semak.delete': { role: U, fn: UmrahController.semakDelete },
      'umrah.berlepas.set': { role: U, fn: UmrahController.berlepasSet },
      'umrah.peringatan.set': { role: U, fn: UmrahController.peringatanSet },
      'umrah.peringatan.test': { role: U, fn: UmrahController.peringatanTest },
      'umrah.belanja.list': { role: U, fn: UmrahController.belanjaList },
      'umrah.belanja.save': { role: U, fn: UmrahController.belanjaSave },
      'umrah.belanja.delete': { role: U, fn: UmrahController.belanjaDelete },
      'umrah.jadual.list': { role: U, fn: UmrahController.jadualList },
      'umrah.jadual.save': { role: U, fn: UmrahController.jadualSave },
      'umrah.jadual.delete': { role: U, fn: UmrahController.jadualDelete },

      'notification.list': { role: U, fn: NotificationController.list },
      'notification.markRead': { role: U, fn: NotificationController.markRead },
      'notification.markAllRead': { role: U, fn: NotificationController.markAllRead },

      'export.pdf': { role: U, fn: ExportController.pdf },

      'admin.stats': { role: A, fn: AdminController.stats, allowInMaintenance: true },
      'admin.report': { role: A, fn: AdminController.report, allowInMaintenance: true },
      'admin.users': { role: A, fn: AdminController.users, allowInMaintenance: true },
      'admin.user.status': { role: A, fn: AdminController.userStatus, allowInMaintenance: true },
      'admin.user.role': { role: S, fn: AdminController.userRole, allowInMaintenance: true },
      'admin.user.revokeSessions': { role: A, fn: AdminController.userRevokeSessions, allowInMaintenance: true },
      'admin.user.sendReset': { role: A, fn: AdminController.userSendReset, allowInMaintenance: true },
      'admin.doas': { role: A, fn: AdminController.doas, allowInMaintenance: true },
      'admin.doa.status': { role: A, fn: AdminController.doaStatus, allowInMaintenance: true },
      'admin.categories': { role: A, fn: AdminController.categories, allowInMaintenance: true },
      'admin.category.create': { role: A, fn: AdminController.categoryCreate, allowInMaintenance: true },
      'admin.category.update': { role: A, fn: AdminController.categoryUpdate, allowInMaintenance: true },
      'admin.broadcast': { role: A, fn: AdminController.broadcast, allowInMaintenance: true },
      'admin.broadcastHistory': { role: A, fn: AdminController.broadcastHistory, allowInMaintenance: true },
      'admin.audit': { role: A, fn: AdminController.audit, allowInMaintenance: true },
      'admin.feedback': { role: A, fn: AdminController.feedback, allowInMaintenance: true },
      'admin.feedback.status': { role: A, fn: AdminController.feedbackStatus, allowInMaintenance: true },
      'admin.settings': { role: A, fn: AdminController.settings, allowInMaintenance: true },
      'admin.settings.update': { role: A, fn: AdminController.settingsUpdate, allowInMaintenance: true }, // per-kunci disemak dalam service

      'admin.health': { role: S, fn: AdminController.health, allowInMaintenance: true },
      'admin.backup': { role: S, fn: AdminController.backup, allowInMaintenance: true },
      'admin.migrations': { role: S, fn: AdminController.migrationStatus, allowInMaintenance: true },
      'admin.systemLogs': { role: S, fn: AdminController.systemLogs, allowInMaintenance: true }
    };
    return Router.routes;
  },

  /**
   * @param {{action:string, payload?:Object, token?:string, meta?:{userAgent?:string}}} request
   * @return {Object} ApiResponse
   */
  dispatch: function (request) {
    /*
     * Idempotensi: klien menghantar meta.rid unik bagi setiap tindakan (sama untuk setiap cubaan semula).
     * Google kadangkala gagal menghantar jawapan walaupun skrip telah siap (HTTP 404 pada URL echo / tamat masa),
     * jadi klien mencuba semula — permintaan berulang mendapat jawapan asal, tindakan tidak dijalankan dua kali.
     */
    const rid = request && request.meta && typeof request.meta.rid === 'string' && /^[A-Za-z0-9_-]{12,64}$/.test(request.meta.rid) ? request.meta.rid : '';
    if (!rid) return Router.run(request);
    const key = 'rid:' + rid + ':' + SecurityUtils.shortHash(String(request.token || '-'));
    let hit = AppCache.get(key);
    for (let i = 0; hit && hit.pending && i < 40; i++) { Utilities.sleep(500); hit = AppCache.get(key); } // cubaan asal masih berjalan
    if (hit && hit.res) return hit.res;
    if (hit && hit.pending) return ApiResponse.fail(ERROR_CODES.BUSY, 'Permintaan anda sedang diproses. Sila tunggu sebentar.');
    AppCache.put(key, { pending: true }, 120);
    const res = Router.run(request);
    // Jawapan besar (cth. PDF) tidak muat dalam cache → buang penanda supaya cubaan semula dijalankan semula
    if (JSON.stringify(res).length < 90000) AppCache.put(key, { res: res }, 600); else AppCache.remove(key);
    return res;
  },

  run: function (request) {
    const started = Date.now();
    let action = '';
    try {
      Database.resetRequestCache();
      if (!request || typeof request !== 'object') throw Errors.badRequest();
      action = String(request.action || '');
      const route = Object.prototype.hasOwnProperty.call(Router.table(), action) ? Router.table()[action] : null;
      if (!route) throw Errors.badRequest('Tindakan tidak dikenali.');

      const payload = request.payload === undefined || request.payload === null ? {} : request.payload;
      if (typeof payload !== 'object' || Array.isArray(payload)) throw Errors.badRequest();
      if (JSON.stringify(payload).length > CONFIG.MAX_REQUEST_CHARS) throw Errors.validation('Permintaan terlalu besar.');

      const userAgent = request.meta && typeof request.meta.userAgent === 'string' ? request.meta.userAgent.slice(0, 200) : '';
      let ctx = { userId: '', role: ROLES.PUBLIC, user: null, sessionId: '', userAgent: userAgent };
      if (request.token) {
        const resolved = AuthService.resolveSession(String(request.token));
        if (resolved) ctx = Object.assign(ctx, resolved);
        else if (route.role !== ROLES.PUBLIC) throw Errors.unauthenticated();
      }

      SecurityService.requireRole(ctx, route.role);

      if (!route.allowInMaintenance && SettingsService.get('MAINTENANCE_MODE') && !SecurityService.hasRole(ctx.role, ROLES.ADMIN)) {
        throw Errors.maintenance();
      }

      const data = route.fn(payload, ctx);
      const res = ApiResponse.ok(data);
      res.meta.ms = Date.now() - started;
      return res;
    } catch (e) {
      const res = ErrorHandler.handle(e, { action: action });
      res.meta.ms = Date.now() - started;
      return res;
    }
  }
};
