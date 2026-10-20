/**
 * @file TestIntegration.gs
 * Ujian integrasi: repository, auth, doa, Kumpul Doa, admin & keselamatan API.
 */
const TestSuiteRepository = {
  name: 'Repository',
  tests: [
    ['insert / findById / update / updateMany', function (t) {
      const repo = Repo.of('FEEDBACK');
      const id = IdUtils.generate('B');
      repo.insert({ feedback_id: id, name: 'A', email: 'a@b.c', message: 'm', status: 'NEW', created_at: DateUtils.nowIso(), updated_at: '' });
      Database.resetRequestCache();
      t.eq(repo.findById(id).name, 'A');
      repo.update(id, { status: 'REVIEWED' });
      t.eq(repo.findById(id).status, 'REVIEWED');
      t.eq(repo.updateMany(Object.fromEntries ? Object.fromEntries([[id, { name: 'B' }]]) : (function () { const o = {}; o[id] = { name: 'B' }; return o; })()), 1);
      Database.resetRequestCache();
      t.eq(repo.findById(id).name, 'B');
    }],
    ['Formula injection disimpan sebagai teks & dibaca semula tepat', function (t) {
      const repo = Repo.of('FEEDBACK');
      const id = IdUtils.generate('B');
      repo.insert({ feedback_id: id, name: '=IMPORTXML("http://evil")', email: 'a@b.c', message: '+1-2', status: 'NEW', created_at: '', updated_at: '' });
      Database.resetRequestCache();
      t.eq(repo.findById(id).name, '=IMPORTXML("http://evil")');
      t.eq(repo.findById(id).message, '+1-2');
    }],
    ['Lajur tambahan manual dikekalkan semasa update', function (t) {
      const sh = Database.sheet('FEEDBACK');
      const col = sh.getLastColumn() + 1;
      sh.getRange(1, col, 1, 1).setValues([['nota_admin']]);
      Database.resetRequestCache();
      const repo = Repo.of('FEEDBACK');
      const id = IdUtils.generate('B');
      repo.insert({ feedback_id: id, name: 'X', email: 'x@y.z', message: 'm', status: 'NEW', created_at: '', updated_at: '' });
      const row = repo.locateRow(id);
      sh.getRange(row, col, 1, 1).setValues([['penting']]);
      Database.resetRequestCache();
      repo.update(id, { status: 'CLOSED' });
      t.eq(sh.getRange(row, col, 1, 1).getValues()[0][0], 'penting');
    }],
    ['hardDelete & deleteWhere', function (t) {
      const repo = Repo.of('FAVORITES');
      const a = IdUtils.generate('F'), b = IdUtils.generate('F');
      repo.insertMany([
        { favorite_id: a, user_id: 'U-X', doa_id: 'D-1', created_at: '' },
        { favorite_id: b, user_id: 'U-X', doa_id: 'D-2', created_at: '' }
      ]);
      t.ok(repo.hardDelete(a));
      Database.resetRequestCache();
      t.eq(repo.findById(a), null);
      t.eq(repo.deleteWhere(function (r) { return r.user_id === 'U-X'; }), 1);
    }],
    ['Kunci sibuk → BUSY (penulisan serentak)', function (t) {
      const lock = LockService.getScriptLock();
      lock.tryLock(1);
      try {
        t.throws(function () { Repo.of('FEEDBACK').insert({ feedback_id: IdUtils.generate('B') }); }, ERROR_CODES.BUSY);
      } finally {
        lock.releaseLock();
      }
    }, { nodeOnly: true }],
    ['Migrasi idempoten (dijalankan semula tanpa duplikat)', function (t) {
      const before = CategoryRepository.base().count();
      const r = Migration.run({});
      t.eq(r.applied.length, 0);
      t.eq(SeedData.categories(), 0);
      Database.resetRequestCache();
      t.eq(CategoryRepository.base().count(), before);
      t.eq(Migration.run({ dryRun: true }).pending.length, 0);
    }]
  ]
};

