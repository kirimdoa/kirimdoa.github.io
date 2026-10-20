/**
 * @file TestUmrah.gs
 * Ujian Planner Umrah (1.7.0): senarai semak, perbelanjaan, jadual, pengasingan pengguna (IDOR).
 */
const TestSuiteUmrah = {
  name: 'Planner Umrah',
  tests: [
    ['Senarai semak lalai: sekali sahaja, tarikh sasaran dikira, tanda siap', function (t) {
      const a = TestHelpers.user('umrahA');
      const dep = UmrahService.shiftDate(DateUtils.dayKey(new Date()), 30);
      const res = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.seed', { tarikhBerlepas: dep }));
      const n = UmrahService.defaults().length;
      t.eq(res.total, n); t.eq(res.done, 0); t.eq(res.tarikhBerlepas, dep, 'tarikh berlepas disimpan');
      const pasport = res.items.filter(function (i) { return /Pasport/.test(i.perkara); })[0];
      t.eq(pasport.tarikhSasar, UmrahService.shiftDate(dep, -5), 'H-5'); t.ok(pasport.ikutBerlepas);
      t.eq(res.items[0].fasa, 'SEBELUM');
      TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.semak.seed', {}), ERROR_CODES.CONFLICT);
      const tog = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.toggle', { id: pasport.id, done: true }));
      t.ok(tog.done && tog.doneAt);
      t.eq(TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.list')).done, 1);
      const back = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.toggle', { id: pasport.id, done: false }));
      t.ok(!back.done && back.doneAt === '');
      const b = TestHelpers.user('umrahB');
      TestAssert.apiFail(TestHelpers.call(b.token, 'umrah.semak.seed', { tarikhBerlepas: 'esok' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiOk(TestHelpers.call(b.token, 'umrah.semak.seed', {}));
      t.eq(TestAssert.apiOk(TestHelpers.call(b.token, 'umrah.semak.list')).items[0].tarikhSasar, '', 'tanpa tarikh berlepas');
    }],
    ['Ubah tarikh berlepas: tarikh sasaran dikira semula, tarikh tetap kekal, jadual dianjak (pilihan)', function (t) {
      const a = TestHelpers.user('berlepas');
      const today = DateUtils.dayKey(new Date());
      const d1 = UmrahService.shiftDate(today, 30), d2 = UmrahService.shiftDate(today, 37);
      const tetap = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.save', { perkara: 'Ambil pasport di pejabat', tarikhSasar: UmrahService.shiftDate(today, 3) }));
      t.ok(!tetap.ikutBerlepas, 'tanpa tarikh berlepas → tarikh tetap');
      Repo.of('UMRAH_SEMAK').hardDelete(tetap.id);
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.seed', { tarikhBerlepas: d1 }));
      const sendiri = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.save', { perkara: 'Beli beg roda', tarikhSasar: UmrahService.shiftDate(d1, -2) }));
      t.ok(sendiri.ikutBerlepas, 'item sendiri bertarikh ikut tarikh berlepas');
      const tanpa = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.save', { perkara: 'Tanya mutawwif' }));
      const j = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.jadual.save', { aktiviti: 'Berlepas KLIA', tarikh: d1, masa: '10:00' }));
      const res = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.berlepas.set', { tarikhBerlepas: d2, anjakJadual: true }));
      t.eq(res.tarikhBerlepas, d2); t.eq(res.bezaHari, 7);
      const by = function (txt) { return res.items.filter(function (i) { return i.perkara === txt; })[0]; };
      t.eq(by('Pasport sah sekurang-kurangnya 6 bulan').tarikhSasar, UmrahService.shiftDate(d2, -5), 'item lalai dianjak');
      t.eq(by('Beli beg roda').tarikhSasar, UmrahService.shiftDate(d2, -2), 'item sendiri dianjak');
      t.eq(by('Tanya mutawwif').tarikhSasar, '', 'tanpa tarikh kekal kosong');
      t.eq(by('Tawaf 7 pusingan').tarikhSasar, '', 'item tanpa offset kekal kosong');
      t.ok(res.dianjak > 30, 'bilangan dianjak: ' + res.dianjak);
      t.eq(TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.jadual.list')).items[0].tarikh, d2, 'jadual dianjak +7');
      const res2 = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.berlepas.set', { tarikhBerlepas: d1 }));
      t.eq(res2.jadualDianjak, 0, 'tanpa anjakJadual, jadual tidak berubah');
      t.eq(TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.jadual.list')).items[0].tarikh, d2);
      t.ok(tanpa && j);
      TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.berlepas.set', { tarikhBerlepas: 'esok' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.berlepas.set', {}), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.berlepas.set', { tarikhBerlepas: '2010-01-01' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiFail(api({ action: 'umrah.berlepas.set', payload: { tarikhBerlepas: d1 } }), ERROR_CODES.UNAUTHENTICATED);
    }],
    ['Rekod 1.7.0 (tiada offset): item lalai dipadankan, item sendiri ikut beza tarikh lama', function (t) {
      const a = TestHelpers.user('lama');
      const today = DateUtils.dayKey(new Date());
      const d1 = UmrahService.shiftDate(today, 20), d2 = UmrahService.shiftDate(today, 25);
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.seed', { tarikhBerlepas: d1 }));
      const own = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.save', { perkara: 'Hantar kucing ke rumah jiran', tarikhSasar: UmrahService.shiftDate(d1, -1) }));
      const repo = Repo.of('UMRAH_SEMAK');
      const p = {};
      UmrahService.mine('UMRAH_SEMAK', a.user.id).forEach(function (r) { p[r.item_id] = { offset_hari: '' }; });
      repo.updateMany(p);
      const res = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.berlepas.set', { tarikhBerlepas: d2 }));
      const by = function (txt) { return res.items.filter(function (i) { return i.perkara === txt; })[0]; };
      t.eq(by('Visa Umrah & tiket penerbangan').tarikhSasar, UmrahService.shiftDate(d2, -5));
      t.eq(by('Hantar kucing ke rumah jiran').tarikhSasar, UmrahService.shiftDate(d2, -1), 'ikut beza tarikh lama');
      t.eq(by('Tahallul').tarikhSasar, '');
      t.eq(repo.findById(own.id).offset_hari, '-1', 'offset disimpan untuk kali seterusnya');
    }],
    ['Senarai semak tanpa tarikh: tetapkan tarikh berlepas kemudian', function (t) {
      const a = TestHelpers.user('kemudian');
      const res0 = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.seed', {}));
      t.eq(res0.tarikhBerlepas, '');
      const d = UmrahService.shiftDate(DateUtils.dayKey(new Date()), 14);
      const res = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.berlepas.set', { tarikhBerlepas: d, anjakJadual: true }));
      t.eq(res.items.filter(function (i) { return /Pasport/.test(i.perkara); })[0].tarikhSasar, UmrahService.shiftDate(d, -5));
      t.eq(res.bezaHari, 0); t.eq(res.jadualDianjak, 0, 'tiada tarikh lama → jadual tidak dianjak');
    }],
    ['Peringatan harian: jadual H-30/21/14/7..0, kandungan, tiada pendua, boleh dimatikan', function (t) {
      const a = TestHelpers.user('ingat');
      const today = DateUtils.dayKey(new Date());
      const dep = UmrahService.shiftDate(today, 4);
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.seed', { tarikhBerlepas: dep }));
      const items = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.list'));
      t.eq(items.peringatan, true, 'peringatan hidup secara lalai');
      const first = items.items.filter(function (i) { return /Pasport/.test(i.perkara); })[0];
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.toggle', { id: first.id, done: true }));
      const mineN = function () { return NotificationRepository.byUser(a.user.id).filter(function (n) { return n.type === 'UMRAH_REMINDER'; }); };
      const r1 = UmrahService.sendReminders(today);
      t.ok(r1.sent >= 1, 'dihantar');
      const n1 = mineN();
      t.eq(n1.length, 1);
      t.eq(n1[0].title, '4 hari lagi ke Tanah Suci');
      t.ok(/^31 persiapan belum selesai \(\d+ perlu disiapkan hari ini\): Visa Umrah & tiket penerbangan,/.test(n1[0].message), n1[0].message);
      t.ok(/\+28 lagi\.$/.test(n1[0].message), 'ringkas: 3 nama + baki');
      UmrahService.sendReminders(today);
      t.eq(mineN().length, 1, 'tiada pendua pada hari sama');
      const besok = UmrahService.shiftDate(today, 1);
      UmrahService.sendReminders(besok);
      t.eq(mineN().length, 2); t.eq(mineN()[1].title, '3 hari lagi ke Tanah Suci');
      t.ok(UmrahService.isReminderDay(30) && UmrahService.isReminderDay(14) && UmrahService.isReminderDay(0));
      t.ok(!UmrahService.isReminderDay(10) && !UmrahService.isReminderDay(-1) && !UmrahService.isReminderDay(31));
      UmrahService.sendReminders(UmrahService.shiftDate(today, -6));
      t.eq(mineN().length, 2, 'H-10 tidak dihantar');
      UmrahService.sendReminders(dep);
      t.eq(mineN()[2].title, 'Hari ini berangkat ke Tanah Suci'); t.ok(/^Selamat berangkat/.test(mineN()[2].message));
      UmrahService.sendReminders(UmrahService.shiftDate(dep, 1));
      t.eq(mineN().length, 3, 'selepas berlepas tidak dihantar');
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.peringatan.set', { aktif: false }));
      t.eq(TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.list')).peringatan, false);
      UmrahService.sendReminders(UmrahService.shiftDate(today, 2));
      t.eq(mineN().length, 3, 'dimatikan → tiada peringatan');
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.peringatan.set', { aktif: true }));
      TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.peringatan.set', {}), ERROR_CODES.VALIDATION_ERROR);
    }],
    ['Peringatan: semua siap / tiada senarai; contoh peringatan; pencetus dipasang sekali', function (t) {
      const a = TestHelpers.user('siap');
      const today = DateUtils.dayKey(new Date());
      TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.peringatan.test'), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.berlepas.set', { tarikhBerlepas: UmrahService.shiftDate(today, 7) }));
      t.eq(UmrahService.reminderFor(a.user.id, today, UmrahService.shiftDate(today, 7)).body, 'Buka Planner Umrah dan jana senarai semak persiapan anda.');
      const own = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.save', { perkara: 'Satu-satunya', fasa: 'SEBELUM' }));
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.toggle', { id: own.id, done: true }));
      t.eq(UmrahService.reminderFor(a.user.id, today, UmrahService.shiftDate(today, 7)).body, 'Semua persiapan sebelum berlepas sudah siap. Alhamdulillah.');
      const res = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.peringatan.test'));
      t.eq(res.title, '7 hari lagi ke Tanah Suci');
      t.eq(NotificationRepository.byUser(a.user.id).filter(function (n) { return n.type === 'UMRAH_REMINDER'; }).length, 1);
      t.eq(UmrahService.repo('UMRAH_PROFIL').findById(a.user.id).last_peringatan, '', 'contoh tidak menghalang peringatan sebenar');
      const count = function () { return ScriptApp.getProjectTriggers().filter(function (x) { return x.getHandlerFunction() === 'umrahReminder'; }).length; };
      UmrahService.ensureReminderTrigger(false); UmrahService.ensureReminderTrigger(false);
      t.eq(count(), 1, 'idempoten');
      UmrahService.ensureReminderTrigger(true);
      t.eq(count(), 1, 'pasang semula tanpa pendua');
    }],
    ['Peringatan: notifikasi telefon membuka Planner Umrah', function (t) {
      const st = globalThis.__mockState;
      const a = TestHelpers.user('telefon');
      TestAssert.apiOk(TestHelpers.call(a.token, 'push.register', { token: 'umrahTok_' + 'c'.repeat(40) }));
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.berlepas.set', { tarikhBerlepas: UmrahService.shiftDate(DateUtils.dayKey(new Date()), 2) }));
      Env.set('FCM_SERVICE_ACCOUNT', globalThis.__testServiceAccount);
      Env.set('PUBLIC_BASE_URL', 'https://kirimdoa.github.io/');
      CacheService.getScriptCache().remove(PushService.TOKEN_CACHE_KEY);
      try {
        const start = st.fetches.length;
        UmrahService.sendReminders();
        const sends = st.fetches.slice(start).filter(function (c) { return /messages:send/.test(c.url); }).map(function (c) { return JSON.parse(c.params.payload).message; })
          .filter(function (m) { return m.token.indexOf('umrahTok_') === 0; });
        t.eq(sends.length, 1, 'dihantar ke telefon');
        t.eq(sends[0].notification.title, '2 hari lagi ke Tanah Suci');
        t.eq(sends[0].webpush.fcm_options.link, 'https://kirimdoa.github.io/#/umrah');
        t.eq(sends[0].data.type, 'UMRAH_REMINDER');
      } finally {
        Env.set('FCM_SERVICE_ACCOUNT', '');
        Env.set('PUBLIC_BASE_URL', '');
      }
    }, { nodeOnly: true }],
    ['Senarai semak: tambah, sunting, padam item sendiri; item sendiri di hujung', function (t) {
      const a = TestHelpers.user('semak');
      const d = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.save', { perkara: '<b>Beli</b> kurma', fasa: 'SEMASA', kumpulan: 'MADINAH' }));
      t.eq(d.perkara, 'Beli kurma', 'tag HTML dibuang'); t.eq(d.urutan, 9000);
      const e = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.save', { id: d.id, perkara: 'Beli kurma Ajwa', fasa: 'SEMASA', kumpulan: 'MADINAH' }));
      t.eq(e.id, d.id); t.eq(e.perkara, 'Beli kurma Ajwa');
      TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.semak.save', { perkara: 'x', fasa: 'ESOK' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.delete', { id: d.id }));
      t.eq(TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.list')).total, 0);
    }],
    ['IDOR: pengguna lain tidak boleh baca/ubah/padam rekod Umrah', function (t) {
      const a = TestHelpers.user('idorA');
      const b = TestHelpers.user('idorB');
      const s = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.semak.save', { perkara: 'Milik A' }));
      const m = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.belanja.save', { perkara: 'Teh', jumlah: '5' }));
      const j = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.jadual.save', { aktiviti: 'Ziarah', tarikh: DateUtils.dayKey(new Date()) }));
      TestAssert.apiFail(TestHelpers.call(b.token, 'umrah.semak.toggle', { id: s.id, done: true }), ERROR_CODES.NOT_FOUND);
      TestAssert.apiFail(TestHelpers.call(b.token, 'umrah.semak.save', { id: s.id, perkara: 'Ubah' }), ERROR_CODES.NOT_FOUND);
      TestAssert.apiFail(TestHelpers.call(b.token, 'umrah.semak.delete', { id: s.id }), ERROR_CODES.NOT_FOUND);
      TestAssert.apiFail(TestHelpers.call(b.token, 'umrah.belanja.delete', { id: m.id }), ERROR_CODES.NOT_FOUND);
      TestAssert.apiFail(TestHelpers.call(b.token, 'umrah.jadual.save', { id: j.id, aktiviti: 'Ubah', tarikh: DateUtils.dayKey(new Date()) }), ERROR_CODES.NOT_FOUND);
      TestAssert.apiFail(TestHelpers.call(b.token, 'umrah.semak.delete', { id: m.id }), ERROR_CODES.NOT_FOUND);
      t.eq(TestAssert.apiOk(TestHelpers.call(b.token, 'umrah.semak.list')).total, 0);
      t.eq(TestAssert.apiOk(TestHelpers.call(b.token, 'umrah.belanja.list')).items.length, 0);
      t.eq(TestAssert.apiOk(TestHelpers.call(b.token, 'umrah.jadual.list')).items.length, 0);
      TestAssert.apiFail(api({ action: 'umrah.semak.list', payload: {} }), ERROR_CODES.UNAUTHENTICATED);
    }],
    ['Perbelanjaan: anggaran RM ikut kadar, ringkasan per kategori, validasi jumlah', function (t) {
      const a = TestHelpers.user('belanja');
      const kadar = UmrahService.kadar();
      const d1 = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.belanja.save', { perkara: 'Kurma', kategori: 'OLEOLE', jumlah: '100', matawang: 'SAR' }));
      t.eq(d1.jumlahRm, UmrahService.round2(100 * kadar));
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.belanja.save', { perkara: 'Teksi KLIA', kategori: 'PENGANGKUTAN', jumlah: '80.50', matawang: 'RM' }));
      const u = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.belanja.save', { id: d1.id, perkara: 'Kurma', kategori: 'OLEOLE', jumlah: '50', matawang: 'SAR' }));
      t.eq(u.jumlah, 50);
      ['0', 'abc', '-5', '1.234'].forEach(function (bad) {
        TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.belanja.save', { perkara: 'Salah', jumlah: bad }), ERROR_CODES.VALIDATION_ERROR);
      });
      const r = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.belanja.list')).ringkasan;
      t.eq(r.bilangan, 2); t.eq(r.sar, 50); t.eq(r.rm, 80.5);
      t.eq(r.jumlahRm, UmrahService.round2(50 * kadar + 80.5));
      t.eq(r.kategori.PENGANGKUTAN, 80.5);
      t.eq(UmrahService.toRm(10, 'SAR', 1.2), 12);
    }],
    ['Jadual: disusun ikut tarikh & masa; masa/tarikh tidak sah ditolak', function (t) {
      const a = TestHelpers.user('jadual');
      const today = DateUtils.dayKey(new Date());
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.jadual.save', { aktiviti: 'Ziarah Quba', tarikh: today, masa: '08:00', bandar: 'MADINAH' }));
      TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.jadual.save', { aktiviti: 'Subuh', tarikh: today, masa: '05:15', bandar: 'MADINAH' }));
      const items = TestAssert.apiOk(TestHelpers.call(a.token, 'umrah.jadual.list')).items;
      t.eq(items[0].aktiviti, 'Subuh');
      TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.jadual.save', { aktiviti: 'X', tarikh: today, masa: '25:00' }), ERROR_CODES.VALIDATION_ERROR);
      TestAssert.apiFail(TestHelpers.call(a.token, 'umrah.jadual.save', { aktiviti: 'Lama', tarikh: '2010-01-01' }), ERROR_CODES.VALIDATION_ERROR);
    }]
  ]
};
