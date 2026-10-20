/**
 * @file NotificationService.gs
 * Notifikasi dalam aplikasi (+ email pilihan untuk doa diterima).
 */
const NotificationService = {
  build: function (userId, type, title, message, referenceId) {
    return {
      notification_id: IdUtils.generate('N'),
      user_id: userId,
      type: type,
      title: StringUtils.truncate(title, 120),
      message: StringUtils.truncate(message, 500),
      reference_id: referenceId || '',
      is_read: false,
      created_at: DateUtils.nowIso()
    };
  },

  /** Tidak melontar — notifikasi bukan laluan kritikal. path = halaman dibuka apabila notifikasi telefon ditekan. */
  notify: function (userId, type, title, message, referenceId, path) {
    try {
      NotificationRepository.insertMany([NotificationService.build(userId, type, title, message, referenceId)]);
    } catch (e) {
      AppLogger.error('Notifikasi gagal', { type: type, error: String(e) });
    }
    // Notifikasi telefon (jika FCM dikonfigurasi & pengguna menghidupkannya). Tidak melontar.
    if (PushService.PUSH_TYPES.indexOf(type) >= 0) {
      let badge = '';
      try { badge = NotificationService.unreadCount(userId); } catch (e) { /* abaikan */ }
      PushService.sendToUser(userId, { title: title, body: message, type: type, ref: referenceId || '', path: path || '#/notifikasi', badge: badge });
    }
  },

  unreadCount: function (userId) {
    return NotificationRepository.byUser(userId).filter(function (n) { return !n.is_read; }).length;
  },

  list: function (ctx, filters) {
    const f = Validator.validate(filters, { unreadOnly: { type: 'boolean', default: false } });
    const rows = NotificationRepository.byUser(ctx.userId)
      .filter(function (n) { return !f.unreadOnly || !n.is_read; })
      .slice()
      .reverse();
    const page = Validator.paginate(rows, Validator.paging(filters, 20));
    page.items = page.items.map(NotificationModel.toDTO);
    page.meta.unread = NotificationService.unreadCount(ctx.userId);
    return page;
  },

  /** Pemilikan disemak — elak IDOR (tanda notifikasi pengguna lain). */
  markRead: function (ctx, payload) {
    const data = Validator.validate(payload, { id: { type: 'id', prefix: 'N', required: true, label: 'Notifikasi' } });
    const n = NotificationRepository.findById(data.id);
    if (!n || n.user_id !== ctx.userId) throw Errors.notFound('Notifikasi');
    if (!n.is_read) NotificationRepository.update(n.notification_id, { is_read: true });
    return { id: n.notification_id, unread: NotificationService.unreadCount(ctx.userId) };
  },

  markAllRead: function (ctx) {
    const patch = {};
    NotificationRepository.byUser(ctx.userId).forEach(function (n) {
      if (!n.is_read) patch[n.notification_id] = { is_read: true };
    });
    return { marked: NotificationRepository.updateMany(patch), unread: 0 };
  },

  /** Hebahan admin kepada semua pengguna aktif (sisipan berkelompok). */
  broadcast: function (ctx, payload) {
    const data = Validator.validate(payload, {
      title: { type: 'string', required: true, min: 3, max: 120, label: 'Tajuk' },
      message: { type: 'text', required: true, min: 5, max: 500, label: 'Mesej' },
      audience: { type: 'enum', values: ['ALL', 'USERS', 'ADMINS'], default: 'ALL', label: 'Sasaran' }
    });
    const users = UserRepository.all().filter(function (u) {
      if (u.status !== USER_STATUS.ACTIVE) return false;
      if (data.audience === 'USERS') return u.role === ROLES.USER;
      if (data.audience === 'ADMINS') return u.role !== ROLES.USER;
      return true;
    });
    const rows = users.map(function (u) { return NotificationService.build(u.user_id, NOTIF_TYPE.BROADCAST, data.title, data.message, ''); });
    NotificationRepository.insertMany(rows);
    AuditService.log(ctx, AUDIT_ACTIONS.NOTIFICATION_BROADCAST, 'NOTIFICATION', '', data.audience + ' · ' + rows.length + ' penerima · ' + data.title);
    return { sent: rows.length };
  },

  /** Senarai hebahan lepas (daripada audit). */
  broadcastHistory: function () {
    return AuditRepository.all()
      .filter(function (l) { return l.action === AUDIT_ACTIONS.NOTIFICATION_BROADCAST; })
      .slice(-20).reverse()
      .map(function (l) { return { description: l.description, createdAt: l.created_at, userId: l.user_id }; });
  },

  /** Email kepada pengirim awam (tanpa akaun) yang memberi email secara sukarela. @return {boolean} */
  emailDoaPrayed: function (doa, readerName) {
    try {
      if (!doa.sender_email || MailApp.getRemainingDailyQuota() < 5) return false;
      const name = SettingsService.get('SYSTEM_NAME');
      const esc = StringUtils.escapeHtml;
      const sender = doa.is_anonymous || !doa.sender_name ? '' : ' ' + esc(doa.sender_name);
      const excerpt = esc(StringUtils.truncate(doa.title || doa.doa_text, 140));
      MailApp.sendEmail({
        to: doa.sender_email,
        subject: name + ' — Doa anda telah dibacakan',
        htmlBody: '<p>Assalamualaikum' + sender + ',</p>' +
          '<p>Alhamdulillah, <b>' + esc(readerName) + '</b> telah membacakan doa yang anda kirimkan:</p>' +
          '<blockquote style="border-left:3px solid #C9A24B;margin:12px 0;padding:6px 12px;color:#4B1027">' + excerpt + '</blockquote>' +
          '<p>Semoga Allah memakbulkan doa anda dan membalas kebaikan anda.</p>' +
          '<p style="color:#888;font-size:12px">Anda menerima email ini kerana memberikan alamat email semasa mengirim doa. ' +
          'Alamat email anda telah dipadam daripada sistem selepas makluman ini dihantar.</p>',
        name: name
      });
      return true;
    } catch (e) {
      AppLogger.warn('Email doa dibacakan gagal', { error: String(e) });
      return false;
    }
  },

  emailDoaReceived: function (owner, recipient, fromLabel) {
    try {
      if (MailApp.getRemainingDailyQuota() < 5) return;
      const name = SettingsService.get('SYSTEM_NAME');
      const esc = StringUtils.escapeHtml;
      const base = PushService.baseUrl();
      const button = base ? '<p><a href="' + esc(base + '#/notifikasi') + '" style="display:inline-block;background:#781E3A;color:#fff;' +
        'padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Buka Kirim Doa</a></p>' : '<p>Log masuk ke ' + esc(name) + ' untuk membacanya.</p>';
      MailApp.sendEmail({
        to: owner.email,
        subject: name + ' — Doa baharu daripada ' + StringUtils.truncate(fromLabel, 40),
        htmlBody: '<p>Assalamualaikum ' + esc(owner.full_name) + ',</p>' +
          '<p><b>' + esc(fromLabel) + '</b> telah mengirim doa kepada anda melalui pautan "' + esc(recipient.title) + '".</p>' + button +
          '<p style="color:#888;font-size:12px">Anda menerima email ini kerana makluman email doa baharu dihidupkan. ' +
          'Isi doa hanya boleh dibaca selepas log masuk.</p>',
        name: name
      });
    } catch (e) {
      AppLogger.warn('Email notifikasi gagal', { error: String(e) });
    }
  }
};
