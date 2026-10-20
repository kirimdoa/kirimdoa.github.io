/**
 * @file RecipientService.gs
 * "Kumpul Doa": pengguna mencipta pautan kongsi; orang lain (termasuk awam tanpa akaun)
 * menghantar doa kepadanya melalui pautan tersebut.
 *
 * Perlindungan borang awam: token borang bertandatangan HMAC (min 3 saat, maks 6 jam),
 * medan honeypot, had kadar per-pautan + global, tiada lampiran untuk awam.
 */
const RecipientService = {
  schema: function (partial) {
    return {
      displayName: { type: 'string', required: !partial, min: 2, max: CONFIG.NAME_MAX, label: 'Nama dipaparkan' },
      title: { type: 'string', required: !partial, min: 3, max: CONFIG.TITLE_MAX, label: 'Tajuk' },
      message: { type: 'text', max: CONFIG.MESSAGE_MAX, label: 'Mesej' },
      occasion: { type: 'enum', values: OCCASIONS, default: 'LAIN', label: 'Majlis' },
      acceptUntil: { type: 'date', label: 'Terima sehingga' }
    };
  },

  /** Kiraan doa per pautan untuk pemilik. */
  counts: function (ownerId) {
    const counts = {};
    DoaRepository.visibleTo(ownerId).forEach(function (d) {
      if (!d.recipient_id) return;
      counts[d.recipient_id] = (counts[d.recipient_id] || 0) + 1;
      if (!d.read_at) counts['unread:' + d.recipient_id] = (counts['unread:' + d.recipient_id] || 0) + 1;
    });
    return counts;
  },

  listMine: function (ctx) {
    const counts = RecipientService.counts(ctx.userId);
    return RecipientRepository.byOwner(ctx.userId)
      .slice()
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })
      .map(function (r) { return RecipientModel.toOwnerDTO(r, counts); });
  },

  create: function (ctx, payload) {
    const data = Validator.validate(payload, RecipientService.schema(false));
    const active = RecipientRepository.byOwner(ctx.userId).filter(function (r) { return r.status === RECIPIENT_STATUS.ACTIVE; });
    if (active.length >= CONFIG.MAX_ACTIVE_RECIPIENT_LINKS) {
      throw Errors.validation('Anda hanya boleh mempunyai ' + CONFIG.MAX_ACTIVE_RECIPIENT_LINKS + ' pautan aktif. Tutup pautan lama dahulu.');
    }
    const now = DateUtils.nowIso();
    const row = Database.withLock(function () {
      RecipientRepository.base().invalidate();
      let code;
      for (let i = 0; i < 6; i++) {
        code = IdUtils.shareCode(8);
        if (!RecipientRepository.findByCode(code)) break;
        code = null;
      }
      if (!code) throw new AppError(ERROR_CODES.BUSY, 'Gagal menjana kod unik. Sila cuba lagi.');
      return RecipientRepository.insert({
        recipient_id: IdUtils.generate('R'),
        owner_user_id: ctx.userId,
        share_code: code,
        display_name: data.displayName,
        title: data.title,
        message: data.message || '',
        occasion: data.occasion,
        status: RECIPIENT_STATUS.ACTIVE,
        accept_until: data.acceptUntil || '',
        created_at: now,
        updated_at: now
      });
    });
    AuditService.log(ctx, AUDIT_ACTIONS.RECIPIENT_CREATED, 'RECIPIENT', row.recipient_id, row.share_code);
    return RecipientModel.toOwnerDTO(row, {});
  },

  update: function (ctx, payload) {
    const schema = RecipientService.schema(true);
    schema.id = { type: 'id', prefix: 'R', required: true, label: 'Pautan' };
    schema.status = { type: 'enum', values: [RECIPIENT_STATUS.ACTIVE, RECIPIENT_STATUS.CLOSED], label: 'Status' };
    const data = Validator.validate(payload, schema);
    const r = RecipientRepository.findById(data.id);
    if (!r || r.owner_user_id !== ctx.userId) throw Errors.notFound('Pautan');
    const patch = {};
    if (data.displayName) patch.display_name = data.displayName;
    if (data.title) patch.title = data.title;
    if (payload.message !== undefined) patch.message = data.message || '';
    if (payload.occasion !== undefined) patch.occasion = data.occasion;
    if (payload.acceptUntil !== undefined) patch.accept_until = data.acceptUntil || '';
    if (data.status) {
      if (data.status === RECIPIENT_STATUS.ACTIVE && r.status !== RECIPIENT_STATUS.ACTIVE) {
        const active = RecipientRepository.byOwner(ctx.userId).filter(function (x) { return x.status === RECIPIENT_STATUS.ACTIVE; });
        if (active.length >= CONFIG.MAX_ACTIVE_RECIPIENT_LINKS) throw Errors.validation('Had pautan aktif telah dicapai.');
      }
      patch.status = data.status;
    }
    const updated = RecipientRepository.update(r.recipient_id, patch);
    AuditService.log(ctx, AUDIT_ACTIONS.RECIPIENT_UPDATED, 'RECIPIENT', r.recipient_id, Object.keys(patch).join(', '));
    return RecipientModel.toOwnerDTO(updated, RecipientService.counts(ctx.userId));
  },

  /** Halaman awam pautan. Tidak mendedahkan email/ID pemilik. */
  getPublic: function (payload) {
    const data = Validator.validate(payload, { code: { type: 'string', required: true, pattern: /^[A-Z0-9]{6,12}$/, label: 'Kod' } });
    const r = RecipientRepository.findByCode(data.code.toUpperCase());
    if (!r) throw Errors.notFound('Pautan');
    const owner = UserService.getCached(r.owner_user_id);
    if (!owner || owner.status !== USER_STATUS.ACTIVE) throw Errors.notFound('Pautan');
    const settings = SettingsService.all();
    const dto = RecipientModel.toPublicDTO(r);
    dto.accepting = dto.accepting && settings.ALLOW_PUBLIC_SUBMISSION;
    dto.allowAnonymous = settings.ALLOW_ANONYMOUS;
    dto.formToken = SecurityUtils.signFormToken('recipient:' + r.share_code);
    dto.categories = CategoryRepository.active().map(CategoryModel.toDTO);
    dto.doaMinLength = settings.DOA_MIN_LENGTH;
    dto.doaMaxLength = settings.DOA_MAX_LENGTH;
    return dto;
  },

  /**
   * Hantar doa melalui pautan. ctx boleh tanpa pengguna (awam).
   */
  submit: function (ctx, payload) {
    const settings = SettingsService.all();
    if (!settings.ALLOW_PUBLIC_SUBMISSION && !(ctx && ctx.userId)) throw Errors.forbidden('Penghantaran doa awam ditutup buat masa ini.');
    const data = Validator.validate(payload, {
      code: { type: 'string', required: true, pattern: /^[A-Z0-9]{6,12}$/, label: 'Kod' },
      senderName: { type: 'string', max: CONFIG.NAME_MAX, label: 'Nama anda' },
      categoryId: { type: 'id', prefix: 'C', label: 'Kategori' }, // pilihan — lalai "Umum"
      title: { type: 'string', max: CONFIG.TITLE_MAX, label: 'Tajuk' },
      doaText: { type: 'text', required: true, min: settings.DOA_MIN_LENGTH, max: settings.DOA_MAX_LENGTH, label: 'Isi doa' },
      isAnonymous: { type: 'boolean', default: false },
      senderEmail: { type: 'email', label: 'Email' }, // pilihan — hanya untuk makluman "telah dibacakan"
      senderPhone: { type: 'string', max: 25, label: 'No. WhatsApp' }, // pilihan — butang WhatsApp pemilik pautan
      formToken: { type: 'string', required: true, max: 60, label: 'Token' },
      website: { type: 'string', max: 200 }, // honeypot — mesti kosong
      requestId: { type: 'string', max: 64 }
    });
    const code = data.code.toUpperCase();
    const senderPhone = Validator.waPhone(data.senderPhone);
    // Honeypot: bot mengisi semua medan. Pulangkan "berjaya" palsu supaya bot tidak belajar.
    if (data.website) {
      AppLogger.warn('Honeypot dicetuskan', { code: code });
      return { submitted: true };
    }
    if (!SecurityUtils.verifyFormToken('recipient:' + code, data.formToken)) {
      throw Errors.validation('Borang telah tamat tempoh atau dihantar terlalu cepat. Sila muat semula halaman.');
    }
    if (data.isAnonymous && !settings.ALLOW_ANONYMOUS) throw Errors.validation('Doa tanpa nama tidak dibenarkan.');
    if (!data.isAnonymous && !data.senderName && !(ctx && ctx.userId)) {
      throw Errors.validation('Sila nyatakan nama anda atau pilih hantar secara anonim.', { senderName: 'Sila nyatakan nama anda.' });
    }
    SecurityService.rateLimit('recipient.submit.global', 'all');
    SecurityService.rateLimit('recipient.submit', code);

    const scope = 'recipient.submit:' + code;
    return SecurityService.idempotent(scope, data.requestId, function () {
      const r = RecipientRepository.findByCode(code);
      if (!r) throw Errors.notFound('Pautan');
      if (!RecipientModel.isAccepting(r)) throw Errors.forbidden('Pautan ini tidak lagi menerima doa.');
      const owner = UserService.getCached(r.owner_user_id);
      if (!owner || owner.status !== USER_STATUS.ACTIVE) throw Errors.notFound('Pautan');
      const categoryId = DoaService.resolveCategory(data.categoryId);

      const now = DateUtils.nowIso();
      const senderName = data.senderName || (ctx && ctx.user ? ctx.user.full_name : '');
      const doa = {
        doa_id: IdUtils.generate('D'),
        sender_user_id: (ctx && ctx.userId) || '',
        sender_name: senderName,
        recipient_type: RECIPIENT_TYPE.PERSON,
        recipient_name: r.display_name,
        recipient_user_id: r.owner_user_id,
        recipient_id: r.recipient_id,
        category_id: categoryId,
        title: data.title || '',
        doa_text: data.doaText,
        is_anonymous: !!data.isAnonymous,
        status: DOA_STATUS.ACTIVE,
        visibility: VISIBILITY.PRIVATE,
        source: DOA_SOURCE.LINK,
        attachment_count: 0,
        read_at: '',
        created_at: now,
        updated_at: now,
        deleted_at: '',
        prayed_at: '',
        // Pengguna log masuk dimaklumkan dalam aplikasi — email tidak disimpan
        sender_email: ctx && ctx.userId ? '' : (data.senderEmail || ''),
        sender_phone: senderPhone
      };
      DoaRepository.insert(doa);
      DoaService.invalidateStats();
      const fromLabel = data.isAnonymous ? DoaModel.ANON_LABEL : senderName;
      NotificationService.notify(r.owner_user_id, NOTIF_TYPE.DOA_RECEIVED, 'Doa baharu diterima',
        fromLabel + ' mengirim doa melalui "' + StringUtils.truncate(r.title, 60) + '".', doa.doa_id);
      if (settings.NOTIFY_EMAIL_ENABLED) NotificationService.emailDoaReceived(owner, r, fromLabel);
      AuditService.log(ctx && ctx.userId ? ctx : { role: ROLES.PUBLIC, userAgent: ctx && ctx.userAgent },
        AUDIT_ACTIONS.DOA_RECEIVED_LINK, 'RECIPIENT', doa.doa_id, code);
      return { submitted: true };
    });
  }
};
