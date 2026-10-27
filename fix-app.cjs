
/* ======================================================
   STORYLAND AI V20.1
   REPAIR COMPLETE APP.JS

   Memperbaiki:
   - imageDisplay before initialization
   - Full-page image preview
   - Layout change
   - Image regeneration / upload / restore
   - Gemini story text sync
   - Smart Layout fixed image size
   - Duplicate Gemini story history

   Mengekalkan semua fungsi app.js asal.
   ====================================================== */

const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve('public/app.js');

if (!fs.existsSync(file)) {
  throw new Error(
    'public/app.js tidak dijumpai. ' +
    'Jalankan arahan dari folder utama projek.'
  );
}

let src = fs.readFileSync(file, 'utf8')
  .replace(/\r\n/g, '\n');

if (src.includes('STORYLAND V20.1 FIXED')) {
  console.log(
    'Pembetulan V20.1 sudah dipasang.'
  );
  process.exit(0);
}

if (!src.includes('function makeStoryPage(page, index)')) {
  throw new Error(
    'Fungsi makeStoryPage tidak dijumpai.'
  );
}

const backup =
  file + '.backup-v20-' + Date.now();

fs.copyFileSync(file, backup);

const a = src.indexOf(
  'function makeStoryPage(page, index) {'
);

const marker = src.indexOf(
  'BACKUP CENTER INTEGRATION',
  a
);

if (marker < 0) {
  throw new Error(
    'Penanda BACKUP CENTER INTEGRATION tidak dijumpai.'
  );
}

const b = src.lastIndexOf(
  '/* ======================================================',
  marker
);

let part = src.slice(a, b);

function replaceRequired(find, replace, label) {
  if (!part.includes(find)) {
    throw new Error(
      `Blok kod tidak dijumpai: ${label}. ` +
      'Fail asal tidak diubah.'
    );
  }

  part = part.replace(find, replace);
}

/* ==========================================
   FIX 1 — Gambar selepas jana/upload/restore
   ========================================== */

part = part.replaceAll(
  '        page.imageUrl = url;\n        showImage();',
  '        page.imageUrl = url;\n' +
  '        showImage();\n' +
  '        updateFullPagePreview();'
);

/* ==========================================
   FIX 2 — Teks manual
   ========================================== */

replaceRequired(
  '    overlayText.textContent = textarea.value;',
  '    updateFullPagePreview();',
  'Kemas kini teks manual'
);

/* ==========================================
   FIX 3 — Teks daripada Gemini
   ========================================== */

replaceRequired(
  '          overlayText.textContent = text;',
  '          updateFullPagePreview();',
  'Kemas kini teks Gemini'
);

/* ==========================================
   FIX 4 — Pulihkan sejarah cerita
   ========================================== */

replaceRequired(
  '      page.text = oldText;\n' +
  '      textarea.value = oldText;',
  '      page.text = oldText;\n' +
  '      textarea.value = oldText;\n' +
  '      updateFullPagePreview();',
  'Pulihkan cerita'
);

/* ==========================================
   FIX 5 — Tukar layout
   ========================================== */

replaceRequired(
  '    updateButtons();\n' +
  '    notifyEditing();\n' +
  '  }\n);',

  '    updateButtons();\n' +
  '    updateFullPagePreview();\n' +
  '    notifyEditing();\n' +
  '  }\n);',

  'Tukar susun atur halaman'
);

/* ==========================================
   FIX 6 — SMART LAYOUT
   ========================================== */

const smartStart = part.indexOf(
  '        onApply: result => {',
  part.indexOf('const smartLayoutPanel')
);

const smartEnd = part.indexOf(
  '        }\n      }) || el',
  smartStart
);

if (smartStart < 0 || smartEnd < 0) {
  throw new Error(
    'Smart Layout onApply tidak dijumpai.'
  );
}

part =
  part.slice(0, smartStart) +

  `        onApply: result => {
          if (
            LAYOUTS.some(
              ([value]) => value === result.layout
            )
          ) {
            layout.value = result.layout;

            layout.dispatchEvent(
              new Event('change', {
                bubbles: true
              })
            );
          }

          // Saiz gambar dikunci.
          page.imageScale = 100;
          page.imageAlign = 'center';

          section.dataset.imageAlign = 'center';

          section.style.setProperty(
            '--page-image-scale',
            '100%'
          );

          updateFullPagePreview();

          notifyEditing();
          refreshQualityChecker();
` +

  part.slice(smartEnd);

/* ==========================================
   FIX 7 — Elak sejarah Gemini berganda
   ========================================== */

const historyStart = part.indexOf(
  '// Simpan cerita lama sebelum digantikan.'
);

const historyEnd = part.indexOf(
  '          // Update halaman sahaja.',
  historyStart
);

if (historyStart >= 0 && historyEnd > historyStart) {
  part =
    part.slice(0, historyStart) +

    `// Simpan satu versi terdahulu sahaja.
          const oldText = String(page.text || '');

          if (
            oldText.trim() &&
            oldText !== text
          ) {
            const job = storyHistory?.capture
              ? storyHistory.capture(oldText)
              : window.StorylandAutoStoryHistory
                  ?.saveVersion?.(
                    bookId,
                    number,
                    oldText
                  );

            Promise.resolve(job).catch(error => {
              console.error(
                '[Sejarah Cerita]',
                error
              );
            });
          }

` +

    part.slice(historyEnd);
}

/* ==========================================
   GABUNGKAN KEMBALI APP.JS PENUH
   ========================================== */

src =
  src.slice(0, a) +
  part +
  src.slice(b);

/* Sokongan untuk buku layout lama */

if (!src.includes("['side', 'Sebelah (Asal)']")) {
  src = src.replace(
    "  ['bottom', 'Teks Bawah'],",
    "  ['bottom', 'Teks Bawah'],\n" +
    "  ['side', 'Sebelah (Asal)'],"
  );
}

/* Tandakan versi telah dikemas kini */

src = src.replace(
  '   STORYLAND AI V18.6\n   FULL APPLICATION',
  '   STORYLAND V20.1 FIXED\n   FULL APPLICATION'
);

fs.writeFileSync(
  file,
  src,
  'utf8'
);

console.log('====================================');
console.log('STORYLAND AI V20.1 FIXED');
console.log('====================================');
console.log('app.js berjaya dikemas kini.');
console.log('Backup:', backup);
console.log('Semua modul aplikasi asal dikekalkan.');
