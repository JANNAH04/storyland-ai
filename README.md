# EbookAI Studio — VS Code + Gemini API (Fasa 1)

Ini projek pembelajaran **berfungsi secara lokal** untuk menjana cerita, mengedit teks dan menyimpan buku dalam SQLite. PDF asas melalui cetakan browser. **Belum termasuk** login, ilustrasi AI, export PDF berkualiti cetak, storan cloud, job queue, perlindungan abuse, billing, atau deployment produksi.

## Prasyarat
- Node.js **22+** (LTS disyorkan)
- VS Code
- Gemini API key daripada https://aistudio.google.com/api-keys

## Jalankan
1. Unzip, buka folder `ebookai-gemini-vscode` dalam VS Code.
2. Buka terminal dalam folder projek.
3. Jalankan `npm install`.
4. Salin `.env.example` kepada `.env` (Windows PowerShell: `Copy-Item .env.example .env`).
5. Isi `GEMINI_API_KEY=...` dalam `.env` dan simpan. **Jangan kongsi fail ini.**
6. Jalankan `npm run dev`.
7. Buka http://localhost:3000
8. Masukkan tajuk/idea, klik **Jana Cerita**, edit halaman, klik **Simpan Perubahan** dan **Cetak / PDF**.

## Fail penting
- `server.js` — Express API, Gemini, SQLite
- `public/index.html` — UI
- `public/style.css` — layout
- `public/app.js` — operasi browser
- `data/books.sqlite` — database dicipta automatik

## Keselamatan / had
**Jangan deploy versi ini ke internet terbuka.** Ia tiada autentikasi atau pemisahan akaun; semua pengunjung boleh melihat/mengedit buku. Tambah login/session, authorization, rate limiting, CSRF controls, backups, privacy notices, and abuse/cost quotas first. Native `better-sqlite3` mungkin memerlukan build tools pada sesetengah Windows environments.

Jika model tidak tersedia, pilih model teks yang akaun anda ada akses dan ubah `GEMINI_MODEL` dalam `.env`. Pemanggilan API adalah berbayar atau tertakluk kepada kuota akaun Google anda.
