/**
 * @file UmrahService.gs
 * Planner Umrah (1.7.0): senarai semak persiapan, perbelanjaan dan jadual & ziarah.
 * Titipan doa keluarga/sahabat TIDAK diduplikasi di sini — ia menggunakan "Kumpul Doa" sedia ada
 * (pautan kongsi + "Telah dibacakan").
 *
 * Keselamatan: setiap rekod mempunyai user_id pemilik; rekod orang lain sentiasa NOT_FOUND (IDOR).
 * Semua input disahkan dengan Validator (tag HTML dibuang). Had bilangan rekod per pengguna.
 */
const UmrahService = {
  MAX_ITEMS: 300,

  FASA: function () { return ['SEBELUM', 'SEMASA', 'SELEPAS']; },
  KUMPULAN: function () {
    return ['DOKUMEN', 'KEWANGAN', 'ROHANI', 'KESIHATAN', 'BARANG', 'BERLEPAS', 'MIQAT', 'IBADAH', 'MAKKAH', 'MADINAH',
      'JAGADIRI', 'PULANG', 'TIBA', 'AMALAN', 'LAIN'];
  },
  KATEGORI_BELANJA: function () { return ['MAKAN', 'PENGANGKUTAN', 'OLEOLE', 'DAM', 'SEDEKAH', 'PAKEJ', 'LAIN']; },
  LOKASI: function () { return ['MALAYSIA', 'PERJALANAN', 'MAKKAH', 'MADINAH', 'LAIN']; },
  JENIS_JADUAL: function () { return ['IBADAH', 'ZIARAH', 'PERJALANAN', 'HOTEL', 'MAKAN', 'LAIN']; },

  /** Item lalai: [fasa, kumpulan, perkara, catatan, hari relatif tarikh berlepas (null = tiada tarikh)]. */
  defaults: function () {
    return [
      ['SEBELUM', 'DOKUMEN', 'Pasport sah sekurang-kurangnya 6 bulan', 'Buat 2 salinan dan simpan gambar dalam telefon', -5],
      ['SEBELUM', 'DOKUMEN', 'Visa Umrah & tiket penerbangan', 'Semak ejaan nama sama seperti pasport', -5],
      ['SEBELUM', 'DOKUMEN', 'Kad vaksin / sijil kesihatan', 'Ikut syarat terkini yang dimaklumkan agensi', -5],
      ['SEBELUM', 'DOKUMEN', 'Insurans perjalanan', 'Simpan nombor polisi dan talian kecemasan', -5],
      ['SEBELUM', 'DOKUMEN', 'Jadual perjalanan & nombor mutawwif', 'Hotel Makkah & Madinah, nombor kumpulan', -4],
      ['SEBELUM', 'DOKUMEN', 'Mohon cuti & serah tugas', 'Auto-balas emel, wakil sementara, nota kerja tertunggak', -4],
      ['SEBELUM', 'DOKUMEN', 'Pasang aplikasi Nusuk', 'Untuk permit Raudhah; daftar akaun sebelum berlepas', -3],
      ['SEBELUM', 'KEWANGAN', 'Tukar wang ke Riyal Saudi (SAR)', 'Untuk makan, dam (jika perlu), sedekah dan ole-ole', -4],
      ['SEBELUM', 'KEWANGAN', 'Aktifkan kad untuk transaksi luar negara', 'Maklumkan bank dan semak caj', -4],
      ['SEBELUM', 'KEWANGAN', 'Asingkan wang harian dan simpanan', 'Dompet kecil + beg pinggang', -2],
      ['SEBELUM', 'KEWANGAN', 'Selesaikan bil & komitmen bulanan', 'Bayar awal atau set auto-debit', -3],
      ['SEBELUM', 'ROHANI', 'Ulang kaji manasik Umrah', 'Ihram, Tawaf, Sa\'ie, Tahallul', -3],
      ['SEBELUM', 'ROHANI', 'Hafal lafaz niat & talbiah', 'Lihat tab Panduan', -3],
      ['SEBELUM', 'ROHANI', 'Fahami larangan ihram', 'Lihat tab Panduan', -3],
      ['SEBELUM', 'ROHANI', 'Kongsi pautan Kumpul Doa kepada keluarga', 'Titipan doa terus masuk ke Kirim Doa', -3],
      ['SEBELUM', 'ROHANI', 'Mohon maaf & minta halal', 'Keluarga, rakan sekerja, jiran', -1],
      ['SEBELUM', 'ROHANI', 'Selesaikan hutang / tulis wasiat ringkas', 'Maklumkan waris', -2],
      ['SEBELUM', 'KESIHATAN', 'Ubat peribadi + preskripsi doktor', 'Bawa lebihan; simpan dalam beg tangan', -3],
      ['SEBELUM', 'KESIHATAN', 'Kit ubat asas', 'Panadol, ubat selesema, cirit-birit, plaster, ORS', -3],
      ['SEBELUM', 'KESIHATAN', 'Bina stamina berjalan', 'Tawaf + Sa\'ie lebih kurang 7 km', null],
      ['SEBELUM', 'BARANG', 'Pakaian ihram / telekung putih', 'Bawa satu pasang ganti', -2],
      ['SEBELUM', 'BARANG', 'Beg pinggang / tali pinggang ihram', 'Untuk pasport, telefon dan wang', -2],
      ['SEBELUM', 'BARANG', 'Selipar selesa + beg kasut kecil', '', -2],
      ['SEBELUM', 'BARANG', 'Pakaian harian & baju solat', 'Kain kapas nipis', -2],
      ['SEBELUM', 'BARANG', 'Sabun, syampu & ubat gigi tanpa wangian', 'Untuk tempoh ihram', -2],
      ['SEBELUM', 'BARANG', 'Botol air & payung kecil', '', -2],
      ['SEBELUM', 'BARANG', 'Telefon, power bank, pengecas, plug jenis G', 'Power bank dalam beg tangan', -1],
      ['SEBELUM', 'BARANG', 'Gunting kecil untuk tahallul', 'Masuk beg besar', -1],
      ['SEBELUM', 'BARANG', 'Label nama pada semua beg', 'Ikut tag kumpulan agensi', -1],
      ['SEBELUM', 'BERLEPAS', 'Mandi sunat ihram & bersihkan diri', 'Potong kuku dan kemas rambut sebelum niat', 0],
      ['SEBELUM', 'BERLEPAS', 'Semak dokumen sekali lagi', 'Pasport, tiket, wang, ubat', 0],
      ['SEBELUM', 'BERLEPAS', 'Tiba di lapangan terbang awal', 'Ikut masa berkumpul agensi', 0],
      ['SEMASA', 'MIQAT', 'Berniat ihram Umrah di miqat', 'Selepas niat, larangan ihram terpakai', 0],
      ['SEMASA', 'MIQAT', 'Perbanyakkan talbiah', 'Hingga mula Tawaf', 0],
      ['SEMASA', 'MAKKAH', 'Tetapkan titik pertemuan kumpulan', 'Cth. nombor pintu Masjidil Haram', null],
      ['SEMASA', 'IBADAH', 'Tawaf 7 pusingan', 'Mula dari garisan Hajarul Aswad', null],
      ['SEMASA', 'IBADAH', 'Solat sunat Tawaf 2 rakaat', '', null],
      ['SEMASA', 'IBADAH', 'Minum air Zamzam & berdoa', '', null],
      ['SEMASA', 'IBADAH', 'Sa\'ie 7 kali Safa ke Marwah', 'Mula di Safa, tamat di Marwah', null],
      ['SEMASA', 'IBADAH', 'Tahallul', 'Lelaki bercukur/bergunting; wanita potong hujung rambut', null],
      ['SEMASA', 'MAKKAH', 'Bacakan titipan doa keluarga', 'Buka Senarai Doa → Diterima, tanda "Telah dibacakan"', null],
      ['SEMASA', 'MAKKAH', 'Solat berjemaah di Masjidil Haram', '', null],
      ['SEMASA', 'MAKKAH', 'Tawaf Wada\' sebelum meninggalkan Makkah', '', null],
      ['SEMASA', 'MADINAH', 'Solat di Masjid Nabawi', '', null],
      ['SEMASA', 'MADINAH', 'Ziarah makam Rasulullah ﷺ', '', null],
      ['SEMASA', 'MADINAH', 'Raudhah (slot melalui Nusuk)', 'Patuhi masa yang diberi', null],
      ['SEMASA', 'MADINAH', 'Ziarah Masjid Quba\'', 'Sunat solat 2 rakaat', null],
      ['SEMASA', 'JAGADIRI', 'Minum air secukupnya setiap hari', '', null],
      ['SEMASA', 'JAGADIRI', 'Bawa kad hotel & nombor mutawwif', '', null],
      ['SELEPAS', 'PULANG', 'Semak had berat bagasi', 'Ikut syarat syarikat penerbangan', null],
      ['SELEPAS', 'PULANG', 'Beli ole-ole lebih awal', '', null],
      ['SELEPAS', 'TIBA', 'Solat sunat 2 rakaat selepas pulang', 'Sunnah pulang dari musafir', null],
      ['SELEPAS', 'TIBA', 'Rehat & pantau kesihatan', 'Jumpa doktor jika demam berlarutan', null],
      ['SELEPAS', 'TIBA', 'Agihkan ole-ole & air Zamzam', '', null],
      ['SELEPAS', 'AMALAN', 'Teruskan solat berjemaah & bacaan Al-Quran', '', null],
      ['SELEPAS', 'AMALAN', 'Tulis catatan pengalaman Umrah', '', null],
      ['SELEPAS', 'AMALAN', 'Sandarkan gambar perjalanan', '', null]
    ];
  },

  // ================================================================== Pembantu

  repo: function (key) { return Repo.of(key); },

  mine: function (key, userId) {
    return UmrahService.repo(key).find(function (r) { return r.user_id === userId; });
  },

  /** Rekod milik pengguna atau NOT_FOUND seragam. */
  own: function (key, id, ctx) {
    const def = SCHEMA[key];
    const sid = String(id || '');
    if (!IdUtils.isValid(sid, def.prefix)) throw Errors.notFound();
    const row = UmrahService.repo(key).findById(sid);
    if (!row || row.user_id !== ctx.userId) throw Errors.notFound();
    return row;
  },

  guardWrite: function (ctx) { SecurityService.rateLimit('umrah.write', ctx.userId); },

  guardCount: function (key, ctx) {
    if (UmrahService.mine(key, ctx.userId).length >= UmrahService.MAX_ITEMS) {
      throw Errors.validation('Had ' + UmrahService.MAX_ITEMS + ' rekod dicapai. Padam rekod lama dahulu.');
    }
  },

  remove: function (ctx, key, payload) {
    UmrahService.guardWrite(ctx);
    const row = UmrahService.own(key, payload && payload.id, ctx);
    UmrahService.repo(key).hardDelete(row[SCHEMA[key].id]);
    return { deleted: true };
  },

  /** Kadar SAR→RM daripada tetapan (fallback 1.18 jika tidak sah). */
  kadar: function () {
    const n = parseFloat(String(SettingsService.get('KADAR_SAR_RM') || '').replace(',', '.'));
    return isFinite(n) && n > 0 && n < 100 ? n : 1.18;
  },

  round2: function (n) { return Math.round(n * 100) / 100; },

  /** 'YYYY-MM-DD' + n hari → 'YYYY-MM-DD' (UTC, tiada isu zon waktu). */
  shiftDate: function (key, n) { return new Date(new Date(key + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10); },

  /** Bilangan hari dari a ke b (b − a). */
  dayDiff: function (a, b) { return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000); },

  /** Tarikh berlepas mesti dalam tempoh 2 tahun dari hari ini. */
  checkTripDate: function (key, field) {
    if (Math.abs(UmrahService.dayDiff(DateUtils.dayKey(new Date()), key)) > 730) {
      const f = {}; f[field] = 'Pilih tarikh dalam tempoh 2 tahun.';
      throw Errors.validation('Tarikh berlepas tidak munasabah.', f);
    }
  },

  berlepas: function (userId) {
    const p = UmrahService.repo('UMRAH_PROFIL').findById(userId);
    return (p && p.tarikh_berlepas) || '';
  },

  profil: function (userId) { return UmrahService.repo('UMRAH_PROFIL').findById(userId) || null; },

  saveProfil: function (userId, patch) {
    const repo = UmrahService.repo('UMRAH_PROFIL');
    const now = DateUtils.nowIso();
    if (repo.findById(userId)) return repo.update(userId, Object.assign({}, patch, { updated_at: now }));
    return repo.insert(Object.assign({ user_id: userId, tarikh_berlepas: '', peringatan: '', last_peringatan: '', created_at: now }, patch, { updated_at: now }));
  },

  saveBerlepas: function (userId, key) { return UmrahService.saveProfil(userId, { tarikh_berlepas: key }); },

  peringatanOn: function (p) { return !p || String(p.peringatan || '').toUpperCase() !== 'TIDAK'; },

  /** Offset item lalai mengikut teks perkara (untuk rekod 1.7.0 yang belum ada offset_hari). */
  defaultOffset: function (perkara) {
    const hit = UmrahService.defaults().filter(function (d) { return d[2] === perkara; })[0];
    if (!hit) return undefined;
    return hit[4] === null ? null : hit[4];
  },

  /** Offset untuk item yang disimpan pengguna: dikira daripada tarikh berlepas jika ada, jika tidak tarikh tetap. */
  offsetFor: function (tarikh, berlepas) {
    if (!tarikh || !berlepas) return '-';
    return String(UmrahService.dayDiff(berlepas, tarikh));
  },

  // ================================================================== Senarai semak

  semakSchema: function () {
    return {
      perkara: { type: 'string', required: true, min: 2, max: 150, label: 'Perkara' },
      fasa: { type: 'enum', values: UmrahService.FASA(), default: 'SEBELUM', label: 'Fasa' },
      kumpulan: { type: 'enum', values: UmrahService.KUMPULAN(), default: 'LAIN', label: 'Kumpulan' },
      catatan: { type: 'text', max: 500, label: 'Catatan' },
      tarikhSasar: { type: 'date', label: 'Tarikh sasaran' }
    };
  },

  semakDTO: function (r) {
    return {
      id: r.item_id, fasa: r.fasa, kumpulan: r.kumpulan, perkara: r.perkara, catatan: r.catatan || '',
      tarikhSasar: r.tarikh_sasar || '', urutan: r.urutan || 0, done: !!r.is_done, doneAt: r.done_at || '',
      ikutBerlepas: /^-?\d+$/.test(String(r.offset_hari || ''))
    };
  },

  semakList: function (ctx) {
    const rows = UmrahService.mine('UMRAH_SEMAK', ctx.userId);
    rows.sort(function (a, b) { return (a.urutan || 0) - (b.urutan || 0) || (a.created_at < b.created_at ? -1 : 1); });
    const items = rows.map(UmrahService.semakDTO);
    return { items: items, total: items.length, done: items.filter(function (i) { return i.done; }).length, tarikhBerlepas: UmrahService.berlepas(ctx.userId),
      peringatan: UmrahService.peringatanOn(UmrahService.profil(ctx.userId)) };
  },

  /** Ringkasan untuk kad Utama (tanpa senarai penuh). */
  ringkasan: function (ctx) {
    const rows = UmrahService.mine('UMRAH_SEMAK', ctx.userId);
    return { total: rows.length, done: rows.filter(function (r) { return r.is_done; }).length, tarikhBerlepas: UmrahService.berlepas(ctx.userId) };
  },

  semakSeed: function (ctx, payload) {
    UmrahService.guardWrite(ctx);
    const p = Validator.validate(payload, { tarikhBerlepas: { type: 'date', label: 'Tarikh berlepas' } });
    if (UmrahService.mine('UMRAH_SEMAK', ctx.userId).length) {
      throw Errors.conflict('Senarai semak anda sudah ada. Padam item sedia ada dahulu jika mahu bermula semula.');
    }
    const berlepas = p.tarikhBerlepas || UmrahService.berlepas(ctx.userId);
    if (p.tarikhBerlepas) { UmrahService.checkTripDate(p.tarikhBerlepas, 'tarikhBerlepas'); UmrahService.saveBerlepas(ctx.userId, p.tarikhBerlepas); }
    const now = DateUtils.nowIso();
    const rows = UmrahService.defaults().map(function (it, i) {
      return {
        item_id: IdUtils.generate('Q'), user_id: ctx.userId, fasa: it[0], kumpulan: it[1], perkara: it[2], catatan: it[3],
        tarikh_sasar: berlepas && it[4] !== null ? UmrahService.shiftDate(berlepas, it[4]) : '',
        offset_hari: it[4] === null ? '-' : String(it[4]),
        urutan: (i + 1) * 10, is_done: false, done_at: '', created_at: now, updated_at: now
      };
    });
    UmrahService.repo('UMRAH_SEMAK').insertMany(rows);
    return UmrahService.semakList(ctx);
  },

  /**
   * Tetapkan / ubah tarikh berlepas. Tarikh sasaran item yang mengikut tarikh berlepas dikira semula.
   * Item bertarikh tetap (dipilih sendiri tanpa tarikh berlepas) tidak diubah.
   * anjakJadual: anjakkan juga semua aktiviti Jadual sebanyak beza hari (hanya jika tarikh lama wujud).
   */
  berlepasSet: function (ctx, payload) {
    UmrahService.guardWrite(ctx);
    const p = Validator.validate(payload, {
      tarikhBerlepas: { type: 'date', required: true, label: 'Tarikh berlepas' },
      anjakJadual: { type: 'boolean', default: false, label: 'Anjak jadual' }
    });
    UmrahService.checkTripDate(p.tarikhBerlepas, 'tarikhBerlepas');
    const lama = UmrahService.berlepas(ctx.userId);
    const baru = p.tarikhBerlepas;
    const now = DateUtils.nowIso();
    const patch = {};
    UmrahService.mine('UMRAH_SEMAK', ctx.userId).forEach(function (r) {
      let off = String(r.offset_hari || '');
      if (off === '-') return;
      if (off === '') {
        const d = UmrahService.defaultOffset(r.perkara);
        if (d === null) { patch[r.item_id] = { offset_hari: '-' }; return; }
        if (d !== undefined) off = String(d);
        else if (lama && r.tarikh_sasar) off = String(UmrahService.dayDiff(lama, r.tarikh_sasar));
        else { patch[r.item_id] = { offset_hari: '-' }; return; }
      }
      const next = UmrahService.shiftDate(baru, Number(off));
      if (next !== r.tarikh_sasar || off !== String(r.offset_hari)) patch[r.item_id] = { tarikh_sasar: next, offset_hari: off, updated_at: now };
    });
    const dianjak = Object.keys(patch).filter(function (k) { return patch[k].tarikh_sasar !== undefined; }).length;
    if (Object.keys(patch).length) UmrahService.repo('UMRAH_SEMAK').updateMany(patch);
    let jadualDianjak = 0;
    const beza = lama ? UmrahService.dayDiff(lama, baru) : 0;
    if (p.anjakJadual && beza) {
      const jp = {};
      UmrahService.mine('UMRAH_JADUAL', ctx.userId).forEach(function (r) {
        if (r.tarikh) jp[r.jadual_id] = { tarikh: UmrahService.shiftDate(r.tarikh, beza), updated_at: now };
      });
      jadualDianjak = Object.keys(jp).length;
      if (jadualDianjak) UmrahService.repo('UMRAH_JADUAL').updateMany(jp);
    }
    UmrahService.saveBerlepas(ctx.userId, baru);
    UmrahService.ensureReminderTriggerSafe();
    return Object.assign(UmrahService.semakList(ctx), { dianjak: dianjak, jadualDianjak: jadualDianjak, bezaHari: beza });
  },

  semakSave: function (ctx, payload) {
    UmrahService.guardWrite(ctx);
    const data = Validator.validate(payload, UmrahService.semakSchema());
    const now = DateUtils.nowIso();
    const row = {
      fasa: data.fasa, kumpulan: data.kumpulan, perkara: data.perkara, catatan: data.catatan || '', tarikh_sasar: data.tarikhSasar || '',
      offset_hari: UmrahService.offsetFor(data.tarikhSasar, UmrahService.berlepas(ctx.userId)), updated_at: now
    };
    if (payload && payload.id) {
      const cur = UmrahService.own('UMRAH_SEMAK', payload.id, ctx);
      return UmrahService.semakDTO(UmrahService.repo('UMRAH_SEMAK').update(cur.item_id, row));
    }
    UmrahService.guardCount('UMRAH_SEMAK', ctx);
    return UmrahService.semakDTO(UmrahService.repo('UMRAH_SEMAK').insert(Object.assign(row, {
      item_id: IdUtils.generate('Q'), user_id: ctx.userId, urutan: 9000, is_done: false, done_at: '', created_at: now
    })));
  },

  semakToggle: function (ctx, payload) {
    UmrahService.guardWrite(ctx);
    const p = Validator.validate(payload, { done: { type: 'boolean', required: true, label: 'Status' } });
    const cur = UmrahService.own('UMRAH_SEMAK', payload && payload.id, ctx);
    const now = DateUtils.nowIso();
    return UmrahService.semakDTO(UmrahService.repo('UMRAH_SEMAK').update(cur.item_id, { is_done: p.done, done_at: p.done ? now : '', updated_at: now }));
  },

  // ================================================================== Perbelanjaan

  belanjaSchema: function () {
    return {
      perkara: { type: 'string', required: true, min: 2, max: 120, label: 'Perkara' },
      kategori: { type: 'enum', values: UmrahService.KATEGORI_BELANJA(), default: 'LAIN', label: 'Kategori' },
      jumlah: { type: 'string', required: true, max: 12, pattern: /^\d{1,7}(\.\d{1,2})?$/, label: 'Jumlah' },
      matawang: { type: 'enum', values: ['SAR', 'RM'], default: 'SAR', label: 'Mata wang' },
      tarikh: { type: 'date', label: 'Tarikh' },
      lokasi: { type: 'enum', values: UmrahService.LOKASI(), default: 'MAKKAH', label: 'Lokasi' },
      catatan: { type: 'text', max: 500, label: 'Catatan' }
    };
  },

  toRm: function (jumlah, matawang, kadar) {
    const j = Number(jumlah) || 0;
    return UmrahService.round2(matawang === 'SAR' ? j * kadar : j);
  },

  belanjaDTO: function (r, kadar) {
    return {
      id: r.belanja_id, perkara: r.perkara, kategori: r.kategori, jumlah: Number(r.jumlah) || 0, matawang: r.matawang,
      tarikh: r.tarikh || '', lokasi: r.lokasi || '', catatan: r.catatan || '',
      jumlahRm: UmrahService.toRm(r.jumlah, r.matawang, kadar), createdAt: r.created_at
    };
  },

  belanjaList: function (ctx) {
    const kadar = UmrahService.kadar();
    const rows = UmrahService.mine('UMRAH_BELANJA', ctx.userId);
    rows.sort(function (a, b) {
      const ka = (a.tarikh || a.created_at.slice(0, 10)) + a.created_at;
      const kb = (b.tarikh || b.created_at.slice(0, 10)) + b.created_at;
      return ka < kb ? 1 : -1;
    });
    const items = rows.map(function (r) { return UmrahService.belanjaDTO(r, kadar); });
    const sum = { kadar: kadar, bilangan: items.length, jumlahRm: 0, sar: 0, rm: 0, kategori: {} };
    items.forEach(function (i) {
      sum.jumlahRm += i.jumlahRm;
      if (i.matawang === 'SAR') sum.sar += i.jumlah; else sum.rm += i.jumlah;
      sum.kategori[i.kategori] = (sum.kategori[i.kategori] || 0) + i.jumlahRm;
    });
    sum.jumlahRm = UmrahService.round2(sum.jumlahRm); sum.sar = UmrahService.round2(sum.sar); sum.rm = UmrahService.round2(sum.rm);
    Object.keys(sum.kategori).forEach(function (k) { sum.kategori[k] = UmrahService.round2(sum.kategori[k]); });
    return { items: items, ringkasan: sum };
  },

  belanjaSave: function (ctx, payload) {
    UmrahService.guardWrite(ctx);
    const data = Validator.validate(payload, UmrahService.belanjaSchema());
    if (Number(data.jumlah) <= 0) throw Errors.validation('Jumlah mesti lebih daripada 0.', { jumlah: 'Jumlah mesti lebih daripada 0.' });
    const now = DateUtils.nowIso();
    const row = {
      perkara: data.perkara, kategori: data.kategori, jumlah: String(Number(data.jumlah)), matawang: data.matawang,
      tarikh: data.tarikh || '', lokasi: data.lokasi, catatan: data.catatan || '', updated_at: now
    };
    const kadar = UmrahService.kadar();
    if (payload && payload.id) {
      const cur = UmrahService.own('UMRAH_BELANJA', payload.id, ctx);
      return UmrahService.belanjaDTO(UmrahService.repo('UMRAH_BELANJA').update(cur.belanja_id, row), kadar);
    }
    UmrahService.guardCount('UMRAH_BELANJA', ctx);
    return UmrahService.belanjaDTO(UmrahService.repo('UMRAH_BELANJA').insert(Object.assign(row, {
      belanja_id: IdUtils.generate('M'), user_id: ctx.userId, created_at: now
    })), kadar);
  },

  // ================================================================== Jadual & ziarah

  jadualSchema: function () {
    return {
      aktiviti: { type: 'string', required: true, min: 2, max: 120, label: 'Aktiviti' },
      tarikh: { type: 'date', required: true, label: 'Tarikh' },
      masa: { type: 'string', max: 5, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, label: 'Masa' },
      bandar: { type: 'enum', values: UmrahService.LOKASI(), default: 'MAKKAH', label: 'Bandar' },
      jenis: { type: 'enum', values: UmrahService.JENIS_JADUAL(), default: 'IBADAH', label: 'Jenis' },
      tempat: { type: 'string', max: 200, label: 'Tempat / alamat' },
      hubungi: { type: 'phone', label: 'No. telefon' },
      catatan: { type: 'text', max: 500, label: 'Catatan' }
    };
  },

  jadualDTO: function (r) {
    return {
      id: r.jadual_id, tarikh: r.tarikh, masa: r.masa || '', aktiviti: r.aktiviti, bandar: r.bandar, jenis: r.jenis,
      tempat: r.tempat || '', hubungi: r.hubungi || '', catatan: r.catatan || ''
    };
  },

  jadualList: function (ctx) {
    const rows = UmrahService.mine('UMRAH_JADUAL', ctx.userId);
    rows.sort(function (a, b) { return (a.tarikh + (a.masa || '99:99')) < (b.tarikh + (b.masa || '99:99')) ? -1 : 1; });
    return { items: rows.map(UmrahService.jadualDTO) };
  },

  jadualSave: function (ctx, payload) {
    UmrahService.guardWrite(ctx);
    const data = Validator.validate(payload, UmrahService.jadualSchema());
    if (Math.abs(new Date(data.tarikh + 'T00:00:00Z').getTime() - Date.now()) > 730 * 86400000) {
      throw Errors.validation('Tarikh aktiviti tidak munasabah.', { tarikh: 'Pilih tarikh dalam tempoh 2 tahun.' });
    }
    const now = DateUtils.nowIso();
    const row = {
      tarikh: data.tarikh, masa: data.masa || '', aktiviti: data.aktiviti, bandar: data.bandar, jenis: data.jenis,
      tempat: data.tempat || '', hubungi: data.hubungi || '', catatan: data.catatan || '', updated_at: now
    };
    if (payload && payload.id) {
      const cur = UmrahService.own('UMRAH_JADUAL', payload.id, ctx);
      return UmrahService.jadualDTO(UmrahService.repo('UMRAH_JADUAL').update(cur.jadual_id, row));
    }
    UmrahService.guardCount('UMRAH_JADUAL', ctx);
    return UmrahService.jadualDTO(UmrahService.repo('UMRAH_JADUAL').insert(Object.assign(row, {
      jadual_id: IdUtils.generate('J'), user_id: ctx.userId, created_at: now
    })));
  },

  // ================================================================== Peringatan harian

  /** Hari peringatan dihantar: H-30, H-21, H-14, kemudian setiap hari H-7 hingga hari berlepas. */
  isReminderDay: function (n) { return n === 30 || n === 21 || n === 14 || (n >= 0 && n <= 7); },

  reminderTitle: function (n) {
    if (n === 0) return 'Hari ini berangkat ke Tanah Suci';
    if (n === 1) return 'Esok berangkat ke Tanah Suci';
    return n + ' hari lagi ke Tanah Suci';
  },

  /** Persiapan sebelum berlepas yang belum siap: lewat / hari ini dahulu, kemudian ikut tarikh sasaran & urutan. */
  pendingBefore: function (userId) {
    return UmrahService.mine('UMRAH_SEMAK', userId)
      .filter(function (r) { return !r.is_done && r.fasa === 'SEBELUM'; })
      .sort(function (a, b) {
        const ka = a.tarikh_sasar || '9999-12-31', kb = b.tarikh_sasar || '9999-12-31';
        return ka < kb ? -1 : ka > kb ? 1 : (a.urutan || 0) - (b.urutan || 0);
      });
  },

  /** Kandungan peringatan untuk pengguna pada hari tertentu. @return {{title:string, body:string, pending:number}} */
  reminderFor: function (userId, today, berlepas) {
    const n = UmrahService.dayDiff(today, berlepas);
    const all = UmrahService.mine('UMRAH_SEMAK', userId);
    const pending = UmrahService.pendingBefore(userId);
    let body;
    if (!all.length) body = 'Buka Planner Umrah dan jana senarai semak persiapan anda.';
    else if (!pending.length) body = 'Semua persiapan sebelum berlepas sudah siap. Alhamdulillah.';
    else {
      const names = pending.slice(0, 3).map(function (r) { return r.perkara; });
      const lewat = pending.filter(function (r) { return r.tarikh_sasar && r.tarikh_sasar <= today; }).length;
      body = pending.length + ' persiapan belum selesai' + (lewat ? ' (' + lewat + ' perlu disiapkan hari ini)' : '') + ': ' +
        names.join(', ') + (pending.length > 3 ? ', +' + (pending.length - 3) + ' lagi.' : '.');
    }
    if (n === 0) body = 'Selamat berangkat, semoga Umrah anda mabrur. ' + body;
    return { title: UmrahService.reminderTitle(n), body: body, pending: pending.length };
  },

  /** Aktiviti Jadual untuk hari tertentu, disusun ikut masa. */
  jadualOn: function (userId, day) {
    return UmrahService.mine('UMRAH_JADUAL', userId).filter(function (r) { return r.tarikh === day; })
      .sort(function (a, b) { return (a.masa || '99:99') < (b.masa || '99:99') ? -1 : 1; });
  },

  /** Ringkasan aktiviti: "05:15 Subuh berjemaah · 09:00 Ziarah …" (maks 4, + baki). */
  jadualText: function (acts) {
    const parts = acts.slice(0, 4).map(function (r) { return (r.masa ? r.masa + ' ' : '') + r.aktiviti; });
    return parts.join(' · ') + (acts.length > 4 ? ' · +' + (acts.length - 4) + ' lagi' : '');
  },

  /** Peringatan semasa perjalanan (selepas tarikh berlepas): hanya jika ada aktiviti Jadual hari ini. */
  tripReminderFor: function (userId, today, berlepas) {
    const acts = UmrahService.jadualOn(userId, today);
    if (!acts.length) return null;
    const dayNo = UmrahService.dayDiff(berlepas, today) + 1;
    const count = {};
    acts.forEach(function (r) { count[r.bandar] = (count[r.bandar] || 0) + 1; });
    const top = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0];
    const tempat = { MAKKAH: ' di Makkah', MADINAH: ' di Madinah' }[top] || '';
    return { title: 'Hari ke-' + dayNo + tempat, body: 'Jadual hari ini: ' + UmrahService.jadualText(acts) + '.', pending: 0 };
  },

  /**
   * Dijalankan oleh pencetus harian. Idempoten untuk hari yang sama (last_peringatan).
   *   mode 'pre'  (~08:00 MYT): kiraan hari & persiapan belum siap, H-30 … hari berlepas
   *   mode 'trip' (~13:00 MYT = 08:00 Makkah): "Hari ke-N" + aktiviti Jadual hari ini, selepas berlepas
   * @param {string=} todayKey untuk ujian; lalai hari ini (zon waktu skrip)
   */
  sendReminders: function (todayKey, mode) {
    const m = mode === 'trip' ? 'trip' : 'pre';
    const out = { checked: 0, sent: 0, mode: m };
    if (!SettingsService.get('UMRAH_PERINGATAN_AKTIF')) return Object.assign(out, { disabled: true });
    const today = todayKey || DateUtils.dayKey(new Date());
    const patch = {};
    UmrahService.repo('UMRAH_PROFIL').all().forEach(function (p) {
      if (!p.tarikh_berlepas || !UmrahService.peringatanOn(p) || p.last_peringatan === today) return;
      out.checked++;
      const n = UmrahService.dayDiff(today, p.tarikh_berlepas);
      let msg = null;
      if (m === 'pre') {
        if (!UmrahService.isReminderDay(n)) return;
        msg = UmrahService.reminderFor(p.user_id, today, p.tarikh_berlepas);
        const acts = n === 0 ? UmrahService.jadualOn(p.user_id, today) : [];
        if (acts.length) msg.body += ' Jadual hari ini: ' + UmrahService.jadualText(acts) + '.';
      } else {
        if (n >= 0 || n < -60) return;
        msg = UmrahService.tripReminderFor(p.user_id, today, p.tarikh_berlepas);
        if (!msg) return;
      }
      const user = UserRepository.findById(p.user_id);
      if (!user || user.status !== USER_STATUS.ACTIVE) return;
      NotificationService.notify(p.user_id, NOTIF_TYPE.UMRAH_REMINDER, msg.title, msg.body, '', '#/umrah' + (m === 'trip' ? '?tab=jadual' : ''));
      patch[p.user_id] = { last_peringatan: today };
      out.sent++;
    });
    if (Object.keys(patch).length) UmrahService.repo('UMRAH_PROFIL').updateMany(patch);
    AppLogger.info('Peringatan Umrah', out);
    return out;
  },

  /** Hidup / matikan peringatan harian untuk pengguna sendiri. */
  peringatanSet: function (ctx, payload) {
    UmrahService.guardWrite(ctx);
    const p = Validator.validate(payload, { aktif: { type: 'boolean', required: true, label: 'Peringatan' } });
    UmrahService.saveProfil(ctx.userId, { peringatan: p.aktif ? 'YA' : 'TIDAK' });
    UmrahService.ensureReminderTriggerSafe();
    return { peringatan: p.aktif };
  },

  /** Hantar contoh peringatan sekarang (ke app + telefon) supaya pengguna boleh menyemak notifikasi. */
  peringatanTest: function (ctx) {
    SecurityService.rateLimit('umrah.test', ctx.userId);
    const berlepas = UmrahService.berlepas(ctx.userId);
    if (!berlepas) throw Errors.validation('Tetapkan tarikh berlepas dahulu.');
    const today = DateUtils.dayKey(new Date());
    const msg = (UmrahService.dayDiff(today, berlepas) < 0 && UmrahService.tripReminderFor(ctx.userId, today, berlepas)) ||
      UmrahService.reminderFor(ctx.userId, today, berlepas);
    NotificationService.notify(ctx.userId, NOTIF_TYPE.UMRAH_REMINDER, msg.title, msg.body, '', '#/umrah');
    UmrahService.ensureReminderTriggerSafe();
    return { title: msg.title, body: msg.body, devices: PushTokenRepository.activeByUser(ctx.userId).length, pushEnabled: PushService.enabled() };
  },

  /** Seperti ensureReminderTrigger, tetapi tidak melontar (dipanggil dalam permintaan pengguna; Web App berjalan sebagai pemilik). */
  ensureReminderTriggerSafe: function () {
    try { return UmrahService.ensureReminderTrigger(false); } catch (e) { AppLogger.warn('Pencetus peringatan gagal dipasang', { error: String(e && e.message || e) }); return { installed: false }; }
  },

  /** Pencetus peringatan: umrahReminder ~08:00 MYT (sebelum berlepas), umrahReminderTrip ~13:00 MYT = 08:00 Makkah. */
  REMINDER_TRIGGERS: function () { return [['umrahReminder', 8], ['umrahReminderTrip', 13]]; },

  /** Pasang pencetus peringatan yang belum wujud. force = pasang semula semua. */
  ensureReminderTrigger: function (force) {
    let installed = 0;
    const all = ScriptApp.getProjectTriggers();
    UmrahService.REMINDER_TRIGGERS().forEach(function (t) {
      const existing = all.filter(function (x) { return x.getHandlerFunction() === t[0]; });
      if (existing.length && !force) return;
      existing.forEach(function (x) { ScriptApp.deleteTrigger(x); });
      ScriptApp.newTrigger(t[0]).timeBased().everyDays(1).atHour(t[1]).create();
      installed++;
    });
    return { installed: installed > 0, count: installed };
  }
};
