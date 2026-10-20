/**
 * @file DoaService.gs
 * Logik perniagaan doa: hantar, senarai, baca, kemas kini, padam, kegemaran, lampiran.
 */
const DoaService = {
  SCOPES: ['ALL', 'SELF', 'OTHERS', 'RECEIVED', 'SENT', 'FAVORITES'],

  viewer: function (ctx) {
    return { userId: ctx.userId, role: ctx.role };
  },

  /** Skema medan doa — had panjang dari tetapan runtime. */
  doaSchema: function (settings, partial) {
    return {
      recipientType: { type: 'enum', values: [RECIPIENT_TYPE.SELF, RECIPIENT_TYPE.PERSON, RECIPIENT_TYPE.GROUP], required: !partial, label: 'Untuk siapa' },
      recipientName: { type: 'string', max: CONFIG.NAME_MAX, label: 'Nama penerima' },
      categoryId: { type: 'id', prefix: 'C', label: 'Kategori' }, // pilihan — lalai "Umum"
      title: { type: 'string', max: CONFIG.TITLE_MAX, label: 'Tajuk' },
      doaText: { type: 'text', required: !partial, min: settings.DOA_MIN_LENGTH, max: settings.DOA_MAX_LENGTH, label: 'Isi doa' },
      isAnonymous: { type: 'boolean', default: false, label: 'Anonim' },
      attachments: { type: 'array', max: settings.MAX_ATTACHMENTS_PER_DOA, label: 'Lampiran' },
      requestId: { type: 'string', max: 64 }
    };
  },

  /**
   * Kategori untuk doa baharu: yang dipilih (mesti aktif), atau lalai — "Umum" / kategori aktif pertama.
   * @return {string} category_id
   */
  resolveCategory: function (categoryId) {
    if (categoryId) return DoaService.requireActiveCategory(categoryId).category_id;
    const active = CategoryRepository.active();
    const def = active.filter(function (c) { return c.name_ms.toLowerCase() === SeedData.DEFAULT_CATEGORY.toLowerCase(); })[0] || active[0];
    if (!def) throw Errors.validation('Tiada kategori aktif. Hubungi pentadbir.', { categoryId: 'Tiada kategori aktif.' });
    return def.category_id;
  },

  requireActiveCategory: function (categoryId) {
    const cat = CategoryRepository.findById(categoryId);
    if (!cat || cat.status !== CATEGORY_STATUS.ACTIVE) throw Errors.validation('Kategori tidak sah.', { categoryId: 'Kategori tidak sah.' });
    return cat;
  },

  /** recipient_id → occasion bagi pautan milik pengguna (untuk mesej WhatsApp "di Tanah Suci"). */
  occasionMap: function (userId) {
    const m = {};
    RecipientRepository.byOwner(userId).forEach(function (r) { m[r.recipient_id] = r.occasion; });
    return m;
  },

  invalidateStats: function () {
    AppCache.remove('stats:publicDoaCount');
    AppCache.remove('stats:admin');
  },

  /** Hantar doa (pengguna log masuk). */
  create: function (ctx, payload) {
    const settings = SettingsService.all();
    const data = Validator.validate(payload, DoaService.doaSchema(settings, false));
    SecurityService.rateLimit('doa.create', ctx.userId);
    return SecurityService.idempotent('doa.create:' + ctx.userId, data.requestId, function () {
      return DoaService.createInternal(ctx, data, settings);
    });
  },

  createInternal: function (ctx, data, settings) {
    if (data.recipientType !== RECIPIENT_TYPE.SELF && !data.recipientName) {
      throw Errors.validation('Sila nyatakan nama penerima.', { recipientName: 'Sila nyatakan nama penerima.' });
    }
    if (data.isAnonymous && !settings.ALLOW_ANONYMOUS) throw Errors.validation('Doa tanpa nama tidak dibenarkan.');
    data.categoryId = DoaService.resolveCategory(data.categoryId);

    // Sahkan SEMUA lampiran dahulu (tiada tulisan separa jika satu gagal)
    const files = (data.attachments || []).map(function (f) { return SecurityService.validateUpload(f); });

    const now = DateUtils.nowIso();
    const doaId = IdUtils.generate('D');
    const uploaded = [];
    try {
      files.forEach(function (f) {
        const saved = DriveService.upload(f, doaId);
        uploaded.push({
          attachment_id: IdUtils.generate('A'), doa_id: doaId, uploader_user_id: ctx.userId,
          drive_file_id: saved.id, filename: f.filename, mime_type: f.mimeType, size_bytes: f.size,
          status: 'ACTIVE', created_at: now
        });
      });
      const doa = {
        doa_id: doaId,
        sender_user_id: ctx.userId,
        sender_name: ctx.user.full_name,
        recipient_type: data.recipientType,
        recipient_name: data.recipientType === RECIPIENT_TYPE.SELF ? 'Diri sendiri' : data.recipientName,
        recipient_user_id: '',
        recipient_id: '',
        category_id: data.categoryId,
        title: data.title || '',
        doa_text: data.doaText,
        is_anonymous: !!data.isAnonymous,
        status: DOA_STATUS.ACTIVE,
        visibility: VISIBILITY.PRIVATE,
        source: DOA_SOURCE.APP,
        attachment_count: uploaded.length,
        read_at: '',
        created_at: now,
        updated_at: now,
        deleted_at: '',
        prayed_at: '',
        sender_email: '',
        sender_phone: ''
      };
      Database.withLock(function () {
        DoaRepository.insert(doa);
        AttachmentRepository.insertMany(uploaded);
      });
      DoaService.invalidateStats();
      AuditService.log(ctx, AUDIT_ACTIONS.DOA_CREATED, 'DOA', doaId, data.recipientType + (uploaded.length ? ' · ' + uploaded.length + ' lampiran' : ''));
      return DoaModel.toDTO(doa, DoaService.viewer(ctx), { categories: CategoryRepository.map(), attachments: {} });
    } catch (e) {
      // Pampasan: buang fail Drive yang sudah dimuat naik jika rekod gagal disimpan
      uploaded.forEach(function (u) { DriveService.trash(u.drive_file_id); });
      throw e;
    }
  },

  /** Penapis senarai (dikongsi oleh list & export). @return {Object[]} rekod mentah tersusun */
  query: function (ctx, filters) {
    const f = Validator.validate(filters, {
      scope: { type: 'enum', values: DoaService.SCOPES, default: 'ALL' },
      categoryId: { type: 'id', prefix: 'C' },
      recipientId: { type: 'id', prefix: 'R' },
      q: { type: 'string', max: 100 },
      from: { type: 'date' },
      to: { type: 'date' },
      unreadOnly: { type: 'boolean', default: false },
      unprayedOnly: { type: 'boolean', default: false },
      sort: { type: 'enum', values: ['NEWEST', 'OLDEST'], default: 'NEWEST' },
      ids: { type: 'array', max: CONFIG.EXPORT_MAX_DOAS }
    });
    const me = ctx.userId;
    const favs = f.scope === 'FAVORITES' ? FavoriteRepository.doaIdSet(me) : null;
    const idSet = f.ids ? f.ids.reduce(function (m, id) { m[String(id)] = true; return m; }, {}) : null;
    const q = (f.q || '').toLowerCase();

    const rows = DoaRepository.visibleTo(me).filter(function (d) {
      switch (f.scope) {
        case 'SELF': if (!(d.sender_user_id === me && d.recipient_type === RECIPIENT_TYPE.SELF)) return false; break;
        case 'OTHERS': if (!(d.sender_user_id === me && d.recipient_type !== RECIPIENT_TYPE.SELF && !d.recipient_user_id)) return false; break;
        case 'RECEIVED': if (d.recipient_user_id !== me) return false; break;
        case 'SENT': if (d.sender_user_id !== me) return false; break;
        case 'FAVORITES': if (!favs[d.doa_id]) return false; break;
        default: break;
      }
      if (idSet && !idSet[d.doa_id]) return false;
      if (f.categoryId && d.category_id !== f.categoryId) return false;
      if (f.recipientId && d.recipient_id !== f.recipientId) return false;
      if (f.unreadOnly && d.read_at) return false;
      // "Belum dibacakan": hanya doa milik saya (yang boleh saya tandakan) dan belum ditanda
      if (f.unprayedOnly && (d.prayed_at || (d.recipient_user_id || d.sender_user_id) !== me)) return false;
      if ((f.from || f.to) && !DateUtils.inDayRange(d.created_at, f.from, f.to)) return false;
      if (q && DoaModel.searchText(d).indexOf(q) < 0) return false;
      return true;
    });
    rows.sort(function (a, b) {
      return f.sort === 'OLDEST' ? (a.created_at > b.created_at ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1);
    });
    return rows;
  },

  list: function (ctx, filters) {
    const rows = DoaService.query(ctx, filters);
    const paging = Validator.paging(filters, SettingsService.get('DEFAULT_PAGE_SIZE'));
    const page = Validator.paginate(rows, paging);
    const dtoCtx = { categories: CategoryRepository.map(), favorites: FavoriteRepository.doaIdSet(ctx.userId), full: !!(filters && filters.full), occasions: DoaService.occasionMap(ctx.userId) };
    page.items = page.items.map(function (d) { return DoaModel.toDTO(d, DoaService.viewer(ctx), dtoCtx); });
    return page;
  },

  get: function (ctx, payload) {
    const data = Validator.validate(payload, { id: { type: 'id', prefix: 'D', required: true, label: 'Doa' } });
    const doa = SecurityService.requireViewableDoa(data.id, ctx);
    const atts = {};
    atts[doa.doa_id] = AttachmentRepository.byDoaIds([doa.doa_id]);
    return DoaModel.toDTO(doa, DoaService.viewer(ctx), {
      categories: CategoryRepository.map(), favorites: FavoriteRepository.doaIdSet(ctx.userId), attachments: atts, occasions: DoaService.occasionMap(ctx.userId)
    });
  },

  /** Tanda "telah dibaca" oleh pemilik (penerima, atau penghantar untuk doa tanpa penerima berdaftar). */
  markRead: function (ctx, payload) {
    const data = Validator.validate(payload, { ids: { type: 'array', required: true, max: 100, label: 'Doa' } });
    const now = DateUtils.nowIso();
    const patch = {};
    data.ids.forEach(function (id) {
      const d = DoaRepository.findById(String(id));
      if (!d || d.read_at || d.status !== DOA_STATUS.ACTIVE) return;
      const owner = d.recipient_user_id || d.sender_user_id;
      if (owner === ctx.userId) patch[d.doa_id] = { read_at: now };
    });
    const n = DoaRepository.updateMany(patch);
    return { marked: n };
  },

  /**
   * Tanda "telah dibacakan" — oleh pemilik doa (penerima pautan, atau penulis doa untuk diri sendiri/orang lain).
   * Pengirim dimaklumkan sekali sahaja: notifikasi dalam aplikasi (jika berakaun) atau email pilihan (pengirim awam).
   * Email pengirim dipadam selepas makluman dihantar (minimumkan data peribadi).
   */
  markPrayed: function (ctx, payload) {
    const data = Validator.validate(payload, { id: { type: 'id', prefix: 'D', required: true, label: 'Doa' } });
    const doa = SecurityService.requireViewableDoa(data.id, ctx);
    const owner = doa.recipient_user_id || doa.sender_user_id;
    if (owner !== ctx.userId) throw Errors.forbidden('Hanya penerima doa boleh menandakannya telah dibacakan.');
    if (doa.status !== DOA_STATUS.ACTIVE) throw Errors.notFound('Doa');
    if (doa.prayed_at) {
      return DoaModel.toDTO(doa, DoaService.viewer(ctx), { categories: CategoryRepository.map(), favorites: FavoriteRepository.doaIdSet(ctx.userId) });
    }
    const now = DateUtils.nowIso();
    const patch = { prayed_at: now };
    if (!doa.read_at) patch.read_at = now;

    let notified = '';
    const readerName = (ctx.user && ctx.user.full_name) || doa.recipient_name || 'Penerima';
    const label = '"' + StringUtils.truncate(doa.title || doa.doa_text, 60).replace(/[.!?。]+$/, '') + '"';
    if (doa.sender_user_id && doa.sender_user_id !== ctx.userId) {
      NotificationService.notify(doa.sender_user_id, NOTIF_TYPE.DOA_PRAYED, 'Doa anda telah dibacakan',
        readerName + ' telah membacakan doa anda ' + label + '. Semoga dimakbulkan Allah.', doa.doa_id);
      notified = 'APP';
    } else if (doa.sender_email) {
      if (NotificationService.emailDoaPrayed(doa, readerName)) notified = 'EMAIL';
      patch.sender_email = ''; // dipadam sama ada berjaya atau tidak — tidak disimpan lebih lama daripada perlu
    }
    const updated = DoaRepository.update(doa.doa_id, patch);
    AuditService.log(ctx, AUDIT_ACTIONS.DOA_PRAYED, 'DOA', doa.doa_id, notified ? 'Pengirim dimaklumkan: ' + notified : '');
    const dto = DoaModel.toDTO(updated, DoaService.viewer(ctx), { categories: CategoryRepository.map(), favorites: FavoriteRepository.doaIdSet(ctx.userId), occasions: DoaService.occasionMap(ctx.userId) });
    dto.notified = notified;
    return dto;
  },

  update: function (ctx, payload) {
    const settings = SettingsService.all();
    const schema = DoaService.doaSchema(settings, true);
    delete schema.attachments;
    schema.id = { type: 'id', prefix: 'D', required: true, label: 'Doa' };
    const data = Validator.validate(payload, schema);
    const doa = SecurityService.requireViewableDoa(data.id, ctx);
    if (doa.sender_user_id !== ctx.userId || doa.source !== DOA_SOURCE.APP || doa.status !== DOA_STATUS.ACTIVE) {
      throw Errors.forbidden('Hanya penghantar boleh menyunting doa ini.');
    }
    const patch = {};
    const type = data.recipientType || doa.recipient_type;
    if (data.recipientType) patch.recipient_type = type;
    if (type === RECIPIENT_TYPE.SELF) {
      if (data.recipientType) patch.recipient_name = 'Diri sendiri';
    } else {
      const name = data.recipientName || (doa.recipient_type !== RECIPIENT_TYPE.SELF ? doa.recipient_name : '');
      if (!name) throw Errors.validation('Sila nyatakan nama penerima.', { recipientName: 'Sila nyatakan nama penerima.' });
      if (data.recipientName || data.recipientType) patch.recipient_name = name;
    }
    if (data.categoryId) { DoaService.requireActiveCategory(data.categoryId); patch.category_id = data.categoryId; }
    if (payload && payload.title !== undefined) patch.title = data.title || '';
    if (data.doaText) patch.doa_text = data.doaText;
    if (payload && payload.isAnonymous !== undefined) {
      if (data.isAnonymous && !settings.ALLOW_ANONYMOUS) throw Errors.validation('Doa tanpa nama tidak dibenarkan.');
      patch.is_anonymous = !!data.isAnonymous;
    }
    const updated = DoaRepository.update(doa.doa_id, patch);
    AuditService.log(ctx, AUDIT_ACTIONS.DOA_UPDATED, 'DOA', doa.doa_id, Object.keys(patch).join(', '));
    return DoaModel.toDTO(updated, DoaService.viewer(ctx), { categories: CategoryRepository.map(), favorites: FavoriteRepository.doaIdSet(ctx.userId) });
  },

  /** Soft delete oleh penghantar atau penerima. */
  remove: function (ctx, payload) {
    const data = Validator.validate(payload, { id: { type: 'id', prefix: 'D', required: true, label: 'Doa' } });
    const doa = SecurityService.requireViewableDoa(data.id, ctx);
    if (doa.sender_user_id !== ctx.userId && doa.recipient_user_id !== ctx.userId) throw Errors.forbidden();
    if (doa.status === DOA_STATUS.DELETED) throw Errors.notFound('Doa');
    DoaRepository.update(doa.doa_id, { status: DOA_STATUS.DELETED, deleted_at: DateUtils.nowIso() });
    DoaService.invalidateStats();
    AuditService.log(ctx, AUDIT_ACTIONS.DOA_DELETED, 'DOA', doa.doa_id, '');
    return { deleted: true };
  },

  toggleFavorite: function (ctx, payload) {
    const data = Validator.validate(payload, { id: { type: 'id', prefix: 'D', required: true, label: 'Doa' } });
    const doa = SecurityService.requireViewableDoa(data.id, ctx);
    if (doa.sender_user_id !== ctx.userId && doa.recipient_user_id !== ctx.userId) throw Errors.notFound('Doa');
    return { id: doa.doa_id, isFavorite: FavoriteRepository.toggle(ctx.userId, doa.doa_id) };
  },

  /** Muat turun lampiran (fail Drive peribadi — dihantar melalui backend selepas semakan akses). */
  getAttachment: function (ctx, payload) {
    const data = Validator.validate(payload, { id: { type: 'id', prefix: 'A', required: true, label: 'Lampiran' } });
    SecurityService.rateLimit('attachment.get', ctx.userId);
    const att = AttachmentRepository.findById(data.id);
    if (!att || att.status !== 'ACTIVE') throw Errors.notFound('Lampiran');
    SecurityService.requireViewableDoa(att.doa_id, ctx);
    return {
      id: att.attachment_id,
      filename: att.filename,
      mimeType: att.mime_type,
      data: DriveService.readBase64(att.drive_file_id)
    };
  },

  /** Ringkasan papan pemuka pengguna. */
  dashboard: function (ctx) {
    const me = ctx.userId;
    const visible = DoaRepository.visibleTo(me);
    const month = DateUtils.monthKey(new Date());
    const favs = FavoriteRepository.doaIdSet(me);
    const owned = visible.filter(function (d) { return (d.recipient_user_id || d.sender_user_id) === me; });
    const sorted = visible.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    const dtoCtx = { categories: CategoryRepository.map(), favorites: favs, full: false };
    const links = RecipientRepository.byOwner(me).filter(function (r) { return r.status === RECIPIENT_STATUS.ACTIVE; });
    return {
      stats: {
        total: visible.length,
        thisMonth: visible.filter(function (d) { return DateUtils.monthKey(d.created_at) === month; }).length,
        favorites: visible.filter(function (d) { return favs[d.doa_id]; }).length,
        read: owned.filter(function (d) { return !!d.read_at; }).length,
        received: visible.filter(function (d) { return d.recipient_user_id === me; }).length,
        unread: owned.filter(function (d) { return !d.read_at; }).length
      },
      recent: sorted.slice(0, 6).map(function (d) { return DoaModel.toDTO(d, DoaService.viewer(ctx), dtoCtx); }),
      activeLinks: links.length,
      unreadNotifications: NotificationService.unreadCount(me)
    };
  },

  // ---------------------------------------------------------------- Admin

  adminList: function (ctx, filters) {
    const f = Validator.validate(filters, {
      q: { type: 'string', max: 100 },
      status: { type: 'enum', values: [DOA_STATUS.ACTIVE, DOA_STATUS.ARCHIVED, DOA_STATUS.DELETED] },
      source: { type: 'enum', values: [DOA_SOURCE.APP, DOA_SOURCE.LINK] },
      categoryId: { type: 'id', prefix: 'C' },
      anonymous: { type: 'boolean' },
      from: { type: 'date' },
      to: { type: 'date' }
    });
    const q = (f.q || '').toLowerCase();
    const rows = DoaRepository.all().filter(function (d) {
      if (f.status && d.status !== f.status) return false;
      if (f.source && d.source !== f.source) return false;
      if (f.categoryId && d.category_id !== f.categoryId) return false;
      if (f.anonymous !== undefined && d.is_anonymous !== f.anonymous) return false;
      if ((f.from || f.to) && !DateUtils.inDayRange(d.created_at, f.from, f.to)) return false;
      if (q && (DoaModel.searchText(d) + ' ' + d.doa_id).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).reverse();
    const page = Validator.paginate(rows, Validator.paging(filters, 20));
    const dtoCtx = { categories: CategoryRepository.map(), admin: true, full: true };
    page.items = page.items.map(function (d) { return DoaModel.toDTO(d, DoaService.viewer(ctx), dtoCtx); });
    return page;
  },

  adminSetStatus: function (ctx, payload) {
    const data = Validator.validate(payload, {
      id: { type: 'id', prefix: 'D', required: true, label: 'Doa' },
      status: { type: 'enum', values: [DOA_STATUS.ACTIVE, DOA_STATUS.ARCHIVED, DOA_STATUS.DELETED], required: true, label: 'Status' },
      reason: { type: 'string', max: 200 }
    });
    const doa = DoaRepository.findById(data.id);
    if (!doa) throw Errors.notFound('Doa');
    const patch = { status: data.status, deleted_at: data.status === DOA_STATUS.DELETED ? DateUtils.nowIso() : '' };
    DoaRepository.update(doa.doa_id, patch);
    DoaService.invalidateStats();
    AuditService.log(ctx, AUDIT_ACTIONS.DOA_MODERATED, 'DOA', doa.doa_id, doa.status + ' → ' + data.status + (data.reason ? ' · ' + data.reason : ''));
    return { id: doa.doa_id, status: data.status };
  }
};
