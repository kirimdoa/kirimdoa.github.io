/**
 * @file DoaModel.gs
 * DTO doa — logik privasi identiti penghantar (anonim) berada di sini.
 */
const DoaModel = {
  ANON_LABEL: 'Hamba Allah',

  /**
   * @param {Object} d rekod DOAS
   * @param {Object} viewer { userId, role }
   * @param {Object} ctx { categories: map, favorites: set, attachments: map doaId→[], users: map, full: bool }
   */
  toDTO: function (d, viewer, ctx) {
    ctx = ctx || {};
    const cat = ctx.categories && ctx.categories[d.category_id];
    const isSender = viewer && d.sender_user_id && d.sender_user_id === viewer.userId;
    const isOwner = viewer && (d.recipient_user_id ? d.recipient_user_id === viewer.userId : isSender);
    const superAdmin = viewer && viewer.role === ROLES.SUPER_ADMIN;

    let senderLabel;
    if (d.is_anonymous && !isSender) senderLabel = DoaModel.ANON_LABEL;
    else if (d.sender_name) senderLabel = d.sender_name;
    else senderLabel = DoaModel.ANON_LABEL;

    const dto = {
      id: d.doa_id,
      title: d.title,
      text: ctx.full === false ? StringUtils.truncate(d.doa_text, 160) : d.doa_text,
      excerpt: StringUtils.truncate(d.doa_text, 120),
      recipientType: d.recipient_type,
      recipientName: d.recipient_name,
      categoryId: d.category_id,
      categoryName: cat ? cat.name_ms : 'Lain-lain',
      categoryIcon: cat ? cat.icon : 'star',
      isAnonymous: d.is_anonymous,
      senderName: senderLabel,
      source: d.source,
      // Doa melalui pautan Kumpul Doa sentiasa "diterima" oleh pemilik pautan (walaupun diuji oleh pemilik sendiri)
      direction: d.recipient_user_id && d.recipient_user_id === (viewer && viewer.userId) ? 'RECEIVED' : 'SENT',
      isMine: !!isSender,
      status: d.status,
      attachmentCount: d.attachment_count,
      isFavorite: !!(ctx.favorites && ctx.favorites[d.doa_id]),
      isRead: !!d.read_at,
      isPrayed: !!d.prayed_at,
      prayedAt: d.prayed_at || '',
      canMarkPrayed: !!isOwner && d.status === DOA_STATUS.ACTIVE && !d.prayed_at,
      // Adakah pengirim akan dimaklumkan bila ditandakan (tanpa mendedahkan email)
      // Makluman automatik (notifikasi aplikasi / email) apabila ditanda dibacakan
      senderAutoNotify: !!isOwner && ((!!d.sender_user_id && d.sender_user_id !== (viewer && viewer.userId)) || !!d.sender_email),
      senderNotifiable: !!isOwner && ((!!d.sender_user_id && d.sender_user_id !== (viewer && viewer.userId)) || !!d.sender_email || (!isSender && !!d.sender_phone)),
      ownerName: d.recipient_user_id ? d.recipient_name : '',
      // No. WhatsApp pengirim — HANYA kepada pemilik doa (penerima), bukan penghantar/admin
      senderWhatsApp: isOwner && !isSender && d.sender_phone ? d.sender_phone : '',
      occasion: ctx.occasions && d.recipient_id ? (ctx.occasions[d.recipient_id] || '') : '',
      canEdit: !!isSender && d.source === DOA_SOURCE.APP && d.status === DOA_STATUS.ACTIVE,
      canDelete: !!(isSender || isOwner),
      createdAt: d.created_at,
      updatedAt: d.updated_at
    };
    if (ctx.attachments) dto.attachments = (ctx.attachments[d.doa_id] || []).map(DoaModel.attachmentDTO);
    // Hanya SUPER_ADMIN boleh melihat ID penghantar sebenar bagi doa anonim (siasatan penyalahgunaan)
    if (ctx.admin) {
      dto.senderUserId = d.is_anonymous && !superAdmin ? '' : d.sender_user_id;
      dto.recipientUserId = d.recipient_user_id;
      dto.recipientId = d.recipient_id;
      dto.realSenderName = d.is_anonymous && !superAdmin ? DoaModel.ANON_LABEL : (d.sender_name || '');
    }
    return dto;
  },

  attachmentDTO: function (a) {
    return { id: a.attachment_id, filename: a.filename, mimeType: a.mime_type, size: a.size_bytes };
  },

  /** Teks carian (huruf kecil). */
  searchText: function (d) {
    return (d.title + ' ' + d.doa_text + ' ' + d.recipient_name + ' ' + (d.is_anonymous ? '' : d.sender_name)).toLowerCase();
  }
};

const CategoryModel = {
  toDTO: function (c) {
    return {
      id: c.category_id,
      nameMs: c.name_ms,
      nameEn: c.name_en,
      description: c.description,
      icon: c.icon,
      sortOrder: c.sort_order,
      status: c.status
    };
  }
};

const RecipientModel = {
  shareUrl: function (code) {
    // PUBLIC_BASE_URL (pilihan) = URL PWA shell; jika tiada, guna URL Web App.
    let base = Env.get('PUBLIC_BASE_URL', '');
    if (!/^https:\/\//.test(base)) {
      try { base = ScriptApp.getService().getUrl() || ''; } catch (e) { base = ''; }
    }
    return base ? base + '?c=' + encodeURIComponent(code) : '?c=' + encodeURIComponent(code);
  },

  isAccepting: function (r) {
    if (r.status !== RECIPIENT_STATUS.ACTIVE) return false;
    if (r.accept_until && DateUtils.dayKey(new Date()) > r.accept_until) return false;
    return true;
  },

  toOwnerDTO: function (r, counts) {
    return {
      id: r.recipient_id,
      code: r.share_code,
      shareUrl: RecipientModel.shareUrl(r.share_code),
      displayName: r.display_name,
      title: r.title,
      message: r.message,
      occasion: r.occasion,
      status: r.status,
      acceptUntil: r.accept_until,
      accepting: RecipientModel.isAccepting(r),
      doaCount: (counts && counts[r.recipient_id]) || 0,
      unreadCount: (counts && counts['unread:' + r.recipient_id]) || 0,
      createdAt: r.created_at
    };
  },

  /** Tiada email/ID pemilik untuk awam. */
  toPublicDTO: function (r) {
    return {
      code: r.share_code,
      displayName: r.display_name,
      title: r.title,
      message: r.message,
      occasion: r.occasion,
      accepting: RecipientModel.isAccepting(r),
      acceptUntil: r.accept_until
    };
  }
};

const NotificationModel = {
  toDTO: function (n) {
    return {
      id: n.notification_id,
      type: n.type,
      title: n.title,
      message: n.message,
      referenceId: n.reference_id,
      isRead: n.is_read,
      createdAt: n.created_at
    };
  }
};

const AuditModel = {
  toDTO: function (l, usersById) {
    const u = usersById && usersById[l.user_id];
    return {
      id: l.log_id,
      userId: l.user_id,
      userName: u ? u.full_name : (l.user_id ? l.user_id : 'Sistem / Awam'),
      role: l.role,
      action: l.action,
      module: l.module,
      referenceId: l.reference_id,
      description: l.description,
      createdAt: l.created_at
    };
  }
};