const TestSuiteAuth = {
  name: 'Auth',
  tests: [
    ['Daftar → token sah, peranan USER, tiada hash dalam USERS', function (t) {
      const u = TestHelpers.user('daftar');
      t.ok(SecurityUtils.isTokenFormat(u.token));
      t.eq(u.user.role, ROLES.USER);
      t.ok(u.ctx && u.ctx.userId === u.user.id);
      const raw = JSON.stringify(Database.sheet('USERS').getRange(1, 1, Database.sheet('USERS').getLastRow(), 11).getValues());
      t.ok(raw.indexOf('pbkdf2') < 0, 'hash tidak dalam USERS');
      t.ok(raw.indexOf('Rahsia123') < 0, 'tiada plaintext');
    }],
    ['Mass assignment: role dalam payload diabaikan', function (t) {
      const em = TestHelpers.email('mass');
      const d = TestAssert.apiOk(api({ action: 'auth.register', payload: { fullName: 'Cuba Naik', email: em, password: 'Rahsia123', role: 'SUPER_ADMIN' } }));
      t.eq(d.user.role, ROLES.USER);
    }],
    ['Email berganda ditolak', function (t) {
      const u = TestHelpers.user('dup');
      TestAssert.apiFail(api({ action: 'auth.register', payload: { fullName: 'Dua', email: u.email.toUpperCase(), password: 'Rahsia123' } }), ERROR_CODES.CONFLICT);
    }],
    ['Log masuk berjaya / gagal (mesej generik)', function (t) {
      const u = TestHelpers.user('login');
      TestAssert.apiOk(api({ action: 'auth.login', payload: { email: u.email, password: 'Rahsia123' } }));
      const bad = TestAssert.apiFail(api({ action: 'auth.login', payload: { email: u.email, password: 'Salah1234' } }), ERROR_CODES.UNAUTHENTICATED);
      const none = TestAssert.apiFail(api({ action: 'auth.login', payload: { email: 'tiada@test.local', password: 'Salah1234' } }), ERROR_CODES.UNAUTHENTICATED);
      t.eq(bad.message, none.message, 'tiada enumerasi akaun');
    }],
    ['Kunci akaun selepas 5 cubaan gagal', function (t) {
      const u = TestHelpers.user('lockout');
      for (let i = 0; i < CONFIG.LOGIN_MAX_FAILS; i++) api({ action: 'auth.login', payload: { email: u.email, password: 'Salah1234' } });
      TestAssert.apiFail(api({ action: 'auth.login', payload: { email: u.email, password: 'Rahsia123' } }), ERROR_CODES.RATE_LIMITED);
    }],
    ['Log keluar membatalkan token', function (t) {
      const u = TestHelpers.user('logout');
      TestAssert.apiOk(TestHelpers.call(u.token, 'auth.me'));
      TestAssert.apiOk(TestHelpers.call(u.token, 'auth.logout'));
      TestAssert.apiFail(TestHelpers.call(u.token, 'auth.me'), ERROR_CODES.UNAUTHENTICATED);
    }],
    ['Sekat pengguna → semua sesi tamat serta-merta', function (t) {
      const u = TestHelpers.user('blockme');
      const adm = TestHelpers.admin(ROLES.ADMIN);
      TestAssert.apiOk(TestHelpers.call(adm.token, 'admin.user.status', { userId: u.user.id, status: 'BLOCKED' }));
      TestAssert.apiFail(TestHelpers.call(u.token, 'auth.me'), ERROR_CODES.UNAUTHENTICATED);
      TestAssert.apiFail(api({ action: 'auth.login', payload: { email: u.email, password: 'Rahsia123' } }), ERROR_CODES.FORBIDDEN);
      Database.resetRequestCache();
      const live = SessionRepository.base().find(function (s) { return s.user_id === u.user.id && !s.revoked_at; });
      t.eq(live.length, 0, 'sesi dibatalkan dalam SESSIONS');
    }],
    ['Bootstrap SUPER_ADMIN melalui Script Property', function (t) {
      const d = TestAssert.apiOk(api({ action: 'auth.register', payload: { fullName: 'Super Admin', email: 'super@test.local', password: 'Rahsia123' } }));
      t.eq(d.user.role, ROLES.SUPER_ADMIN);
    }],
    ['Tukar kata laluan menamatkan sesi lain', function (t) {
      const u = TestHelpers.user('chpw');
      const second = TestAssert.apiOk(api({ action: 'auth.login', payload: { email: u.email, password: 'Rahsia123' } })).token;
      TestAssert.apiFail(TestHelpers.call(u.token, 'auth.changePassword', { currentPassword: 'Salah1234', newPassword: 'Baharu456' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiOk(TestHelpers.call(u.token, 'auth.changePassword', { currentPassword: 'Rahsia123', newPassword: 'Baharu456' }));
      TestAssert.apiOk(TestHelpers.call(u.token, 'auth.me'));
      TestAssert.apiFail(TestHelpers.call(second, 'auth.me'), ERROR_CODES.UNAUTHENTICATED);
    }],
    ['Set semula kata laluan dengan kod email', function (t, sandbox) {
      const u = TestHelpers.user('reset');
      const r1 = TestAssert.apiOk(api({ action: 'auth.requestReset', payload: { email: u.email } }));
      const r2 = TestAssert.apiOk(api({ action: 'auth.requestReset', payload: { email: 'tiada@test.local' } }));
      t.eq(r1.message, r2.message, 'anti-enumerasi');
      const mail = globalThis.__mails ? globalThis.__mails[globalThis.__mails.length - 1] : null;
      t.ok(mail && mail.to === u.email, 'email dihantar');
      const code = mail.htmlBody.match(/<b>(\d{6})<\/b>/)[1];
      TestAssert.apiFail(api({ action: 'auth.resetPassword', payload: { email: u.email, code: code === '000000' ? '111111' : '000000', newPassword: 'Baharu789' } }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiOk(api({ action: 'auth.resetPassword', payload: { email: u.email, code: code, newPassword: 'Baharu789' } }));
      TestAssert.apiFail(TestHelpers.call(u.token, 'auth.me'), ERROR_CODES.UNAUTHENTICATED);
      TestAssert.apiOk(api({ action: 'auth.login', payload: { email: u.email, password: 'Baharu789' } }));
      TestAssert.apiFail(api({ action: 'auth.resetPassword', payload: { email: u.email, code: code, newPassword: 'Lagi1234' } }), ERROR_CODES.VALIDATION_ERROR, 'kod sekali guna');
    }, { nodeOnly: true }]
  ]
};

const TestSuiteDoa = {
  name: 'Doa',
  tests: [
    ['Hantar doa untuk diri sendiri', function (t) {
      const u = TestHelpers.user('doa');
      const d = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.create', { recipientType: 'SELF', categoryId: TestHelpers.categoryId(), title: 'Kesihatan', doaText: 'Ya Allah, sembuhkanlah penyakitku.' }));
      t.eq(d.recipientName, 'Diri sendiri');
      t.ok(d.canEdit);
    }],
    ['Validasi: penerima wajib, panjang minimum, kategori sah', function (t) {
      const u = TestHelpers.user('doaval');
      TestAssert.apiFail(TestHelpers.call(u.token, 'doa.create', { recipientType: 'PERSON', categoryId: TestHelpers.categoryId(), doaText: 'Semoga dipermudahkan urusan.' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiFail(TestHelpers.call(u.token, 'doa.create', { recipientType: 'SELF', categoryId: TestHelpers.categoryId(), doaText: 'pendek' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiFail(TestHelpers.call(u.token, 'doa.create', { recipientType: 'SELF', categoryId: 'C-0000000000000000', doaText: 'Semoga dipermudahkan urusan.' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiFail(TestHelpers.call(u.token, 'doa.create', { recipientType: 'ROOT', categoryId: TestHelpers.categoryId(), doaText: 'Semoga dipermudahkan urusan.' }), ERROR_CODES.VALIDATION_ERROR);
    }],
    ['XSS: tag HTML dibuang daripada input', function (t) {
      const u = TestHelpers.user('xss');
      const d = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.create', {
        recipientType: 'PERSON', recipientName: '<img src=x onerror=alert(1)>Ibu', categoryId: TestHelpers.categoryId(),
        title: '<script>alert(1)</script>Tajuk', doaText: 'Ya Allah <b onclick="x()">lindungilah</b> ibuku.'
      }));
      t.eq(d.recipientName, 'Ibu');
      t.eq(d.title, 'alert(1)Tajuk');
      t.ok(d.text.indexOf('<') < 0 && d.text.indexOf('onclick') < 0, d.text);
    }],
    ['Senarai: skop, carian, pagination', function (t) {
      const u = TestHelpers.user('list');
      const cat = TestHelpers.categoryId();
      for (let i = 0; i < 5; i++) {
        TestHelpers.call(u.token, 'doa.create', { recipientType: i % 2 ? 'PERSON' : 'SELF', recipientName: 'Sahabat ' + i, categoryId: cat, doaText: 'Doa nombor ' + i + ' semoga diterima.' });
      }
      const all = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.list', { pageSize: 2 }));
      t.eq(all.meta.total, 5);
      t.eq(all.items.length, 2);
      t.eq(all.meta.totalPages, 3);
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.list', { scope: 'SELF' })).meta.total, 3);
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.list', { scope: 'OTHERS' })).meta.total, 2);
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.list', { q: 'nombor 3' })).meta.total, 1);
    }],
    ['IDOR: pengguna lain tidak boleh baca/ubah/padam/kegemaran', function (t) {
      const a = TestHelpers.user('owner');
      const b = TestHelpers.user('intruder');
      const d = TestAssert.apiOk(TestHelpers.call(a.token, 'doa.create', { recipientType: 'SELF', categoryId: TestHelpers.categoryId(), doaText: 'Rahsia antara aku dan Tuhanku.' }));
      TestAssert.apiFail(TestHelpers.call(b.token, 'doa.get', { id: d.id }), ERROR_CODES.NOT_FOUND);
      TestAssert.apiFail(TestHelpers.call(b.token, 'doa.update', { id: d.id, doaText: 'Diubah oleh orang lain.' }), ERROR_CODES.NOT_FOUND);
      TestAssert.apiFail(TestHelpers.call(b.token, 'doa.delete', { id: d.id }), ERROR_CODES.NOT_FOUND);
      TestAssert.apiFail(TestHelpers.call(b.token, 'doa.favorite', { id: d.id }), ERROR_CODES.NOT_FOUND);
      t.eq(TestAssert.apiOk(TestHelpers.call(b.token, 'doa.list', {})).meta.total, 0);
    }],
    ['Kemas kini & padam (soft delete)', function (t) {
      const u = TestHelpers.user('upd');
      const d = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.create', { recipientType: 'SELF', categoryId: TestHelpers.categoryId(), doaText: 'Asal: semoga dipermudahkan.' }));
      const up = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.update', { id: d.id, doaText: 'Baharu: semoga dipermudahkan.', recipientType: 'PERSON', recipientName: 'Ayah' }));
      t.eq(up.recipientName, 'Ayah');
      TestAssert.apiOk(TestHelpers.call(u.token, 'doa.delete', { id: d.id }));
      TestAssert.apiFail(TestHelpers.call(u.token, 'doa.get', { id: d.id }), ERROR_CODES.NOT_FOUND);
      Database.resetRequestCache();
      t.eq(DoaRepository.findById(d.id).status, DOA_STATUS.DELETED, 'rekod dikekalkan');
    }],
    ['Kegemaran togol tanpa duplikat', function (t) {
      const u = TestHelpers.user('fav');
      const d = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.create', { recipientType: 'SELF', categoryId: TestHelpers.categoryId(), doaText: 'Doa kegemaran saya hari ini.' }));
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.favorite', { id: d.id })).isFavorite, true);
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.favorite', { id: d.id })).isFavorite, false);
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.favorite', { id: d.id })).isFavorite, true);
      Database.resetRequestCache();
      t.eq(FavoriteRepository.byUser(u.user.id).length, 1);
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.list', { scope: 'FAVORITES' })).meta.total, 1);
    }],
    ['Hantaran berganda (requestId sama) → satu rekod', function (t) {
      const u = TestHelpers.user('idem');
      const p = { recipientType: 'SELF', categoryId: TestHelpers.categoryId(), doaText: 'Doa yang diklik dua kali.', requestId: 'req_' + Utilities.getUuid().replace(/-/g, '') };
      const a = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.create', p));
      const b = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.create', p));
      t.eq(a.id, b.id);
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.list', {})).meta.total, 1);
    }],
    ['Lampiran: PNG sah disimpan di Drive peribadi & boleh dibaca pemilik sahaja', function (t) {
      const u = TestHelpers.user('att');
      const other = TestHelpers.user('att2');
      const d = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.create', {
        recipientType: 'SELF', categoryId: TestHelpers.categoryId(), doaText: 'Doa dengan gambar keluarga.',
        attachments: [{ name: 'keluarga.png', mimeType: 'image/png', data: TestHelpers.PNG_1PX }]
      }));
      t.eq(d.attachmentCount, 1);
      const full = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.get', { id: d.id }));
      const att = full.attachments[0];
      t.eq(att.mimeType, 'image/png');
      const file = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.attachment', { id: att.id }));
      t.eq(file.data, TestHelpers.PNG_1PX);
      TestAssert.apiFail(TestHelpers.call(other.token, 'doa.attachment', { id: att.id }), ERROR_CODES.NOT_FOUND);
    }],
    ['Lampiran tidak sah → tiada rekod separa', function (t) {
      const u = TestHelpers.user('attbad');
      TestAssert.apiFail(TestHelpers.call(u.token, 'doa.create', {
        recipientType: 'SELF', categoryId: TestHelpers.categoryId(), doaText: 'Doa dengan fail berbahaya.',
        attachments: [{ name: 'a.png', mimeType: 'image/png', data: TestHelpers.PNG_1PX }, { name: 'virus.png', mimeType: 'image/png', data: 'TVqQAAMAAAAEAAAA' }]
      }), ERROR_CODES.VALIDATION_ERROR);
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.list', {})).meta.total, 0);
    }],
    ['Papan pemuka & eksport PDF', function (t) {
      const u = TestHelpers.user('dash');
      TestHelpers.call(u.token, 'doa.create', { recipientType: 'SELF', categoryId: TestHelpers.categoryId(), doaText: 'Doa untuk dieksport ke PDF.' });
      const dash = TestAssert.apiOk(TestHelpers.call(u.token, 'user.dashboard'));
      t.eq(dash.stats.total, 1);
      t.eq(dash.stats.thisMonth, 1);
      const pdf = TestAssert.apiOk(TestHelpers.call(u.token, 'export.pdf', { scope: 'ALL' }));
      t.ok(/\.pdf$/.test(pdf.filename));
      t.eq(Utilities.newBlob(Utilities.base64Decode(pdf.data)).getDataAsString().slice(0, 5), '%PDF-');
    }]
  ]
};

const TestSuiteRecipient = {
  name: 'Kumpul Doa',
  tests: [
    ['Pautan: cipta, papar awam (tiada email pemilik), hantar, terima', function (t) {
      const owner = TestHelpers.user('jemaah');
      const link = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.create', { displayName: 'Mohamad Zaki', title: 'Doakan umrah saya', occasion: 'UMRAH' }));
      t.ok(/\?c=[A-Z0-9]{8}$/.test(link.shareUrl), link.shareUrl);
      const pub = TestAssert.apiOk(api({ action: 'recipient.public', payload: { code: link.code } }));
      t.ok(JSON.stringify(pub).indexOf(owner.email) < 0, 'tiada email');
      t.ok(pub.formToken && pub.categories.length > 0);
      TestAssert.apiFail(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Bot', categoryId: TestHelpers.categoryId(), doaText: 'Terlalu cepat dihantar.', formToken: pub.formToken } }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiOk(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Mak Long', categoryId: TestHelpers.categoryId(), doaText: 'Semoga selamat pergi dan pulang.', formToken: TestHelpers.agedFormToken(link.code) } }));
      TestAssert.apiOk(api({ action: 'recipient.submit', payload: { code: link.code, isAnonymous: true, categoryId: TestHelpers.categoryId(), doaText: 'Semoga umrahmu mabrur.', formToken: TestHelpers.agedFormToken(link.code) } }));
      const recv = TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.list', { scope: 'RECEIVED' }));
      t.eq(recv.meta.total, 2);
      t.ok(recv.items.some(function (d) { return d.senderName === 'Mak Long'; }));
      t.ok(recv.items.some(function (d) { return d.senderName === DoaModel.ANON_LABEL; }));
      const notifs = TestAssert.apiOk(TestHelpers.call(owner.token, 'notification.list', {}));
      t.ok(notifs.items.some(function (n) { return n.type === NOTIF_TYPE.DOA_RECEIVED; }));
      const mine = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.mine'));
      t.eq(mine[0].doaCount, 2);
    }],
    ['Telah dibacakan: notifikasi kepada pengirim berakaun; DTO Daripada/Untuk', function (t) {
      const owner = TestHelpers.user('pray');
      const sender = TestHelpers.user('prays');
      const link = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.create', { displayName: 'Pak Haji', title: 'Doakan umrah saya' }));
      TestAssert.apiOk(TestHelpers.call(sender.token, 'recipient.submit', { code: link.code, senderName: 'Daniel', categoryId: TestHelpers.categoryId(), title: 'Final exam', doaText: 'Semoga final exam saya berjaya.', formToken: TestHelpers.agedFormToken(link.code) }));
      const d = TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.list', { scope: 'RECEIVED' })).items[0];
      t.eq(d.direction, 'RECEIVED'); t.eq(d.senderName, 'Daniel'); t.eq(d.isMine, false);
      t.ok(d.canMarkPrayed && d.senderNotifiable && !d.isPrayed);
      // Pengirim tidak boleh menanda doa yang dia hantar kepada orang lain
      TestAssert.apiFail(TestHelpers.call(sender.token, 'doa.markPrayed', { id: d.id }), ERROR_CODES.FORBIDDEN);
      const r = TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.markPrayed', { id: d.id }));
      t.ok(r.isPrayed && r.prayedAt && !r.canMarkPrayed); t.eq(r.notified, 'APP');
      const n = TestAssert.apiOk(TestHelpers.call(sender.token, 'notification.list', {}));
      t.ok(n.items.some(function (x) { return x.type === NOTIF_TYPE.DOA_PRAYED && x.referenceId === d.id; }), 'pengirim dimaklumkan');
      // Idempoten: tanda kali kedua tidak menghantar notifikasi berganda
      TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.markPrayed', { id: d.id }));
      const n2 = TestAssert.apiOk(TestHelpers.call(sender.token, 'notification.list', {}));
      t.eq(n2.items.filter(function (x) { return x.type === NOTIF_TYPE.DOA_PRAYED; }).length, 1);
      // Pengirim nampak status dibacakan
      const sent = TestAssert.apiOk(TestHelpers.call(sender.token, 'doa.get', { id: d.id }));
      t.ok(sent.isPrayed && sent.isMine && sent.direction === 'SENT' && !sent.canMarkPrayed);
      // Doa untuk diri sendiri: boleh ditanda, tiada notifikasi
      const self = TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.create', { recipientType: 'SELF', categoryId: TestHelpers.categoryId(), doaText: 'Ya Allah, permudahkan urusanku.' }));
      t.ok(self.isMine && self.canMarkPrayed && !self.senderNotifiable);
      t.eq(TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.markPrayed', { id: self.id })).notified, '');
    }],
    ['Telah dibacakan: email pilihan pengirim awam dihantar sekali & dipadam', function (t) {
      const owner = TestHelpers.user('praye');
      const link = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.create', { displayName: 'Mak Cik', title: 'Doakan haji saya' }));
      TestAssert.apiFail(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Ali', senderEmail: 'bukan-email', categoryId: TestHelpers.categoryId(), doaText: 'Semoga haji mabrur.', formToken: TestHelpers.agedFormToken(link.code) } }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiOk(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Ali', senderEmail: 'Ali@Contoh.MY', categoryId: TestHelpers.categoryId(), doaText: 'Semoga haji mabrur.', formToken: TestHelpers.agedFormToken(link.code) } }));
      const d = TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.list', { scope: 'RECEIVED' })).items[0];
      t.ok(JSON.stringify(d).indexOf('contoh.my') < 0, 'email tidak didedahkan kepada penerima');
      t.ok(d.senderNotifiable);
      const before = globalThis.__mails.length;
      t.eq(TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.markPrayed', { id: d.id })).notified, 'EMAIL');
      t.eq(globalThis.__mails.length, before + 1);
      t.eq(globalThis.__mails[before].to, 'ali@contoh.my');
      Database.resetRequestCache();
      t.eq(DoaRepository.findById(d.id).sender_email, '', 'email dipadam selepas makluman');
    }, { nodeOnly: true }],
    ['No. WhatsApp: dinormalkan, hanya dilihat pemilik doa, dipadam 30 hari selepas dibacakan', function (t) {
      t.eq(Validator.waPhone('012-345 6789'), '60123456789');
      t.eq(Validator.waPhone('+60 11-2345 6789'), '601123456789');
      t.eq(Validator.waPhone('0065 9123 4567'), '6591234567');
      t.eq(Validator.waPhone(''), '');
      t.throws(function () { Validator.waPhone('12345'); }, ERROR_CODES.VALIDATION_ERROR);
      const owner = TestHelpers.user('wa');
      const sender = TestHelpers.user('was');
      const link = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.create', { displayName: 'Pak Long', title: 'Doakan umrah saya', occasion: 'UMRAH' }));
      TestAssert.apiFail(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'X', senderPhone: 'abc', categoryId: TestHelpers.categoryId(), doaText: 'Semoga dipermudahkan.', formToken: TestHelpers.agedFormToken(link.code) } }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiOk(TestHelpers.call(sender.token, 'recipient.submit', { code: link.code, senderName: 'Daniel', senderPhone: '012-345 6789', categoryId: TestHelpers.categoryId(), doaText: 'Semoga final exam berjaya.', formToken: TestHelpers.agedFormToken(link.code) }));
      const d = TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.list', { scope: 'RECEIVED' })).items[0];
      t.eq(d.senderWhatsApp, '60123456789'); t.eq(d.occasion, 'UMRAH');
      const asSender = TestAssert.apiOk(TestHelpers.call(sender.token, 'doa.get', { id: d.id }));
      t.eq(asSender.senderWhatsApp, '', 'pengirim tidak menerima semula nombor');
      const admin = TestHelpers.admin(ROLES.SUPER_ADMIN);
      t.ok(JSON.stringify(TestAssert.apiOk(TestHelpers.call(admin.token, 'admin.doas', { q: d.id }))).indexOf('60123456789') < 0, 'admin tidak nampak nombor');
      const r = TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.markPrayed', { id: d.id }));
      t.eq(r.senderWhatsApp, '60123456789', 'nombor kekal untuk butang WhatsApp');
      DoaRepository.update(d.id, { prayed_at: '2000-01-01T00:00:00.000Z' });
      Database.resetRequestCache();
      MaintenanceService.purgeSenderEmails();
      Database.resetRequestCache();
      t.eq(DoaRepository.findById(d.id).sender_phone, '');
    }],
    ['Penyelenggaraan memadam email pengirim lama', function (t) {
      const owner = TestHelpers.user('purge');
      const link = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.create', { displayName: 'Abu', title: 'Doakan saya' }));
      TestAssert.apiOk(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Ah', senderEmail: 'ah@contoh.my', categoryId: TestHelpers.categoryId(), doaText: 'Semoga dipermudahkan.', formToken: TestHelpers.agedFormToken(link.code) } }));
      const d = TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.list', { scope: 'RECEIVED' })).items[0];
      DoaRepository.update(d.id, { created_at: '2000-01-01T00:00:00.000Z' });
      Database.resetRequestCache();
      t.ok(MaintenanceService.purgeSenderEmails() >= 1);
      Database.resetRequestCache();
      t.eq(DoaRepository.findById(d.id).sender_email, '');
    }],
    ['Honeypot: bot "berjaya" palsu tanpa rekod', function (t) {
      const owner = TestHelpers.user('hp');
      const link = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.create', { displayName: 'Ali', title: 'Doakan peperiksaan saya' }));
      TestAssert.apiOk(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Spam', categoryId: TestHelpers.categoryId(), doaText: 'Beli ubat murah di sini sekarang.', formToken: TestHelpers.agedFormToken(link.code), website: 'http://spam' } }));
      t.eq(TestAssert.apiOk(TestHelpers.call(owner.token, 'doa.list', { scope: 'RECEIVED' })).meta.total, 0);
    }],
    ['Pautan ditutup menolak doa', function (t) {
      const owner = TestHelpers.user('close');
      const link = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.create', { displayName: 'Siti', title: 'Doakan perjalanan saya' }));
      TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.update', { id: link.id, status: 'CLOSED' }));
      TestAssert.apiFail(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Kawan', categoryId: TestHelpers.categoryId(), doaText: 'Semoga selamat sampai ke destinasi.', formToken: TestHelpers.agedFormToken(link.code) } }), ERROR_CODES.FORBIDDEN);
    }],
    ['Pengguna lain tidak boleh ubah pautan orang lain', function (t) {
      const owner = TestHelpers.user('lo');
      const other = TestHelpers.user('lx');
      const link = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.create', { displayName: 'Abu', title: 'Doakan saya' }));
      TestAssert.apiFail(TestHelpers.call(other.token, 'recipient.update', { id: link.id, status: 'CLOSED' }), ERROR_CODES.NOT_FOUND);
    }]
  ]
};

const TestSuitePush = {
  name: 'Kategori & Notifikasi telefon',
  tests: [
    ['Kategori: hanya "Umum" aktif; doa tanpa kategori → Umum; kategori tersembunyi ditolak', function (t) {
      const active = CategoryRepository.active();
      t.eq(active.length, 1); t.eq(active[0].name_ms, 'Umum');
      t.ok(CategoryRepository.all().length > 1, 'kategori lama disimpan (tersembunyi), bukan dipadam');
      const u = TestHelpers.user('cat');
      const d = TestAssert.apiOk(TestHelpers.call(u.token, 'doa.create', { recipientType: 'SELF', doaText: 'Ya Allah, kurniakan kesihatan.' }));
      t.eq(d.categoryName, 'Umum');
      const hidden = CategoryRepository.all().filter(function (c) { return c.status !== CATEGORY_STATUS.ACTIVE; })[0];
      TestAssert.apiFail(TestHelpers.call(u.token, 'doa.create', { recipientType: 'SELF', categoryId: hidden.category_id, doaText: 'Ya Allah, kurniakan kesihatan.' }), ERROR_CODES.VALIDATION_ERROR);
      const link = TestAssert.apiOk(TestHelpers.call(u.token, 'recipient.create', { displayName: 'Ali', title: 'Doakan saya' }));
      t.eq(TestAssert.apiOk(api({ action: 'recipient.public', payload: { code: link.code } })).categories.length, 1);
      TestAssert.apiOk(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Abu', doaText: 'Semoga dipermudahkan.', formToken: TestHelpers.agedFormToken(link.code) } }));
      t.eq(TestAssert.apiOk(TestHelpers.call(u.token, 'doa.list', { scope: 'RECEIVED' })).items[0].categoryName, 'Umum');
      t.eq(SeedData.onlyDefaultCategory().hidden.length, 0, 'migrasi idempoten');
    }, { nodeOnly: true }],
    ['Push: hurai JSON akaun servis dengan toleransi tampal', function (t) {
      const sa = globalThis.__testServiceAccount;
      t.ok(PushService.parseServiceAccount(sa), 'JSON biasa');
      t.ok(PushService.parseServiceAccount('\uFEFF  ' + sa + '\n'), 'BOM & ruang');
      t.ok(PushService.parseServiceAccount(JSON.stringify(sa)), 'dibalut petikan');
      t.ok(PushService.parseServiceAccount(Utilities.base64Encode(sa)), 'base64');
      t.ok(PushService.parseServiceAccount(sa.replace(/"/g, '\u201C')) === null || true, 'petikan pintar tidak melontar');
      t.eq(PushService.parseServiceAccount(sa.slice(0, 500)), null, 'terpotong → null');
      t.eq(PushService.parseServiceAccount('{"a":1}'), null, 'bukan akaun servis → null');
      const d = PushService.diagnose(sa.slice(0, 500));
      t.ok(d.length === 500 && d.hasPrivateKey && !d.hasEndKey && JSON.stringify(d).indexOf('PRIVATE') < 0, 'diagnostik tanpa rahsia');
    }, { nodeOnly: true }],
    ['Push: daftar/buang token, had peranti, pindah milik', function (t) {
      const a = TestHelpers.user('pusha');
      const b = TestHelpers.user('pushb');
      const tok = function (n) { return 'fcmTok' + n + '_' + 'x'.repeat(40); };
      TestAssert.apiFail(TestHelpers.call(a.token, 'push.register', { token: 'bad token!' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiFail(api({ action: 'push.register', payload: { token: tok(0) } }), ERROR_CODES.UNAUTHENTICATED);
      for (let i = 1; i <= 7; i++) TestAssert.apiOk(TestHelpers.call(a.token, 'push.register', { token: tok(i), platform: 'ANDROID' }));
      t.eq(PushTokenRepository.activeByUser(a.user.id).length, PushService.MAX_TOKENS_PER_USER, 'had peranti');
      // Peranti yang sama kini digunakan oleh pengguna B → token dipindah milik
      TestAssert.apiOk(TestHelpers.call(b.token, 'push.register', { token: tok(7) }));
      t.ok(PushTokenRepository.activeByUser(a.user.id).every(function (x) { return x.token !== tok(7); }));
      t.eq(PushTokenRepository.activeByUser(b.user.id).length, 1);
      // A tidak boleh membuang token B
      TestAssert.apiOk(TestHelpers.call(a.token, 'push.unregister', { token: tok(7) }));
      t.eq(PushTokenRepository.activeByUser(b.user.id).length, 1);
      TestAssert.apiOk(TestHelpers.call(b.token, 'push.unregister', { token: tok(7) }));
      t.eq(PushTokenRepository.activeByUser(b.user.id).length, 0);
      t.eq(TestAssert.apiOk(TestHelpers.call(b.token, 'push.status')).devices, 0);
    }, { nodeOnly: true }],
    ['Push: tanpa konfigurasi FCM → senyap; dengan konfigurasi → hantar FCM v1 & batal token tidak sah', function (t) {
      const st = globalThis.__mockState;
      const owner = TestHelpers.user('pusho');
      TestAssert.apiOk(TestHelpers.call(owner.token, 'push.register', { token: 'okToken_' + 'a'.repeat(40) }));
      TestAssert.apiOk(TestHelpers.call(owner.token, 'push.register', { token: 'deadToken_' + 'b'.repeat(40) }));
      const link = TestAssert.apiOk(TestHelpers.call(owner.token, 'recipient.create', { displayName: 'Pak Haji', title: 'Doakan umrah saya' }));
      Env.set('FCM_SERVICE_ACCOUNT', '');
      t.eq(TestAssert.apiOk(api({ action: 'public.config' })).PUSH_ENABLED, false);
      const before = st.fetches.length;
      TestAssert.apiOk(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Daniel', doaText: 'Semoga selamat.', formToken: TestHelpers.agedFormToken(link.code) } }));
      t.eq(st.fetches.length, before, 'tiada panggilan rangkaian tanpa konfigurasi');

      Env.set('FCM_SERVICE_ACCOUNT', globalThis.__testServiceAccount);
      Env.set('PUBLIC_BASE_URL', 'https://kirimdoa.github.io/');
      CacheService.getScriptCache().remove(PushService.TOKEN_CACHE_KEY);
      st.fetchHandler = function (url, params) {
        if (/oauth2/.test(url)) return { code: 200, body: { access_token: 'ya29.test', expires_in: 3599 } };
        return JSON.parse(params.payload).message.token.indexOf('deadToken') === 0
          ? { code: 404, body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } }
          : { code: 200, body: { name: 'projects/kirimdoa-test/messages/1' } };
      };
      try {
        t.eq(TestAssert.apiOk(api({ action: 'public.config' })).PUSH_ENABLED, true);
        const start = st.fetches.length;
        TestAssert.apiOk(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Siti', doaText: 'Semoga mabrur.', formToken: TestHelpers.agedFormToken(link.code) } }));
        const calls = st.fetches.slice(start);
        const oauth = calls.filter(function (c) { return /oauth2/.test(c.url); })[0];
        t.ok(oauth && globalThis.__verifyJwt(oauth.params.payload.assertion), 'JWT RS256 sah');
        const sends = calls.filter(function (c) { return /fcm\.googleapis\.com\/v1\/projects\/kirimdoa-test\/messages:send/.test(c.url); });
        t.eq(sends.length, 2, 'dihantar ke 2 peranti');
        const msg = JSON.parse(sends[0].params.payload).message;
        t.ok(/Doa baharu/.test(msg.notification.title) && /Siti/.test(msg.notification.body));
        t.eq(msg.webpush.fcm_options.link, 'https://kirimdoa.github.io/#/notifikasi');
        t.ok(/^[1-9][0-9]*$/.test(msg.data.badge), 'bilangan belum dibaca untuk lencana ikon: ' + msg.data.badge);
        t.ok(msg.webpush.notification.tag.indexOf('DOA_RECEIVED:D-') === 0, 'tag unik setiap doa (notifikasi bertindan)');
        t.eq(msg.webpush.notification.badge, 'https://kirimdoa.github.io/icons/badge-72.png');
        t.eq(sends[0].params.headers.Authorization, 'Bearer ya29.test');
        t.eq(PushTokenRepository.activeByUser(owner.user.id).length, 1, 'token UNREGISTERED dibatalkan');
        // Token akses dicache — tiada permintaan OAuth kedua
        const s2 = st.fetches.length;
        PushService.sendToUser(owner.user.id, { title: 'x', body: 'y', type: 'TEST' });
        t.eq(st.fetches.slice(s2).filter(function (c) { return /oauth2/.test(c.url); }).length, 0);
        // FCM ralat 500 → tidak melontar, permintaan asal tetap berjaya
        st.fetchHandler = function (url) { return /oauth2/.test(url) ? { code: 200, body: { access_token: 'ya29.t', expires_in: 3599 } } : { code: 500, body: 'oops' }; };
        TestAssert.apiOk(api({ action: 'recipient.submit', payload: { code: link.code, senderName: 'Ah', doaText: 'Semoga sihat.', formToken: TestHelpers.agedFormToken(link.code) } }));
      } finally {
        st.fetchHandler = null;
        Env.set('FCM_SERVICE_ACCOUNT', '');
        Env.set('PUBLIC_BASE_URL', '');
      }
    }, { nodeOnly: true }]
  ]
};

const TestSuiteAdmin = {
  name: 'Admin & API',
  tests: [
    ['Tindakan tidak dikenali / payload rosak', function (t) {
      TestAssert.apiFail(api({ action: 'drop.tables' }), ERROR_CODES.BAD_REQUEST);
      TestAssert.apiFail(api({ action: 'public.config', payload: [1, 2] }), ERROR_CODES.BAD_REQUEST);
      TestAssert.apiFail(api(null), ERROR_CODES.BAD_REQUEST);
      TestAssert.apiFail(api({ action: 'constructor' }), ERROR_CODES.BAD_REQUEST);
    }],
    ['Tanpa token → UNAUTHENTICATED; token palsu → UNAUTHENTICATED', function (t) {
      TestAssert.apiFail(api({ action: 'doa.list' }), ERROR_CODES.UNAUTHENTICATED);
      TestAssert.apiFail(api({ action: 'doa.list', token: 'A'.repeat(43) }), ERROR_CODES.UNAUTHENTICATED);
    }],
    ['RBAC: USER tidak boleh akses admin; ADMIN tidak boleh akses SUPER_ADMIN', function (t) {
      const u = TestHelpers.user('rbac');
      const a = TestHelpers.admin(ROLES.ADMIN);
      TestAssert.apiFail(TestHelpers.call(u.token, 'admin.stats'), ERROR_CODES.FORBIDDEN);
      TestAssert.apiFail(TestHelpers.call(u.token, 'admin.users'), ERROR_CODES.FORBIDDEN);
      TestAssert.apiOk(TestHelpers.call(a.token, 'admin.stats'));
      TestAssert.apiFail(TestHelpers.call(a.token, 'admin.health'), ERROR_CODES.FORBIDDEN);
      TestAssert.apiFail(TestHelpers.call(a.token, 'admin.user.role', { userId: u.user.id, role: 'ADMIN' }), ERROR_CODES.FORBIDDEN);
    }],
    ['Peningkatan keistimewaan: ADMIN tidak boleh sekat ADMIN lain / diri sendiri', function (t) {
      const a1 = TestHelpers.admin(ROLES.ADMIN);
      const a2 = TestHelpers.admin(ROLES.ADMIN);
      TestAssert.apiFail(TestHelpers.call(a1.token, 'admin.user.status', { userId: a2.user.id, status: 'BLOCKED' }), ERROR_CODES.FORBIDDEN);
      TestAssert.apiFail(TestHelpers.call(a1.token, 'admin.user.status', { userId: a1.user.id, status: 'INACTIVE' }), ERROR_CODES.FORBIDDEN);
    }],
    ['SUPER_ADMIN tukar peranan; tidak boleh turunkan SUPER_ADMIN terakhir', function (t) {
      const s = TestHelpers.admin(ROLES.SUPER_ADMIN);
      const u = TestHelpers.user('promote');
      TestAssert.apiOk(TestHelpers.call(s.token, 'admin.user.role', { userId: u.user.id, role: 'ADMIN' }));
      TestAssert.apiFail(TestHelpers.call(u.token, 'auth.me'), ERROR_CODES.UNAUTHENTICATED); // dipaksa log masuk semula
      TestAssert.apiFail(TestHelpers.call(s.token, 'admin.user.role', { userId: s.user.id, role: 'USER' }), ERROR_CODES.FORBIDDEN);
    }],
    ['Tetapan: ADMIN tidak boleh ubah tetapan kritikal', function (t) {
      const a = TestHelpers.admin(ROLES.ADMIN);
      TestAssert.apiOk(TestHelpers.call(a.token, 'admin.settings.update', { changes: { SYSTEM_TAGLINE: 'Doa anda, cahaya hati' } }));
      TestAssert.apiFail(TestHelpers.call(a.token, 'admin.settings.update', { changes: { MAINTENANCE_MODE: true } }), ERROR_CODES.FORBIDDEN);
      TestAssert.apiFail(TestHelpers.call(a.token, 'admin.settings.update', { changes: { NOT_A_KEY: 1 } }), ERROR_CODES.VALIDATION_ERROR);
    }],
    ['Mod penyelenggaraan: pengguna disekat, admin dibenarkan', function (t) {
      const s = TestHelpers.admin(ROLES.SUPER_ADMIN);
      const u = TestHelpers.user('maint');
      TestAssert.apiOk(TestHelpers.call(s.token, 'admin.settings.update', { changes: { MAINTENANCE_MODE: true } }));
      try {
        TestAssert.apiFail(TestHelpers.call(u.token, 'doa.list'), ERROR_CODES.MAINTENANCE);
        TestAssert.apiOk(TestHelpers.call(s.token, 'admin.stats'));
        TestAssert.apiOk(api({ action: 'public.config' }));
      } finally {
        TestAssert.apiOk(TestHelpers.call(s.token, 'admin.settings.update', { changes: { MAINTENANCE_MODE: false } }));
      }
    }],
    ['Ralat dalaman disembunyikan + errorId direkod', function (t) {
      const table = Router.table();
      table['test.boom'] = { role: ROLES.PUBLIC, fn: function () { null.x(); } };
      try {
        const res = TestAssert.apiFail(api({ action: 'test.boom' }), ERROR_CODES.INTERNAL_ERROR);
        t.eq(res.message, ErrorHandler.GENERIC_MESSAGE);
        t.ok(/^E-\d{12}-[0-9A-F]{6}$/.test(res.meta.errorId), res.meta.errorId);
        t.ok(JSON.stringify(res).indexOf('Cannot read') < 0 && JSON.stringify(res).indexOf('stack') < 0, 'tiada stack trace');
        Database.resetRequestCache();
        t.eq(SystemLogRepository.recent(1)[0].error_id, res.meta.errorId);
      } finally {
        delete table['test.boom'];
      }
    }],
    ['Audit merekod tindakan admin', function (t) {
      const a = TestHelpers.admin(ROLES.ADMIN);
      TestAssert.apiOk(TestHelpers.call(a.token, 'admin.category.create', { nameMs: 'Kategori Ujian ' + Date.now(), icon: 'star' }));
      const logs = TestAssert.apiOk(TestHelpers.call(a.token, 'admin.audit', { action: 'CATEGORY_CREATED' }));
      t.ok(logs.items.length >= 1);
      t.eq(logs.items[0].userId, a.user.id);
      const all = JSON.stringify(Database.sheet('AUDIT_LOGS').getRange(1, 1, Database.sheet('AUDIT_LOGS').getLastRow(), 10).getValues());
      t.ok(all.indexOf('Rahsia123') < 0, 'tiada kata laluan dalam audit');
    }],
    ['Admin: statistik, laporan, hebahan', function (t) {
      const s = TestHelpers.admin(ROLES.SUPER_ADMIN);
      const st = TestAssert.apiOk(TestHelpers.call(s.token, 'admin.stats'));
      t.ok(st.kpi.totalUsers > 0 && st.charts.doaByDay.length === 14);
      const rep = TestAssert.apiOk(TestHelpers.call(s.token, 'admin.report', {}));
      t.ok(rep.summary.totalDoa >= 0);
      const b = TestAssert.apiOk(TestHelpers.call(s.token, 'admin.broadcast', { title: 'Makluman', message: 'Selamat menggunakan Kirim Doa.' }));
      t.ok(b.sent > 0);
      const h = TestAssert.apiOk(TestHelpers.call(s.token, 'admin.health'));
      t.ok(h.database.ok, 'pangkalan data sihat');
    }],
    ['doGet menghidangkan halaman (meta tag dibenarkan, anti-clickjacking lalai)', function (t) {
      const out = doGet({ parameter: { c: 'abc<script>' } });
      t.eq(out.xframe, 'DEFAULT', 'tidak boleh dibenam secara lalai');
      t.ok(out.meta.viewport && out.title.indexOf('Kirim Doa') === 0);
      const ok = doGet({ parameter: { c: 'K2QCST5Z' } });
      t.ok(ok && ok.meta, 'kod sah diterima');
    }, { nodeOnly: true }],
    ['doPost: API JSON untuk frontend statik (sama dengan api())', function (t) {
      const post = function (body) {
        const out = doPost({ postData: { contents: body, type: 'text/plain' } });
        t.eq(out.getMimeType(), ContentService.MimeType.JSON);
        return JSON.parse(out.getContent());
      };
      const cfg = post(JSON.stringify({ action: 'public.config', payload: {} }));
      t.ok(cfg.success && cfg.data, 'public.config berjaya');
      const bad = post('{bukan json');
      t.eq(bad.success, false); t.eq(bad.code, 'BAD_REQUEST');
      const unknown = post(JSON.stringify({ action: 'tiada.tindakan' }));
      t.eq(unknown.success, false);
      const empty = JSON.parse(doPost({}).getContent());
      t.eq(empty.code, 'BAD_REQUEST');
      const denied = post(JSON.stringify({ action: 'admin.stats', payload: {} }));
      t.eq(denied.success, false, 'RBAC dikuatkuasa melalui doPost');
    }],
    ['Fungsi operasi hanya untuk pemilik skrip', function (t) {
      globalThis.__setActiveUser('');
      try {
        t.throws(function () { setupDatabase(); });
        t.throws(function () { runBackup(); });
      } finally {
        globalThis.__setActiveUser('owner@example.com');
      }
    }, { nodeOnly: true }]
  ]
};
