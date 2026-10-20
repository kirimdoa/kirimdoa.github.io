"""
e2e-offline.py — Cache pelayar & luar talian (1.9.0). Dev server mesti berjalan.
Mengukur masa paparan pertama vs dengan cache, dan menguji tanda senarai semak luar talian → disegerakkan.
"""
from playwright.sync_api import sync_playwright
import os, time, json, urllib.request
B = os.environ.get('E2E_BASE', 'http://localhost:8080/')
def step(n): print('✔', n)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 360, 'height': 780}); pg = ctx.new_page()
    pg.route('https://fonts.**', lambda r: r.abort())
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    slow = {'off': False}
    pg.add_init_script("window.__latency = 1200")  # tiru latensi Apps Script ~1.2s setiap panggilan
    def api(route):
        if slow['off']: return route.abort()
        return route.continue_()
    pg.route('**/__api*', api)
    email = 'luar%d@demo.local' % int(time.time())
    pg.goto(B + '#/daftar'); pg.wait_for_selector('#f-fullName')
    pg.fill('#f-fullName', 'Jemaah Luar Talian'); pg.fill('#f-email', email); pg.fill('#f-password', 'Kuat12345'); pg.click('button[type=submit]')
    pg.wait_for_selector('.welcome', timeout=40000)
    pg.goto(B + '#/umrah'); pg.wait_for_selector('[data-act=seed]', timeout=40000); pg.click('[data-act=seed]'); pg.wait_for_selector('.um-row', timeout=40000)
    # Masa paparan TANPA cache (kosongkan cache sahaja, sesi kekal)
    pg.evaluate("Object.keys(localStorage).filter(k=>k.indexOf('kd.c1.')===0||k==='kd.cfg1').forEach(k=>localStorage.removeItem(k))")
    t0 = time.time(); pg.reload(); pg.wait_for_selector('.um-row', timeout=40000); cold = time.time() - t0
    t0 = time.time(); pg.reload(); pg.wait_for_selector('.um-row', timeout=40000); warm = time.time() - t0
    print('   masa paparan Planner: tanpa cache %.1fs, dengan cache %.1fs' % (cold, warm))
    assert warm < cold and warm < 1.5, (cold, warm); step('dengan cache, Planner dipaparkan serta-merta')
    pg.goto(B + '#/utama'); pg.wait_for_selector('.um-dash', timeout=40000)
    t0 = time.time(); pg.reload(); pg.wait_for_selector('.um-dash'); pg.wait_for_selector('[data-stats] .stat'); warm_home = time.time() - t0
    print('   masa paparan Utama dengan cache: %.1fs' % warm_home); assert warm_home < 1.5; step('Utama serta-merta dari cache (1 panggilan user.home)')
    # Luar talian
    slow['off'] = True
    pg.goto(B + '#/umrah'); pg.reload(); pg.wait_for_selector('.um-row', timeout=10000); step('luar talian: Planner tetap dipaparkan')
    pg.wait_for_selector('text=Luar talian: memaparkan data tersimpan', timeout=20000); step('mesej luar talian')
    first = pg.locator('[data-tick]').nth(1); fid = first.get_attribute('data-tick'); first.check()
    pg.wait_for_selector('text=disimpan dalam telefon', timeout=20000)
    assert pg.evaluate("JSON.parse(localStorage.getItem('kd.q1')||'[]').length") == 1; step('tanda luar talian → beratur')
    pg.reload(); pg.wait_for_selector('.um-row'); assert pg.is_checked('[data-tick="%s"]' % fid); step('selepas muat semula luar talian, tanda kekal')
    slow['off'] = False
    pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_selector('text=disegerakkan', timeout=20000)
    assert pg.evaluate("localStorage.getItem('kd.q1')") is None; step('kembali dalam talian → disegerakkan ke pelayan')
    tok = pg.evaluate("JSON.parse(localStorage.getItem('kd.session.v1')||sessionStorage.getItem('kd.session.v1')).token")
    req = urllib.request.Request(B + '__api', data=json.dumps({'action': 'umrah.semak.list', 'payload': {}, 'token': tok}).encode(), headers={'Content-Type': 'text/plain'})
    items = json.loads(urllib.request.urlopen(req).read())['data']['items']
    assert [i for i in items if i['id'] == fid][0]['done'] is True; step('pelayan merekod tanda yang dibuat luar talian')
    pg.click('[data-act=menu]') if pg.locator('[data-act=menu]').count() else None
    pg.evaluate("KD.auth.clear()")
    assert pg.evaluate("Object.keys(localStorage).filter(k=>k.indexOf('kd.c1.')===0).length") == 0; step('log keluar → cache dipadam')
    assert not errs, errs
    b.close()
print('\nE2E cache & luar talian lulus.')
