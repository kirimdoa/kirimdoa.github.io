/**
 * @file DashboardService.gs
 * KPI & carta papan pemuka admin (dicache 2 minit), laporan berjulat tarikh.
 */
const DashboardService = {
  adminStats: function () {
    return AppCache.remember('stats:admin', CONFIG.CACHE_TTL.ADMIN_STATS, DashboardService.computeAdminStats);
  },

  computeAdminStats: function () {
    const users = UserRepository.all();
    const doas = DoaRepository.all().filter(function (d) { return d.status !== DOA_STATUS.DELETED; });
    const cats = CategoryRepository.all();
    const today = DateUtils.dayKey(new Date());
    const month = DateUtils.monthKey(new Date());
    const activeCutoff = DateUtils.addDays(new Date(), -30).toISOString();

    const days = DateUtils.lastNDays(14);
    const months = DateUtils.lastNMonths(12);
    const byDay = DashboardService.zeroMap(days);
    const byMonth = DashboardService.zeroMap(months);
    const byCat = {};
    let anon = 0;
    doas.forEach(function (d) {
      const dk = DateUtils.dayKey(d.created_at);
      const mk = dk.slice(0, 7);
      if (byDay[dk] !== undefined) byDay[dk]++;
      if (byMonth[mk] !== undefined) byMonth[mk]++;
      byCat[d.category_id] = (byCat[d.category_id] || 0) + 1;
      if (d.is_anonymous) anon++;
    });

    const regMonths = DateUtils.lastNMonths(6);
    const regs = DashboardService.zeroMap(regMonths);
    users.forEach(function (u) {
      const mk = DateUtils.monthKey(u.created_at);
      if (regs[mk] !== undefined) regs[mk]++;
    });

    const activity = DashboardService.zeroMap(days);
    const logs = AuditRepository.all();
    logs.forEach(function (l) {
      const dk = DateUtils.dayKey(l.created_at);
      if (activity[dk] !== undefined) activity[dk]++;
    });
    const usersById = {};
    users.forEach(function (u) { usersById[u.user_id] = u; });

    return {
      kpi: {
        totalUsers: users.length,
        activeUsers: users.filter(function (u) { return u.status === USER_STATUS.ACTIVE && u.last_login_at && u.last_login_at >= activeCutoff; }).length,
        totalDoa: doas.length,
        doaToday: doas.filter(function (d) { return DateUtils.dayKey(d.created_at) === today; }).length,
        doaMonth: doas.filter(function (d) { return DateUtils.monthKey(d.created_at) === month; }).length,
        activeCategories: cats.filter(function (c) { return c.status === CATEGORY_STATUS.ACTIVE; }).length,
        anonymousDoa: anon,
        activeLinks: RecipientRepository.all().filter(function (r) { return r.status === RECIPIENT_STATUS.ACTIVE; }).length
      },
      charts: {
        doaByDay: DashboardService.series(byDay),
        doaByCategory: cats.map(function (c) { return { label: c.name_ms, value: byCat[c.category_id] || 0 }; })
          .filter(function (x) { return x.value > 0; })
          .sort(function (a, b) { return b.value - a.value; }),
        registrations: DashboardService.series(regs),
        activity: DashboardService.series(activity),
        monthlyTrend: DashboardService.series(byMonth)
      },
      recentActivity: logs.slice(-10).reverse().map(function (l) { return AuditModel.toDTO(l, usersById); }),
      generatedAt: DateUtils.nowIso()
    };
  },

  zeroMap: function (keys) {
    const m = {};
    keys.forEach(function (k) { m[k] = 0; });
    return m;
  },

  series: function (map) {
    return Object.keys(map).map(function (k) { return { label: k, value: map[k] }; });
  },

  /** Laporan untuk julat tarikh (maksimum 366 hari). */
  report: function (ctx, payload) {
    const today = DateUtils.dayKey(new Date());
    const data = Validator.validate(payload, {
      from: { type: 'date', default: DateUtils.dayKey(DateUtils.addDays(new Date(), -29)), label: 'Dari' },
      to: { type: 'date', default: today, label: 'Hingga' }
    });
    if (data.from > data.to) throw Errors.validation('Tarikh mula mesti sebelum tarikh akhir.');
    const spanDays = (new Date(data.to) - new Date(data.from)) / 86400000;
    if (spanDays > 366) throw Errors.validation('Julat maksimum ialah 366 hari.');

    const doas = DoaRepository.all().filter(function (d) {
      return d.status !== DOA_STATUS.DELETED && DateUtils.inDayRange(d.created_at, data.from, data.to);
    });
    const cats = CategoryRepository.map();
    const byCat = {}, bySource = {}, byType = {}, byDay = {}, byRecipient = {};
    doas.forEach(function (d) {
      const c = cats[d.category_id] ? cats[d.category_id].name_ms : 'Lain-lain';
      byCat[c] = (byCat[c] || 0) + 1;
      bySource[d.source] = (bySource[d.source] || 0) + 1;
      byType[d.recipient_type] = (byType[d.recipient_type] || 0) + 1;
      const dk = DateUtils.dayKey(d.created_at);
      byDay[dk] = (byDay[dk] || 0) + 1;
      if (d.recipient_id) byRecipient[d.recipient_id] = (byRecipient[d.recipient_id] || 0) + 1;
    });
    const recips = {};
    RecipientRepository.all().forEach(function (r) { recips[r.recipient_id] = r; });
    const users = UserRepository.all();
    const newUsers = users.filter(function (u) { return DateUtils.inDayRange(u.created_at, data.from, data.to); }).length;
    const toList = function (m) {
      return Object.keys(m).map(function (k) { return { label: k, value: m[k] }; }).sort(function (a, b) { return b.value - a.value; });
    };
    AuditService.log(ctx, AUDIT_ACTIONS.REPORT_GENERATED, 'REPORT', '', data.from + ' → ' + data.to);
    return {
      range: data,
      summary: {
        totalDoa: doas.length,
        anonymous: doas.filter(function (d) { return d.is_anonymous; }).length,
        viaLink: bySource[DOA_SOURCE.LINK] || 0,
        withAttachment: doas.filter(function (d) { return d.attachment_count > 0; }).length,
        newUsers: newUsers,
        uniqueSenders: Object.keys(doas.reduce(function (m, d) { if (d.sender_user_id) m[d.sender_user_id] = 1; return m; }, {})).length
      },
      byCategory: toList(byCat),
      bySource: toList(bySource),
      byRecipientType: toList(byType),
      byDay: Object.keys(byDay).sort().map(function (k) { return { label: k, value: byDay[k] }; }),
      topLinks: Object.keys(byRecipient).map(function (id) {
        const r = recips[id];
        return { label: r ? r.title + ' (' + r.display_name + ')' : id, value: byRecipient[id] };
      }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10)
    };
  }
};
