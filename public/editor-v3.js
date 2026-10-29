
/* ======================================================
   STORYLAND AI V19.4
   SINGLE PAGE FULL WIDTH EDITOR

   FEATURES:
   - One page per navigation step
   - Full width desktop and mobile
   - Cover -> Page 1 -> Page 2
   - Previous / Next
   - Edit / Preview
   - 16 Kids Fonts
   - Font Size
   - Paper Color
   - Compatible with existing Storyland modules
   ====================================================== */

(function () {
  'use strict';

  const VERSION = '19.4';

  /* ======================================================
     FONT SETTINGS
     ====================================================== */

  const FONTS = [
    ['Nunito', 'Nunito — Bacaan Cerita'],
    ['Lexend', 'Lexend — Bacaan Jelas'],
    ['ABeeZee', 'ABeeZee — Pembaca Awal'],
    ['Comic Neue', 'Comic Neue — Gaya Komik'],
    ['Quicksand', 'Quicksand — Lembut'],
    ['Comfortaa', 'Comfortaa — Moden'],
    ['Varela Round', 'Varela Round — Bulat'],
    ['Patrick Hand', 'Patrick Hand — Tulisan Tangan'],
    ['Fredoka', 'Fredoka — Ceria'],
    ['Baloo 2', 'Baloo 2 — Kartun'],
    ['Bubblegum Sans', 'Bubblegum Sans — Bubble'],
    ['Chewy', 'Chewy — Fantasi'],
    ['Sniglet', 'Sniglet — Playful'],
    ['Georgia', 'Georgia — Klasik'],
    ['Trebuchet MS', 'Trebuchet — Moden'],
    ['Arial', 'Arial — Ringkas']
  ];

  const PAPER_COLORS = [
    ['#fffaf2', 'Krim Lembut'],
    ['#ffffff', 'Putih'],
    ['#fff1f7', 'Pink Pastel'],
    ['#f0eafa', 'Ungu Pastel'],
    ['#edf8ef', 'Hijau Pastel'],
    ['#ebf5ff', 'Biru Pastel']
  ];

  /* ======================================================
     STATE
     ====================================================== */

  // 0 = Cover
  // 1 = Halaman 1
  // 2 = Halaman 2
  // dan seterusnya.

  let currentPage = 0;
  let pages = [];

  let currentMode = 'edit';
  let currentFont = 'Nunito';
  let currentFontSize = 18;
  let currentPaper = '#fffaf2';

  let toolbar = null;
  let navigation = null;

  let prevButton = null;
  let nextButton = null;
  let counter = null;

  let modeEdit = null;
  let modePreview = null;

  let fontSelect = null;
  let sizeSelect = null;
  let paperSelect = null;

  const $ = id => document.getElementById(id);

  /* ======================================================
     BASIC HELPERS
     ====================================================== */

  function create(tag, className = '', content) {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (content !== undefined) {
      node.textContent = String(content);
    }

    return node;
  }

  function selectControl(options, value) {
    const select = create('select');

    for (const [id, name] of options) {
      const option = create('option', '', name);

      option.value = id;

      select.append(option);
    }

    select.value = value;

    return select;
  }

  function controlLabel(label, element) {
    const node = create('label', '', label);

    node.append(element);

    return node;
  }

  function validFont(value) {
    return FONTS.some(
      row => row[0] === value
    );
  }

  function fontCSS(value) {
    const name = validFont(value)
      ? value
      : 'Nunito';

    if (name === 'Georgia') {
      return 'Georgia, serif';
    }

    if (name === 'Trebuchet MS') {
      return '"Trebuchet MS", sans-serif';
    }

    if (name === 'Arial') {
      return 'Arial, sans-serif';
    }

    return `"${name}", sans-serif`;
  }

  function root() {
    return document.documentElement;
  }

  function pageContainer() {
    return $('pages');
  }

  function getCover() {
    const container = pageContainer();

    return container?.querySelector(
      ':scope > .cover-page'
    ) || null;
  }

  function getStoryPages() {
    const container = pageContainer();

    if (!container) {
      return [];
    }

    return Array.from(
      container.querySelectorAll(
        ':scope > .page'
      )
    );
  }

  /* ======================================================
     NAVIGATION STATE
     ====================================================== */

  function totalPages() {
    // Cover + number of story pages.
    return pages.length + 1;
  }

  function clampPage(value) {
    return Math.max(
      0,
      Math.min(
        Math.floor(value),
        pages.length
      )
    );
  }

  function getVisiblePageNumbers() {
    if (currentPage === 0) {
      return [];
    }

    return [currentPage];
  }

  function updateNavigation() {
    if (
      !navigation ||
      !prevButton ||
      !nextButton ||
      !counter
    ) {
      return;
    }

    prevButton.disabled =
      currentPage <= 0;

    nextButton.disabled =
      currentPage >= pages.length;

    if (currentPage === 0) {
      counter.textContent =
        `Cover • 1 / ${totalPages()}`;
    } else {
      counter.textContent =
        `Halaman ${currentPage} / ${pages.length}`;
    }

    nextButton.textContent =
      currentPage >= pages.length
        ? 'Halaman Terakhir'
        : 'Seterusnya →';

    prevButton.textContent =
      currentPage <= 0
        ? 'Cover'
        : '← Sebelumnya';
  }

  /* ======================================================
     SHOW ONLY ONE PAGE
     ====================================================== */

  function showPage() {
    const container = pageContainer();
    const cover = getCover();

    if (!container) {
      return;
    }

    currentPage = clampPage(currentPage);

    // Activate full-width mode.
    container.classList.add(
      'storyland-single-page-mode'
    );

    const showCover =
      currentPage === 0;

    if (cover) {
      cover.hidden = !showCover;

      cover.style.display =
        showCover ? 'block' : 'none';
    }

    pages.forEach((page, index) => {
      const shouldShow =
        index + 1 === currentPage;

      page.hidden = !shouldShow;

      page.style.display =
        shouldShow ? 'block' : 'none';

      page.classList.toggle(
        'storyland-page-active',
        shouldShow
      );
    });

    updateNavigation();
  }

  /* ======================================================
     REFRESH EDITOR
     ====================================================== */

  function refresh() {
    const container = pageContainer();

    if (!container) {
      return getStatus();
    }

    // Read the new DOM after app.js rerenders.
    pages = getStoryPages();

    // Preserve current page when editor rebuilds.
    currentPage = clampPage(currentPage);

    ensureNavigation();

    applyTypography(false);
    applyMode();
    showPage();

    return getStatus();
  }

  /* ======================================================
     PREVIOUS / NEXT
     ====================================================== */

  function next() {
    if (currentPage < pages.length) {
      currentPage += 1;

      showPage();
    }
  }

  function previous() {
    if (currentPage > 0) {
      currentPage -= 1;

      showPage();
    }
  }

  function goToPage(number) {
    const value = Number(number);

    if (
      !Number.isInteger(value) ||
      value < 1 ||
      value > pages.length
    ) {
      return;
    }

    currentPage = value;

    showPage();
  }

  function goToSpread(value) {
    // Compatibility for older Storyland modules.
    // One spread now equals one page.

    const requested = Number(value);

    if (!Number.isFinite(requested)) {
      return;
    }

    currentPage = clampPage(requested);

    showPage();
  }

  function goToCover() {
    currentPage = 0;

    showPage();
  }

  /* ======================================================
     TYPOGRAPHY
     ====================================================== */

  function applyTypography(notify = true) {
    root().style.setProperty(
      '--book-font',
      fontCSS(currentFont)
    );

    root().style.setProperty(
      '--book-font-size',
      `${currentFontSize}px`
    );

    root().style.setProperty(
      '--story-paper',
      currentPaper
    );

    if (fontSelect) {
      fontSelect.value = currentFont;
    }

    if (sizeSelect) {
      sizeSelect.value =
        String(currentFontSize);
    }

    if (paperSelect) {
      paperSelect.value = currentPaper;
    }

    // Prevent unnecessary autosaves on refresh.
    if (notify) {
      document.dispatchEvent(
        new CustomEvent(
          'storyland:typography-change',
          {
            detail: {
              font: currentFont,
              fontSize: currentFontSize,
              paper: currentPaper
            }
          }
        )
      );
    }
  }

  function setFont(font) {
    if (!validFont(font)) {
      return;
    }

    currentFont = font;

    applyTypography();
  }

  function setFontSize(size) {
    const value = Number(size);

    if (!Number.isFinite(value)) {
      return;
    }

    currentFontSize = Math.max(
      14,
      Math.min(
        30,
        Math.round(value)
      )
    );

    applyTypography();
  }

  function setPaperColor(value) {
    if (
      !PAPER_COLORS.some(
        item => item[0] === value
      )
    ) {
      return;
    }

    currentPaper = value;

    applyTypography();
  }

  /* ======================================================
     EDIT / PREVIEW MODE
     ====================================================== */

  function applyMode() {
    const container = pageContainer();

    if (!container) {
      return;
    }

    container.classList.toggle(
      'is-preview',
      currentMode === 'preview'
    );

    if (modeEdit) {
      modeEdit.classList.toggle(
        'active',
        currentMode === 'edit'
      );
    }

    if (modePreview) {
      modePreview.classList.toggle(
        'active',
        currentMode === 'preview'
      );
    }

    container.querySelectorAll(
      '.storybook-text-area'
    ).forEach(textarea => {
      textarea.readOnly =
        currentMode === 'preview';
    });
  }

  function setMode(mode) {
    currentMode =
      mode === 'preview'
        ? 'preview'
        : 'edit';

    applyMode();
  }

  /* ======================================================
     EDITOR TOOLBAR
     ====================================================== */

  function makeToolbar() {
    const box = create(
      'section',
      'storybook-tools'
    );

    const heading = create(
      'h3',
      'storybook-tools-title',
      '🎨 Editor Buku Cerita'
    );

    const settings = create(
      'div',
      'storybook-settings'
    );

    fontSelect = selectControl(
      FONTS,
      currentFont
    );

    sizeSelect = selectControl(
      Array.from(
        { length: 17 },
        (_, index) => {
          const size = 14 + index;

          return [
            String(size),
            `${size} px`
          ];
        }
      ),
      String(currentFontSize)
    );

    paperSelect = selectControl(
      PAPER_COLORS,
      currentPaper
    );

    fontSelect.addEventListener(
      'change',
      () => {
        setFont(fontSelect.value);
      }
    );

    sizeSelect.addEventListener(
      'change',
      () => {
        setFontSize(sizeSelect.value);
      }
    );

    paperSelect.addEventListener(
      'change',
      () => {
        setPaperColor(paperSelect.value);
      }
    );

    settings.append(
      controlLabel(
        'Jenis Font Cerita',
        fontSelect
      ),

      controlLabel(
        'Saiz Font',
        sizeSelect
      ),

      controlLabel(
        'Warna Kertas',
        paperSelect
      )
    );

    const modes = create(
      'div',
      'storybook-view-buttons'
    );

    modeEdit = create(
      'button',
      '',
      '✏️ Edit'
    );

    modePreview = create(
      'button',
      '',
      '👀 Preview'
    );

    modeEdit.type = 'button';
    modePreview.type = 'button';

    modeEdit.addEventListener(
      'click',
      () => setMode('edit')
    );

    modePreview.addEventListener(
      'click',
      () => setMode('preview')
    );

    modes.append(
      modeEdit,
      modePreview
    );

    box.append(
      heading,
      settings,
      modes
    );

    return box;
  }

  function ensureToolbar() {
    const editor = $('editor');
    const container = pageContainer();

    if (!editor || !container) {
      return;
    }

    if (!toolbar) {
      toolbar = makeToolbar();
    }

    if (!editor.contains(toolbar)) {
      editor.insertBefore(
        toolbar,
        container
      );
    }
  }

  /* ======================================================
     NAVIGATION BAR
     ====================================================== */

  function makeNavigation() {
    const bar = create(
      'div',
      'storybook-navigation'
    );

    prevButton = create(
      'button',
      'ghost',
      '← Sebelumnya'
    );

    nextButton = create(
      'button',
      'ghost',
      'Seterusnya →'
    );

    counter = create(
      'span',
      '',
      'Cover'
    );

    counter.id = 'spreadCounter';

    prevButton.type = 'button';
    nextButton.type = 'button';

    prevButton.addEventListener(
      'click',
      previous
    );

    nextButton.addEventListener(
      'click',
      next
    );

    bar.append(
      prevButton,
      counter,
      nextButton
    );

    return bar;
  }

  function ensureNavigation() {
    const editor = $('editor');
    const container = pageContainer();

    if (!editor || !container) {
      return;
    }

    if (!navigation) {
      navigation = makeNavigation();
    }

    if (!editor.contains(navigation)) {
      editor.insertBefore(
        navigation,
        container
      );
    }
  }

  /* ======================================================
     RESPONSIVE
     ====================================================== */

  window.addEventListener(
    'resize',
    () => {
      // Both desktop and mobile show one page.
      // Keep current page unchanged.
      showPage();
    }
  );

  /* ======================================================
     LOAD SAVED TYPOGRAPHY
     ====================================================== */

  document.addEventListener(
    'storyland:typography-load',
    event => {
      const data = event.detail || {};

      if (validFont(data.font)) {
        currentFont = data.font;
      }

      const size = Number(data.fontSize);

      if (Number.isFinite(size)) {
        currentFontSize = Math.max(
          14,
          Math.min(30, size)
        );
      }

      applyTypography(false);
    }
  );

  /* ======================================================
     STATUS / DEBUG
     ====================================================== */

  function getStatus() {
    return {
      version: VERSION,

      storyPages: pages.length,

      totalSpreads: totalPages(),

      currentSpread: currentPage,

      currentPage,

      visiblePages:
        getVisiblePageNumbers(),

      nextDisabled:
        currentPage >= pages.length,

      previousDisabled:
        currentPage <= 0,

      mode: currentMode,

      font: currentFont,

      fontSize: currentFontSize,

      singlePage: true
    };
  }

  /* ======================================================
     PUBLIC API
     ====================================================== */

  window.StorylandEditor = {
    version: VERSION,

    refresh,

    next,

    previous,

    goToSpread,

    goToPage,

    goToCover,

    setMode,

    setFont,

    setFontSize,

    setPaperColor,

    getStatus
  };

  /* ======================================================
     INITIALIZE
     ====================================================== */

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      refresh,
      { once: true }
    );
  } else {
    refresh();
  }

  console.log(
    'Storyland Editor V19.4 Single Page Full Width Ready'
  );

})();
