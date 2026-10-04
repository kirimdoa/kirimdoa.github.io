/* ---- bahagian 0 ---- */
/**
 * Kirim Doa — jambatan google.script.* untuk versi web statik (GitHub Pages / domain sendiri).
 *
 * Frontend yang sama digunakan dalam Apps Script dan versi web. Dalam Apps Script,
 * `google.script.run.api()` disediakan oleh Google. Di sini, kita sediakan objek yang
 * sama tetapi menghantar permintaan ke doPost() Web App melalui fetch():
 *   - Content-Type text/plain  → tiada CORS preflight
 *   - credentials: 'omit'      → TIADA cookie Google dihantar. Ini yang menyelesaikan isu
 *     "Sorry, unable to open the file" bagi pelayar yang log masuk beberapa akaun Google.
 */
(function () {
  'use strict';
  var cfg = window.KIRIM_DOA_CONFIG || {};
  var API = String(cfg.webAppUrl || '');
  var VALID = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(API) ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+\/__api$/.test(API);
  var TIMEOUT_MS = 120000; // muat naik lampiran boleh mengambil masa

  function post(request, onOk, onFail) {
    if (!VALID) {
      setTimeout(function () { if (onFail) onFail(new Error('webAppUrl dalam config.js tidak sah')); }, 0);
      return;
    }
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(request),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }).then(function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { throw new Error('Respons pelayan bukan JSON'); }
      clearTimeout(timer);
      if (onOk) onOk(data);
    }).catch(function (err) {
      clearTimeout(timer);
      if (onFail) onFail(err);
    });
  }

  function runner(onOk, onFail) {
    return {
      withSuccessHandler: function (fn) { return runner(fn, onFail); },
      withFailureHandler: function (fn) { return runner(onOk, fn); },
      api: function (request) { post(request, onOk, onFail); }
    };
  }

  window.google = {
    script: {
      run: runner(null, null),
      url: {
        getLocation: function (cb) {
          var parameter = {};
          new URLSearchParams(location.search).forEach(function (v, k) { parameter[k] = v; });
          cb({ hash: '', parameter: parameter });
        }
      },
      // Versi web memiliki URL sendiri; router hash sudah mengemas kini alamat.
      history: { replace: function () {}, push: function () {} }
    }
  };
  window.KD_WEB = { apiConfigured: VALID };
})();
;
/* ---- bahagian 1 ---- */
/**
 * KD.utils — templat HTML selamat (auto-escape), format tarikh, pembantu DOM.
 * SEMUA nilai dinamik dimasukkan ke HTML melalui html`` → di-escape secara lalai (cegah XSS).
 * Hanya nilai yang dibalut raw() (dijana oleh kod kita sendiri) dimasukkan tanpa escape.
 */
window.KD = window.KD || {};
(function (KD) {
  'use strict';
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"'`]/g, (c) => ESC[c]);

  class Raw { constructor(s) { this.s = String(s); } toString() { return this.s; } }
  const raw = (s) => (s instanceof Raw ? s : new Raw(s));
  const renderVal = (v) => {
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(renderVal).join('');
    if (v === false || v === null || v === undefined) return '';
    return esc(v);
  };
  /** Tagged template: html`<p>${userText}</p>` → Raw (selamat). */
  function html(strings, ...vals) {
    let out = '';
    strings.forEach((s, i) => { out += s; if (i < vals.length) out += renderVal(vals[i]); });
    return new Raw(out);
  }

  const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
  function toDate(iso) { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d : null; }
  function fmtDate(iso, withTime) {
    const d = toDate(iso);
    if (!d) return '—';
    const s = d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    return withTime ? s + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : s;
  }
  function relTime(iso) {
    const d = toDate(iso);
    if (!d) return '';
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'baru sahaja';
    if (s < 3600) return Math.floor(s / 60) + ' minit yang lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam yang lalu';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' hari yang lalu';
    return fmtDate(iso);
  }
  const fmtNum = (n) => Number(n || 0).toLocaleString('ms-MY');
  const fmtBytes = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
  const todayKey = (offsetDays) => {
    const d = new Date(Date.now() + (offsetDays || 0) * 86400000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /** ID permintaan unik (idempotensi borang). */
  function requestId() {
    const a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return 'r' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  /** Delegasi acara: on(root, 'click', '[data-act]', fn) */
  function on(root, type, selector, fn) {
    const handler = (e) => {
      const el = e.target.closest(selector);
      if (el && root.contains(el)) fn(e, el);
    };
    root.addEventListener(type, handler);
    return () => root.removeEventListener(type, handler);
  }
  function debounce(fn, ms) {
    let t;
    return function () { const args = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }
  /** Data borang → objek (checkbox → boolean). */
  function formData(form) {
    const out = {};
    qsa('input, select, textarea', form).forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else if (el.type !== 'file') out[el.name] = el.value;
    });
    return out;
  }
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
      r.onerror = () => reject(new Error('Gagal membaca fail.'));
      r.readAsDataURL(file);
    });
  }
  function base64ToBlob(b64, mime) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function downloadBase64(b64, mime, filename) {
    const url = URL.createObjectURL(base64ToBlob(b64, mime));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  /** CSV selamat (escape petikan + cegah formula injection dalam Excel/Sheets). */
  function toCsv(rows) {
    return rows.map((r) => r.map((v) => {
      let s = String(v === null || v === undefined ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
  }
  function downloadText(text, mime, filename) {
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }
  const storage = {
    get(k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v, persist) {
      try { (persist ? localStorage : sessionStorage).setItem(k, v); (persist ? sessionStorage : localStorage).removeItem(k); } catch (e) { /* mod peribadi */ }
    },
    remove(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* abaikan */ } }
  };

  KD.utils = { esc, raw, html, Raw, fmtDate, relTime, fmtNum, fmtBytes, todayKey, requestId, qs, qsa, on, debounce, formData, fileToBase64, downloadBase64, toCsv, downloadText, copyText, storage };
})(window.KD);
;
/* ---- bahagian 2 ---- */
/**
 * KD.api — SATU-SATUNYA lapisan komunikasi dengan backend (google.script.run → api()).
 * Frontend tidak pernah mengakses perkhidmatan Google secara terus atau menyimpan rahsia.
 */
(function (KD) {
  'use strict';

  class ApiError extends Error {
    constructor(message, code, meta) { super(message); this.code = code; this.meta = meta || {}; }
  }

  function call(action, payload) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.script || !google.script.run) {
        reject(new ApiError('Aplikasi mesti dibuka melalui pautan Web App.', 'NO_RUNTIME'));
        return;
      }
      google.script.run
        .withSuccessHandler((res) => {
          if (res && res.success) return resolve(res.data);
          const err = new ApiError((res && res.message) || 'Permintaan tidak dapat diproses.', res && res.code, res && res.meta);
          if (err.code === 'UNAUTHENTICATED' && KD.auth && KD.auth.token() && action !== 'auth.login') KD.auth.expired();
          if (err.code === 'MAINTENANCE' && KD.app) KD.app.maintenance(err.message);
          reject(err);
        })
        .withFailureHandler((e) => {
          console.error('[api]', action, e);
          reject(new ApiError('Sambungan ke pelayan gagal. Semak internet anda dan cuba semula.', 'NETWORK'));
        })
        .api({ action: action, payload: payload || {}, token: KD.auth ? KD.auth.token() : '', meta: { userAgent: navigator.userAgent } });
    });
  }

  KD.api = {
    call,
    ApiError,
    // Awam
    getConfig: () => call('public.config'),
    getCategories: () => call('public.categories'),
    sendFeedback: (p) => call('public.feedback', p),
    // Auth
    register: (p) => call('auth.register', p),
    login: (p) => call('auth.login', p),
    logout: () => call('auth.logout'),
    getCurrentUser: () => call('auth.me'),
    changePassword: (p) => call('auth.changePassword', p),
    requestReset: (p) => call('auth.requestReset', p),
    resetPassword: (p) => call('auth.resetPassword', p),
    // Pengguna
    updateProfile: (p) => call('user.updateProfile', p),
    getDashboard: () => call('user.dashboard'),
    // Doa
    getDoas: (filters) => call('doa.list', filters),
    getDoa: (id) => call('doa.get', { id }),
    createDoa: (p) => call('doa.create', p),
    updateDoa: (id, p) => call('doa.update', Object.assign({ id }, p)),
    deleteDoa: (id) => call('doa.delete', { id }),
    favoriteDoa: (id) => call('doa.favorite', { id }),
    markRead: (ids) => call('doa.markRead', { ids }),
    getAttachment: (id) => call('doa.attachment', { id }),
    exportPdf: (filters) => call('export.pdf', filters),
    // Kumpul Doa
    getMyLinks: () => call('recipient.mine'),
    createLink: (p) => call('recipient.create', p),
    updateLink: (p) => call('recipient.update', p),
    getPublicLink: (code) => call('recipient.public', { code }),
    submitToLink: (p) => call('recipient.submit', p),
    // Notifikasi
    getNotifications: (p) => call('notification.list', p),
    markNotificationRead: (id) => call('notification.markRead', { id }),
    markAllNotificationsRead: () => call('notification.markAllRead'),
    // Admin
    admin: {
      getStatistics: () => call('admin.stats'),
      getReport: (p) => call('admin.report', p),
      getUsers: (f) => call('admin.users', f),
      setUserStatus: (p) => call('admin.user.status', p),
      setUserRole: (p) => call('admin.user.role', p),
      revokeSessions: (userId) => call('admin.user.revokeSessions', { userId }),
      sendReset: (userId) => call('admin.user.sendReset', { userId }),
      getDoas: (f) => call('admin.doas', f),
      setDoaStatus: (p) => call('admin.doa.status', p),
      getCategories: () => call('admin.categories'),
      createCategory: (p) => call('admin.category.create', p),
      updateCategory: (p) => call('admin.category.update', p),
      broadcast: (p) => call('admin.broadcast', p),
      getBroadcasts: () => call('admin.broadcastHistory'),
      getAuditLogs: (f) => call('admin.audit', f),
      getFeedback: (f) => call('admin.feedback', f),
      setFeedbackStatus: (p) => call('admin.feedback.status', p),
      getSettings: () => call('admin.settings'),
      updateSettings: (changes) => call('admin.settings.update', { changes }),
      getHealth: () => call('admin.health'),
      runBackup: () => call('admin.backup'),
      getMigrations: () => call('admin.migrations'),
      getSystemLogs: () => call('admin.systemLogs')
    }
  };
})(window.KD);
;
/* ---- bahagian 3 ---- */
/**
 * KD.ui — komponen UI boleh guna semula: ikon, toast, modal, sahkan, skeleton, kosong, pager, ralat borang.
 */
(function (KD) {
  'use strict';
  const { html, raw, qs, qsa, esc, fmtNum } = KD.utils;

  const icon = (name, cls) => raw('<svg class="i ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + esc(name) + '"/></svg>');
  const star = (cls) => raw('<svg class="brand-star ' + (cls || '') + '" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-brand"/></svg>');

  /** Siluet langit masjid (asli, generik) untuk bahagian bawah hero. */
  const skyline = raw('<svg viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true" fill="currentColor">' +
    '<path d="M0 220V178h70v-34h8v-46l6-14 6 14v46h8v34h60c0-34 22-58 52-66 4-10 10-16 10-16s6 6 10 16c30 8 52 32 52 66h40v-64h6v-80l7-16 7 16v80h6v64h56' +
    'c0-26 18-44 40-48 2-8 7-12 7-12s5 4 7 12c22 4 40 22 40 48h120c0-58 40-104 96-114 6-18 20-30 20-30s14 12 20 30c56 10 96 56 96 114h44v-90h8v-62l8-18 8 18v62h8v90' +
    'h112c0-30 20-52 46-58 3-9 9-14 9-14s6 5 9 14c26 6 46 28 46 58h70v-40h8v-52l6-14 6 14v52h8v40h48c0-22 14-36 32-40 2-7 6-10 6-10s4 3 6 10c18 4 32 18 32 40h50v42z"/></svg>');

  const CATEGORY_ICON = { heart: 'heart', home: 'home', coins: 'coins', plane: 'plane', mosque: 'mosque', book: 'book', briefcase: 'briefcase', rings: 'rings', kaaba: 'kaaba', users: 'users', parents: 'parents', star: 'star', moon: 'moon', hands: 'hands' };
  const catIcon = (name, cls) => icon(CATEGORY_ICON[name] || 'star', cls);

  // ---------------------------------------------------------------- Toast
  function toast(message, type) {
    const root = qs('#toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = html`${icon(type === 'error' ? 'alert' : 'check')}<div>${message}</div>`.s;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, type === 'error' ? 6000 : 3800);
  }
  /** Papar ralat API dengan errorId (jika ada) untuk rujukan sokongan. */
  function toastError(err) {
    const id = err && err.meta && err.meta.errorId;
    toast((err && err.message ? err.message : 'Maaf, berlaku masalah.') + (id ? ' (Rujukan: ' + id + ')' : ''), 'error');
  }

  // ---------------------------------------------------------------- Modal
  let lastFocus = null;
  /**
   * @param {{title:string, body:Raw, foot?:Raw, wide?:boolean, onClose?:Function}} opts
   * @return {{el:HTMLElement, close:Function}}
   */
  function modal(opts) {
    lastFocus = document.activeElement;
    const root = qs('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    const titleId = 'm' + Math.random().toString(36).slice(2);
    wrap.innerHTML = html`<div class="modal ${opts.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="modal__head"><h3 id="${titleId}">${opts.title}</h3><button class="icon-btn" data-close aria-label="Tutup">${icon('x')}</button></div>
      <div class="modal__body">${opts.body}</div>
      ${opts.foot ? html`<div class="modal__foot">${opts.foot}</div>` : ''}
    </div>`.s;
    root.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    const close = () => {
      wrap.remove();
      if (!qs('#modal-root').children.length) document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { // perangkap fokus
        const f = qsa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', wrap).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    qsa('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
    const first = qs('input, select, textarea', wrap) || qs('[data-close]', wrap);
    if (first) setTimeout(() => first.focus(), 30);
    return { el: wrap, close };
  }

  /** Dialog pengesahan. @return {Promise<boolean|string>} (string = sebab, jika withReason) */
  function confirm(opts) {
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title: opts.title,
        body: html`<p>${opts.message}</p>${opts.withReason ? html`<div class="field mt-4"><label class="label" for="cf-reason">Sebab (pilihan)</label><input class="input" id="cf-reason" maxlength="200"></div>` : ''}`,
        foot: html`<button class="btn btn-outline" data-close>Batal</button><button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-ok>${opts.confirmText || 'Teruskan'}</button>`,
        onClose: () => { if (!done) resolve(false); }
      });
      qs('[data-ok]', m.el).addEventListener('click', () => {
        done = true;
        const reason = opts.withReason ? qs('#cf-reason', m.el).value.trim() : true;
        m.close();
        resolve(opts.withReason ? (reason || ' ') : true);
      });
    });
  }

  // ---------------------------------------------------------------- Keadaan
  const skeletonList = (n) => html`<div class="panel">${Array.from({ length: n || 4 }, () => html`<div class="row" style="margin:14px 0"><div class="skel" style="width:42px;height:42px;border-radius:50%"></div><div class="grow"><div class="skel skel-line" style="width:40%"></div><div class="skel skel-line" style="width:85%"></div></div></div>`)}</div>`;
  const skeletonStats = (n) => html`<div class="grid grid-4">${Array.from({ length: n || 4 }, () => html`<div class="skel skel-block"></div>`)}</div>`;
  const empty = (title, message, action) => html`<div class="empty">${star()}<h3>${title}</h3><p>${message}</p>${action || ''}</div>`;
  const errorState = (err, retryAct) => html`<div class="empty">${icon('alert', 'i-lg')}<h3>Tidak dapat memuatkan data</h3><p>${err && err.message ? err.message : 'Sila cuba semula.'}</p>${retryAct ? html`<button class="btn btn-outline" data-act="${retryAct}">${icon('refresh')}Cuba semula</button>` : ''}</div>`;

  /** Navigasi halaman. */
  function pager(meta) {
    if (!meta || meta.totalPages <= 1) return meta && meta.total ? html`<div class="pager"><span>${fmtNum(meta.total)} rekod</span></div>` : '';
    return html`<div class="pager"><span>Halaman ${meta.page} daripada ${meta.totalPages}, ${fmtNum(meta.total)} rekod</span>
      <div class="row"><button class="btn btn-outline btn-sm" data-page="${meta.page - 1}" ${meta.page <= 1 ? raw('disabled') : ''}>${icon('chev-left', 'i-sm')}Sebelum</button>
      <button class="btn btn-outline btn-sm" data-page="${meta.page + 1}" ${meta.page >= meta.totalPages ? raw('disabled') : ''}>Seterusnya${icon('chev-right', 'i-sm')}</button></div></div>`;
  }

  /** Butang sibuk semasa operasi async. */
  async function busy(btn, fn) {
    if (!btn) return fn();
    btn.classList.add('is-loading'); btn.disabled = true;
    try { return await fn(); } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
  }

  /** Papar ralat medan daripada respons VALIDATION_ERROR. */
  function fieldErrors(form, err) {
    qsa('.field-error', form).forEach((e) => e.remove());
    qsa('.field.has-error', form).forEach((f) => f.classList.remove('has-error'));
    const fields = err && err.meta && err.meta.fields;
    if (!fields) return false;
    let first = null;
    Object.keys(fields).forEach((name) => {
      const input = form.querySelector('[name="' + name + '"]');
      const field = input && input.closest('.field');
      if (!field) return;
      field.classList.add('has-error');
      const p = document.createElement('div');
      p.className = 'field-error';
      p.textContent = fields[name];
      field.appendChild(p);
      if (!first) first = input;
    });
    if (first) first.focus();
    return !!first;
  }

  const statusBadge = (s) => {
    const map = { ACTIVE: ['badge-success', 'Aktif'], INACTIVE: ['badge-muted', 'Tidak aktif'], BLOCKED: ['badge-danger', 'Disekat'], ARCHIVED: ['badge-warn', 'Diarkib'], DELETED: ['badge-danger', 'Dipadam'], CLOSED: ['badge-muted', 'Ditutup'], NEW: ['badge-gold', 'Baharu'], REVIEWED: ['badge-success', 'Disemak'] };
    const m = map[s] || ['badge-muted', s];
    return html`<span class="badge ${m[0]}">${m[1]}</span>`;
  };
  const roleBadge = (r) => html`<span class="badge ${r === 'SUPER_ADMIN' ? 'badge-maroon' : r === 'ADMIN' ? 'badge' : 'badge-muted'}">${r === 'SUPER_ADMIN' ? 'Super Admin' : r === 'ADMIN' ? 'Admin' : 'Pengguna'}</span>`;

  KD.ui = { icon, star, skyline, catIcon, toast, toastError, modal, confirm, skeletonList, skeletonStats, empty, errorState, pager, busy, fieldErrors, statusBadge, roleBadge };
})(window.KD);
;
/* ---- bahagian 4 ---- */
/**
 * KD.charts — carta SVG ringan tanpa pustaka luar. Setiap carta ada <title> & jadual tersembunyi untuk pembaca skrin.
 */
(function (KD) {
  'use strict';
  const { html, raw, esc, fmtNum } = KD.utils;

  const shortDay = (k) => { const p = String(k).split('-'); return p.length === 3 ? Number(p[2]) + '/' + Number(p[1]) : k; };
  const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
  const shortMonth = (k) => { const p = String(k).split('-'); return p.length === 2 ? MONTHS[Number(p[1]) - 1] : k; };

  function niceMax(v) {
    if (v <= 5) return 5;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / p) * p;
  }

  function srTable(title, data) {
    return html`<table class="sr-only"><caption>${title}</caption><tbody>${data.map((d) => html`<tr><th>${d.label}</th><td>${d.value}</td></tr>`)}</tbody></table>`;
  }

  /** Carta bar menegak. */
  function bars(data, opts) {
    opts = opts || {};
    const W = 640, H = opts.height || 220, P = { t: 12, r: 8, b: 26, l: 32 };
    const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const bw = iw / Math.max(1, data.length);
    const fmt = opts.labelFormat === 'month' ? shortMonth : opts.labelFormat === 'day' ? shortDay : (x) => x;
    const every = Math.ceil(data.length / 10);
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const y = P.t + ih - (ih * i) / 4;
      s += '<line class="grid-line" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text x="' + (P.l - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + fmtNum((max * i) / 4) + '</text>';
    }
    data.forEach((d, i) => {
      const h = (d.value / max) * ih;
      const x = P.l + i * bw + bw * 0.18;
      s += '<rect class="bar" rx="3" x="' + x + '" y="' + (P.t + ih - h) + '" width="' + bw * 0.64 + '" height="' + Math.max(h, d.value ? 2 : 0) + '"><title>' + esc(fmt(d.label)) + ': ' + d.value + '</title></rect>';
      if (i % every === 0) s += '<text x="' + (x + bw * 0.32) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(fmt(d.label)) + '</text>';
    });
    return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.title || 'Carta'}">${raw(s)}</svg>${srTable(opts.title || 'Carta', data)}`;
  }

  /** Carta garis + kawasan. */
  function line(data, opts) {
    opts = opts || {};
    const W = 640, H = opts.height || 220, P = { t: 12, r: 12, b: 26, l: 32 };
    const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const step = data.length > 1 ? iw / (data.length - 1) : 0;
    const fmt = opts.labelFormat === 'month' ? shortMonth : opts.labelFormat === 'day' ? shortDay : (x) => x;
    const pts = data.map((d, i) => [P.l + i * step, P.t + ih - (d.value / max) * ih]);
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const y = P.t + ih - (ih * i) / 4;
      s += '<line class="grid-line" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text x="' + (P.l - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + fmtNum((max * i) / 4) + '</text>';
    }
    if (pts.length) {
      const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      s += '<path class="area" d="' + path + ' L' + pts[pts.length - 1][0] + ' ' + (P.t + ih) + ' L' + pts[0][0] + ' ' + (P.t + ih) + 'Z"/>';
      s += '<path class="line" d="' + path + '"/>';
      const every = Math.ceil(data.length / 8);
      pts.forEach((p, i) => {
        s += '<circle class="dot" r="3.5" cx="' + p[0] + '" cy="' + p[1] + '"><title>' + esc(fmt(data[i].label)) + ': ' + data[i].value + '</title></circle>';
        if (i % every === 0 || i === pts.length - 1) s += '<text x="' + p[0] + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(fmt(data[i].label)) + '</text>';
      });
    }
    return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.title || 'Carta'}">${raw(s)}</svg>${srTable(opts.title || 'Carta', data)}`;
  }

  /** Bar mendatar (kategori). */
  function hbars(data, opts) {
    opts = opts || {};
    if (!data.length) return html`<p class="muted small">Tiada data lagi.</p>`;
    const max = Math.max(1, ...data.map((d) => d.value));
    return html`<div class="hbars" role="list" aria-label="${opts.title || 'Taburan'}">${data.slice(0, opts.limit || 10).map((d) => html`
      <div class="hbar" role="listitem"><span class="nowrap" style="overflow:hidden;text-overflow:ellipsis">${d.label}</span>
      <div class="hbar__track"><div class="hbar__fill" style="width:${Math.round((d.value / max) * 100)}%"></div></div>
      <span class="hbar__val">${fmtNum(d.value)}</span></div>`)}</div>`;
  }

  KD.charts = { bars, line, hbars };
})(window.KD);
;
/* ---- bahagian 5 ---- */
/**
 * KD.auth (keadaan sesi), KD.router (navigasi hash + kawalan akses UI), KD.app (shell & but).
 * NOTA: kawalan akses di sini hanyalah UX — semua kebenaran sebenar dikuatkuasa di backend.
 */
