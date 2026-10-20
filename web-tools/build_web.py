"""
build_web.py — Bina versi web Kirim Doa (GitHub Pages) TERUS di akar repo ini daripada src/.

  python3 web-tools/build_web.py            (dijalankan oleh .github/workflows/deploy.yml)

Hasil:
  assets/app.<hash>.js   = web-tools/bridge.js + skrip src/frontend (susunan seperti index.html) + boot + daftar SW
  assets/app.<hash>.css  = gaya src/frontend/css/* + gaya paparan + gaya cetak
  index.html, sw.js      = nama aset, versi & cache dikemas kini (struktur lain tidak disentuh)
Fail lain (config.js, manifest, ikon, offline.html) tidak diubah.
"""
import hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
FE = os.path.join(SRC, 'frontend')
TOOLS = os.path.join(ROOT, 'web-tools')
CSS = ['css/tokens', 'css/base', 'css/layout', 'css/components', 'css/views', 'css/mobile']
PRINT = """@media print {
    .sidebar, .topbar, .bottomnav, #toasts, .toolbar, .page-head .row, .pager { display: none !important; }
    .shell { display: block; } .content { padding: 0; max-width: none; } .panel { break-inside: avoid; }
}"""


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def write(p, s):
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)


def blocks(path, tag):
    return re.findall(r'<' + tag + r'[^>]*>\n?(.*?)</' + tag + '>', read(path), re.S)


def main():
    index_src = read(os.path.join(FE, 'index.html'))
    # Susunan skrip & paparan mengikut include dalam src/frontend/index.html (paparan baharu ikut serta automatik)
    includes = re.findall(r"include\('frontend/((?:js|views)/[a-z0-9_-]+)'\)", index_src)
    if not includes:
        sys.exit('Tiada include skrip dalam src/frontend/index.html')
    views = [i for i in includes if i.startswith('views/')]

    parts = [read(os.path.join(TOOLS, 'bridge.js'))]
    parts += ['\n'.join(blocks(os.path.join(FE, i + '.html'), 'script')) for i in includes]
    parts += [read(os.path.join(TOOLS, 'boot.js')), read(os.path.join(TOOLS, 'sw-register.js'))]
    for p in parts:
        if '<' + '/script>' in p:
            sys.exit('Teg penutup skrip dalam kandungan skrip')
    js = ''.join('/* ---- bahagian %d ---- */\n%s\n' % (i, p.rstrip('\n')) for i, p in enumerate(parts))

    css = '\n'.join('\n'.join(blocks(os.path.join(FE, c + '.html'), 'style')) for c in CSS)
    extra = [b for v in views for b in blocks(os.path.join(FE, v + '.html'), 'style')]
    css += '\n' + '\n'.join(extra) + '\n' + PRINT + '\n'

    h = lambda s: hashlib.sha1(s.encode('utf-8')).hexdigest()[:10]
    js_name, css_name = 'assets/app.%s.js' % h(js), 'assets/app.%s.css' % h(css)
    version = re.search(r"VERSION:\s*'([^']+)'", read(os.path.join(SRC, 'config/Config.gs'))).group(1)

    assets = os.path.join(ROOT, 'assets')
    os.makedirs(assets, exist_ok=True)
    for f in os.listdir(assets):
        if re.match(r'app\.[0-9a-f]+\.(js|css)$', f):
            os.remove(os.path.join(assets, f))
    write(os.path.join(ROOT, js_name), js)
    write(os.path.join(ROOT, css_name), css)

    idx_path = os.path.join(ROOT, 'index.html')
    idx = read(idx_path)
    idx = re.sub(r'assets/app\.[0-9a-f]+\.js', js_name, idx)
    idx = re.sub(r'assets/app\.[0-9a-f]+\.css', css_name, idx)
    idx = re.sub(r'data-version="[^"]*"', 'data-version="%s"' % version, idx)
    write(idx_path, idx)

    sw_path = os.path.join(ROOT, 'sw.js')
    sw = read(sw_path)
    sw = re.sub(r'var CACHE = "[^"]*";', 'var CACHE = "kirimdoa-%s-%s";' % (version, h(js + css)), sw)
    sw = re.sub(r'assets/app\.[0-9a-f]+\.js', js_name, sw)
    sw = re.sub(r'assets/app\.[0-9a-f]+\.css', css_name, sw)
    write(sw_path, sw)
    print('Web %s: %s, %s' % (version, js_name, css_name))


if __name__ == '__main__':
    main()
