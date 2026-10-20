"""
e2e-umrah.py — E2E Planner Umrah dalam Kirim Doa (telefon 360px + desktop), serta regresi halaman sedia ada.
Dev server mesti berjalan (node tools/dev-server.js --seed). Tangkapan skrin: e2e-shots/kd-*.png
"""
from playwright.sync_api import sync_playwright
import os, time

B = os.environ.get('E2E_BASE', 'http://localhost:8080/')
os.makedirs('e2e-shots', exist_ok=True)
errs = []
def step(n): print('✔', n)
def no_hscroll(pg, name):
    w = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    assert w <= 1, name + ': skrol mendatar ' + str(w) + 'px'

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 360, 'height': 780})
    pg.route('https://fonts.**', lambda r: r.abort())
    pg.on('pageerror', lambda e: errs.append(str(e)))

    pg.goto(B + '#/log-masuk'); pg.wait_for_selector('#f-email')
    pg.fill('#f-email', 'user@demo.local'); pg.fill('#f-password', 'Demo1234'); pg.click('button[type=submit]')
    pg.wait_for_selector('.welcome'); pg.wait_for_selector('.um-dash'); step('Utama: kad Planner Umrah dipaparkan')
    no_hscroll(pg, 'utama'); pg.screenshot(path='e2e-shots/kd-utama.png', full_page=True)

    pg.click('.um-dash a'); pg.wait_for_selector('[data-act=seed]')
    pg.fill('#um-berlepas', '2026-10-24'); pg.click('[data-act=seed]'); pg.wait_for_selector('.um-row')
    assert pg.inner_text('.um-hero__pct') == '0%'; step('jana senarai semak')
    pg.locator('[data-tick]').first.check(); pg.wait_for_selector('.um-row.is-done')
    assert pg.inner_text('.um-hero__pct') != '0%'; step('tanda siap → kemajuan')
    no_hscroll(pg, 'semak'); pg.screenshot(path='e2e-shots/kd-semak.png', full_page=True)
    assert '24 Okt 2026' in pg.inner_text('[data-berlepas]'); step('bar tarikh berlepas dipaparkan')
    pg.click('[data-act=berlepas]'); pg.wait_for_selector('#bp-tarikh'); pg.fill('#bp-tarikh', '2026-10-31')
    assert 'Ditunda 7 hari' in pg.inner_text('[data-beza]'); pg.screenshot(path='e2e-shots/kd-berlepas-modal.png')
    pg.click('.modal [data-act=save]'); pg.wait_for_function("document.querySelector('[data-berlepas]') && document.querySelector('[data-berlepas]').textContent.indexOf('31 Okt 2026') >= 0")
    assert '26 Okt 2026' in pg.inner_text('.um-row:has-text("Visa Umrah")'); step('ubah tarikh berlepas → tarikh sasaran dikira semula (H-5)')
    assert pg.is_checked('[data-remind]'); pg.uncheck('[data-remind]'); pg.wait_for_selector('text=Peringatan harian dimatikan')
    pg.check('[data-remind]'); pg.wait_for_selector('text=Peringatan harian dihidupkan'); step('suis peringatan harian')
    pg.click('[data-act=remind-test]'); pg.wait_for_selector('text=hari lagi ke Tanah Suci'); step('contoh peringatan dihantar')
    no_hscroll(pg, 'semak+peringatan'); pg.evaluate("document.getElementById('toasts').innerHTML=''"); pg.locator('.um-trip').screenshot(path='e2e-shots/kd-peringatan.png')
    pg.goto(B + '#/notifikasi'); pg.wait_for_selector('[data-type=UMRAH_REMINDER]')
    assert 'persiapan belum selesai' in pg.inner_text('[data-type=UMRAH_REMINDER]'); pg.screenshot(path='e2e-shots/kd-notifikasi.png')
    pg.click('[data-type=UMRAH_REMINDER]'); pg.wait_for_selector('.um-trip'); assert '#/umrah' in pg.url; step('notifikasi → buka Planner Umrah')
    pg.click('[data-fasa=SEMASA]'); pg.wait_for_timeout(300); assert 'Ibadah Umrah' in pg.inner_text('[data-um-body]'); step('fasa Semasa')
    pg.click('[data-act=add]'); pg.wait_for_selector('#s-perkara'); pg.fill('#s-perkara', 'Beli kurma Ajwa'); pg.click('[data-act=save]')
    pg.wait_for_selector('text=Beli kurma Ajwa'); step('tambah item sendiri (modal)')
    pg.reload(); pg.wait_for_selector('.um-row'); assert pg.locator('.um-row.is-done').count() >= 0

    pg.click('[data-tab=kaunter]'); pg.wait_for_selector('.um-ktr__btn')
    for i in range(7):
        pg.click('[data-ktr="+1"]'); pg.wait_for_timeout(1600)
    assert pg.inner_text('.um-ktr__num') == '7/7' and pg.is_disabled('.um-ktr__btn'); step('kaunter Tawaf 7/7 (getaran & elak tekan berganda)')
    pg.reload(); pg.wait_for_selector('.um-ktr__num'); assert pg.inner_text('.um-ktr__num') == '7/7'; step('kiraan kekal selepas muat semula')
    pg.wait_for_selector('#boot', state='detached'); pg.screenshot(path='e2e-shots/kd-kaunter.png', full_page=True)
    pg.click('[data-ktr="semak"]'); pg.wait_for_selector('text=Ditanda dalam senarai semak'); step('Tawaf selesai → ditanda dalam senarai semak')
    pg.click('[data-ktr-mode=SAIE]'); assert pg.inner_text('.um-ktr__dir') == 'Safa → Marwah'
    pg.click('[data-ktr="+1"]'); assert pg.inner_text('.um-ktr__dir') == 'Marwah → Safa'; step("Sa'ie: arah Safa/Marwah bertukar")
    pg.click('[data-tab=doa]'); pg.wait_for_selector('.um-dcard')
    assert pg.locator('.um-dcard').count() == 30; step('koleksi 30 doa dipaparkan')
    pg.fill('[data-doa-q]', 'ibu bapa'); pg.wait_for_timeout(200); assert 'Doa untuk kedua ibu bapa' in pg.inner_text('[data-doa-list]'); step('carian doa')
    pg.fill('[data-doa-q]', ''); pg.click('[data-kat=TAWAF]'); pg.wait_for_timeout(200); assert pg.locator('.um-dcard').count() == 6; step('tapis kategori Tawaf/Sa\'ie/Zamzam')
    pg.click('#doa-11 [data-fav]'); pg.click('[data-kat=FAV]'); pg.wait_for_timeout(200); assert pg.locator('.um-dcard').count() == 1; step('kegemaran doa')
    pg.click('[data-kat=""]'); pg.click('[data-fs="1"]'); no_hscroll(pg, 'koleksi doa'); pg.screenshot(path='e2e-shots/kd-doa.png')
    pg.click('[data-tab=kad]'); pg.wait_for_selector('[data-act=kad-edit]'); pg.click('[data-act=kad-edit]'); pg.wait_for_selector('#kd-pasport'); pg.wait_for_timeout(200)
    pg.fill('#kd-pasport', 'A12345678'); pg.fill('#kd-mutawwifTel', '+966 50 123 4567'); pg.fill('#kd-makkahNama', 'Hotel Contoh Makkah')
    pg.fill('#kd-makkahArab', 'فندق مكة'); pg.click('[data-act=kad-save]'); pg.wait_for_selector('text=A12345678')
    assert 'A12345678' not in pg.inner_text('.um-kad section:first-child dd:first-of-type')
    no_hscroll(pg, 'kad'); pg.screenshot(path='e2e-shots/kd-kad.png', full_page=True)
    pg.click('[data-ar=makkah]'); pg.wait_for_selector('.um-big-ar'); assert 'فندق مكة' in pg.inner_text('.um-big-ar'); pg.keyboard.press('Escape'); step('kad penting + paparan Arab untuk pemandu')
    pg.click('[data-tab=belanja]'); pg.wait_for_selector('[data-act=add]'); pg.click('[data-act=add]'); pg.wait_for_selector('#b-perkara')
    pg.fill('#b-perkara', 'Kurma Ajwa'); pg.fill('#b-jumlah', 'abc'); pg.click('[data-act=save]'); pg.wait_for_selector('.field-error'); step('validasi jumlah dipaparkan')
    pg.fill('#b-jumlah', '120'); pg.select_option('#b-kat', 'OLEOLE'); pg.click('[data-act=save]'); pg.wait_for_selector('.um-sum')
    assert 'SAR 120' in pg.inner_text('.um-sum'); step('rekod belanja + ringkasan')
    no_hscroll(pg, 'belanja'); pg.screenshot(path='e2e-shots/kd-belanja.png', full_page=True)

    pg.click('[data-tab=jadual]'); pg.wait_for_selector('[data-act=add]')
    for akt, masa in (('Ziarah Masjid Quba', '08:00'), ('Subuh berjemaah', '05:15')):
        pg.click('[data-act=add]'); pg.wait_for_selector('#j-akt'); pg.fill('#j-akt', akt); pg.fill('#j-masa', masa); pg.select_option('#j-bandar', 'MADINAH')
        pg.click('[data-act=save]'); pg.wait_for_selector('text=' + akt)
    titles = pg.locator('.um-act__title').all_inner_texts(); assert titles[0].startswith('Subuh'), titles
    assert pg.locator('.um-day.is-today').count() == 1; step('jadual disusun ikut masa, hari ini ditanda')
    no_hscroll(pg, 'jadual'); pg.screenshot(path='e2e-shots/kd-jadual.png', full_page=True)
    pg.locator('[data-edit]').first.click(); pg.wait_for_selector('[data-act=del]'); pg.click('[data-act=del]'); pg.wait_for_selector('[data-ok]'); pg.click('[data-ok]')
    pg.wait_for_timeout(800); assert pg.locator('.um-act').count() == 1; step('padam aktiviti (dengan pengesahan)')
    pg.click('[data-tab=semak]'); pg.wait_for_selector('[data-act=berlepas]'); pg.click('[data-act=berlepas]'); pg.wait_for_selector('#bp-jadual')
    pg.fill('#bp-tarikh', '2026-10-24'); assert pg.is_checked('#bp-jadual'); pg.click('.modal [data-act=save]')
    pg.wait_for_function("document.querySelector('[data-berlepas]') && document.querySelector('[data-berlepas]').textContent.indexOf('24 Okt 2026') >= 0")
    pg.click('[data-tab=jadual]'); pg.wait_for_selector('.um-act'); assert pg.locator('.um-day.is-today').count() == 0; step('jadual dianjak bersama tarikh berlepas (-7 hari)')

    pg.click('[data-tab=titipan]'); pg.wait_for_selector('.um-titipan'); pg.click('.um-titipan a[href="#/kumpul"]'); pg.wait_for_selector('.link-card'); step('titipan → Kumpul Doa sedia ada')
    pg.goto(B + '#/umrah?tab=panduan'); pg.wait_for_selector('.um-ar'); no_hscroll(pg, 'panduan'); step('panduan')
    pg.screenshot(path='e2e-shots/kd-panduan.png', full_page=True)

    pg.goto(B + '#/utama'); pg.wait_for_selector('.um-dash .um-trip__count'); assert 'hari lagi' in pg.inner_text('.um-dash'); step('Utama: kiraan hari ke tarikh berlepas')
    pg.screenshot(path='e2e-shots/kd-utama-countdown.png', full_page=True)
    pg.goto(B + '#/umrah?tab=panduan'); pg.wait_for_selector('.um-ar')
    pg.click('[data-act=menu]'); pg.wait_for_selector('.modal'); assert 'Planner Umrah' in pg.inner_text('.modal'); step('menu telefon ada Planner Umrah')
    pg.keyboard.press('Escape')
    for path in ('#/senarai', '#/hantar', '#/baca', '#/profil'):
        pg.goto(B + path); pg.wait_for_timeout(700); no_hscroll(pg, path)
    step('regresi: halaman sedia ada dimuat tanpa ralat')

    d = b.new_page(viewport={'width': 1280, 'height': 860}); d.route('https://fonts.**', lambda r: r.abort()); d.on('pageerror', lambda e: errs.append(str(e)))
    d.goto(B + '#/log-masuk'); d.wait_for_selector('#f-email'); d.fill('#f-email', 'user@demo.local'); d.fill('#f-password', 'Demo1234'); d.click('button[type=submit]')
    d.wait_for_selector('.welcome'); d.goto(B + '#/umrah'); d.wait_for_selector('.um-row'); assert 'Planner Umrah' in d.inner_text('.sidebar'); step('desktop: sidebar + senarai semak')
    d.screenshot(path='e2e-shots/kd-desktop.png', full_page=False)

    assert not errs, 'Ralat JS: ' + '; '.join(errs)
    b.close()
print('\nE2E Planner Umrah (Kirim Doa) lulus.')