(function (KD) {
  'use strict';
  const { html, raw, qs, qsa, on, storage } = KD.utils;
  const { icon, star } = KD.ui;

  // ================================================================ AUTH
  const SESSION_KEY = 'kd.session.v1';
  const auth = {
    state: null, // { token, user, expiresAt }
    load() {
      try { auth.state = JSON.parse(storage.get(SESSION_KEY) || 'null'); } catch (e) { auth.state = null; }
      if (auth.state && auth.state.expiresAt && new Date(auth.state.expiresAt) < new Date()) auth.clear();
    },
    token: () => (auth.state && auth.state.token) || '',
    user: () => (auth.state && auth.state.user) || null,
    loggedIn: () => !!auth.token(),
    role: () => (auth.user() && auth.user().role) || 'PUBLIC',
    isAdmin: () => ['ADMIN', 'SUPER_ADMIN'].indexOf(auth.role()) >= 0,
    isSuper: () => auth.role() === 'SUPER_ADMIN',
    set(data, remember) {
      auth.state = { token: data.token, user: data.user, expiresAt: data.expiresAt, remember: !!remember };
      storage.set(SESSION_KEY, JSON.stringify(auth.state), !!remember);
    },
    updateUser(user) {
      if (!auth.state) return;
      auth.state.user = user;
      storage.set(SESSION_KEY, JSON.stringify(auth.state), auth.state.remember);
    },
    clear() { auth.state = null; storage.remove(SESSION_KEY); KD.app.unread = 0; },
    expired() {
      if (!auth.loggedIn()) return;
      auth.clear();
      KD.ui.toast('Sesi anda telah tamat. Sila log masuk semula.', 'error');
      router.go('/log-masuk');
    },
    async logout() {
      try { await KD.api.logout(); } catch (e) { /* tetap log keluar di klien */ }
      auth.clear();
      KD.ui.toast('Anda telah log keluar.');
      router.go('/');
    }
  };

  // ================================================================ ROUTER
  const ROUTES = [
    { path: '/', view: 'landing', access: 'public', layout: 'public' },
    { path: '/log-masuk', view: 'login', access: 'guest', layout: 'public', title: 'Log Masuk' },
    { path: '/daftar', view: 'register', access: 'guest', layout: 'public', title: 'Daftar Baru' },
    { path: '/lupa-kata-laluan', view: 'forgot', access: 'guest', layout: 'public', title: 'Lupa Kata Laluan' },
    { path: '/k/:code', view: 'collect', access: 'public', layout: 'public', title: 'Kirim Doa' },

    { path: '/utama', view: 'dashboard', access: 'user', layout: 'app', title: 'Utama' },
    { path: '/hantar', view: 'compose', access: 'user', layout: 'app', title: 'Hantar Doa' },
    { path: '/hantar/:id', view: 'compose', access: 'user', layout: 'app', title: 'Sunting Doa' },
    { path: '/senarai', view: 'doaList', access: 'user', layout: 'app', title: 'Senarai Doa' },
    { path: '/kegemaran', view: 'favorites', access: 'user', layout: 'app', title: 'Kegemaran' },
    { path: '/baca', view: 'reader', access: 'user', layout: 'app', title: 'Baca Satu-Persatu' },
    { path: '/kumpul', view: 'links', access: 'user', layout: 'app', title: 'Kumpul Doa' },
    { path: '/notifikasi', view: 'notifications', access: 'user', layout: 'app', title: 'Notifikasi' },
    { path: '/profil', view: 'profile', access: 'user', layout: 'app', title: 'Profil' },

    { path: '/admin', view: 'adminDashboard', access: 'admin', layout: 'admin', title: 'Dashboard' },
    { path: '/admin/pengguna', view: 'adminUsers', access: 'admin', layout: 'admin', title: 'Pengguna' },
    { path: '/admin/doa', view: 'adminDoas', access: 'admin', layout: 'admin', title: 'Doa' },
    { path: '/admin/kategori', view: 'adminCategories', access: 'admin', layout: 'admin', title: 'Kategori' },
    { path: '/admin/notifikasi', view: 'adminNotifications', access: 'admin', layout: 'admin', title: 'Notifikasi' },
    { path: '/admin/maklum-balas', view: 'adminFeedback', access: 'admin', layout: 'admin', title: 'Maklum Balas' },
    { path: '/admin/laporan', view: 'adminReports', access: 'admin', layout: 'admin', title: 'Laporan' },
    { path: '/admin/audit', view: 'adminAudit', access: 'admin', layout: 'admin', title: 'Audit Log' },
    { path: '/admin/tetapan', view: 'adminSettings', access: 'admin', layout: 'admin', title: 'Tetapan' },
    { path: '/admin/pangkalan-data', view: 'adminDatabase', access: 'super', layout: 'admin', title: 'Pangkalan Data' },
    { path: '/admin/kesihatan', view: 'adminHealth', access: 'super', layout: 'admin', title: 'Kesihatan Sistem' }
  ];

  function match(path) {
    const clean = path.split('?')[0] || '/';
    for (const r of ROUTES) {
      const keys = [];
      const re = new RegExp('^' + r.path.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
      const m = clean.match(re);
      if (m) {
        const params = {};
        keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
    }
    return null;
  }

  function parseQuery(path) {
    const q = {};
    const i = path.indexOf('?');
    if (i < 0) return q;
    path.slice(i + 1).split('&').forEach((pair) => {
      const [k, v] = pair.split('=');
      if (k) q[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return q;
  }

  const router = {
    current: null,
    currentPath: () => (location.hash || '#/').slice(1) || '/',
    go(path, replace) {
      if (('#' + path) === location.hash) router.render();
      else if (replace) { history.replaceState(null, '', '#' + path); router.render(); }
      else location.hash = path;
    },
    /** Kemas kini query semasa tanpa menambah sejarah. */
    setQuery(query) {
      const base = router.currentPath().split('?')[0];
      const qsStr = Object.keys(query).filter((k) => query[k] !== '' && query[k] !== undefined && query[k] !== null)
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(query[k])).join('&');
      history.replaceState(null, '', '#' + base + (qsStr ? '?' + qsStr : ''));
      syncTop(base + (qsStr ? '?' + qsStr : ''));
    },
    async render() {
      const path = router.currentPath();
      const found = match(path);
      if (!found) return router.go(auth.loggedIn() ? '/utama' : '/', true);
      const r = found.route;
      if (r.access === 'guest' && auth.loggedIn()) return router.go('/utama', true);
      if (r.access !== 'public' && r.access !== 'guest' && !auth.loggedIn()) {
        storage.set('kd.afterLogin', path, false);
        return router.go('/log-masuk', true);
      }
      if (r.access === 'admin' && !auth.isAdmin()) return router.go('/utama', true);
      if (r.access === 'super' && !auth.isSuper()) return router.go('/admin', true);

      router.current = { route: r, params: found.params, query: parseQuery(path), path };
      const view = KD.views[r.view];
      const container = KD.app.mount(r);
      document.title = (r.title ? r.title + ' — ' : '') + ((KD.config && KD.config.SYSTEM_NAME) || 'Kirim Doa');
      syncTop(path);
      window.scrollTo(0, 0);
      try {
        await view.render(container, found.params, router.current.query);
      } catch (err) {
        console.error(err);
        container.innerHTML = KD.ui.errorState(err, 'reload').s;
        on(container, 'click', '[data-act="reload"]', () => router.render());
      }
    },
    start() {
      window.addEventListener('hashchange', router.render);
      router.render();
    }
  };

  /** Selaraskan URL halaman atas (GAS iframe) supaya muat semula kekal di laluan sama. */
  function syncTop(path) {
    try { if (window.google && google.script && google.script.history) google.script.history.replace(null, {}, path); } catch (e) { /* abaikan */ }
  }

  // ================================================================ APP SHELL
  const USER_NAV = [
    ['/utama', 'home', 'Utama'], ['/hantar', 'send', 'Hantar Doa'], ['/senarai', 'list', 'Senarai Doa'],
    ['/baca', 'book', 'Baca Satu-Persatu'], ['/kegemaran', 'heart', 'Kegemaran'], ['/kumpul', 'link', 'Kumpul Doa'],
    ['/notifikasi', 'bell', 'Notifikasi'], ['/profil', 'user', 'Profil']
  ];
  const ADMIN_NAV = [
    ['/admin', 'chart', 'Dashboard'], ['/admin/pengguna', 'users', 'Pengguna'], ['/admin/doa', 'list', 'Doa'],
    ['/admin/kategori', 'grid', 'Kategori'], ['/admin/notifikasi', 'bell', 'Notifikasi'], ['/admin/maklum-balas', 'feedback', 'Maklum Balas'],
    ['/admin/laporan', 'pdf', 'Laporan'], ['/admin/audit', 'shield', 'Audit Log'], ['/admin/tetapan', 'settings', 'Tetapan'],
    ['/admin/pangkalan-data', 'database', 'Pangkalan Data', 'super'], ['/admin/kesihatan', 'activity', 'Kesihatan Sistem', 'super']
  ];
  const BOTTOM_NAV = [['/utama', 'home', 'Utama'], ['/senarai', 'list', 'Senarai'], ['/hantar', 'send', 'Doa', true], ['/notifikasi', 'bell', 'Notifikasi'], ['/profil', 'user', 'Profil']];

  const app = {
    unread: 0,
    shellMode: null,

    navItems(mode) {
      return (mode === 'admin' ? ADMIN_NAV : USER_NAV).filter((n) => n[3] !== 'super' || auth.isSuper());
    },

    /** Sediakan susun atur & pulangkan bekas paparan BAHARU (pendengar lama dibuang bersama elemen lama). */
    mount(route) {
      const root = qs('#root');
      const mode = route.layout;
      if (mode === 'public') {
        app.shellMode = 'public';
        root.innerHTML = '<div class="public" id="view"></div>';
        return qs('#view');
      }
      if (app.shellMode !== mode || !qs('#view')) app.renderShell(mode);
      app.updateShell(route);
      const old = qs('#view');
      const fresh = document.createElement('div');
      fresh.id = 'view';
      fresh.className = 'content';
      old.replaceWith(fresh);
      qs('.main').scrollTop = 0;
      return fresh;
    },

    renderShell(mode) {
      app.shellMode = mode;
      const user = auth.user() || {};
      const nav = app.navItems(mode);
      qs('#root').innerHTML = html`<div class="shell">
        <aside class="sidebar" aria-label="Navigasi utama">
          <a class="side-brand" href="#${mode === 'admin' ? '/admin' : '/utama'}">${star()}<span class="side-brand__name">${(KD.config && KD.config.SYSTEM_NAME) || 'Kirim Doa'}</span>${mode === 'admin' ? html`<span class="badge badge-gold">Pentadbir</span>` : ''}</a>
          <nav class="side-nav">${nav.map((n) => html`<a class="side-link" href="#${n[0]}" data-nav="${n[0]}">${icon(n[1])}<span>${n[2]}</span>${n[0] === '/notifikasi' ? html`<span class="badge-dot hidden" data-unread-dot></span>` : ''}</a>`)}</nav>
          ${auth.isAdmin() ? html`<div class="side-section">${mode === 'admin' ? 'Aplikasi' : 'Pentadbiran'}</div>
            <nav class="side-nav">${mode === 'admin' ? html`<a class="side-link" href="#/utama">${icon('home')}<span>Kembali ke aplikasi</span></a>` : html`<a class="side-link" href="#/admin">${icon('shield')}<span>Panel pentadbir</span></a>`}</nav>` : ''}
          <div class="side-foot"><button class="side-link" style="width:100%" data-act="logout">${icon('logout')}<span>Log Keluar</span></button></div>
        </aside>
        <div class="main">
          <header class="topbar">
            <button class="icon-btn hide-desktop" data-act="menu" aria-label="Menu">${icon('menu')}</button>
            <a class="topbar__brand" href="#/utama">${star()}<span>${(KD.config && KD.config.SYSTEM_NAME) || 'Kirim Doa'}</span></a>
            <div class="topbar__title" data-title></div>
            <div class="topbar__actions">
              <a class="icon-btn" href="#/notifikasi" aria-label="Notifikasi">${icon('bell')}<span class="count-pill hidden" data-unread-count></span></a>
              <div class="menu">
                <button class="user-chip" data-act="user-menu" aria-haspopup="true" aria-expanded="false"><span class="avatar">${user.initials || '?'}</span><span class="user-chip__name">${user.fullName || ''}</span>${icon('chev-down', 'i-sm')}</button>
                <div class="menu__pop hidden" data-user-menu role="menu">
                  <div style="padding:8px 12px"><div class="small" style="font-weight:600">${user.fullName || ''}</div><div class="xs muted">${user.email || ''}</div></div><hr>
                  <a href="#/profil" role="menuitem">${icon('user')}Profil saya</a>
                  ${auth.isAdmin() ? (mode === 'admin' ? html`<a href="#/utama" role="menuitem">${icon('home')}Mod pengguna</a>` : html`<a href="#/admin" role="menuitem">${icon('shield')}Panel pentadbir</a>`) : ''}
                  <hr><button data-act="logout" role="menuitem">${icon('logout')}Log keluar</button>
                </div>
              </div>
            </div>
          </header>
          <div id="view" class="content"></div>
        </div>
      </div>
      <nav class="bottomnav" aria-label="Navigasi bawah">${BOTTOM_NAV.map((n) => html`<a href="#${n[0]}" data-nav="${n[0]}" class="${n[3] ? 'bn-main' : ''}">${n[3] ? html`<span class="bn-circle">${icon(n[1])}</span>` : icon(n[1])}<span>${n[2]}</span>${n[0] === '/notifikasi' ? html`<span class="count-pill hidden" data-unread-count></span>` : ''}</a>`)}</nav>`.s;

      const root = qs('#root');
      on(root, 'click', '[data-act="logout"]', () => auth.logout());
      on(root, 'click', '[data-act="menu"]', () => app.openNavSheet(mode));
      on(root, 'click', '[data-act="user-menu"]', (e, btn) => {
        e.stopPropagation();
        const pop = qs('[data-user-menu]');
        const open = pop.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', String(open));
      });
      if (!app.docListener) {
        app.docListener = true;
        document.addEventListener('click', () => { const p = qs('[data-user-menu]'); if (p) p.classList.add('hidden'); });
      }
      app.setUnread(app.unread);
    },

    updateShell(route) {
      const t = qs('[data-title]');
      if (t) t.textContent = route.title || '';
      const path = route.path.replace(/\/:.+$/, '');
      qsa('[data-nav]').forEach((a) => {
        const active = a.getAttribute('data-nav') === path;
        a.classList.toggle('is-active', active);
        if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
    },

    openNavSheet(mode) {
      const nav = app.navItems(mode);
      const m = KD.ui.modal({
        title: mode === 'admin' ? 'Menu pentadbir' : 'Menu',
        body: html`<nav class="stack" style="gap:4px">${nav.map((n) => html`<a class="btn btn-ghost" style="justify-content:flex-start" href="#${n[0]}">${icon(n[1])}${n[2]}</a>`)}
          ${auth.isAdmin() ? html`<hr style="border:0;border-top:1px solid var(--line);margin:8px 0">${mode === 'admin' ? html`<a class="btn btn-ghost" style="justify-content:flex-start" href="#/utama">${icon('home')}Kembali ke aplikasi</a>` : html`<a class="btn btn-ghost" style="justify-content:flex-start" href="#/admin">${icon('shield')}Panel pentadbir</a>`}` : ''}
          <button class="btn btn-ghost" style="justify-content:flex-start" data-act="logout">${icon('logout')}Log keluar</button></nav>`
      });
      on(m.el, 'click', 'a', () => m.close());
      on(m.el, 'click', '[data-act="logout"]', () => { m.close(); auth.logout(); });
    },

    setUnread(n) {
      app.unread = n || 0;
      qsa('[data-unread-count]').forEach((el) => { el.textContent = app.unread > 9 ? '9+' : String(app.unread); el.classList.toggle('hidden', !app.unread); });
      qsa('[data-unread-dot]').forEach((el) => el.classList.toggle('hidden', !app.unread));
    },

    maintenance(message) {
      if (auth.isAdmin()) return;
      qs('#root').innerHTML = html`<div class="public"><div class="auth"><div class="auth-card" style="text-align:center">${star()}<h2 class="mt-4">Sedang diselenggara</h2><p class="muted mt-2">${message}</p><button class="btn btn-outline mt-6" data-act="reload">${icon('refresh')}Muat semula</button></div></div></div>`.s;
      const btn = qs('#root [data-act="reload"]');
      if (btn) btn.addEventListener('click', () => location.reload());
      app.shellMode = null;
    },

    async boot() {
      auth.load();
      const body = document.body;
      let share = body.getAttribute('data-share') || '';
      let topHash = '';
      try {
        await new Promise((resolve) => {
          if (window.google && google.script && google.script.url) google.script.url.getLocation((loc) => {
            topHash = loc && loc.hash;
            const c = loc && loc.parameter && String(loc.parameter.c || '').toUpperCase();
            if (!share && /^[A-Z0-9]{6,12}$/.test(c || '')) share = c;
            resolve();
          });
          else resolve();
          setTimeout(resolve, 1500);
        });
      } catch (e) { /* abaikan */ }

      const tasks = [KD.api.getConfig().then((c) => { KD.config = c; }).catch(() => { KD.config = {}; })];
      if (auth.loggedIn()) {
        tasks.push(KD.api.getCurrentUser().then((me) => { auth.updateUser(me.user); app.unread = me.unreadNotifications; }).catch((e) => { if (e.code === 'UNAUTHENTICATED') auth.clear(); }));
      }
      await Promise.all(tasks);

      if (share && !(topHash || location.hash)) history.replaceState(null, '', '#/k/' + share);
      else if (!location.hash && topHash) history.replaceState(null, '', '#' + topHash.replace(/^#/, ''));
      else if (!location.hash && auth.loggedIn()) history.replaceState(null, '', '#/utama');

      const boot = qs('#boot');
      boot.classList.add('is-done');
      setTimeout(() => boot.remove(), 450);
      router.start();
    },

    /** Selepas log masuk: pergi ke laluan yang diminta sebelum ini. */
    afterLogin() {
      const next = storage.get('kd.afterLogin');
      storage.remove('kd.afterLogin');
      app.shellMode = null;
      router.go(next && next.indexOf('/log-masuk') < 0 ? next : (auth.isAdmin() ? '/admin' : '/utama'));
    }
  };

  KD.auth = auth;
  KD.router = router;
  KD.app = app;
  KD.views = KD.views || {};
})(window.KD);
;
/* ---- bahagian 6 ---- */
/**
 * Paparan awam: Landing, Log Masuk, Daftar, Lupa Kata Laluan, halaman pautan Kumpul Doa.
 */
(function (KD) {
  'use strict';
  const { html, raw, qs, on, formData, fmtNum, requestId } = KD.utils;
  const { icon, star, skyline, toast, toastError, busy, fieldErrors } = KD.ui;
  const cfg = () => KD.config || {};

  const BISMILLAH = 'بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

  function publicTop(dark) {
    const loggedIn = KD.auth.loggedIn();
    return html`<header class="public-top"><a class="brand" href="#/">${star()}<span>${cfg().SYSTEM_NAME || 'Kirim Doa'}</span></a>
      <nav class="row">${loggedIn
        ? html`<a class="btn ${dark ? 'btn-light' : 'btn-outline'} btn-sm" href="#/utama">Buka aplikasi</a>`
        : html`<a class="btn ${dark ? 'btn-light' : 'btn-ghost'} btn-sm" href="#/log-masuk">Log Masuk</a><a class="btn ${dark ? 'btn-cream' : 'btn-primary'} btn-sm" href="#/daftar">Daftar</a>`}</nav></header>`;
  }

  function publicFoot() {
    return html`<footer class="public-foot"><nav><button class="btn-link" data-scroll="tentang">Tentang ${cfg().SYSTEM_NAME || 'Kirim Doa'}</button><button class="btn-link" data-scroll="panduan">Panduan</button><button class="btn-link" data-scroll="maklum-balas">Maklum Balas</button></nav>
      <div>${cfg().SYSTEM_NAME || 'Kirim Doa'}: ${cfg().SYSTEM_TAGLINE || ''}${cfg().ORG_NAME ? html`<br>${cfg().ORG_NAME}` : ''}</div></footer>`;
  }

  function passwordField(name, label, autocomplete, hint) {
    return html`<div class="field"><label class="label" for="f-${name}">${label}</label>
      <div class="input-group"><input class="input" id="f-${name}" name="${name}" type="password" autocomplete="${autocomplete}" required minlength="8" maxlength="128">
      <button type="button" class="icon-btn" data-act="toggle-pw" aria-label="Tunjuk kata laluan">${icon('eye')}</button></div>${hint ? html`<span class="hint">${hint}</span>` : ''}</div>`;
  }
  function bindPwToggle(root) {
    on(root, 'click', '[data-act="toggle-pw"]', (e, btn) => {
      const input = btn.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eye-off' : 'eye').s;
      btn.setAttribute('aria-label', show ? 'Sembunyi kata laluan' : 'Tunjuk kata laluan');
    });
  }

  // ---------------------------------------------------------------- Landing
  KD.views.landing = {
    async render(el) {
      const c = cfg();
      el.innerHTML = html`
        <section class="hero">
          ${publicTop(true)}
          <div class="hero__arch arch">
            ${star('hero__star')}
            <div class="hero__bismillah arabic" lang="ar">${BISMILLAH}</div>
            <h1 class="hero__title">${c.SYSTEM_NAME || 'Kirim Doa'}</h1>
            <p class="hero__tag">${c.SYSTEM_TAGLINE || 'Doa anda, cahaya hati'}</p>
            <p class="hero__msg">${c.LANDING_MESSAGE || ''}</p>
            <div class="hero__cta">
              ${KD.auth.loggedIn() ? html`<a class="btn btn-cream btn-lg" href="#/hantar">${icon('send')}Hantar Doa</a><a class="btn btn-light btn-lg" href="#/utama">Buka aplikasi</a>`
                : html`${c.ALLOW_REGISTRATION !== false ? html`<a class="btn btn-cream btn-lg" href="#/daftar">Daftar Baru</a>` : ''}<a class="btn btn-light btn-lg" href="#/log-masuk">Log Masuk</a>`}
            </div>
            <p class="hero__count">Sebanyak <strong>${fmtNum(c.TOTAL_DOA || 0)}</strong> doa telah dikirim melalui ${c.SYSTEM_NAME || 'Kirim Doa'}</p>
          </div>
          <div class="hero__skyline">${skyline}</div>
        </section>
        <div class="feature-strip">
          <a class="feature-chip" href="#/kumpul">${icon('link')}Kumpul Doa</a>
          <a class="feature-chip" href="#/baca">${icon('book')}Baca Satu-Persatu</a>
          <a class="feature-chip" href="#/senarai?eksport=1">${icon('pdf')}Export ke PDF</a>
        </div>

        <section class="section" id="panduan">
          <div class="section-title"><h2>Bagaimana ia berfungsi</h2><p>Kumpulkan doa daripada orang tersayang dalam satu tempat, kemudian bacalah ketika di Tanah Suci.</p></div>
          <div class="steps">
            <div class="step"><h3>Daftar dan cipta pautan</h3><p>Buka akaun, kemudian cipta pautan Kumpul Doa dengan nama anda dan tujuan perjalanan.</p></div>
            <div class="step"><h3>Kongsi kepada keluarga</h3><p>Hantar pautan melalui WhatsApp atau Telegram. Mereka boleh menulis doa tanpa perlu mendaftar.</p></div>
            <div class="step"><h3>Baca satu per satu</h3><p>Di Multazam atau Raudhah, buka mod baca dan doakan setiap hajat. Eksport ke PDF jika perlu dibaca tanpa internet.</p></div>
          </div>
        </section>

        <section class="section" id="tentang" style="padding-top:0">
          <div class="about">
            <blockquote class="about__quote">“Dan Tuhanmu berfirman: Berdoalah kepada-Ku, nescaya Aku perkenankan bagimu.”<small>Surah Ghafir, ayat 60</small></blockquote>
            <div>
              <h2>Tentang ${c.SYSTEM_NAME || 'Kirim Doa'}</h2>
              <p class="mt-3">Ramai yang berpesan, “Doakan saya di sana.” Pesanan itu mudah hilang dalam mesej yang bertimbun. ${c.SYSTEM_NAME || 'Kirim Doa'} menyimpan setiap hajat dengan kemas, mengikut kategori, supaya tiada doa yang tertinggal.</p>
              <p>Doa anda adalah peribadi. Hanya anda dan penerima boleh membacanya, dan pengirim boleh memilih untuk kekal tanpa nama.</p>
            </div>
          </div>
        </section>

        <section class="section" id="maklum-balas" style="padding-top:0">
          <div class="panel" style="max-width:640px;margin:0 auto">
            <h2>Maklum balas</h2><p class="muted mt-2">Ada cadangan atau masalah? Beritahu kami.</p>
            <form class="mt-6" data-form="feedback" novalidate>
              <div class="grid grid-2"><div class="field"><label class="label" for="fb-name">Nama</label><input class="input" id="fb-name" name="name" required maxlength="80" autocomplete="name"></div>
              <div class="field" style="margin-top:0"><label class="label" for="fb-email">Email</label><input class="input" id="fb-email" name="email" type="email" required autocomplete="email"></div></div>
              <div class="field mt-4"><label class="label" for="fb-msg">Mesej</label><textarea class="textarea" id="fb-msg" name="message" required minlength="10" maxlength="1500"></textarea></div>
              <div class="hp" aria-hidden="true"><label>Laman web<input name="website" tabindex="-1" autocomplete="off"></label></div>
              <button class="btn btn-primary mt-4" type="submit">${icon('send')}Hantar maklum balas</button>
            </form>
          </div>
        </section>
        ${publicFoot()}`.s;

      on(el, 'click', '[data-scroll]', (e, b) => { const t = qs('#' + b.getAttribute('data-scroll'), el); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
      on(el, 'submit', '[data-form="feedback"]', async (e, form) => {
        e.preventDefault();
        const btn = qs('button[type="submit"]', form);
        await busy(btn, async () => {
          try {
            await KD.api.sendFeedback(formData(form));
            form.reset(); fieldErrors(form, null);
            toast('Terima kasih. Maklum balas anda telah dihantar.');
          } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
        });
      });
    }
  };

  // ---------------------------------------------------------------- Auth
  function authShell(title, subtitle, body, links) {
    return html`${publicTop(false)}<main class="auth"><div class="auth-card">
      <div class="auth-card__head">${star()}<h1 style="font-size:var(--fs-2xl)">${title}</h1><p>${subtitle}</p></div>
      ${body}${links ? html`<div class="auth-links">${links}</div>` : ''}</div></main>`;
  }

  KD.views.login = {
    async render(el) {
      el.innerHTML = authShell('Log Masuk', 'Assalamualaikum. Selamat kembali.', html`
        <form data-form="login" novalidate>
          <div class="field"><label class="label" for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required placeholder="cth. nama@email.com"></div>
          <div class="field">${passwordField('password', 'Kata laluan', 'current-password')}</div>
          <label class="check mt-4"><input type="checkbox" name="remember" checked>Ingat saya pada peranti ini</label>
          <button class="btn btn-primary btn-lg btn-block mt-6" type="submit">${icon('lock')}Log Masuk</button>
        </form>`, html`<a href="#/daftar">Daftar baru</a><a href="#/lupa-kata-laluan">Lupa kata laluan?</a>`).s;
      bindPwToggle(el);
      on(el, 'submit', 'form', async (e, form) => {
        e.preventDefault();
        const data = formData(form);
        await busy(qs('button[type="submit"]', form), async () => {
          try {
            const res = await KD.api.login(data);
            KD.auth.set(res, data.remember);
            toast('Selamat datang, ' + res.user.fullName + '.');
            KD.api.getCurrentUser().then((me) => KD.app.setUnread(me.unreadNotifications)).catch(() => {});
            KD.app.afterLogin();
          } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
        });
      });
    }
  };

  KD.views.register = {
    async render(el) {
      if (cfg().ALLOW_REGISTRATION === false) {
        el.innerHTML = authShell('Pendaftaran ditutup', 'Pendaftaran akaun baharu tidak dibuka buat masa ini.', html`<a class="btn btn-outline btn-block" href="#/log-masuk">Log masuk</a>`).s;
        return;
      }
      el.innerHTML = authShell('Daftar Baru', 'Cipta akaun untuk mula mengumpul doa.', html`
        <form data-form="register" novalidate>
          <div class="field"><label class="label" for="f-fullName">Nama penuh <span class="req">*</span></label><input class="input" id="f-fullName" name="fullName" required minlength="3" maxlength="80" autocomplete="name"></div>
          <div class="field"><label class="label" for="f-email">Email <span class="req">*</span></label><input class="input" id="f-email" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label class="label" for="f-phone">No. telefon</label><input class="input" id="f-phone" name="phone" type="tel" autocomplete="tel" placeholder="cth. 012-345 6789"></div>
          <div class="field">${passwordField('password', 'Kata laluan *', 'new-password', 'Sekurang-kurangnya 8 aksara, dengan huruf dan nombor.')}</div>
          <label class="check mt-4"><input type="checkbox" name="remember">Ingat saya pada peranti ini</label>
          <button class="btn btn-primary btn-lg btn-block mt-6" type="submit">Daftar</button>
        </form>`, html`<span class="muted">Sudah ada akaun?</span><a href="#/log-masuk">Log masuk</a>`).s;
      bindPwToggle(el);
      on(el, 'submit', 'form', async (e, form) => {
        e.preventDefault();
        const data = formData(form);
        await busy(qs('button[type="submit"]', form), async () => {
          try {
            const res = await KD.api.register(data);
            KD.auth.set(res, data.remember);
            toast('Akaun anda telah didaftarkan. Selamat datang!');
            KD.app.setUnread(1);
            KD.app.afterLogin();
          } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
        });
      });
    }
  };

  KD.views.forgot = {
    async render(el) {
      let email = '';
      const step1 = () => {
        el.innerHTML = authShell('Lupa Kata Laluan', 'Kami akan menghantar kod 6 digit ke email anda.', html`
          <form data-form="request" novalidate>
            <div class="field"><label class="label" for="f-email">Email</label><input class="input" id="f-email" name="email" type="email" required autocomplete="email"></div>
            <button class="btn btn-primary btn-lg btn-block mt-6" type="submit">${icon('mail')}Hantar kod</button>
          </form>`, html`<a href="#/log-masuk">Kembali ke log masuk</a>`).s;
      };
      const step2 = () => {
        el.innerHTML = authShell('Tetapkan kata laluan baharu', 'Masukkan kod yang dihantar ke ' + email + '.', html`
          <form data-form="reset" novalidate>
            <div class="field"><label class="label" for="f-code">Kod 6 digit</label><input class="input" id="f-code" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" style="letter-spacing:.4em;font-size:1.2rem"></div>
            <div class="field">${passwordField('newPassword', 'Kata laluan baharu', 'new-password', 'Sekurang-kurangnya 8 aksara, dengan huruf dan nombor.')}</div>
            <button class="btn btn-primary btn-lg btn-block mt-6" type="submit">Tetapkan kata laluan</button>
          </form>`, html`<button class="btn-link" data-act="again">Hantar semula kod</button><a href="#/log-masuk">Log masuk</a>`).s;
        bindPwToggle(el);
      };
      step1();
      on(el, 'click', '[data-act="again"]', step1);
      on(el, 'submit', 'form', async (e, form) => {
        e.preventDefault();
        const data = formData(form);
        await busy(qs('button[type="submit"]', form), async () => {
          try {
            if (form.dataset.form === 'request') {
              const r = await KD.api.requestReset(data);
              email = data.email;
              toast(r.message);
              step2();
            } else {
              await KD.api.resetPassword({ email, code: data.code, newPassword: data.newPassword });
              toast('Kata laluan telah ditetapkan. Sila log masuk.');
              KD.router.go('/log-masuk');
            }
          } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
        });
      });
    }
  };

  // ---------------------------------------------------------------- Kumpul Doa (awam)
  const OCCASION = { UMRAH: 'Umrah', HAJI: 'Haji', PERJALANAN: 'Perjalanan', PEPERIKSAAN: 'Peperiksaan', KESIHATAN: 'Kesihatan', LAIN: '' };
  KD.views.occasionLabel = (o) => OCCASION[o] || '';

  KD.views.collect = {
    async render(el, params) {
      el.innerHTML = html`${publicTop(false)}<main class="collect"><div class="collect__head arch">${star()}<div class="skel skel-line" style="width:60%;margin:12px auto;opacity:.3"></div></div><div class="collect__form">${KD.ui.skeletonList(2)}</div></main>`.s;
      let link;
      try {
        link = await KD.api.getPublicLink(String(params.code || '').toUpperCase());
      } catch (err) {
        el.innerHTML = html`${publicTop(false)}<main class="auth"><div class="auth-card" style="text-align:center">${star()}<h2 class="mt-4">Pautan tidak ditemui</h2><p class="muted mt-2">Pautan ini mungkin salah atau telah dipadam. Minta pautan baharu daripada penghantar.</p><a class="btn btn-outline mt-6" href="#/">Ke halaman utama</a></div></main>`.s;
        return;
      }
      const draw = () => {
        const head = html`<div class="collect__head arch">${star()}
          ${OCCASION[link.occasion] ? html`<span class="badge badge-gold">${OCCASION[link.occasion]}</span>` : ''}
          <h1 class="mt-3">${link.title}</h1><div class="collect__for">untuk ${link.displayName}</div>
          ${link.message ? html`<p>${link.message}</p>` : ''}</div>`;
        if (!link.accepting) {
          el.innerHTML = html`${publicTop(false)}<main class="collect">${head}<div class="collect__form"><div class="alert alert-info">${icon('info')}<div>Pautan ini tidak lagi menerima doa. Terima kasih kerana sudi mendoakan.</div></div></div></main>${publicFoot()}`.s;
          return;
        }
        const me = KD.auth.user();
        el.innerHTML = html`${publicTop(false)}<main class="collect">${head}
          <div class="collect__form">
            <form data-form="collect" novalidate>
              <div class="field"><label class="label" for="c-name">Nama anda</label><input class="input" id="c-name" name="senderName" maxlength="80" autocomplete="name" value="${me ? me.fullName : ''}" placeholder="cth. Mak Long"></div>
              <div class="field"><label class="label" for="c-cat">Kategori <span class="req">*</span></label><select class="select" id="c-cat" name="categoryId" required><option value="">Pilih kategori doa</option>${link.categories.map((c) => html`<option value="${c.id}">${c.nameMs}</option>`)}</select></div>
              <div class="field"><label class="label" for="c-title">Tajuk (pilihan)</label><input class="input" id="c-title" name="title" maxlength="120" placeholder="cth. Untuk kesihatan mak"></div>
              <div class="field"><label class="label" for="c-text">Isi doa <span class="req">*</span></label><textarea class="textarea" id="c-text" name="doaText" required minlength="${link.doaMinLength}" maxlength="${link.doaMaxLength}" placeholder="Tulis doa atau hajat anda di sini…"></textarea><div class="counter" data-counter>0 / ${link.doaMaxLength}</div></div>
              ${link.allowAnonymous ? html`<label class="check mt-4"><input type="checkbox" name="isAnonymous">Hantar tanpa nama (penerima akan melihat “Hamba Allah”)</label>` : ''}
              <div class="hp" aria-hidden="true"><label>Laman web<input name="website" tabindex="-1" autocomplete="off"></label></div>
              <button class="btn btn-primary btn-lg btn-block mt-6" type="submit">${icon('send')}Hantar Doa</button>
              <p class="xs muted mt-3" style="text-align:center">Doa anda hanya dapat dibaca oleh ${link.displayName}.</p>
            </form>
          </div></main>${publicFoot()}`.s;
        const ta = qs('textarea', el);
        const counter = qs('[data-counter]', el);
        ta.addEventListener('input', () => { counter.textContent = ta.value.length + ' / ' + link.doaMaxLength; });
        rid = requestId();
      };
      let rid = requestId();
      draw();
      on(el, 'submit', 'form', async (e, form) => {
        e.preventDefault();
        const data = formData(form);
        data.code = link.code; data.formToken = link.formToken; data.requestId = rid;
        await busy(qs('button[type="submit"]', form), async () => {
          try {
            await KD.api.submitToLink(data);
            qs('.collect__form', el).innerHTML = html`<div class="success-card">${star()}<h2>Doa anda telah dihantar.</h2><p class="muted">Semoga menjadi cahaya dan harapan.</p>
              <div class="row row-wrap mt-6" style="justify-content:center"><button class="btn btn-outline" data-act="again">${icon('plus')}Hantar doa lain</button>${KD.auth.loggedIn() ? '' : html`<a class="btn btn-primary" href="#/daftar">${icon('link')}Cipta pautan anda sendiri</a>`}</div></div>`.s;
          } catch (err) {
            if (/tamat tempoh|terlalu cepat/.test(err.message)) {
              try { link = await KD.api.getPublicLink(link.code); } catch (e2) { /* abaikan */ }
            }
            if (!fieldErrors(form, err)) toastError(err);
          }
        });
      });
      on(el, 'click', '[data-act="again"]', async () => {
        try { link = await KD.api.getPublicLink(link.code); } catch (e) { /* abaikan */ }
        draw();
      });
      on(el, 'click', '[data-scroll]', () => KD.router.go('/'));
    }
  };
})(window.KD);
;
/* ---- bahagian 7 ---- */
/**
 * Paparan pengguna: Utama, Hantar Doa, Senarai, Kegemaran, Butiran, Baca Satu-Persatu, Kumpul Doa, Notifikasi, Profil.
 */
(function (KD) {
  'use strict';
  const { html, raw, qs, qsa, on, formData, fmtNum, fmtDate, relTime, requestId, debounce, fileToBase64, downloadBase64, copyText, fmtBytes, todayKey } = KD.utils;
  const { icon, star, catIcon, toast, toastError, modal, confirm, skeletonList, skeletonStats, empty, errorState, pager, busy, fieldErrors } = KD.ui;
  const api = KD.api;

  let categoriesCache = null;
  async function categories() {
    if (!categoriesCache) categoriesCache = await api.getCategories();
    return categoriesCache;
  }

  // Nota: Apps Script membuang teks selepas dua garis condong dalam <script> — jangan tulis URL penuh secara literal.
  const WA_URL = 'https:' + '\/\/wa.me/?text=';
  const SCOPES = [['ALL', 'Semua'], ['SELF', 'Diri Sendiri'], ['OTHERS', 'Orang Lain'], ['RECEIVED', 'Diterima']];
  const RECIPIENT_LABEL = { SELF: 'Diri sendiri', PERSON: 'Seseorang', GROUP: 'Kumpulan' };

  // ---------------------------------------------------------------- Item doa
  function doaItem(d) {
    const who = d.direction === 'RECEIVED' ? 'Daripada ' + d.senderName : (d.recipientType === 'SELF' ? 'Untuk diri sendiri' : 'Untuk ' + d.recipientName);
    return html`<div class="doa-item ${d.direction === 'RECEIVED' && !d.isRead ? 'is-unread' : ''}" data-doa="${d.id}">
      <button class="doa-item__icon" data-open="${d.id}" aria-label="Buka doa">${catIcon(d.categoryIcon)}</button>
      <button class="doa-item__body" data-open="${d.id}" style="text-align:left">
        <span class="doa-item__title"><span>${d.title || who}</span>${d.direction === 'RECEIVED' && !d.isRead ? html`<span class="badge badge-maroon">Baharu</span>` : ''}</span>
        <span class="doa-item__text">${d.excerpt}</span>
        <span class="doa-item__meta"><span class="cat-dot">${catIcon(d.categoryIcon)}${d.categoryName}</span>${d.title ? html`<span>${who}</span>` : ''}<span>${relTime(d.createdAt)}</span>
          ${d.isAnonymous ? html`<span class="badge badge-muted">${icon('anon', 'i-sm')}Anonim</span>` : ''}${d.attachmentCount ? html`<span>${icon('clip', 'i-sm')}</span>` : ''}</span>
      </button>
      <div class="doa-item__side"><button class="icon-btn fav-btn ${d.isFavorite ? 'is-on' : ''}" data-fav="${d.id}" aria-pressed="${d.isFavorite}" aria-label="Kegemaran">${icon('heart')}</button></div>
    </div>`;
  }

  /** Togol kegemaran pada item senarai. */
  function bindListActions(root, onChange) {
    on(root, 'click', '[data-fav]', async (e, btn) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-fav');
      btn.classList.toggle('is-on');
      try {
        const r = await api.favoriteDoa(id);
        btn.classList.toggle('is-on', r.isFavorite);
        btn.setAttribute('aria-pressed', String(r.isFavorite));
        toast(r.isFavorite ? 'Ditambah ke kegemaran.' : 'Dibuang daripada kegemaran.');
        if (onChange) onChange('favorite', r);
      } catch (err) { btn.classList.toggle('is-on'); toastError(err); }
    });
    on(root, 'click', '[data-open]', (e, btn) => openDoa(btn.getAttribute('data-open'), onChange));
  }

  // ---------------------------------------------------------------- Butiran doa
  async function openDoa(id, onChange) {
    const m = modal({ title: 'Doa', body: skeletonList(1), wide: true });
    let d;
    try { d = await api.getDoa(id); } catch (err) { m.close(); toastError(err); return; }
    if (!d.isRead) api.markRead([d.id]).then(() => { if (onChange) onChange('read', d); }).catch(() => {});
    const body = qs('.modal__body', m.el);
    qs('.modal__head h3', m.el).textContent = d.title || (d.direction === 'RECEIVED' ? 'Doa daripada ' + d.senderName : (d.recipientType === 'SELF' ? 'Doa untuk diri sendiri' : 'Doa untuk ' + d.recipientName));
    body.innerHTML = html`<div class="cat-dot" style="margin-bottom:12px">${catIcon(d.categoryIcon)}${d.categoryName}</div>
      <div class="doa-detail__text">${d.text}</div>
      ${d.attachments && d.attachments.length ? html`<div class="mt-6"><div class="label">Lampiran</div><div class="stack mt-2">${d.attachments.map((a) => html`<div><button class="file-chip" data-att="${a.id}">${icon('clip', 'i-sm')}${a.filename} <span class="muted">${fmtBytes(a.size)}</span></button><div data-att-view="${a.id}"></div></div>`)}</div></div>` : ''}
      <dl class="doa-detail__meta">
        <div><dt>${d.direction === 'RECEIVED' ? 'Daripada' : 'Untuk'}</dt><dd>${d.direction === 'RECEIVED' ? d.senderName : (RECIPIENT_LABEL[d.recipientType] === 'Diri sendiri' ? 'Diri sendiri' : d.recipientName)}</dd></div>
        <div><dt>Tarikh</dt><dd>${fmtDate(d.createdAt, true)}</dd></div>
        <div><dt>Sumber</dt><dd>${d.source === 'LINK' ? 'Pautan Kumpul Doa' : 'Aplikasi'}</dd></div>
        <div><dt>Privasi</dt><dd>${d.isAnonymous ? 'Tanpa nama' : 'Bernama'}</dd></div>
      </dl>`.s;
    const foot = document.createElement('div');
    foot.className = 'modal__foot';
    foot.innerHTML = html`${d.canDelete ? html`<button class="btn btn-ghost" data-act="delete" style="margin-right:auto;color:var(--danger)">${icon('trash')}Padam</button>` : ''}
      <button class="btn btn-outline" data-act="share">${icon('share')}Kongsi</button>
      ${d.canEdit ? html`<a class="btn btn-outline" href="#/hantar/${d.id}" data-close>${icon('edit')}Sunting</a>` : ''}
      <button class="btn ${d.isFavorite ? 'btn-primary' : 'btn-outline'}" data-act="fav">${icon('heart')}${d.isFavorite ? 'Kegemaran' : 'Tambah kegemaran'}</button>`.s;
    qs('.modal', m.el).appendChild(foot);
    on(foot, 'click', '[data-close]', () => m.close());
    on(m.el, 'click', '[data-att]', async (e, b) => {
      const target = qs('[data-att-view="' + b.getAttribute('data-att') + '"]', m.el);
      await busy(b, async () => {
        try {
          const f = await api.getAttachment(b.getAttribute('data-att'));
          const url = 'data:' + f.mimeType + ';base64,' + f.data;
          if (f.mimeType.indexOf('image/') === 0) target.innerHTML = html`<div class="att-preview"><img alt="${f.filename}" src="${url}"></div>`.s;
          else if (f.mimeType.indexOf('audio/') === 0) target.innerHTML = html`<div class="att-preview"><audio controls src="${url}"></audio></div>`.s;
          else downloadBase64(f.data, f.mimeType, f.filename);
        } catch (err) { toastError(err); }
      });
    });
    on(foot, 'click', '[data-act="fav"]', async (e, b) => {
      try {
        const r = await api.favoriteDoa(d.id);
        d.isFavorite = r.isFavorite;
        b.className = 'btn ' + (r.isFavorite ? 'btn-primary' : 'btn-outline');
        b.innerHTML = html`${icon('heart')}${r.isFavorite ? 'Kegemaran' : 'Tambah kegemaran'}`.s;
        if (onChange) onChange('favorite', r);
      } catch (err) { toastError(err); }
    });
    on(foot, 'click', '[data-act="share"]', () => shareDoa(d));
    on(foot, 'click', '[data-act="delete"]', async () => {
      const ok = await confirm({ title: 'Padam doa ini?', message: 'Doa akan dibuang daripada senarai anda.', confirmText: 'Padam', danger: true });
      if (!ok) return;
      try { await api.deleteDoa(d.id); m.close(); toast('Doa telah dipadam.'); if (onChange) onChange('delete', d); } catch (err) { toastError(err); }
    });
  }

  async function shareDoa(d) {
    const text = (d.title ? d.title + '\n\n' : '') + d.text + '\n\n— ' + ((KD.config && KD.config.SYSTEM_NAME) || 'Kirim Doa');
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    toast((await copyText(text)) ? 'Teks doa disalin.' : 'Tidak dapat menyalin teks.');
  }
  KD.views.openDoa = openDoa;

  // ---------------------------------------------------------------- Eksport PDF
  async function openExport(defaults) {
    const cats = await categories();
    const d = defaults || {};
    const m = modal({
      title: 'Export ke PDF',
      body: html`<form data-form="export" novalidate>
        <div class="field"><label class="label" for="x-scope">Doa yang dieksport</label><select class="select" id="x-scope" name="scope">${[['ALL', 'Semua doa'], ['RECEIVED', 'Doa diterima'], ['SELF', 'Untuk diri sendiri'], ['OTHERS', 'Untuk orang lain'], ['FAVORITES', 'Kegemaran']].map((s) => html`<option value="${s[0]}" ${d.scope === s[0] ? raw('selected') : ''}>${s[1]}</option>`)}</select></div>
        <div class="field"><label class="label" for="x-cat">Kategori</label><select class="select" id="x-cat" name="categoryId"><option value="">Semua kategori</option>${cats.map((c) => html`<option value="${c.id}" ${d.categoryId === c.id ? raw('selected') : ''}>${c.nameMs}</option>`)}</select></div>
        <div class="grid grid-2 mt-4"><div class="field"><label class="label" for="x-from">Dari</label><input class="input" type="date" id="x-from" name="from" value="${d.from || ''}"></div><div class="field" style="margin-top:0"><label class="label" for="x-to">Hingga</label><input class="input" type="date" id="x-to" name="to" value="${d.to || ''}"></div></div>
        <p class="hint mt-4">Maksimum 300 doa setiap fail. Fail PDF dijana di pelayan dan dimuat turun terus ke peranti anda.</p></form>`,
      foot: html`<button class="btn btn-outline" data-close>Batal</button><button class="btn btn-primary" data-act="go">${icon('download')}Muat turun PDF</button>`
    });
    on(m.el, 'click', '[data-act="go"]', async (e, b) => {
      const p = formData(qs('form', m.el));
      Object.keys(p).forEach((k) => { if (!p[k]) delete p[k]; });
      await busy(b, async () => {
        try {
          const r = await api.exportPdf(p);
          downloadBase64(r.data, r.mimeType, r.filename);
          toast(r.count + ' doa dieksport ke ' + r.filename + '.');
          m.close();
        } catch (err) { toastError(err); }
      });
    });
  }
  KD.views.openExport = openExport;

  // ---------------------------------------------------------------- Utama
  KD.views.dashboard = {
    async render(el) {
      const user = KD.auth.user() || {};
      el.innerHTML = html`<div class="welcome"><div><div class="welcome__salam arabic" lang="ar">السلام عليكم</div><h2>Assalamualaikum, ${user.fullName || ''}</h2><p>Semoga hari ini dipermudahkan.</p></div><a class="btn btn-cream" href="#/hantar">${icon('plus')}Hantar Doa</a>${star()}</div>
        <div class="mt-6" data-stats>${skeletonStats(4)}</div>
        <div class="quick mt-6">
          <a href="#/hantar">${icon('send')}Hantar Doa</a><a href="#/kegemaran">${icon('heart')}Kegemaran</a>
          <a href="#/baca">${icon('book')}Baca Doa</a><a href="#" data-act="export">${icon('pdf')}Export PDF</a>
        </div>
        <div class="grid grid-main-side mt-6">
          <section class="panel panel-flush"><div class="panel-head"><h3>Doa terkini</h3><a class="small" href="#/senarai">Lihat semua</a></div><div data-recent class="mt-3">${skeletonList(3)}</div></section>
          <section class="panel" data-links-panel><div class="panel-head"><h3>Kumpul Doa</h3><a class="small" href="#/kumpul">Urus</a></div><div data-links>${skeletonList(1)}</div></section>
        </div>`.s;
      on(el, 'click', '[data-act="export"]', (e) => { e.preventDefault(); openExport(); });
      const load = async () => {
        try {
          const [d, links] = await Promise.all([api.getDashboard(), api.getMyLinks()]);
          KD.app.setUnread(d.unreadNotifications);
          const s = d.stats;
          qs('[data-stats]', el).innerHTML = html`<div class="grid grid-4">
            <div class="stat"><div class="stat__label">${icon('inbox')}Jumlah doa</div><div class="stat__value">${fmtNum(s.total)}</div><div class="stat__note">${fmtNum(s.received)} diterima</div></div>
            <div class="stat"><div class="stat__label">${icon('calendar')}Doa bulan ini</div><div class="stat__value">${fmtNum(s.thisMonth)}</div></div>
            <div class="stat"><div class="stat__label">${icon('heart')}Doa kegemaran</div><div class="stat__value">${fmtNum(s.favorites)}</div></div>
            <div class="stat"><div class="stat__label">${icon('book')}Doa dibaca</div><div class="stat__value">${fmtNum(s.read)}</div><div class="stat__note">${fmtNum(s.unread)} belum dibaca</div></div></div>`.s;
          const recent = qs('[data-recent]', el);
          recent.innerHTML = d.recent.length ? html`<div class="doa-list">${d.recent.map(doaItem)}</div>`.s
            : empty('Belum ada doa', 'Tulis doa pertama anda, atau cipta pautan Kumpul Doa untuk menerima doa daripada keluarga.', html`<a class="btn btn-primary" href="#/hantar">${icon('send')}Hantar Doa</a>`).s;
          const active = links.filter((l) => l.status === 'ACTIVE');
          qs('[data-links]', el).innerHTML = active.length ? html`${active.slice(0, 3).map((l) => html`<div class="health-row"><div class="grow"><div style="font-weight:600;color:var(--maroon-900)">${l.title}</div><div class="xs muted">${fmtNum(l.doaCount)} doa, ${fmtNum(l.unreadCount)} belum dibaca</div></div><button class="icon-btn" data-copy="${l.shareUrl}" aria-label="Salin pautan">${icon('copy')}</button></div>`)}`.s
            : html`<p class="muted small">Bakal ke Tanah Suci? Cipta pautan dan kongsikan kepada keluarga supaya mereka boleh mengirim doa.</p><a class="btn btn-purple btn-block mt-4" href="#/kumpul">${icon('link')}Cipta pautan</a>`.s;
        } catch (err) {
          qs('[data-stats]', el).innerHTML = errorState(err, 'reload').s;
        }
      };
      on(el, 'click', '[data-act="reload"]', load);
      on(el, 'click', '[data-copy]', async (e, b) => toast((await copyText(b.getAttribute('data-copy'))) ? 'Pautan disalin.' : 'Gagal menyalin.'));
      bindListActions(el, () => {});
      load();
    }
  };

  // ---------------------------------------------------------------- Hantar / Sunting doa
  KD.views.compose = {
    async render(el, params) {
      const editId = params.id;
      const cfg = KD.config || {};
      const maxLen = cfg.DOA_MAX_LENGTH || 2000;
      const maxFiles = cfg.MAX_ATTACHMENTS_PER_DOA || 0;
      const maxMb = cfg.MAX_ATTACHMENT_MB || 5;
      const accept = (cfg.ALLOWED_MIME_TYPES || '').split(',').filter(Boolean).join(',');
      el.innerHTML = skeletonList(3).s;
      let cats, existing = null;
      try {
        cats = await categories();
        if (editId) existing = await api.getDoa(editId);
      } catch (err) { el.innerHTML = errorState(err).s; return; }
      if (existing && !existing.canEdit) { el.innerHTML = empty('Doa ini tidak boleh disunting', 'Hanya doa yang anda tulis sendiri boleh disunting.', html`<a class="btn btn-outline" href="#/senarai">Kembali ke senarai</a>`).s; return; }

      const v = existing || { recipientType: 'SELF', recipientName: '', categoryId: '', title: '', text: '', isAnonymous: false };
      let files = [];
      let rid = requestId();

      el.innerHTML = html`<div class="page-head"><div><h1>${editId ? 'Sunting Doa' : 'Hantar Doa'}</h1><p>${editId ? 'Kemas kini doa anda.' : 'Tuliskan doa untuk diri sendiri atau untuk orang yang anda sayangi.'}</p></div></div>
        <div class="compose">
          <form class="panel" data-form="compose" novalidate>
            <div class="field"><span class="label" id="lbl-who">Untuk siapa? <span class="req">*</span></span>
              <div class="segmented" role="group" aria-labelledby="lbl-who" data-who>${Object.keys(RECIPIENT_LABEL).map((k) => html`<button type="button" data-type="${k}" aria-pressed="${v.recipientType === k}">${RECIPIENT_LABEL[k]}</button>`)}</div>
              <input type="hidden" name="recipientType" value="${v.recipientType}"></div>
            <div class="field ${v.recipientType === 'SELF' ? 'hidden' : ''}" data-recipient><label class="label" for="d-rname">Nama penerima <span class="req">*</span></label><input class="input" id="d-rname" name="recipientName" maxlength="80" value="${v.recipientType === 'SELF' ? '' : v.recipientName}" placeholder="cth. Ibu, Suami, Kawan sepejabat"></div>
            <div class="field"><label class="label" for="d-cat">Kategori <span class="req">*</span></label><select class="select" id="d-cat" name="categoryId" required><option value="">Pilih kategori doa</option>${cats.map((c) => html`<option value="${c.id}" ${v.categoryId === c.id ? raw('selected') : ''}>${c.nameMs}</option>`)}</select></div>
            <div class="field"><label class="label" for="d-title">Tajuk</label><input class="input" id="d-title" name="title" maxlength="120" value="${v.title}" placeholder="cth. Semoga sembuh segera"></div>
            <div class="field"><label class="label" for="d-text">Isi doa <span class="req">*</span></label><textarea class="textarea" id="d-text" name="doaText" required maxlength="${maxLen}" placeholder="Tulis doa anda di sini…">${v.text}</textarea><div class="counter" data-counter>${v.text.length} / ${maxLen}</div></div>
            ${!editId && maxFiles ? html`<div class="field"><span class="label">Lampiran (pilihan)</span>
              <div class="dropzone"><label class="btn btn-outline btn-sm" for="d-files">${icon('clip', 'i-sm')}Pilih fail</label><input class="sr-only" type="file" id="d-files" multiple accept="${accept}"><span class="hint" data-files-hint>Tiada fail dipilih</span><div class="row row-wrap" data-files></div></div>
              <span class="hint">Gambar, audio atau PDF. Maksimum ${maxFiles} fail, ${maxMb}MB setiap satu.</span></div>` : ''}
            ${cfg.ALLOW_ANONYMOUS !== false ? html`<label class="check mt-4"><input type="checkbox" name="isAnonymous" ${v.isAnonymous ? raw('checked') : ''}>Hantar secara anonim</label>` : ''}
            <div class="row mt-6"><button class="btn btn-primary btn-lg grow" type="submit">${icon('send')}${editId ? 'Simpan perubahan' : 'Hantar Doa'}</button>${editId ? html`<a class="btn btn-outline btn-lg" href="#/senarai">Batal</a>` : ''}</div>
          </form>
          <aside class="compose__aside">
            <section class="panel panel-flush"><div class="panel-head"><h3>Doa terkini</h3><a class="small" href="#/senarai">Lihat semua</a></div><div data-recent class="mt-3">${skeletonList(2)}</div></section>
            <section class="panel"><h3 style="font-size:var(--fs-lg)">Adab berdoa</h3><ul class="small muted mt-3" style="padding-left:18px;line-height:1.8"><li>Mulakan dengan pujian kepada Allah dan selawat.</li><li>Nyatakan hajat dengan jelas dan ikhlas.</li><li>Doakan juga kebaikan untuk orang lain.</li></ul></section>
          </aside>
        </div>`.s;

      const form = qs('form', el);
      on(el, 'click', '[data-who] button', (e, b) => {
        const t = b.getAttribute('data-type');
        qsa('[data-who] button', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        form.recipientType.value = t;
        qs('[data-recipient]', el).classList.toggle('hidden', t === 'SELF');
        if (t !== 'SELF') qs('#d-rname', el).focus();
      });
      const ta = qs('#d-text', el);
      ta.addEventListener('input', () => { qs('[data-counter]', el).textContent = ta.value.length + ' / ' + maxLen; });

      const drawFiles = () => {
        const box = qs('[data-files]', el);
        if (!box) return;
        box.innerHTML = html`${files.map((f, i) => html`<span class="file-chip">${f.name} <span class="muted">${fmtBytes(f.size)}</span><button type="button" data-rm="${i}" aria-label="Buang ${f.name}">${icon('x', 'i-sm')}</button></span>`)}`.s;
        qs('[data-files-hint]', el).classList.toggle('hidden', files.length > 0);
      };
      const fileInput = qs('#d-files', el);
      if (fileInput) {
        fileInput.addEventListener('change', () => {
          const allowed = accept.split(',');
          Array.from(fileInput.files).forEach((f) => {
            if (files.length >= maxFiles) return toast('Maksimum ' + maxFiles + ' fail.', 'error');
            if (allowed.indexOf(f.type) < 0) return toast('Jenis fail "' + f.name + '" tidak dibenarkan.', 'error');
            if (f.size > maxMb * 1048576) return toast('"' + f.name + '" melebihi ' + maxMb + 'MB.', 'error');
            files.push(f);
          });
          fileInput.value = '';
          drawFiles();
        });
        on(el, 'click', '[data-rm]', (e, b) => { files.splice(Number(b.getAttribute('data-rm')), 1); drawFiles(); });
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = formData(form);
        if (data.recipientType === 'SELF') delete data.recipientName;
        await busy(qs('button[type="submit"]', form), async () => {
          try {
            if (editId) {
              await api.updateDoa(editId, data);
              toast('Doa telah dikemas kini.');
              KD.router.go('/senarai');
              return;
            }
            data.requestId = rid;
            data.attachments = await Promise.all(files.map(async (f) => ({ name: f.name, mimeType: f.type, data: await fileToBase64(f) })));
            await api.createDoa(data);
            rid = requestId();
            files = [];
            el.querySelector('.compose').innerHTML = html`<div class="panel success-card" style="grid-column:1/-1">${star()}<h2>Doa anda telah dihantar.</h2><p class="muted">Semoga menjadi cahaya dan harapan.</p>
              <div class="row row-wrap mt-6" style="justify-content:center"><button class="btn btn-primary" data-act="again">${icon('plus')}Tulis doa lain</button><a class="btn btn-outline" href="#/senarai">${icon('list')}Lihat senarai</a></div></div>`.s;
          } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
        });
      });
      on(el, 'click', '[data-act="again"]', () => KD.router.render());
      bindListActions(el);

      api.getDoas({ pageSize: 4 }).then((r) => {
        const box = qs('[data-recent]', el);
        if (!box) return;
        box.innerHTML = r.items.length ? html`<div class="doa-list">${r.items.map(doaItem)}</div>`.s : html`<p class="muted small" style="padding:0 24px 24px">Doa yang anda hantar akan dipaparkan di sini.</p>`.s;
      }).catch(() => {});
    }
  };

  // ---------------------------------------------------------------- Senarai
  function listView(fixedScope) {
    return {
      async render(el, params, query) {
        const cats = await categories().catch(() => []);
        const state = {
          scope: fixedScope || query.scope || 'ALL',
          q: query.q || '', categoryId: query.categoryId || '', from: query.from || '', to: query.to || '',
          sort: query.sort || 'NEWEST', recipientId: query.recipientId || '', page: Number(query.page) || 1
        };
        el.innerHTML = html`<div class="page-head"><div><h1>${fixedScope ? 'Kegemaran' : 'Senarai Doa'}</h1><p>${fixedScope ? 'Doa yang anda tandakan untuk dibaca semula.' : 'Semua doa yang anda tulis dan terima.'}</p></div>
          <div class="row row-wrap"><a class="btn btn-outline" href="#/baca${fixedScope ? '?scope=FAVORITES' : ''}" data-read>${icon('book')}Baca satu-persatu</a><button class="btn btn-primary" data-act="export">${icon('pdf')}Export PDF</button></div></div>
          ${fixedScope ? '' : html`<div class="segmented mt-2" role="group" aria-label="Skop" data-scope>${SCOPES.map((s) => html`<button type="button" data-v="${s[0]}" aria-pressed="${state.scope === s[0]}">${s[1]}</button>`)}</div>`}
          ${state.recipientId ? html`<div class="alert alert-info mt-4">${icon('link')}<div class="grow">Menunjukkan doa daripada satu pautan Kumpul Doa.</div><button class="btn-link" data-act="clear-link">Tunjuk semua</button></div>` : ''}
          <div class="toolbar mt-4">
            <div class="search">${icon('search')}<input class="input" type="search" placeholder="Cari doa, tajuk atau nama…" value="${state.q}" data-f="q" aria-label="Cari"></div>
            <select class="select" data-f="categoryId" aria-label="Kategori"><option value="">Semua kategori</option>${cats.map((c) => html`<option value="${c.id}" ${state.categoryId === c.id ? raw('selected') : ''}>${c.nameMs}</option>`)}</select>
            <input class="input" type="date" data-f="from" value="${state.from}" aria-label="Dari tarikh">
            <input class="input" type="date" data-f="to" value="${state.to}" aria-label="Hingga tarikh">
            <select class="select" data-f="sort" aria-label="Susunan"><option value="NEWEST">Terbaharu</option><option value="OLDEST" ${state.sort === 'OLDEST' ? raw('selected') : ''}>Terlama</option></select>
          </div>
          <section class="panel panel-flush" data-results>${skeletonList(5)}</section>`.s;

        const load = async () => {
          const box = qs('[data-results]', el);
          box.innerHTML = skeletonList(4).s;
          const filters = Object.assign({}, state);
          Object.keys(filters).forEach((k) => { if (filters[k] === '') delete filters[k]; });
          if (!fixedScope) KD.router.setQuery(Object.assign({}, state, { scope: state.scope === 'ALL' ? '' : state.scope, sort: state.sort === 'NEWEST' ? '' : state.sort, page: state.page > 1 ? state.page : '' }));
          const readLink = qs('[data-read]', el);
          if (readLink && !fixedScope) readLink.setAttribute('href', '#/baca?scope=' + state.scope + (state.categoryId ? '&categoryId=' + state.categoryId : ''));
          try {
            const r = await api.getDoas(filters);
            const filtered = state.q || state.categoryId || state.from || state.to;
            box.innerHTML = r.items.length
              ? html`<div class="doa-list">${r.items.map(doaItem)}</div>${pager(r.meta)}`.s
              : (filtered ? empty('Tiada padanan', 'Cuba ubah kata carian atau penapis.', html`<button class="btn btn-outline" data-act="reset">Kosongkan penapis</button>`)
                : fixedScope ? empty('Belum ada kegemaran', 'Tekan ikon hati pada mana-mana doa untuk menyimpannya di sini.', html`<a class="btn btn-outline" href="#/senarai">Lihat senarai doa</a>`)
                  : state.scope === 'RECEIVED' ? empty('Belum ada doa diterima', 'Kongsi pautan Kumpul Doa anda supaya keluarga dan sahabat boleh mengirim doa.', html`<a class="btn btn-purple" href="#/kumpul">${icon('link')}Kumpul Doa</a>`)
                    : empty('Belum ada doa', 'Tulis doa pertama anda.', html`<a class="btn btn-primary" href="#/hantar">${icon('send')}Hantar Doa</a>`)).s;
          } catch (err) { box.innerHTML = errorState(err, 'reload').s; }
        };
        const refilter = () => { state.page = 1; load(); };
        on(el, 'click', '[data-scope] button', (e, b) => {
          state.scope = b.getAttribute('data-v');
          qsa('[data-scope] button', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          refilter();
        });
        on(el, 'input', '[data-f="q"]', debounce((e) => { state.q = e.target.value.trim(); refilter(); }, 350));
        on(el, 'change', 'select[data-f], input[type="date"][data-f]', (e, f) => { state[f.getAttribute('data-f')] = f.value; refilter(); });
        on(el, 'click', '[data-page]', (e, b) => { state.page = Number(b.getAttribute('data-page')); load(); el.scrollIntoView(); });
        on(el, 'click', '[data-act="reset"]', () => { Object.assign(state, { q: '', categoryId: '', from: '', to: '', page: 1 }); KD.router.render(); });
        on(el, 'click', '[data-act="clear-link"]', () => { state.recipientId = ''; KD.router.setQuery({}); KD.router.render(); });
        on(el, 'click', '[data-act="reload"]', load);
        on(el, 'click', '[data-act="export"]', () => openExport({ scope: fixedScope || state.scope, categoryId: state.categoryId, from: state.from, to: state.to }));
        bindListActions(el, (kind) => { if (kind === 'delete' || (fixedScope && kind === 'favorite')) load(); });
        await load();
        if (query.eksport) openExport({ scope: state.scope });
      }
    };
  }
  KD.views.doaList = listView(null);
  KD.views.favorites = listView('FAVORITES');

  // ---------------------------------------------------------------- Baca satu-persatu
  KD.views.reader = {
    async render(el, params, query) {
      const PAGE = 20;
      const st = { scope: query.scope || 'ALL', categoryId: query.categoryId || '', unreadOnly: query.unread === '1', items: [], total: 0, index: 0, loadedPages: {} };
      el.innerHTML = html`<div class="page-head"><div><h1>Baca Satu-Persatu</h1><p>Hayati setiap doa, satu demi satu.</p></div>
        <div class="row row-wrap"><select class="select" data-f="scope" aria-label="Skop" style="width:auto">${[['ALL', 'Semua doa'], ['RECEIVED', 'Doa diterima'], ['SELF', 'Untuk diri sendiri'], ['OTHERS', 'Untuk orang lain'], ['FAVORITES', 'Kegemaran']].map((s) => html`<option value="${s[0]}" ${st.scope === s[0] ? raw('selected') : ''}>${s[1]}</option>`)}</select>
        <label class="check"><input type="checkbox" data-f="unread" ${st.unreadOnly ? raw('checked') : ''}>Belum dibaca sahaja</label></div></div>
        <div class="reader" data-reader>${skeletonList(2)}</div>`.s;

      async function ensure(i) {
        const page = Math.floor(i / PAGE) + 1;
        if (st.loadedPages[page]) return;
        const r = await api.getDoas({ scope: st.scope, categoryId: st.categoryId || undefined, unreadOnly: st.unreadOnly, page, pageSize: PAGE, sort: 'OLDEST', full: true });
        st.total = r.meta.total;
        r.items.forEach((d, k) => { st.items[(page - 1) * PAGE + k] = d; });
        st.loadedPages[page] = true;
      }

      async function show(i) {
        const box = qs('[data-reader]', el);
        try {
          await ensure(i);
        } catch (err) { box.innerHTML = errorState(err, 'reload').s; return; }
        if (!st.total) {
          box.innerHTML = html`<div class="panel">${empty(st.unreadOnly ? 'Semua doa telah dibaca' : 'Tiada doa untuk dibaca', st.unreadOnly ? 'Alhamdulillah. Tiada doa baharu yang belum dibaca.' : 'Doa yang anda tulis atau terima akan dipaparkan di sini.', html`<a class="btn btn-primary" href="#/hantar">${icon('send')}Hantar Doa</a>`)}</div>`.s;
          return;
        }
        st.index = Math.max(0, Math.min(i, st.total - 1));
        const d = st.items[st.index];
        const pct = ((st.index + 1) / st.total) * 100;
        box.innerHTML = html`<div class="reader__progress"><span>Doa ${fmtNum(st.index + 1)} daripada ${fmtNum(st.total)}</span><span class="xs">Gunakan anak panah atau leret untuk beralih</span></div>
          <div class="reader__bar" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></div>
          <article class="reader__page arch" aria-live="polite">
            ${star()}<div class="reader__cat">${catIcon(d.categoryIcon, 'i-sm')}${d.categoryName}</div>
            ${d.title ? html`<h2 class="reader__title">${d.title}</h2>` : ''}
            <p class="reader__text">${d.text}</p>
            <div class="reader__from">${d.direction === 'RECEIVED' ? html`Daripada <strong>${d.senderName}</strong>` : d.recipientType === 'SELF' ? 'Untuk diri sendiri' : html`Untuk <strong>${d.recipientName}</strong>`}<br><span class="xs">${fmtDate(d.createdAt)}</span></div>
          </article>
          <div class="reader__nav">
            <button class="btn btn-outline" data-go="-1" ${st.index === 0 ? raw('disabled') : ''}>${icon('chev-left')}Sebelum</button>
            <div class="reader__tools">
              <button class="icon-btn fav-btn ${d.isFavorite ? 'is-on' : ''}" data-act="fav" aria-pressed="${d.isFavorite}" aria-label="Kegemaran">${icon('heart')}</button>
              <button class="icon-btn" data-act="share" aria-label="Kongsi">${icon('share')}</button>
            </div>
            <button class="btn btn-primary" data-go="1" ${st.index >= st.total - 1 ? raw('disabled') : ''}>Seterusnya${icon('chev-right')}</button>
          </div>`.s;
        if (!d.isRead) { d.isRead = true; api.markRead([d.id]).catch(() => {}); }
        if (st.index + 3 >= Object.keys(st.loadedPages).length * PAGE && st.index + 3 < st.total) ensure(st.index + 3).catch(() => {});
      }

      const restart = () => { st.items = []; st.loadedPages = {}; st.total = 0; qs('[data-reader]', el).innerHTML = skeletonList(2).s; show(0); };
      on(el, 'change', '[data-f="scope"]', (e, s) => { st.scope = s.value; restart(); });
      on(el, 'change', '[data-f="unread"]', (e, c) => { st.unreadOnly = c.checked; restart(); });
      on(el, 'click', '[data-go]', (e, b) => show(st.index + Number(b.getAttribute('data-go'))));
      on(el, 'click', '[data-act="reload"]', restart);
      on(el, 'click', '[data-act="share"]', () => shareDoa(st.items[st.index]));
      on(el, 'click', '[data-act="fav"]', async (e, b) => {
        const d = st.items[st.index];
        try { const r = await api.favoriteDoa(d.id); d.isFavorite = r.isFavorite; b.classList.toggle('is-on', r.isFavorite); b.setAttribute('aria-pressed', String(r.isFavorite)); toast(r.isFavorite ? 'Ditambah ke kegemaran.' : 'Dibuang daripada kegemaran.'); } catch (err) { toastError(err); }
      });
      const onKey = (e) => {
        if (!document.body.contains(el)) { document.removeEventListener('keydown', onKey); return; }
        if (/input|select|textarea/i.test(e.target.tagName)) return;
        if (e.key === 'ArrowRight' && st.index < st.total - 1) show(st.index + 1);
        if (e.key === 'ArrowLeft' && st.index > 0) show(st.index - 1);
      };
      document.addEventListener('keydown', onKey);
      // Leret (swipe) pada mudah alih
      let x0 = null;
      el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      el.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 60) { if (dx < 0 && st.index < st.total - 1) show(st.index + 1); if (dx > 0 && st.index > 0) show(st.index - 1); }
      });
      show(0);
    }
  };

  // ---------------------------------------------------------------- Kumpul Doa (pemilik)
  const OCCASIONS = [['UMRAH', 'Umrah'], ['HAJI', 'Haji'], ['PERJALANAN', 'Perjalanan'], ['PEPERIKSAAN', 'Peperiksaan'], ['KESIHATAN', 'Kesihatan'], ['LAIN', 'Lain-lain']];
  function linkForm(l) {
    const user = KD.auth.user() || {};
    l = l || { displayName: user.fullName || '', title: '', message: '', occasion: 'UMRAH', acceptUntil: '' };
    return html`<form novalidate>
      <div class="field"><label class="label" for="l-title">Tajuk <span class="req">*</span></label><input class="input" id="l-title" name="title" required maxlength="120" value="${l.title}" placeholder="cth. Doakan perjalanan umrah saya"></div>
      <div class="field"><label class="label" for="l-name">Nama dipaparkan <span class="req">*</span></label><input class="input" id="l-name" name="displayName" required maxlength="80" value="${l.displayName}"></div>
      <div class="field"><label class="label" for="l-occ">Majlis</label><select class="select" id="l-occ" name="occasion">${OCCASIONS.map((o) => html`<option value="${o[0]}" ${l.occasion === o[0] ? raw('selected') : ''}>${o[1]}</option>`)}</select></div>
      <div class="field"><label class="label" for="l-msg">Mesej kepada pengirim</label><textarea class="textarea" id="l-msg" name="message" maxlength="500" style="min-height:90px" placeholder="cth. Saya akan berangkat pada 12 November. Kirimkan hajat anda, insya-Allah saya doakan di sana.">${l.message}</textarea></div>
      <div class="field"><label class="label" for="l-until">Terima doa sehingga</label><input class="input" type="date" id="l-until" name="acceptUntil" min="${todayKey()}" value="${l.acceptUntil}"><span class="hint">Biarkan kosong untuk tiada had tarikh.</span></div>
    </form>`;
  }

  KD.views.links = {
    async render(el) {
      el.innerHTML = html`<div class="page-head"><div><h1>Kumpul Doa</h1><p>Cipta pautan dan kongsikan. Keluarga dan sahabat boleh mengirim doa tanpa perlu mendaftar.</p></div><button class="btn btn-primary" data-act="new">${icon('plus')}Cipta pautan</button></div><div data-links>${skeletonList(2)}</div>`.s;
      const load = async () => {
        const box = qs('[data-links]', el);
        try {
          const links = await api.getMyLinks();
          box.innerHTML = links.length ? html`${links.map((l) => html`<article class="link-card">
            <div class="row spread row-wrap"><div><div class="row" style="gap:8px"><h3 style="font-size:var(--fs-lg)">${l.title}</h3>${KD.ui.statusBadge(l.accepting ? 'ACTIVE' : 'CLOSED')}</div>
              <div class="small muted mt-2">Untuk ${l.displayName}${KD.views.occasionLabel(l.occasion) ? ', ' + KD.views.occasionLabel(l.occasion) : ''}${l.acceptUntil ? ', sehingga ' + fmtDate(l.acceptUntil) : ''}</div></div>
              <a class="btn btn-ghost btn-sm" href="#/senarai?scope=RECEIVED&recipientId=${l.id}">${icon('inbox', 'i-sm')}${fmtNum(l.doaCount)} doa${l.unreadCount ? html`<span class="badge badge-maroon">${fmtNum(l.unreadCount)} baharu</span>` : ''}</a></div>
            <div class="link-card__url"><input class="input" readonly value="${l.shareUrl}" aria-label="Pautan kongsi"><button class="btn btn-outline" data-copy="${l.shareUrl}">${icon('copy')}Salin</button></div>
            <div class="row row-wrap mt-3">
              <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${WA_URL}${encodeURIComponent(l.title + ' — kirimkan doa anda di sini: ' + l.shareUrl)}">${icon('share', 'i-sm')}Kongsi ke WhatsApp</a>
              <button class="btn btn-ghost btn-sm" data-edit="${l.id}">${icon('edit', 'i-sm')}Sunting</button>
              <button class="btn btn-ghost btn-sm" data-toggle="${l.id}" data-status="${l.status === 'ACTIVE' ? 'CLOSED' : 'ACTIVE'}">${icon(l.status === 'ACTIVE' ? 'lock' : 'refresh', 'i-sm')}${l.status === 'ACTIVE' ? 'Tutup pautan' : 'Buka semula'}</button>
            </div></article>`)}`.s
            : html`<div class="panel">${empty('Belum ada pautan', 'Cipta pautan Kumpul Doa, kemudian kongsikan melalui WhatsApp kepada keluarga dan sahabat.', html`<button class="btn btn-primary" data-act="new">${icon('plus')}Cipta pautan pertama</button>`)}</div>`.s;
          box._links = links;
        } catch (err) { box.innerHTML = errorState(err, 'reload').s; }
      };
      const openForm = (l) => {
        const m = modal({ title: l ? 'Sunting pautan' : 'Cipta pautan Kumpul Doa', body: linkForm(l), foot: html`<button class="btn btn-outline" data-close>Batal</button><button class="btn btn-primary" data-act="save">${l ? 'Simpan' : 'Cipta pautan'}</button>` });
        on(m.el, 'click', '[data-act="save"]', async (e, b) => {
          const form = qs('form', m.el);
          const data = formData(form);
          await busy(b, async () => {
            try {
              if (l) { data.id = l.id; await api.updateLink(data); toast('Pautan dikemas kini.'); }
              else { const r = await api.createLink(data); await copyText(r.shareUrl); toast('Pautan dicipta dan disalin. Kongsikan sekarang!'); }
              m.close(); load();
            } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
          });
        });
      };
      on(el, 'click', '[data-act="new"]', () => openForm(null));
      on(el, 'click', '[data-act="reload"]', load);
      on(el, 'click', '[data-edit]', (e, b) => openForm(qs('[data-links]', el)._links.find((x) => x.id === b.getAttribute('data-edit'))));
      on(el, 'click', '[data-copy]', async (e, b) => toast((await copyText(b.getAttribute('data-copy'))) ? 'Pautan disalin.' : 'Gagal menyalin.'));
      on(el, 'click', '[data-toggle]', async (e, b) => {
        const status = b.getAttribute('data-status');
        if (status === 'CLOSED' && !(await confirm({ title: 'Tutup pautan?', message: 'Orang lain tidak lagi boleh mengirim doa melalui pautan ini. Doa yang telah diterima kekal tersimpan.', confirmText: 'Tutup pautan' }))) return;
        try { await api.updateLink({ id: b.getAttribute('data-toggle'), status }); toast(status === 'CLOSED' ? 'Pautan ditutup.' : 'Pautan dibuka semula.'); load(); } catch (err) { toastError(err); }
      });
      load();
    }
  };

  // ---------------------------------------------------------------- Notifikasi
  const NOTIF_ICON = { WELCOME: 'sparkle', DOA_RECEIVED: 'inbox', BROADCAST: 'bell', SECURITY: 'lock', ACCOUNT: 'user' };
  KD.views.notifications = {
    async render(el) {
      let page = 1;
      el.innerHTML = html`<div class="page-head"><div><h1>Notifikasi</h1><p>Doa baharu dan makluman akaun anda.</p></div><button class="btn btn-outline" data-act="all">${icon('check')}Tandakan semua dibaca</button></div><section class="panel panel-flush" data-box>${skeletonList(4)}</section>`.s;
      const load = async () => {
        const box = qs('[data-box]', el);
        try {
          const r = await api.getNotifications({ page, pageSize: 20 });
          KD.app.setUnread(r.meta.unread);
          box.innerHTML = r.items.length ? html`<div class="doa-list">${r.items.map((n) => html`<button class="doa-item ${n.isRead ? '' : 'is-unread'}" data-n="${n.id}" data-ref="${n.referenceId}" data-type="${n.type}">
              <span class="doa-item__icon">${icon(NOTIF_ICON[n.type] || 'bell')}</span>
              <span class="doa-item__body"><span class="doa-item__title"><span>${n.title}</span>${n.isRead ? '' : html`<span class="badge-dot" aria-label="Belum dibaca"></span>`}</span><span class="doa-item__text">${n.message}</span><span class="doa-item__meta">${relTime(n.createdAt)}</span></span></button>`)}</div>${pager(r.meta)}`.s
            : empty('Tiada notifikasi', 'Anda akan dimaklumkan di sini apabila menerima doa baharu.').s;
        } catch (err) { box.innerHTML = errorState(err, 'reload').s; }
      };
      on(el, 'click', '[data-n]', async (e, b) => {
        if (b.classList.contains('is-unread')) {
          b.classList.remove('is-unread');
          api.markNotificationRead(b.getAttribute('data-n')).then((r) => KD.app.setUnread(r.unread)).catch(() => {});
        }
        const ref = b.getAttribute('data-ref');
        if (b.getAttribute('data-type') === 'DOA_RECEIVED' && ref) openDoa(ref);
      });
      on(el, 'click', '[data-act="all"]', async (e, b) => busy(b, async () => { try { await api.markAllNotificationsRead(); KD.app.setUnread(0); toast('Semua notifikasi ditandakan dibaca.'); load(); } catch (err) { toastError(err); } }));
      on(el, 'click', '[data-page]', (e, b) => { page = Number(b.getAttribute('data-page')); load(); });
      on(el, 'click', '[data-act="reload"]', load);
      load();
    }
  };

  // ---------------------------------------------------------------- Profil
  KD.views.profile = {
    async render(el) {
      const u = KD.auth.user() || {};
      el.innerHTML = html`<div class="page-head"><div><h1>Profil</h1><p>Urus maklumat akaun dan keselamatan anda.</p></div></div>
        <div class="grid grid-2">
          <section class="panel"><div class="row" style="margin-bottom:20px"><span class="avatar" style="width:56px;height:56px;font-size:1.2rem">${u.initials}</span><div><h3>${u.fullName}</h3><div class="small muted">${u.email}</div><div class="mt-2">${KD.ui.roleBadge(u.role)}</div></div></div>
            <form data-form="profile" novalidate>
              <div class="field"><label class="label" for="p-name">Nama penuh</label><input class="input" id="p-name" name="fullName" required maxlength="80" value="${u.fullName}" autocomplete="name"></div>
              <div class="field"><label class="label" for="p-phone">No. telefon</label><input class="input" id="p-phone" name="phone" type="tel" value="${u.phone || ''}" autocomplete="tel"></div>
              <div class="field"><span class="label">Email</span><input class="input" value="${u.email}" disabled aria-label="Email"><span class="hint">Email digunakan untuk log masuk dan tidak boleh diubah.</span></div>
              <button class="btn btn-primary mt-6" type="submit">Simpan profil</button>
              <p class="xs muted mt-4">Ahli sejak ${fmtDate(u.createdAt)}. Log masuk terakhir ${fmtDate(u.lastLoginAt, true)}.</p>
            </form></section>
          <section class="panel"><h3>Tukar kata laluan</h3>
            <form data-form="password" class="mt-4" novalidate>
              <div class="field"><label class="label" for="p-cur">Kata laluan semasa</label><input class="input" id="p-cur" name="currentPassword" type="password" required autocomplete="current-password"></div>
              <div class="field"><label class="label" for="p-new">Kata laluan baharu</label><input class="input" id="p-new" name="newPassword" type="password" required minlength="8" autocomplete="new-password"><span class="hint">Sekurang-kurangnya 8 aksara, dengan huruf dan nombor.</span></div>
              <label class="check mt-4"><input type="checkbox" name="logoutOthers" checked>Log keluar daripada peranti lain</label>
              <button class="btn btn-primary mt-6" type="submit">${icon('lock')}Tukar kata laluan</button>
            </form>
            <hr style="border:0;border-top:1px solid var(--line);margin:28px 0 20px">
            <button class="btn btn-outline btn-block" data-act="logout">${icon('logout')}Log keluar</button></section>
        </div>`.s;
      on(el, 'submit', 'form', async (e, form) => {
        e.preventDefault();
        const data = formData(form);
        await busy(qs('button[type="submit"]', form), async () => {
          try {
            if (form.dataset.form === 'profile') {
              const user = await api.updateProfile(data);
              KD.auth.updateUser(user);
              KD.app.shellMode = null;
              toast('Profil disimpan.');
              KD.router.render();
            } else {
              const r = await api.changePassword(data);
              form.reset();
              fieldErrors(form, null);
              toast('Kata laluan ditukar.' + (r.sessionsRevoked ? ' ' + r.sessionsRevoked + ' sesi lain telah ditamatkan.' : ''));
            }
          } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
        });
      });
      on(el, 'click', '[data-act="logout"]', () => KD.auth.logout());
    }
  };
})(window.KD);
;
/* ---- bahagian 8 ---- */
/**
 * Paparan pentadbir. Semua tindakan disahkan semula di backend (RBAC + audit).
 */
(function (KD) {
  'use strict';
  const { html, raw, qs, qsa, on, formData, fmtNum, fmtDate, relTime, debounce, toCsv, downloadText, todayKey } = KD.utils;
  const { icon, star, catIcon, toast, toastError, modal, confirm, skeletonList, skeletonStats, empty, errorState, pager, busy, fieldErrors, statusBadge, roleBadge } = KD.ui;
  const A = KD.api.admin;
  const C = KD.charts;

  const head = (title, sub, actions) => html`<div class="page-head"><div><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>${actions ? html`<div class="row row-wrap">${actions}</div>` : ''}</div>`;
  const stat = (label, value, ic, note) => html`<div class="stat"><div class="stat__label">${icon(ic)}${label}</div><div class="stat__value">${typeof value === 'number' ? fmtNum(value) : value}</div>${note ? html`<div class="stat__note">${note}</div>` : ''}</div>`;
  const ACTION_LABEL = {
    USER_REGISTERED: 'Pendaftaran', USER_LOGIN: 'Log masuk', ADMIN_LOGIN: 'Log masuk admin', USER_LOGOUT: 'Log keluar', LOGIN_FAILED: 'Log masuk gagal',
    PASSWORD_CHANGED: 'Tukar kata laluan', PASSWORD_RESET_REQUESTED: 'Minta set semula', PASSWORD_RESET: 'Set semula kata laluan', PROFILE_UPDATED: 'Kemas kini profil',
    DOA_CREATED: 'Doa dihantar', DOA_RECEIVED_LINK: 'Doa melalui pautan', DOA_UPDATED: 'Doa disunting', DOA_DELETED: 'Doa dipadam', DOA_MODERATED: 'Moderasi doa',
    RECIPIENT_CREATED: 'Pautan dicipta', RECIPIENT_UPDATED: 'Pautan dikemas kini', USER_BLOCKED: 'Pengguna disekat', USER_ACTIVATED: 'Pengguna diaktifkan',
    USER_DEACTIVATED: 'Pengguna dinyahaktif', USER_ROLE_CHANGED: 'Tukar peranan', USER_SESSIONS_REVOKED: 'Sesi ditamatkan', CATEGORY_CREATED: 'Kategori dicipta',
    CATEGORY_UPDATED: 'Kategori dikemas kini', SETTINGS_UPDATED: 'Tetapan dikemas kini', NOTIFICATION_BROADCAST: 'Hebahan', EXPORT_GENERATED: 'Eksport PDF',
    REPORT_GENERATED: 'Laporan dijana', FEEDBACK_UPDATED: 'Maklum balas dikemas kini', BACKUP_CREATED: 'Sandaran dicipta', MIGRATION_APPLIED: 'Migrasi'
  };
  const actionLabel = (a) => ACTION_LABEL[a] || a;
  const activityList = (items) => items.length ? html`<div>${items.map((a) => html`<div class="health-row"><span class="avatar" style="width:30px;height:30px;font-size:11px;background:var(--lilac);color:var(--purple-900)">${KD.utils.esc((a.userName || '?').slice(0, 1)).toUpperCase()}</span><div class="grow"><div class="small"><strong>${a.userName}</strong> <span class="muted">${actionLabel(a.action)}</span></div>${a.description ? html`<div class="xs muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.description}</div>` : ''}</div><span class="xs muted nowrap">${relTime(a.createdAt)}</span></div>`)}</div>` : html`<p class="muted small">Tiada aktiviti.</p>`;

  /** Pembantu: muat senarai berpaginasi dengan penapis. */
  function pagedTable(el, opts) {
    const state = Object.assign({ page: 1 }, opts.initial || {});
    const box = qs(opts.box, el);
    const load = async () => {
      box.innerHTML = skeletonList(4).s;
      try {
        const f = Object.assign({}, state);
        Object.keys(f).forEach((k) => { if (f[k] === '') delete f[k]; });
        const r = await opts.fetch(f);
        box.innerHTML = r.items.length ? html`<div class="table-wrap">${opts.table(r.items)}</div>${pager(r.meta)}`.s : empty(opts.emptyTitle || 'Tiada rekod', opts.emptyText || 'Cuba ubah penapis.').s;
        box._items = r.items;
      } catch (err) { box.innerHTML = errorState(err, 'reload').s; }
    };
    on(el, 'input', '[data-f="q"]', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }, 350));
    on(el, 'change', 'select[data-f], input[type="date"][data-f]', (e, s) => { state[s.getAttribute('data-f')] = s.value; state.page = 1; load(); });
    on(el, 'click', '[data-page]', (e, b) => { state.page = Number(b.getAttribute('data-page')); load(); });
    on(el, 'click', '[data-act="reload"]', load);
    return { load, state, items: () => box._items || [] };
  }

  // ================================================================ Dashboard
  KD.views.adminDashboard = {
    async render(el) {
      el.innerHTML = html`${head('Dashboard', 'Gambaran keseluruhan aktiviti sistem.', html`<button class="btn btn-outline" data-act="reload">${icon('refresh')}Muat semula</button>`)}<div data-box>${skeletonStats(4)}<div class="mt-6">${skeletonStats(2)}</div></div>`.s;
      const load = async () => {
        const box = qs('[data-box]', el);
        try {
          const s = await A.getStatistics();
          const k = s.kpi;
          box.innerHTML = html`<div class="grid grid-4">
              ${stat('Jumlah pengguna', k.totalUsers, 'users', fmtNum(k.activeUsers) + ' aktif dalam 30 hari')}
              ${stat('Jumlah doa', k.totalDoa, 'inbox', fmtNum(k.anonymousDoa) + ' anonim')}
              ${stat('Doa hari ini', k.doaToday, 'clock', fmtNum(k.doaMonth) + ' bulan ini')}
              ${stat('Pautan aktif', k.activeLinks, 'link', fmtNum(k.activeCategories) + ' kategori aktif')}
            </div>
            <div class="grid grid-2 mt-6">
              <section class="panel"><div class="panel-head"><h3>Doa mengikut hari</h3><span class="xs muted">14 hari terakhir</span></div>${C.bars(s.charts.doaByDay, { title: 'Doa mengikut hari', labelFormat: 'day' })}</section>
              <section class="panel"><div class="panel-head"><h3>Trend bulanan</h3><span class="xs muted">12 bulan</span></div>${C.line(s.charts.monthlyTrend, { title: 'Trend doa bulanan', labelFormat: 'month' })}</section>
            </div>
            <div class="grid grid-main-side mt-6">
              <section class="panel"><div class="panel-head"><h3>Doa mengikut kategori</h3></div>${C.hbars(s.charts.doaByCategory, { title: 'Doa mengikut kategori' })}</section>
              <section class="panel"><div class="panel-head"><h3>Aktiviti terkini</h3><a class="small" href="#/admin/audit">Audit log</a></div>${activityList(s.recentActivity)}</section>
            </div>
            <div class="grid grid-2 mt-6">
              <section class="panel"><div class="panel-head"><h3>Pendaftaran pengguna</h3><span class="xs muted">6 bulan</span></div>${C.bars(s.charts.registrations, { title: 'Pendaftaran pengguna', labelFormat: 'month', height: 180 })}</section>
              <section class="panel"><div class="panel-head"><h3>Aktiviti pengguna</h3><span class="xs muted">Peristiwa audit, 14 hari</span></div>${C.line(s.charts.activity, { title: 'Aktiviti pengguna', labelFormat: 'day', height: 180 })}</section>
            </div>
            <p class="xs muted mt-4">Dikemas kini ${fmtDate(s.generatedAt, true)}. Statistik dicache selama 2 minit.</p>`.s;
        } catch (err) { box.innerHTML = errorState(err, 'reload').s; }
      };
      on(el, 'click', '[data-act="reload"]', load);
      load();
    }
  };

  // ================================================================ Pengguna
  KD.views.adminUsers = {
    async render(el) {
      el.innerHTML = html`${head('Pengguna', 'Urus akaun, status dan peranan. Kata laluan tidak pernah boleh dilihat.')}
        <div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" data-f="q" placeholder="Cari nama, email atau ID…" aria-label="Cari pengguna"></div>
          <select class="select" data-f="role" aria-label="Peranan"><option value="">Semua peranan</option><option value="USER">Pengguna</option><option value="ADMIN">Admin</option><option value="SUPER_ADMIN">Super Admin</option></select>
          <select class="select" data-f="status" aria-label="Status"><option value="">Semua status</option><option value="ACTIVE">Aktif</option><option value="INACTIVE">Tidak aktif</option><option value="BLOCKED">Disekat</option></select>
          <select class="select" data-f="sort" aria-label="Susunan"><option value="NEWEST">Terbaharu</option><option value="OLDEST">Terlama</option><option value="NAME">Nama</option><option value="LAST_LOGIN">Log masuk terakhir</option></select></div>
        <section class="panel panel-flush" data-box></section>`.s;
      const me = KD.auth.user();
      const t = pagedTable(el, {
        box: '[data-box]', fetch: A.getUsers, emptyTitle: 'Tiada pengguna',
        table: (items) => html`<table class="table"><thead><tr><th>Pengguna</th><th>Peranan</th><th>Status</th><th>Doa</th><th>Log masuk terakhir</th><th>Daftar</th><th><span class="sr-only">Tindakan</span></th></tr></thead><tbody>
          ${items.map((u) => html`<tr><td><div class="cell-strong">${u.fullName}</div><div class="xs muted">${u.email}</div></td><td>${roleBadge(u.role)}</td><td>${statusBadge(u.status)}</td><td>${fmtNum(u.doaCount)}</td><td class="nowrap">${u.lastLoginAt ? relTime(u.lastLoginAt) : '—'}</td><td class="nowrap">${fmtDate(u.createdAt)}</td>
          <td>${u.id === me.id ? html`<span class="xs muted">Anda</span>` : html`<button class="btn btn-outline btn-sm" data-manage="${u.id}">Urus</button>`}</td></tr>`)}</tbody></table>`
      });
      on(el, 'click', '[data-manage]', (e, b) => {
        const u = t.items().find((x) => x.id === b.getAttribute('data-manage'));
        const isSuper = KD.auth.isSuper();
        const m = modal({
          title: u.fullName,
          body: html`<div class="small muted">${u.email}</div><div class="row mt-2">${roleBadge(u.role)}${statusBadge(u.status)}</div>
            <div class="mt-6"><div class="label">Status akaun</div><div class="row row-wrap mt-2">
              ${u.status !== 'ACTIVE' ? html`<button class="btn btn-outline btn-sm" data-status="ACTIVE">${icon('check', 'i-sm')}Aktifkan</button>` : ''}
              ${u.status !== 'INACTIVE' ? html`<button class="btn btn-outline btn-sm" data-status="INACTIVE">Nyahaktifkan</button>` : ''}
              ${u.status !== 'BLOCKED' ? html`<button class="btn btn-danger btn-sm" data-status="BLOCKED">${icon('lock', 'i-sm')}Sekat</button>` : ''}</div></div>
            ${isSuper ? html`<div class="mt-6"><label class="label" for="m-role">Peranan</label><div class="row mt-2"><select class="select" id="m-role">${['USER', 'ADMIN', 'SUPER_ADMIN'].map((r) => html`<option value="${r}" ${u.role === r ? raw('selected') : ''}>${r === 'USER' ? 'Pengguna' : r === 'ADMIN' ? 'Admin' : 'Super Admin'}</option>`)}</select><button class="btn btn-primary btn-sm" data-act="role">Tukar</button></div><span class="hint">Pengguna akan dilog keluar supaya peranan baharu berkuat kuasa.</span></div>` : ''}
            <div class="mt-6"><div class="label">Keselamatan</div><div class="row row-wrap mt-2"><button class="btn btn-outline btn-sm" data-act="revoke">${icon('logout', 'i-sm')}Tamatkan semua sesi</button><button class="btn btn-outline btn-sm" data-act="reset">${icon('mail', 'i-sm')}Hantar email set semula</button></div></div>`
        });
        const done = (msg) => { toast(msg); m.close(); t.load(); };
        on(m.el, 'click', '[data-status]', async (e2, sb) => {
          const status = sb.getAttribute('data-status');
          const reason = status === 'ACTIVE' ? true : await confirm({ title: status === 'BLOCKED' ? 'Sekat pengguna?' : 'Nyahaktifkan pengguna?', message: 'Semua sesi pengguna akan ditamatkan serta-merta.', confirmText: status === 'BLOCKED' ? 'Sekat' : 'Nyahaktifkan', danger: status === 'BLOCKED', withReason: true });
          if (!reason) return;
          try { await A.setUserStatus({ userId: u.id, status, reason: typeof reason === 'string' ? reason.trim() : '' }); done('Status dikemas kini.'); } catch (err) { toastError(err); }
        });
        on(m.el, 'click', '[data-act="role"]', async (e2, rb) => busy(rb, async () => { try { await A.setUserRole({ userId: u.id, role: qs('#m-role', m.el).value }); done('Peranan dikemas kini.'); } catch (err) { toastError(err); } }));
        on(m.el, 'click', '[data-act="revoke"]', async (e2, rb) => busy(rb, async () => { try { const r = await A.revokeSessions(u.id); toast(r.revoked + ' sesi ditamatkan.'); } catch (err) { toastError(err); } }));
        on(m.el, 'click', '[data-act="reset"]', async (e2, rb) => busy(rb, async () => { try { await A.sendReset(u.id); toast('Email set semula dihantar kepada pengguna.'); } catch (err) { toastError(err); } }));
      });
      t.load();
    }
  };

  // ================================================================ Doa (moderasi)
  KD.views.adminDoas = {
    async render(el) {
      const cats = await KD.api.getCategories().catch(() => []);
      el.innerHTML = html`${head('Doa', 'Pantau dan moderasi doa. Identiti penghantar anonim hanya kelihatan kepada Super Admin.')}
        <div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" data-f="q" placeholder="Cari teks, nama atau ID…" aria-label="Cari doa"></div>
          <select class="select" data-f="status" aria-label="Status"><option value="">Semua status</option><option value="ACTIVE">Aktif</option><option value="ARCHIVED">Diarkib</option><option value="DELETED">Dipadam</option></select>
          <select class="select" data-f="source" aria-label="Sumber"><option value="">Semua sumber</option><option value="APP">Aplikasi</option><option value="LINK">Pautan</option></select>
          <select class="select" data-f="categoryId" aria-label="Kategori"><option value="">Semua kategori</option>${cats.map((c) => html`<option value="${c.id}">${c.nameMs}</option>`)}</select></div>
        <section class="panel panel-flush" data-box></section>`.s;
      const t = pagedTable(el, {
        box: '[data-box]', fetch: A.getDoas, emptyTitle: 'Tiada doa',
        table: (items) => html`<table class="table"><thead><tr><th>Doa</th><th>Kategori</th><th>Daripada / Untuk</th><th>Sumber</th><th>Status</th><th>Tarikh</th><th><span class="sr-only">Tindakan</span></th></tr></thead><tbody>
          ${items.map((d) => html`<tr><td><div class="cell-strong">${d.title || '—'}</div><div class="cell-clip muted">${d.text}</div></td><td class="nowrap">${d.categoryName}</td>
          <td><div class="small">${d.realSenderName || d.senderName}${d.isAnonymous ? html` <span class="badge badge-muted">Anonim</span>` : ''}</div><div class="xs muted">→ ${d.recipientName}</div></td>
          <td>${d.source === 'LINK' ? 'Pautan' : 'Aplikasi'}</td><td>${statusBadge(d.status)}</td><td class="nowrap">${fmtDate(d.createdAt, true)}</td>
          <td class="nowrap">${d.status !== 'ACTIVE' ? html`<button class="btn btn-outline btn-sm" data-st="ACTIVE" data-id="${d.id}">Pulih</button>` : html`<button class="btn btn-outline btn-sm" data-st="ARCHIVED" data-id="${d.id}">Arkib</button>`}
          ${d.status !== 'DELETED' ? html` <button class="btn btn-ghost btn-sm" style="color:var(--danger)" data-st="DELETED" data-id="${d.id}">Padam</button>` : ''}</td></tr>`)}</tbody></table>`
      });
      on(el, 'click', '[data-st]', async (e, b) => {
        const status = b.getAttribute('data-st');
        const label = { ACTIVE: 'Pulihkan', ARCHIVED: 'Arkibkan', DELETED: 'Padam' }[status];
        const reason = await confirm({ title: label + ' doa ini?', message: status === 'DELETED' ? 'Doa akan disembunyikan daripada pengguna (soft delete). Rekod kekal untuk audit.' : 'Tindakan ini akan direkodkan dalam audit log.', confirmText: label, danger: status === 'DELETED', withReason: true });
        if (!reason) return;
        try { await A.setDoaStatus({ id: b.getAttribute('data-id'), status, reason: reason.trim() }); toast('Status doa dikemas kini.'); t.load(); } catch (err) { toastError(err); }
      });
      t.load();
    }
  };

  // ================================================================ Kategori
  KD.views.adminCategories = {
    async render(el) {
      el.innerHTML = html`${head('Kategori', 'Kategori yang dipaparkan semasa menulis doa.', html`<button class="btn btn-primary" data-act="new">${icon('plus')}Tambah kategori</button>`)}<section class="panel panel-flush" data-box>${skeletonList(4)}</section>`.s;
      let data = null;
      const load = async () => {
        const box = qs('[data-box]', el);
        try {
          data = await A.getCategories();
          box.innerHTML = html`<div class="table-wrap"><table class="table"><thead><tr><th>Susunan</th><th>Kategori</th><th>Nama (EN)</th><th>Doa</th><th>Status</th><th><span class="sr-only">Tindakan</span></th></tr></thead><tbody>
            ${data.items.map((c) => html`<tr><td>${c.sortOrder}</td><td><span class="row" style="gap:10px"><span class="doa-item__icon" style="width:34px;height:34px">${catIcon(c.icon, 'i-sm')}</span><span><span class="cell-strong">${c.nameMs}</span>${c.description ? html`<br><span class="xs muted">${c.description}</span>` : ''}</span></span></td><td>${c.nameEn || '—'}</td><td>${fmtNum(c.doaCount)}</td><td>${statusBadge(c.status)}</td>
            <td class="nowrap"><button class="btn btn-outline btn-sm" data-edit="${c.id}">Sunting</button> <button class="btn btn-ghost btn-sm" data-toggle="${c.id}" data-status="${c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}">${c.status === 'ACTIVE' ? 'Nyahaktif' : 'Aktifkan'}</button></td></tr>`)}</tbody></table></div>`.s;
        } catch (err) { box.innerHTML = errorState(err, 'reload').s; }
      };
      const openForm = (c) => {
        c = c || { nameMs: '', nameEn: '', description: '', icon: 'star', sortOrder: 100 };
        const m = modal({
          title: c.id ? 'Sunting kategori' : 'Tambah kategori',
          body: html`<form novalidate>
            <div class="grid grid-2"><div class="field"><label class="label" for="k-ms">Nama (BM) <span class="req">*</span></label><input class="input" id="k-ms" name="nameMs" required maxlength="40" value="${c.nameMs}"></div>
            <div class="field" style="margin-top:0"><label class="label" for="k-en">Nama (EN)</label><input class="input" id="k-en" name="nameEn" maxlength="40" value="${c.nameEn}"></div></div>
            <div class="field mt-4"><label class="label" for="k-desc">Penerangan</label><input class="input" id="k-desc" name="description" maxlength="200" value="${c.description}"></div>
            <div class="grid grid-2 mt-4"><div class="field"><label class="label" for="k-icon">Ikon</label><select class="select" id="k-icon" name="icon">${data.icons.map((i) => html`<option value="${i}" ${c.icon === i ? raw('selected') : ''}>${i}</option>`)}</select></div>
            <div class="field" style="margin-top:0"><label class="label" for="k-sort">Susunan</label><input class="input" type="number" id="k-sort" name="sortOrder" min="0" max="999" value="${c.sortOrder}"></div></div></form>`,
          foot: html`<button class="btn btn-outline" data-close>Batal</button><button class="btn btn-primary" data-act="save">Simpan</button>`
        });
        on(m.el, 'click', '[data-act="save"]', async (e, b) => {
          const form = qs('form', m.el);
          const p = formData(form);
          p.sortOrder = Number(p.sortOrder);
          if (c.id) p.id = c.id;
          await busy(b, async () => {
            try { await (c.id ? A.updateCategory(p) : A.createCategory(p)); toast('Kategori disimpan.'); m.close(); load(); } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
          });
        });
      };
      on(el, 'click', '[data-act="new"]', () => openForm(null));
      on(el, 'click', '[data-edit]', (e, b) => openForm(data.items.find((x) => x.id === b.getAttribute('data-edit'))));
      on(el, 'click', '[data-toggle]', async (e, b) => { try { await A.updateCategory({ id: b.getAttribute('data-toggle'), status: b.getAttribute('data-status') }); toast('Status kategori dikemas kini.'); load(); } catch (err) { toastError(err); } });
      on(el, 'click', '[data-act="reload"]', load);
      load();
    }
  };

  // ================================================================ Notifikasi (hebahan)
  KD.views.adminNotifications = {
    async render(el) {
      el.innerHTML = html`${head('Notifikasi', 'Hantar makluman kepada pengguna dalam aplikasi.')}
        <div class="grid grid-main-side">
          <section class="panel"><h3>Hebahan baharu</h3><form class="mt-4" novalidate>
            <div class="field"><label class="label" for="b-title">Tajuk <span class="req">*</span></label><input class="input" id="b-title" name="title" required maxlength="120"></div>
            <div class="field"><label class="label" for="b-msg">Mesej <span class="req">*</span></label><textarea class="textarea" id="b-msg" name="message" required maxlength="500"></textarea></div>
            <div class="field"><label class="label" for="b-aud">Sasaran</label><select class="select" id="b-aud" name="audience"><option value="ALL">Semua pengguna aktif</option><option value="USERS">Pengguna biasa sahaja</option><option value="ADMINS">Pentadbir sahaja</option></select></div>
            <button class="btn btn-primary mt-6" type="submit">${icon('send')}Hantar hebahan</button></form></section>
          <section class="panel"><div class="panel-head"><h3>Sejarah hebahan</h3></div><div data-hist>${skeletonList(2)}</div></section>
        </div>`.s;
      const loadHist = async () => {
        try {
          const h = await A.getBroadcasts();
          qs('[data-hist]', el).innerHTML = h.length ? html`${h.map((x) => html`<div class="health-row"><div class="grow small">${x.description}</div><span class="xs muted nowrap">${relTime(x.createdAt)}</span></div>`)}`.s : html`<p class="muted small">Belum ada hebahan.</p>`.s;
        } catch (err) { qs('[data-hist]', el).innerHTML = errorState(err).s; }
      };
      on(el, 'submit', 'form', async (e, form) => {
        e.preventDefault();
        const p = formData(form);
        if (!(await confirm({ title: 'Hantar hebahan?', message: 'Notifikasi akan dihantar serta-merta dan tidak boleh ditarik balik.', confirmText: 'Hantar' }))) return;
        await busy(qs('button[type="submit"]', form), async () => {
          try { const r = await A.broadcast(p); toast('Hebahan dihantar kepada ' + fmtNum(r.sent) + ' pengguna.'); form.reset(); loadHist(); } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
        });
      });
      loadHist();
    }
  };

  // ================================================================ Maklum balas
  KD.views.adminFeedback = {
    async render(el) {
      el.innerHTML = html`${head('Maklum Balas', 'Mesej yang dihantar melalui halaman utama.')}
        <div class="toolbar"><select class="select" data-f="status" aria-label="Status"><option value="">Semua status</option><option value="NEW">Baharu</option><option value="REVIEWED">Disemak</option><option value="CLOSED">Ditutup</option></select></div>
        <section class="panel panel-flush" data-box></section>`.s;
      const t = pagedTable(el, {
        box: '[data-box]', fetch: A.getFeedback, emptyTitle: 'Tiada maklum balas', emptyText: 'Maklum balas daripada pengguna akan dipaparkan di sini.',
        table: (items) => html`<table class="table"><thead><tr><th>Daripada</th><th>Mesej</th><th>Status</th><th>Tarikh</th><th><span class="sr-only">Tindakan</span></th></tr></thead><tbody>
          ${items.map((f) => html`<tr><td><div class="cell-strong">${f.name}</div><div class="xs"><a href="mailto:${f.email}">${f.email}</a></div></td><td style="max-width:460px;white-space:pre-wrap">${f.message}</td><td>${statusBadge(f.status)}</td><td class="nowrap">${fmtDate(f.createdAt, true)}</td>
          <td><select class="select" style="min-height:34px;width:auto" data-fb="${f.id}" aria-label="Tukar status">${['NEW', 'REVIEWED', 'CLOSED'].map((s) => html`<option value="${s}" ${f.status === s ? raw('selected') : ''}>${{ NEW: 'Baharu', REVIEWED: 'Disemak', CLOSED: 'Ditutup' }[s]}</option>`)}</select></td></tr>`)}</tbody></table>`
      });
      on(el, 'change', '[data-fb]', async (e, s) => { try { await A.setFeedbackStatus({ id: s.getAttribute('data-fb'), status: s.value }); toast('Status dikemas kini.'); t.load(); } catch (err) { toastError(err); } });
      t.load();
    }
  };

  // ================================================================ Laporan
  KD.views.adminReports = {
    async render(el) {
      el.innerHTML = html`${head('Laporan', 'Ringkasan aktiviti mengikut julat tarikh.', html`<button class="btn btn-outline" data-act="csv" disabled>${icon('download')}Muat turun CSV</button><button class="btn btn-outline" data-act="print" disabled>${icon('pdf')}Cetak</button>`)}
        <form class="toolbar" novalidate><label class="small">Dari <input class="input" type="date" name="from" value="${todayKey(-29)}"></label><label class="small">Hingga <input class="input" type="date" name="to" value="${todayKey()}"></label><button class="btn btn-primary" type="submit">${icon('chart')}Jana laporan</button></form>
        <div data-box></div>`.s;
      let report = null;
      const run = async (btn) => {
        const p = formData(qs('form', el));
        const box = qs('[data-box]', el);
        box.innerHTML = skeletonStats(4).s;
        await busy(btn, async () => {
          try {
            report = await A.getReport(p);
            const s = report.summary;
            qsa('[data-act="csv"], [data-act="print"]', el).forEach((b) => { b.disabled = false; });
            const SRC = { APP: 'Aplikasi', LINK: 'Pautan Kumpul Doa' };
            const TYPE = { SELF: 'Diri sendiri', PERSON: 'Seseorang', GROUP: 'Kumpulan' };
            box.innerHTML = html`<p class="small muted" style="margin-bottom:16px">Laporan ${fmtDate(report.range.from)} hingga ${fmtDate(report.range.to)}</p>
              <div class="grid grid-3">${stat('Jumlah doa', s.totalDoa, 'inbox')}${stat('Melalui pautan', s.viaLink, 'link')}${stat('Anonim', s.anonymous, 'anon')}${stat('Pengguna baharu', s.newUsers, 'users')}${stat('Penghantar unik', s.uniqueSenders, 'user')}${stat('Dengan lampiran', s.withAttachment, 'clip')}</div>
              <section class="panel mt-6"><div class="panel-head"><h3>Doa mengikut hari</h3></div>${report.byDay.length ? C.bars(report.byDay, { title: 'Doa mengikut hari', labelFormat: 'day' }) : html`<p class="muted small">Tiada doa dalam julat ini.</p>`}</section>
              <div class="grid grid-2 mt-6">
                <section class="panel"><div class="panel-head"><h3>Mengikut kategori</h3></div>${C.hbars(report.byCategory)}</section>
                <section class="panel"><div class="panel-head"><h3>Pautan paling aktif</h3></div>${C.hbars(report.topLinks)}</section>
                <section class="panel"><div class="panel-head"><h3>Mengikut sumber</h3></div>${C.hbars(report.bySource.map((x) => ({ label: SRC[x.label] || x.label, value: x.value })))}</section>
                <section class="panel"><div class="panel-head"><h3>Mengikut penerima</h3></div>${C.hbars(report.byRecipientType.map((x) => ({ label: TYPE[x.label] || x.label, value: x.value })))}</section>
              </div>`.s;
          } catch (err) { box.innerHTML = errorState(err).s; }
        });
      };
      on(el, 'submit', 'form', (e, f) => { e.preventDefault(); run(qs('button[type="submit"]', f)); });
      on(el, 'click', '[data-act="csv"]', () => {
        if (!report) return;
        const rows = [['Laporan Kirim Doa', report.range.from, report.range.to], [], ['Ringkasan', 'Nilai']];
        Object.keys(report.summary).forEach((k) => rows.push([k, report.summary[k]]));
        [['Mengikut hari', report.byDay], ['Mengikut kategori', report.byCategory], ['Mengikut sumber', report.bySource], ['Mengikut penerima', report.byRecipientType], ['Pautan paling aktif', report.topLinks]].forEach((sec) => {
          rows.push([], [sec[0], 'Bilangan']);
          sec[1].forEach((x) => rows.push([x.label, x.value]));
        });
        downloadText(toCsv(rows), 'text/csv;charset=utf-8', 'laporan-kirimdoa-' + report.range.from + '_' + report.range.to + '.csv');
      });
      on(el, 'click', '[data-act="print"]', () => window.print());
      run(qs('button[type="submit"]', el));
    }
  };

  // ================================================================ Audit
  KD.views.adminAudit = {
    async render(el) {
      el.innerHTML = html`${head('Audit Log', 'Jejak setiap tindakan sensitif. Kata laluan, token dan isi doa tidak pernah direkodkan.')}
        <div class="toolbar"><div class="search">${icon('search')}<input class="input" type="search" data-f="q" placeholder="Cari keterangan atau rujukan…" aria-label="Cari audit"></div>
          <select class="select" data-f="action" aria-label="Tindakan"><option value="">Semua tindakan</option>${Object.keys(ACTION_LABEL).map((a) => html`<option value="${a}">${ACTION_LABEL[a]}</option>`)}</select>
          <select class="select" data-f="module" aria-label="Modul"><option value="">Semua modul</option>${['AUTH', 'USER', 'DOA', 'RECIPIENT', 'CATEGORY', 'SETTINGS', 'NOTIFICATION', 'EXPORT', 'REPORT', 'FEEDBACK', 'DATABASE'].map((m) => html`<option value="${m}">${m}</option>`)}</select>
          <input class="input" type="date" data-f="from" aria-label="Dari"><input class="input" type="date" data-f="to" aria-label="Hingga"></div>
        <section class="panel panel-flush" data-box></section>`.s;
      const t = pagedTable(el, {
        box: '[data-box]', fetch: A.getAuditLogs, emptyTitle: 'Tiada log',
        table: (items) => html`<table class="table"><thead><tr><th>Masa</th><th>Pengguna</th><th>Tindakan</th><th>Modul</th><th>Rujukan</th><th>Keterangan</th></tr></thead><tbody>
          ${items.map((l) => html`<tr><td class="nowrap">${fmtDate(l.createdAt, true)}</td><td><div class="cell-strong">${l.userName}</div><div class="xs muted">${l.role}</div></td><td class="nowrap">${actionLabel(l.action)}</td><td>${l.module}</td><td class="xs nowrap">${l.referenceId || '—'}</td><td class="small">${l.description || '—'}</td></tr>`)}</tbody></table>`
      });
      t.load();
    }
  };

  // ================================================================ Tetapan
  KD.views.adminSettings = {
    async render(el) {
      el.innerHTML = html`${head('Tetapan', 'Konfigurasi sistem. Tetapan kritikal keselamatan hanya boleh diubah oleh Super Admin.')}<section class="panel" data-box>${skeletonList(4)}</section>`.s;
      let rows = [];
      const draw = () => {
        qs('[data-box]', el).innerHTML = html`<form novalidate>${rows.map((s) => html`<div class="setting-row field" style="margin-top:0">
            <div><label class="setting-row__key" for="s-${s.key}">${s.description}</label><div class="xs muted">${s.key}${!s.editable ? html` <span class="badge badge-gold">${icon('lock', 'i-sm')}Super Admin</span>` : ''}${s.updatedAt ? html` <span>dikemas kini ${relTime(s.updatedAt)}</span>` : ''}</div></div>
            <div>${s.type === 'bool' ? html`<span class="toggle"><input type="checkbox" id="s-${s.key}" name="${s.key}" ${s.value ? raw('checked') : ''} ${s.editable ? '' : raw('disabled')}><span></span></span>`
              : s.type === 'text' ? html`<textarea class="textarea" style="min-height:80px" id="s-${s.key}" name="${s.key}" maxlength="${s.max || 400}" ${s.editable ? '' : raw('disabled')}>${s.value}</textarea>`
                : html`<input class="input" id="s-${s.key}" name="${s.key}" type="${s.type === 'int' ? 'number' : 'text'}" ${s.min !== undefined ? raw('min="' + s.min + '"') : ''} ${s.max !== undefined && s.type === 'int' ? raw('max="' + s.max + '"') : ''} value="${s.value}" ${s.editable ? '' : raw('disabled')}>`}</div></div>`)}
          <div class="row mt-6" style="justify-content:flex-end"><button class="btn btn-primary" type="submit">Simpan tetapan</button></div></form>`.s;
      };
      const load = async () => {
        try { rows = await A.getSettings(); draw(); } catch (err) { qs('[data-box]', el).innerHTML = errorState(err, 'reload').s; }
      };
      on(el, 'submit', 'form', async (e, form) => {
        e.preventDefault();
        const data = formData(form);
        const changes = {};
        rows.forEach((s) => {
          if (!s.editable || !(s.key in data)) return;
          let v = data[s.key];
          if (s.type === 'int') v = Number(v);
          if (v !== s.value) changes[s.key] = v;
        });
        if (!Object.keys(changes).length) { toast('Tiada perubahan untuk disimpan.'); return; }
        if (changes.MAINTENANCE_MODE === true && !(await confirm({ title: 'Aktifkan mod penyelenggaraan?', message: 'Semua pengguna bukan pentadbir tidak dapat menggunakan sistem sehingga mod ini dimatikan.', confirmText: 'Aktifkan', danger: true }))) return;
        await busy(qs('button[type="submit"]', form), async () => {
          try {
            rows = await A.updateSettings(changes);
            KD.config = await KD.api.getConfig().catch(() => KD.config);
            toast(Object.keys(changes).length + ' tetapan disimpan.');
            draw();
          } catch (err) { if (!fieldErrors(form, err)) toastError(err); }
        });
      });
      on(el, 'click', '[data-act="reload"]', load);
      load();
    }
  };

  // ================================================================ Pangkalan data (SUPER_ADMIN)
  KD.views.adminDatabase = {
    async render(el) {
      el.innerHTML = html`${head('Pangkalan Data', 'Sandaran, migrasi dan log ralat sistem.', html`<button class="btn btn-primary" data-act="backup">${icon('database')}Sandar sekarang</button>`)}
        <div class="grid grid-2"><section class="panel"><div class="panel-head"><h3>Migrasi</h3></div><div data-mig>${skeletonList(2)}</div></section>
        <section class="panel"><div class="panel-head"><h3>Sandaran</h3></div><div data-bk>${skeletonList(1)}</div></section></div>
        <section class="panel panel-flush mt-6"><div class="panel-head"><h3>Log ralat terkini</h3><span class="xs muted">Gunakan ID ralat untuk menjejak aduan pengguna</span></div><div data-logs class="mt-3">${skeletonList(2)}</div></section>`.s;
      const load = async () => {
        try {
          const [mig, logs, health] = await Promise.all([A.getMigrations(), A.getSystemLogs(), A.getHealth()]);
          qs('[data-mig]', el).innerHTML = html`${mig.map((m) => html`<div class="health-row"><span class="status-dot ${m.appliedAt ? 'status-ok' : 'status-warn'}"></span><div class="grow"><div class="cell-strong small">${m.id}</div><div class="xs muted">${m.description}</div></div><span class="xs muted">${m.appliedAt ? fmtDate(m.appliedAt, true) : 'Tertunda'}</span></div>`)}<p class="xs muted mt-3">Migrasi baharu dijalankan oleh pemilik skrip melalui fungsi runMigration() dalam editor Apps Script.</p>`.s;
          qs('[data-bk]', el).innerHTML = html`<div class="health-row"><span class="status-dot ${health.backup.ok ? 'status-ok' : 'status-warn'}"></span><div class="grow small">Sandaran terakhir</div><strong class="small">${health.backup.lastBackupAt ? fmtDate(health.backup.lastBackupAt, true) : 'Belum pernah'}</strong></div>
            <div class="health-row"><span class="status-dot ${health.script.maintenanceTriggerInstalled ? 'status-ok' : 'status-warn'}"></span><div class="grow small">Sandaran automatik harian</div><strong class="small">${health.script.maintenanceTriggerInstalled ? 'Aktif' : 'Belum dipasang'}</strong></div>
            <p class="xs muted mt-3">Salinan penuh spreadsheet disimpan dalam folder "Kirim Doa Backup" (30 salinan terkini).</p>`.s;
          qs('[data-logs]', el).innerHTML = logs.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Masa</th><th>ID ralat</th><th>Tindakan</th><th>Mesej</th></tr></thead><tbody>${logs.map((l) => html`<tr><td class="nowrap">${fmtDate(l.createdAt, true)}</td><td class="xs nowrap">${l.errorId}</td><td>${l.action || '—'}</td><td class="small">${l.message}</td></tr>`)}</tbody></table></div>`.s : html`<p class="muted small" style="padding:0 24px 24px">Tiada ralat direkodkan. Alhamdulillah.</p>`.s;
        } catch (err) { qs('[data-mig]', el).innerHTML = errorState(err, 'reload').s; }
      };
      on(el, 'click', '[data-act="backup"]', async (e, b) => busy(b, async () => { try { const r = await A.runBackup(); toast('Sandaran dicipta: ' + r.name); load(); } catch (err) { toastError(err); } }));
      on(el, 'click', '[data-act="reload"]', load);
      load();
    }
  };

  // ================================================================ Kesihatan sistem (SUPER_ADMIN)
  KD.views.adminHealth = {
    async render(el) {
      el.innerHTML = html`${head('Kesihatan Sistem', 'Status pangkalan data, storan, skrip dan sandaran.', html`<button class="btn btn-outline" data-act="reload">${icon('refresh')}Semak semula</button>`)}<div data-box>${skeletonStats(4)}</div>`.s;
      const dot = (ok) => html`<span class="status-dot ${ok === true ? 'status-ok' : ok === false ? 'status-bad' : 'status-warn'}"></span>`;
      const load = async () => {
        const box = qs('[data-box]', el);
        box.innerHTML = skeletonStats(4).s;
        try {
          const h = await A.getHealth();
          const s = h.script;
          box.innerHTML = html`<div class="grid grid-4">
              <div class="stat"><div class="stat__label">${dot(h.database.ok)}Pangkalan data</div><div class="stat__value" style="font-size:var(--fs-xl)">${h.database.ok ? 'Sihat' : 'Bermasalah'}</div><div class="stat__note">${h.database.name || h.database.error || ''}</div></div>
              <div class="stat"><div class="stat__label">${dot(h.drive.ok && h.drive.isPrivate)}Drive</div><div class="stat__value" style="font-size:var(--fs-xl)">${h.drive.ok ? (h.drive.isPrivate ? 'Peribadi' : 'Dikongsi!') : 'Ralat'}</div><div class="stat__note">${h.drive.folderName || h.drive.error || ''}</div></div>
              <div class="stat"><div class="stat__label">${dot(true)}Skrip</div><div class="stat__value" style="font-size:var(--fs-xl)">v${s.version}</div><div class="stat__note">${s.environment}, ${s.timezone}</div></div>
              <div class="stat"><div class="stat__label">${dot(h.backup.ok)}Sandaran terakhir</div><div class="stat__value" style="font-size:var(--fs-xl)">${h.backup.lastBackupAt ? relTime(h.backup.lastBackupAt) : 'Tiada'}</div></div>
            </div>
            <div class="grid grid-2 mt-6">
              <section class="panel"><div class="panel-head"><h3>Sheet</h3></div>${(h.database.sheets || []).map((x) => html`<div class="health-row">${dot(x.exists && x.headersOk)}<span class="grow">${x.sheet}</span><span class="small muted">${x.exists ? fmtNum(x.rows) + ' baris' : 'Tiada'}${x.missing && x.missing.length ? ', lajur hilang: ' + x.missing.join(', ') : ''}</span></div>`)}</section>
              <section class="panel"><div class="panel-head"><h3>Konfigurasi</h3></div>
                <div class="health-row">${dot(s.maintenanceTriggerInstalled)}<span class="grow">Pencetus harian (sandaran & pembersihan)</span><strong class="small">${s.maintenanceTriggerInstalled ? 'Dipasang' : 'Jalankan installTriggers()'}</strong></div>
                <div class="health-row">${dot(s.mailQuotaRemaining === null ? null : s.mailQuotaRemaining > 10)}<span class="grow">Baki kuota email hari ini</span><strong class="small">${s.mailQuotaRemaining === null ? '—' : fmtNum(s.mailQuotaRemaining)}</strong></div>
                <div class="health-row">${dot(s.pbkdf2Iterations >= 10000 ? true : null)}<span class="grow">Lelaran PBKDF2</span><strong class="small">${fmtNum(s.pbkdf2Iterations)}</strong></div>
                <div class="health-row">${dot(s.iframeEmbed ? null : true)}<span class="grow">Benam iframe (PWA shell)</span><strong class="small">${s.iframeEmbed ? 'Dibenarkan' : 'Disekat'}</strong></div>
                <div class="health-row">${dot(!h.lastError)}<span class="grow">Ralat terakhir</span><strong class="small">${h.lastError ? h.lastError.errorId + ', ' + relTime(h.lastError.createdAt) : 'Tiada'}</strong></div>
              </section></div>
            <p class="xs muted mt-4">Disemak ${fmtDate(h.checkedAt, true)}.</p>`.s;
        } catch (err) { box.innerHTML = errorState(err, 'reload').s; }
      };
      on(el, 'click', '[data-act="reload"]', load);
      load();
    }
  };
})(window.KD);
;
/* ---- bahagian 9 ---- */
window.addEventListener('error', function (e) { console.error('[kd]', e.message); });
    KD.app.boot();
;
/* ---- bahagian 10 ---- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW gagal', e); }); });
}
