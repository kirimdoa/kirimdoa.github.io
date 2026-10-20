/**
 * @file PdfService.gs
 * Eksport doa ke PDF: HTML (semua nilai di-escape) → Blob → PDF (penukar terbina GAS).
 * PDF dipulangkan sebagai base64 untuk dimuat turun terus — tidak disimpan dalam Drive.
 */
const PdfService = {
  exportDoas: function (ctx, filters) {
    SecurityService.rateLimit('export.pdf', ctx.userId);
    const rows = DoaService.query(ctx, filters || {}).slice(0, CONFIG.EXPORT_MAX_DOAS);
    if (!rows.length) throw Errors.validation('Tiada doa untuk dieksport dengan penapis ini.');
    const cats = CategoryRepository.map();
    const viewer = { userId: ctx.userId, role: ctx.role };
    const items = rows.map(function (d) { return DoaModel.toDTO(d, viewer, { categories: cats }); });
    const settings = SettingsService.all();
    const html = PdfService.render(items, ctx.user, settings, filters || {});
    const stamp = Utilities.formatDate(new Date(), DateUtils.tz(), 'yyyyMMdd-HHmm');
    const filename = 'KirimDoa-' + stamp + '.pdf';
    const pdf = Utilities.newBlob(html, 'text/html', 'export.html').getAs('application/pdf').setName(filename);
    AuditService.log(ctx, AUDIT_ACTIONS.EXPORT_GENERATED, 'EXPORT', '', items.length + ' doa · ' + (filters && filters.scope || 'ALL'));
    return { filename: filename, mimeType: 'application/pdf', data: Utilities.base64Encode(pdf.getBytes()), count: items.length };
  },

  render: function (items, user, settings, filters) {
    const e = StringUtils.escapeHtml;
    const scopeLabel = { ALL: 'Semua doa', SELF: 'Doa untuk diri sendiri', OTHERS: 'Doa untuk orang lain', RECEIVED: 'Doa diterima', SENT: 'Doa dihantar', FAVORITES: 'Doa kegemaran' };
    const blocks = items.map(function (d, i) {
      return '<div class="doa">' +
        '<div class="meta">' + (i + 1) + '. ' + e(d.categoryName) + ' · ' + e(DateUtils.format(d.createdAt, 'dd MMM yyyy')) + '</div>' +
        (d.title ? '<h3>' + e(d.title) + '</h3>' : '') +
        '<p class="text">' + StringUtils.escapeMultiline(d.text) + '</p>' +
        '<div class="from">Daripada: ' + e(d.senderName + (d.isMine ? ' (anda)' : '')) + ' · Untuk: ' + e(d.recipientType === RECIPIENT_TYPE.SELF ? 'Diri sendiri' : d.recipientName) +
          (d.isPrayed ? ' · ✓ Telah dibacakan' : '') + '</div>' +
        '</div>';
    }).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      'body{font-family:Georgia,"Times New Roman",serif;color:#241A22;margin:28px 36px;}' +
      '.head{text-align:center;border-bottom:2px solid #C9A33A;padding-bottom:14px;margin-bottom:18px;}' +
      '.bismillah{font-size:22px;color:#781E3A;margin-bottom:6px;}' +
      'h1{font-size:26px;color:#4B1027;margin:4px 0;} .tag{color:#746A73;font-style:italic;font-size:12px;}' +
      '.info{font-size:11px;color:#746A73;margin-top:8px;}' +
      '.doa{border:1px solid #EBDCEC;border-left:4px solid #682C86;border-radius:6px;padding:10px 14px;margin:0 0 12px;page-break-inside:avoid;}' +
      '.meta{font-size:10px;color:#682C86;text-transform:uppercase;letter-spacing:1px;} h3{font-size:14px;margin:4px 0;color:#4B1027;}' +
      '.text{font-size:13px;line-height:1.6;margin:6px 0;} .from{font-size:11px;color:#746A73;text-align:right;}' +
      '.foot{margin-top:20px;text-align:center;font-size:10px;color:#746A73;border-top:1px solid #EBDCEC;padding-top:8px;}' +
      '</style></head><body>' +
      '<div class="head"><div class="bismillah">بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>' +
      '<h1>' + e(settings.SYSTEM_NAME) + '</h1><div class="tag">' + e(settings.SYSTEM_TAGLINE) + '</div>' +
      '<div class="info">' + e(scopeLabel[filters.scope] || scopeLabel.ALL) + ' · ' + items.length + ' doa · ' +
      e(user.full_name) + ' · Dijana ' + e(DateUtils.format(new Date(), 'dd MMM yyyy, HH:mm')) + '</div></div>' +
      blocks +
      '<div class="foot">' + e(settings.SYSTEM_NAME) + ' — ' + e(settings.SYSTEM_TAGLINE) + '</div>' +
      '</body></html>';
  }
};
