
/* ======================================================
   STORYLAND AI V20.4
   PREMIUM PDF BOOK EXPORT

   FEATURES:
   - Export A4 / A5
   - Cover penuh
   - 16 font kanak-kanak
   - Font PDF ikut Editor Buku Cerita
   - Susun atur biasa
   - Gambar penuh + teks atas
   - Gambar penuh + teks tengah
   - Gambar penuh + teks bawah
   - Nombor halaman
   - Halaman pengajaran
   - Tiada CSS tercetak sebagai teks
   - Tiada halaman tambahan akibat CSS
   ====================================================== */

(function () {
  'use strict';

  /* ==========================================
     GOOGLE FONTS
     ========================================== */

  const FONT_URL =
    'https://fonts.googleapis.com/css2?' +
    'family=ABeeZee&' +
    'family=Baloo+2:wght@400;500;600;700;800&' +
    'family=Bubblegum+Sans&' +
    'family=Chewy&' +
    'family=Comic+Neue:wght@400;700&' +
    'family=Comfortaa:wght@400;500;600;700&' +
    'family=Fredoka:wght@400;500;600;700&' +
    'family=Lexend:wght@400;500;600;700&' +
    'family=Nunito:wght@400;500;600;700;800;900&' +
    'family=Patrick+Hand&' +
    'family=Quicksand:wght@400;500;600;700&' +
    'family=Sniglet:wght@400;800&' +
    'family=Varela+Round&display=swap';

  const FONTS = [
    'Fredoka',
    'Baloo 2',
    'Bubblegum Sans',
    'Chewy',
    'Sniglet',
    'Comic Neue',
    'Comfortaa',
    'Quicksand',
    'Nunito',
    'Lexend',
    'ABeeZee',
    'Patrick Hand',
    'Varela Round',
    'Georgia',
    'Trebuchet MS',
    'Arial'
  ];

  const COLORS = [
    '#ffffff',
    '#fff4d8',
    '#3b2855',
    '#261e37',
    '#ffe6f3',
    '#fff0a8'
  ];

  /* ==========================================
     PAGE THEMES
     ========================================== */

  const THEMES = {
    fantasy: {
      background: '#f6edff',
      ink: '#624181',
      border: '#d8b9ed'
    },

    garden: {
      background: '#edf9ef',
      ink: '#376c52',
      border: '#bde7c7'
    },

    royal: {
      background: '#fff4db',
      ink: '#795c2c',
      border: '#edcf9c'
    },

    sky: {
      background: '#eaf5ff',
      ink: '#3b658f',
      border: '#b7ddf5'
    }
  };

  const VALID_LAYOUTS = [
    'top',
    'bottom',
    'side',
    'left',
    'right',
    'full-top',
    'full-center',
    'full-bottom'
  ];

  const FULL_LAYOUTS = [
    'full-top',
    'full-center',
    'full-bottom'
  ];

  /* ==========================================
     HELPERS
     ========================================== */

  function pick(value, options, fallback) {
    return options.includes(value)
      ? value
      : fallback;
  }

  function bounded(value, min, max, fallback) {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return fallback;
    }

    const n = Number(value);

    if (!Number.isFinite(n)) {
      return fallback;
    }

    return Math.max(
      min,
      Math.min(max, n)
    );
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]
    );
  }

  function fontFamily(value) {
    const selected = pick(
      value,
      FONTS,
      'Nunito'
    );

    if (selected === 'Georgia') {
      return 'Georgia, serif';
    }

    if (selected === 'Trebuchet MS') {
      return '"Trebuchet MS", sans-serif';
    }

    if (selected === 'Arial') {
      return 'Arial, sans-serif';
    }

    return `"${selected}", sans-serif`;
  }

  function safeImage(url) {
    if (typeof url !== 'string') {
      return '';
    }

    const value = url.trim();

    // Gambar daripada server aplikasi sendiri.
    // Termasuk imej cover dan imej halaman.

    if (
      !/^\/generated\/[a-f0-9-]+\/(?:characters\/)?[a-z0-9-]+\.(png|jpg|jpeg|webp)$/i.test(value)
    ) {
      return '';
    }

    return window.location.origin + value;
  }

  function getPaper(size) {
    return String(size).toUpperCase() === 'A5'
      ? 'A5'
      : 'A4';
  }

  function getPaperDimensions(paper) {
    if (paper === 'A5') {
      return {
        width: '148mm',
        height: '210mm'
      };
    }

    return {
      width: '210mm',
      height: '297mm'
    };
  }

  /* ==========================================
     TYPOGRAPHY

     FONT PDF MENGIKUT PILIHAN EDITOR
     ========================================== */

  function getTypography(story) {
    const font = fontFamily(
      story.readingFont || 'Nunito'
    );

    const size = bounded(
      story.readingFontSize,
      14,
      30,
      18
    );

    return {
      font,
      size,
      cssSize: `${size}px`
    };
  }

  /* ==========================================
     COVER DESIGN
     ========================================== */

  function coverStyleForPrint(story) {
    const input = story.coverDesign || {};

    const template = pick(
      input.template,
      [
        'fantasy',
        'pastel',
        'modern',
        'royal',
        'night',
        'minimal'
      ],
      'fantasy'
    );

    const font = pick(
      input.font,
      FONTS,
      'Fredoka'
    );

    const align = pick(
      input.align,
      ['left', 'center', 'right'],
      'center'
    );

    const position = pick(
      input.position,
      ['top', 'middle', 'bottom'],
      'bottom'
    );

    const color = pick(
      input.titleColor,
      COLORS,
      '#ffffff'
    );

    const size = bounded(
      input.titleSize,
      22,
      60,
      36
    );

    const overlay = bounded(
      input.overlay,
      0,
      85,
      65
    );

    const tones = {
      fantasy: [42, 22, 75],
      pastel: [78, 40, 80],
      modern: [19, 38, 68],
      royal: [70, 42, 20],
      night: [13, 18, 57],
      minimal: [40, 40, 48]
    };

    const borders = {
      fantasy: '5px solid white',
      pastel: '7px solid #ffe5f3',
      modern: '3px solid white',
      royal: '8px double #e1bb65',
      night: '5px solid #b8a1ed',
      minimal: '2px solid white'
    };

    const [r, g, b] = tones[template];

    const alpha = overlay / 100;

    const flexPosition = {
      top: 'flex-start',
      middle: 'center',
      bottom: 'flex-end'
    }[position];

    const flexAlign = {
      left: 'flex-start',
      center: 'center',
      right: 'flex-end'
    }[align];

    return {
      border: borders[template],

      title: [
        `font-family:${fontFamily(font)}`,
        `font-size:${size}px`,
        `color:${color}`,
        `text-align:${align}`
      ].join(';'),

      overlay: [
        'display:flex',
        'flex-direction:column',
        `justify-content:${flexPosition}`,
        `align-items:${flexAlign}`,
        `text-align:${align}`,
        'background:linear-gradient(180deg,' +
          `rgba(${r},${g},${b},${Math.min(alpha * 0.25, 0.2)}) 0%,` +
          `rgba(${r},${g},${b},${Math.min(alpha * 0.65, 0.6)}) 48%,` +
          `rgba(${r},${g},${b},${alpha}) 100%)`
      ].join(';')
    };
  }

  /* ==========================================
     COVER PAGE
     ========================================== */

  function coverPage(story) {
    const cover = coverStyleForPrint(story);

    const image = safeImage(
      story.coverImageUrl
    );

    return `
      <section class="print-sheet book-cover">

        <div class="cover-art"
             style="border:${cover.border}">

          ${
            image
              ? `
                <img
                  class="cover-photo"
                  src="${escapeHTML(image)}"
                  alt="Cover Buku"
                >
              `
              : `
                <div class="cover-placeholder">
                  ✨ 📖 🏰
                </div>
              `
          }

          <div
            class="cover-content"
            style="${cover.overlay}"
          >

            <div class="cover-ribbon">
              CERITA KANAK-KANAK
            </div>

            <h1
              class="cover-book-title"
              style="${cover.title}"
            >
              ${escapeHTML(story.title || 'Cerita Baharu')}
            </h1>

            <p class="cover-book-subtitle">
              ${escapeHTML(story.coverSubtitle || '')}
            </p>

            <p class="cover-book-author">
              Oleh ${escapeHTML(story.coverAuthor || 'Storyland AI')}
            </p>

          </div>

        </div>

      </section>
    `;
  }

  /* ==========================================
     FULL PAGE IMAGE

     GAMBAR PENUH + TEKS OVERLAY
     ========================================== */

  function fullImagePage(
    page,
    index,
    story,
    layout
  ) {
    const image = safeImage(page.imageUrl);

    const typography = getTypography(story);

    const position = layout.replace(
      'full-',
      ''
    );

    return `
      <section
        class="print-sheet full-story-sheet position-${position}"
      >

        <div class="full-story-background">

          ${
            image
              ? `
                <img
                  class="full-story-image"
                  src="${escapeHTML(image)}"
                  alt="Ilustrasi halaman ${index + 1}"
                >
              `
              : `
                <div class="full-story-placeholder">
                  🖼️ Ilustrasi belum tersedia
                </div>
              `
          }

        </div>

        <div class="full-story-text-box">

          <p
            class="full-story-text"
            style="
              font-family:${typography.font};
              font-size:${typography.cssSize};
            "
          >${escapeHTML(page.text || '')}</p>

        </div>

        <div class="full-story-page-number">
          ${index + 1}
        </div>

      </section>
    `;
  }

  /* ==========================================
     NORMAL STORY PAGE
     ========================================== */

  function normalStoryPage(
    page,
    index,
    story,
    layout,
    paper
  ) {
    const themeName = pick(
      page.theme,
      Object.keys(THEMES),
      'fantasy'
    );

    const theme = THEMES[themeName];

    const decoration =
      page.decoration === 'minimal'
        ? 'minimal'
        : 'frame';

    const image = safeImage(page.imageUrl);

    const typography = getTypography(story);

    const align = pick(
      page.imageAlign,
      ['left', 'center', 'right'],
      'center'
    );

    const scale = bounded(
      page.imageScale,
      40,
      100,
      100
    );

    const imageHTML = `
      <div
        class="page-artwork"
        style="
          width:${scale}%;
          margin-left:${align === 'left' ? '0' : 'auto'};
          margin-right:${align === 'right' ? '0' : 'auto'};
        "
      >
        ${
          image
            ? `
              <img
                src="${escapeHTML(image)}"
                alt="Ilustrasi halaman ${index + 1}"
              >
            `
            : `
              <div class="missing-image">
                🖼️ Ilustrasi belum tersedia
              </div>
            `
        }
      </div>
    `;

    const textHTML = `
      <div class="page-story">

        <p
          class="story-print-text"
          style="
            font-family:${typography.font};
            font-size:${typography.cssSize};
          "
        >${escapeHTML(page.text || '')}</p>

      </div>
    `;

    let inside;

    if (layout === 'bottom') {
      inside = textHTML + imageHTML;

    } else if (layout === 'right') {
      inside = textHTML + imageHTML;

    } else {
      inside = imageHTML + textHTML;
    }

    const cssLayout =
      layout === 'left' ||
      layout === 'right'
        ? 'side'
        : layout;

    return `
      <section
        class="
          print-sheet
          story-sheet
          theme-${themeName}
          decoration-${decoration}
        "
      >

        <div
          class="story-sheet-inner"
          style="
            background:${theme.background};
            color:${theme.ink};
            border-color:${theme.border};
          "
        >

          <div
            class="story-content layout-${cssLayout}"
          >
            ${inside}
          </div>

          <div class="story-footer">
            ${escapeHTML(story.title || 'Storyland AI')}
          </div>

          <div class="story-number">
            HALAMAN ${index + 1}
          </div>

        </div>

      </section>
    `;
  }

  /* ==========================================
     STORY PAGE ROUTER

     PILIH FULL IMAGE ATAU NORMAL
     ========================================== */

  function storyPage(
    page,
    index,
    story,
    paper = 'A4'
  ) {
    if (!page) {
      throw new Error(
        `Data halaman ${index + 1} tidak sah.`
      );
    }

    const layout = pick(
      page.layout,
      VALID_LAYOUTS,
      'side'
    );

    if (FULL_LAYOUTS.includes(layout)) {
      return fullImagePage(
        page,
        index,
        story,
        layout
      );
    }

    return normalStoryPage(
      page,
      index,
      story,
      layout,
      paper
    );
  }

  /* ==========================================
     LAST PAGE — PENGAJARAN
     ========================================== */

  function lastPage(story) {
    return `
      <section class="print-sheet moral-sheet">

        <div class="moral-content">

          <div class="moral-emoji">
            🌟
          </div>

          <h2>
            Pengajaran Cerita
          </h2>

          <p>
            ${escapeHTML(
              story.moral ||
              'Setiap pengembaraan membawa satu pengajaran.'
            )}
          </p>

          <div class="moral-end">
            Tamat · Storyland AI
          </div>

        </div>

      </section>
    `;
  }

  /* ==========================================
     BUILD FULL HTML DOCUMENT
     ========================================== */

  function buildDocument(
    story,
    size = 'A4'
  ) {
    if (
      !story ||
      !Array.isArray(story.pages)
    ) {
      throw new Error(
        'Data buku tidak sah.'
      );
    }

    const paper = getPaper(size);

    const dimensions =
      getPaperDimensions(paper);

    const pages = story.pages
      .map((page, index) =>
        storyPage(
          page,
          index,
          story,
          paper
        )
      )
      .join('\n');

    /* ========================================
       ALL CSS IS INSIDE <style>
       ======================================== */

    return `<!doctype html>
<html lang="ms">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>${escapeHTML(story.title || 'Storyland AI')}</title>

<link
  rel="stylesheet"
  href="${escapeHTML(FONT_URL)}"
>

<style>

/* ==========================================
   PAGE SETUP
   ========================================== */

@page {
  size: ${paper} portrait;
  margin: 0;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;

  width: 100%;

  background: white;

  font-family: "Nunito", sans-serif;

  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

body {
  color: #4f4266;
}

/* ==========================================
   ALL PRINT SHEETS
   ========================================== */

.print-sheet {
  position: relative;

  width: ${dimensions.width};
  height: ${dimensions.height};

  min-width: ${dimensions.width};
  min-height: ${dimensions.height};

  max-width: ${dimensions.width};
  max-height: ${dimensions.height};

  overflow: hidden;

  margin: 0;
  padding: 0;

  break-after: page;
  page-break-after: always;
}

.print-sheet:last-child {
  break-after: auto;
  page-break-after: auto;
}

/* ==========================================
   COVER
   ========================================== */

.book-cover {
  background: #e8d6fa;
}

.cover-art {
  position: relative;

  width: 100%;
  height: 100%;

  overflow: hidden;

  background: linear-gradient(
    145deg,
    #b7e5ff,
    #c9b5f5,
    #fbc8e2
  );
}

.cover-photo {
  position: absolute;

  inset: 0;

  display: block;

  width: 100%;
  height: 100%;

  object-fit: cover;
}

.cover-placeholder {
  display: grid;
  place-items: center;

  width: 100%;
  height: 100%;

  font-size: 75px;
}

.cover-content {
  position: absolute;

  inset: 0;

  padding: 12%;
  gap: 12px;

  color: white;
}

.cover-ribbon {
  max-width: 100%;

  padding: 8px 15px;

  border-radius: 99px;

  background: #ffe49a;
  color: #815c25;

  font-family: "Fredoka", sans-serif;
  font-size: 12px;
  font-weight: 700;

  letter-spacing: 0.5px;
}

.cover-book-title {
  max-width: 100%;

  margin: 0;

  line-height: 1.15;

  overflow-wrap: anywhere;

  text-wrap: balance;

  text-shadow: 0 3px 10px #28193a55;
}

.cover-book-subtitle,
.cover-book-author {
  max-width: 100%;

  margin: 0;

  color: #fff8ff;

  font-size: 13px;

  text-shadow: 0 2px 5px #24122d66;
}

/* ==========================================
   NORMAL STORY PAGES
   ========================================== */

.story-sheet {
  padding: ${paper === 'A5' ? '12mm' : '17mm'};

  background: white;
}

.story-sheet-inner {
  display: flex;
  flex-direction: column;

  width: 100%;
  height: 100%;

  min-height: 0;

  padding: ${paper === 'A5' ? '10mm' : '15mm'};

  border: 3px solid transparent;
  border-radius: 12px;
}

.decoration-minimal .story-sheet-inner {
  border-color: transparent !important;
}

.story-content {
  display: flex;
  flex: 1;

  min-height: 0;

  flex-direction: column;

  align-items: stretch;
  justify-content: center;

  gap: 16px;

  padding: 15px 0;
}

/* Gambar sebelah teks */

.story-content.layout-side {
  display: grid;

  grid-template-columns:
    minmax(0, 1fr)
    minmax(0, 1fr);

  align-items: center;

  gap: 16px;
}

/* Gambar atas / bawah */

.story-content.layout-top,
.story-content.layout-bottom {
  flex-direction: column;
}

/* ==========================================
   NORMAL IMAGE
   ========================================== */

.page-artwork {
  min-width: 0;
  max-width: 100%;
}

.page-artwork img {
  display: block;

  width: 100%;

  max-height: ${paper === 'A5' ? '105mm' : '160mm'};

  object-fit: contain;

  border-radius: 12px;
}

.layout-side .page-artwork img {
  max-height: ${paper === 'A5' ? '125mm' : '190mm'};
}

.missing-image {
  display: grid;
  place-items: center;

  min-height: 80px;

  padding: 15px;

  background: white;

  border: 2px dashed #d9c6e8;
  border-radius: 12px;

  font-size: 12px;
  text-align: center;
}

/* ==========================================
   NORMAL STORY TEXT
   ========================================== */

.page-story {
  width: 100%;
  min-width: 0;

  align-self: center;

  overflow-wrap: anywhere;
}

.story-print-text {
  margin: 0;

  line-height: 1.4;
  font-weight: 700;

  text-align: center;

  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Saiz font ditentukan oleh inline style
   berdasarkan pilihan di editor. */

/* ==========================================
   NORMAL FOOTER
   ========================================== */

.story-footer {
  margin-bottom: 4px;

  font-size: 9pt;

  text-align: center;

  opacity: 0.65;
}

.story-number {
  width: 100%;

  margin-top: 0;
  padding-top: 8px;

  font-family: "Fredoka", sans-serif;

  font-size: 13pt;
  font-weight: 700;

  letter-spacing: 0.5px;

  text-align: center;

  opacity: 0.85;
}

/* ==========================================
   V20.4 FULL PAGE IMAGE
   ========================================== */

.full-story-sheet {
  position: relative;

  padding: 0 !important;
  margin: 0 !important;

  overflow: hidden;

  background: #f3eaff;
}

/* Gambar memenuhi satu halaman */

.full-story-background {
  position: absolute;

  inset: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;
}

.full-story-image {
  display: block;

  width: 100%;
  height: 100%;

  max-width: none;
  max-height: none;

  object-fit: cover;
  object-position: center;
}

.full-story-placeholder {
  display: grid;
  place-items: center;

  width: 100%;
  height: 100%;

  background: #f3eaff;

  color: #7658a5;
  font-size: 20px;
}

/* ==========================================
   TEXT OVERLAY ON IMAGE
   ========================================== */

.full-story-text-box {
  position: absolute;

  z-index: 2;

  left: 7%;
  right: 7%;

  width: 86%;

  padding: ${paper === 'A5' ? '12px 15px' : '18px 22px'};

  border-radius: 16px;

  background: rgba(
    255,
    255,
    255,
    0.86
  );

  color: #37274f;

  text-align: center;

  overflow-wrap: anywhere;
}

.full-story-text {
  margin: 0;

  font-weight: 700;
  line-height: 1.4;

  text-align: center;

  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ==========================================
   POSITION: TOP
   ========================================== */

.full-story-sheet.position-top
.full-story-text-box {
  top: 7%;
}

/* ==========================================
   POSITION: CENTER
   ========================================== */

.full-story-sheet.position-center
.full-story-text-box {
  top: 50%;

  transform: translateY(-50%);
}

/* ==========================================
   POSITION: BOTTOM
   ========================================== */

.full-story-sheet.position-bottom
.full-story-text-box {
  bottom: 9%;
}

/* ==========================================
   FULL PAGE NUMBER
   ========================================== */

.full-story-page-number {
  position: absolute;

  z-index: 3;

  bottom: 3%;
  left: 50%;

  transform: translateX(-50%);

  padding: 5px 12px;

  border-radius: 30px;

  background: rgba(
    255,
    255,
    255,
    0.85
  );

  color: #4b356b;

  font-family: "Nunito", sans-serif;

  font-size: 11pt;
  font-weight: 700;
}

/* ==========================================
   MORAL / PENGAJARAN
   ========================================== */

.moral-sheet {
  display: grid;
  place-items: center;

  padding: 20mm;

  background: linear-gradient(
    155deg,
    #d9edff,
    #eddbff,
    #fff0f9
  );

  text-align: center;
}

.moral-content {
  max-width: 540px;

  padding: 25px;
}

.moral-emoji {
  font-size: 60px;
}

.moral-content h2 {
  font-family: "Fredoka", sans-serif;

  color: #704c9a;

  font-size: 32px;
}

.moral-content p {
  font-family: "Nunito", sans-serif;

  font-size: 20px;
  line-height: 1.7;
}

.moral-end {
  margin-top: 35px;

  font-family: "Fredoka", sans-serif;

  color: #946bb5;
}

/* ==========================================
   SCREEN PREVIEW
   ========================================== */

@media screen {
  body {
    background: #e2d9ea;
    padding: 20px;
  }

  .print-sheet {
    margin: 0 auto 20px;

    box-shadow:
      0 8px 28px #483d591f;
  }
}

/* ==========================================
   PRINT MODE
   ========================================== */

@media print {
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;

    background: white;
  }

  .print-sheet {
    margin: 0 !important;

    box-shadow: none !important;

    break-inside: avoid;
    page-break-inside: avoid;
  }

  .full-story-sheet {
    padding: 0 !important;
  }

  .full-story-image {
    width: 100%;
    height: 100%;

    object-fit: cover;
  }
}

</style>

</head>

<body>

${coverPage(story)}

${pages}

${lastPage(story)}

</body>

</html>`;
  }

  /* ==========================================
     WAIT FOR FONTS AND IMAGES
     ========================================== */

  async function waitForAssets(
    win,
    timeoutMs = 15000
  ) {
    const ready = (async () => {
      if (win.document.fonts?.ready) {
        await win.document.fonts.ready;
      }

      const images = [
        ...win.document.querySelectorAll('img')
      ];

      await Promise.all(
        images.map(img => {
          if (img.complete) {
            return Promise.resolve();
          }

          return new Promise(resolve => {
            img.addEventListener(
              'load',
              resolve,
              { once: true }
            );

            img.addEventListener(
              'error',
              resolve,
              { once: true }
            );
          });
        })
      );
    })();

    let timeoutId;

    const timeout = new Promise(resolve => {
      timeoutId = setTimeout(
        resolve,
        timeoutMs
      );
    });

    try {
      await Promise.race([
        ready,
        timeout
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ==========================================
     EXPORT PDF
     ========================================== */

  async function printBook(
    story,
    size = 'A4'
  ) {
    let printable;

    try {
      printable = buildDocument(
        story,
        size
      );
    } catch (error) {
      console.error(
        '[Storyland PDF]',
        error
      );

      window.alert(
        'Gagal menyediakan PDF: ' +
        error.message
      );

      return;
    }

    const popup = window.open(
      '',
      '_blank',
      'width=1050,height=850'
    );

    if (!popup) {
      window.alert(
        'Browser menyekat pop-up. ' +
        'Benarkan pop-up untuk eksport PDF.'
      );

      return;
    }

    popup.document.open();

    popup.document.write(
      printable
    );

    popup.document.close();

    try {
      await waitForAssets(popup);

      if (!popup.closed) {
        popup.focus();
        popup.print();
      }

    } catch (error) {
      console.error(
        '[Storyland PDF]',
        error
      );

      if (!popup.closed) {
        popup.focus();
        popup.print();
      }
    }
  }

  /* ==========================================
     DEBUG
     ========================================== */

  function debugPrint(story, size = 'A4') {
    const paper = getPaper(size);

    const typography = getTypography(
      story
    );

    const layoutCounts = {};

    for (const page of story.pages || []) {
      const layout = page.layout || 'side';

      layoutCounts[layout] =
        (layoutCounts[layout] || 0) + 1;
    }

    const result = {
      version: '20.4',
      paper,
      font: typography.font,
      fontSize: typography.cssSize,
      storyPages: story.pages?.length || 0,
      expectedPdfPages:
        (story.pages?.length || 0) + 2,
      layoutCounts
    };

    console.log(
      '[Storyland PDF Debug]',
      result
    );

    return result;
  }

  /* ==========================================
     PUBLIC API
     ========================================== */

  window.StorylandPrint = {
    version: '20.4',

    printBook,
    buildDocument,
    coverStyleForPrint,
    debugPrint,

    availableFonts: [...FONTS],

    supportedLayouts: [
      ...VALID_LAYOUTS
    ]
  };

  console.log(
    '✅ Storyland Print Book V20.4 loaded'
  );

})();
