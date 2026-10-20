# Deploy Kirim Doa

Repo ini menyimpan **laman web** (GitHub Pages, di akar repo) dan **kod sumber** Apps Script (`src/`).
Setiap kali `src/` diubah dan dipush ke `main`, GitHub Actions (`.github/workflows/deploy.yml`) melakukan perkara berikut secara automatik:

1. Menjalankan ujian backend, semakan frontend dan imbasan rahsia. Jika ada yang gagal, deploy dihentikan.
2. Menghantar kod ke projek Apps Script "Kirim Doa" (`clasp push`), kemudian mencipta versi baharu pada deployment sedia ada. URL `/exec` kekal sama.
3. Membina semula laman web (`assets/`, `index.html`, `sw.js`) dan mengcommitnya ke `main`.

Tiada lagi langkah ekstrak zip, `clasp push` di PC atau **Manage deployments → New version**.

## Persediaan sekali sahaja (±5 minit)

1. **Hidupkan Apps Script API**
   Buka <https://script.google.com/home/usersettings> → **Google Apps Script API: On**.

2. **Dapatkan kelayakan clasp** (di PC, sekali sahaja)
   ```
   npx @google/clasp@3 login
   ```
   Log masuk dengan akaun Google pemilik projek Kirim Doa. Fail berikut akan dicipta:
   - Windows: `C:\Users\<nama>\.clasprc.json`
   - Mac/Linux: `~/.clasprc.json`

   Jika anda pernah menjalankan `clasp login` sebelum ini, fail itu sudah wujud.

3. **Simpan sebagai GitHub Secret**
   Repo `kirimdoa.github.io` → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `CLASPRC_JSON`
   - Secret: tampal **keseluruhan** kandungan fail `.clasprc.json`

4. **Jalankan deploy pertama**
   **Actions → Deploy Kirim Doa → Run workflow → Run workflow**. Tunggu sehingga tanda hijau (±2 minit).

## Selepas itu

| Mahu | Buat |
|---|---|
| Kemas kini kod | Claude (atau anda) push perubahan `src/` ke `main`. Selebihnya automatik |
| Deploy semula tanpa perubahan | **Actions → Deploy Kirim Doa → Run workflow** |
| Semak status | Tab **Actions**: hijau = live, merah = gagal (backend dan laman web tidak diubah) |
| Patah balik ke 1.6.1 | Branch `backup/v1.6.1` (laman web) dan zip sandaran (kod) |

## Keselamatan

- `CLASPRC_JSON` memberi akses kepada projek Apps Script dalam akaun Google anda. Ia hanya disimpan sebagai GitHub Secret, dan dipadam daripada pelari CI selepas setiap deploy. Jangan commit fail `.clasprc.json`.
- Repo ini public, jadi kod `src/` boleh dilihat orang. Tiada rahsia dalam kod: `AUTH_PEPPER`, `FORM_SECRET`, kunci FCM dan ID pangkalan data kekal dalam **Script Properties**. `tools/scan-secrets.js` menggagalkan deploy jika rahsia ditemui.
- Hadkan akses tulis repo kepada anda sahaja. Secret tidak didedahkan kepada pull request dari fork.
- Untuk menamatkan akses CI pada bila-bila masa, padam secret `CLASPRC_JSON`, atau batalkan akses "clasp" di <https://myaccount.google.com/permissions>.

## Struktur

```
index.html, sw.js, assets/, config.js, icons/, manifest.webmanifest, offline.html   ← laman web (Pages)
src/                 ← kod Apps Script (backend + frontend)
tools/               ← ujian (run-tests), semakan, build-gas, dev-server, e2e-umrah.py
web-tools/           ← pembina laman web (build_web.py + jambatan/boot)
.github/workflows/   ← deploy.yml
```

Ujian tempatan: `node tools/run-tests.js` · Dev server: `node tools/dev-server.js --seed` (http://localhost:8080)
