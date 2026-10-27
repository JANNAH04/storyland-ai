
/* ==============================================
   STORYLAND AI — APP V12
   Dashboard + Editor + AutoSave + PDF
   ============================================== */

const $ = id => document.getElementById(id);

let selected = null;

const MAX_WORDS = 35;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const LAYOUTS = [
  ['top', '🖼️ Gambar Atas'],
  ['bottom', '📄 Gambar Bawah'],
  ['side', '📖 Gambar Sebelah Teks']
];

const THEMES = [
  ['fantasy', '✨ Dunia Fantasi'],
  ['garden', '🌸 Taman Ceria'],
  ['royal', '🏰 Istana Emas'],
  ['sky', '☁️ Langit Ajaib']
];

const DECORATIONS = [
  ['frame', '🖼️ Bingkai Cantik'],
  ['minimal', '📄 Minimal']
];

const ALIGNMENTS = [
  ['left', '⬅️ Kiri'],
  ['center', '↔️ Tengah'],
  ['right', '➡️ Kanan']
];

const SCALES = [40, 50, 60, 70, 80, 90, 100];

function el(tag, className = '', value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function message(value) {
  if ($('message')) $('message').textContent = value;
}

function words(value) {
  const text = String(value || '').trim();
  return text ? text.split(/\s+/u).length : 0;
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function safeChoice(value, options, fallback) {
  return options.some(item => item[0] === value)
    ? value
    : fallback;
}

function normalizeStory(story) {
  story.coverImageUrl ??= null;
  story.coverAuthor ??= 'Storyland AI';
  story.coverSubtitle ??=
    'Sebuah cerita penuh imaginasi dan pengajaran';

  story.pages = (story.pages || []).map(page => ({
    ...page,
    imageUrl: page.imageUrl || null,
    text: page.text || '',
    layout: safeChoice(page.layout, LAYOUTS, 'side'),
    theme: safeChoice(page.theme, THEMES, 'fantasy'),
    decoration: safeChoice(
      page.decoration, DECORATIONS, 'frame'
    ),
    imageScale: SCALES.includes(Number(page.imageScale))
      ? Number(page.imageScale)
      : 100,
    imageAlign: safeChoice(
      page.imageAlign, ALIGNMENTS, 'center'
    )
  }));

  return story;
}

function selectControl(options, current, onChange) {
  const select = el('select');

  options.forEach(([value, label]) => {
    const option = el('option', '', label);
    option.value = value;
    select.append(option);
  });

  select.value = current;
  select.addEventListener('change', () => {
    onChange(select.value);
  });

  return select;
}

function labeledControl(title, control, className = '') {
  const label = el('label', className, title);
  label.append(control);
  return label;
}

/* =====================================
   UPLOAD IMAGE
   ===================================== */

async function uploadImage(bookId, target, file, status) {
  if (
    !file ||
    !['image/jpeg', 'image/png', 'image/webp']
      .includes(file.type)
  ) {
    throw new Error('Gunakan JPG, PNG atau WebP.');
  }

  if (file.size === 0 || file.size > MAX_IMAGE_SIZE) {
    throw new Error('Gambar maksimum 8MB.');
  }

  status.textContent = '⏳ Menyimpan gambar...';

  const result = await api(
    `/api/books/${encodeURIComponent(bookId)}` +
    `/images/${encodeURIComponent(target)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file
    }
  );

  status.textContent = '✅ Gambar disimpan.';
  return result.imageUrl;
}

function uploadControl(bookId, target, labelText, onUploaded) {
  const container = el('div', 'manual-upload-label');
  const label = el('label', '', labelText);
  const input = el('input', 'manual-image-input');

  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';

  const status = el('p', 'image-status');
  status.setAttribute('role', 'status');

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    input.disabled = true;

    try {
      const url = await uploadImage(
        bookId, target, file, status
      );
      onUploaded(url);
    } catch (error) {
      status.textContent = '❌ ' + error.message;
    } finally {
      input.disabled = false;
      input.value = '';
    }
  });

  label.append(input);
  container.append(label, status);
  return container;
}

/* =====================================
   DASHBOARD LIBRARY
   ===================================== */

async function loadLibrary() {
  try {
    const books = await api('/api/books');

    if (window.StorylandDashboard?.render) {
      window.StorylandDashboard.render(books);
      return;
    }

    const library = $('library');
    library.replaceChildren();

    books.forEach(book => {
      const button = el('button', 'book');
      button.type = 'button';
      button.append(
        el('strong', '', '📖 ' + book.title),
        el('small', '', book.language || '')
      );
      button.onclick = () => openBook(book.id);
      library.append(button);
    });

  } catch (error) {
    message('❌ ' + error.message);
  }
}

window.StorylandReloadLibrary = loadLibrary;

/* =====================================
   OPEN BOOK + AUTOSAVE
   ===================================== */

async function openBook(id) {
  try {
    const book = await api(
      '/api/books/' + encodeURIComponent(id)
    );

    selected = {
      ...book,
      pages: normalizeStory(book.pages)
    };

    window.StorylandAutosave?.attach(selected);
    renderEditor();
  } catch (error) {
    message('❌ ' + error.message);
  }
}

window.StorylandOpenBook = openBook;

/* =====================================
   PREMIUM COVER
   ===================================== */

function makeCover() {
  const story = selected.pages;
  const section = el('section', 'cover-page premium-cover-page');
  const shell = el('div', 'premium-cover-shell');
  const bookCover = el('div', 'premium-book-cover');
  const visual = el('div', 'premium-cover-visual');
  const overlay = el('div', 'premium-cover-overlay');

  const ribbon = el(
    'div', 'premium-cover-ribbon', 'CERITA KANAK-KANAK'
  );
  const title = el(
    'h3', 'premium-cover-title', story.title
  );
  const subtitle = el(
    'p', 'premium-cover-subtitle', story.coverSubtitle
  );
  const author = el(
    'div',
    'premium-cover-author',
    'Oleh ' + story.coverAuthor
  );

  function updateCover() {
    visual.replaceChildren();

    if (story.coverImageUrl) {
      const img = el('img');
      img.src = story.coverImageUrl;
      img.alt = 'Cover ' + story.title;
      visual.append(img);
    } else {
      visual.append(
        el('div', 'premium-placeholder', '📘 Upload Gambar Cover')
      );
    }

    overlay.replaceChildren(
      ribbon, title, subtitle, author
    );
    visual.append(overlay);
  }

  const panel = el('div', 'premium-cover-side-panel');

  panel.append(
    el('div', 'cover-badge', '✨ PREMIUM COVER'),
    el('h4', 'premium-side-title', 'Reka Cover Buku Anda')
  );

  const authorInput = el('input');
  authorInput.type = 'text';
  authorInput.maxLength = 100;
  authorInput.value = story.coverAuthor;

  authorInput.addEventListener('input', () => {
    story.coverAuthor = authorInput.value;
    author.textContent = 'Oleh ' + authorInput.value;
  });

  const subtitleInput = el('input');
  subtitleInput.type = 'text';
  subtitleInput.maxLength = 200;
  subtitleInput.value = story.coverSubtitle;

  subtitleInput.addEventListener('input', () => {
    story.coverSubtitle = subtitleInput.value;
    subtitle.textContent = subtitleInput.value;
  });

  panel.append(
    labeledControl('✍️ Nama Penulis', authorInput),
    labeledControl('💖 Subtitle Buku', subtitleInput),
    uploadControl(
      selected.id,
      'cover',
      '📤 Upload Gambar Cover',
      url => {
        story.coverImageUrl = url;
        updateCover();
      }
    )
  );

  updateCover();
  bookCover.append(visual);
  shell.append(bookCover, panel);
  section.append(shell);

  return section;
}

/* =====================================
   STORY PAGE EDITOR
   ===================================== */

function makeStoryPage(page, index) {
  const section = el('section', 'page');
  const number = page.number || index + 1;

  section.dataset.layout = page.layout;
  section.dataset.theme = page.theme;
  section.dataset.decoration = page.decoration;
  section.dataset.imageAlign = page.imageAlign;

  section.style.setProperty(
    '--page-image-scale',
    page.imageScale + '%'
  );

  const pageNumber = el(
    'b', '', '📖 HALAMAN ' + (index + 1)
  );

  const designPanel = el('div', 'page-design-panel');
  designPanel.append(
    el('h3', '', '🎨 Tema & Hiasan Halaman'),
    labeledControl(
      'Tema Warna',
      selectControl(THEMES, page.theme, value => {
        page.theme = value;
        section.dataset.theme = value;
      })
    ),
    labeledControl(
      'Hiasan Halaman',
      selectControl(
        DECORATIONS,
        page.decoration,
        value => {
          page.decoration = value;
          section.dataset.decoration = value;
        }
      )
    )
  );

  const layoutSelect = selectControl(
    LAYOUTS,
    page.layout,
    value => {
      page.layout = value;
      section.dataset.layout = value;
    }
  );
  layoutSelect.className = 'page-layout-select';

  const layoutLabel = labeledControl(
    '📖 Susun Atur Halaman',
    layoutSelect,
    'page-layout-label'
  );

  const pageBody = el('div', 'storybook-page-body');
  const illustration = el(
    'div', 'story-illustration storybook-image-area'
  );

  const imageArea = el('div', 'story-image-preview');

  function showImage() {
    imageArea.replaceChildren();

    if (page.imageUrl) {
      const img = el('img');
      img.src = page.imageUrl;
      img.alt = 'Ilustrasi halaman ' + number;
      img.loading = 'lazy';
      imageArea.append(img);
    } else {
      imageArea.append(
        el('div', 'illustration-empty', '🖼️ Belum ada gambar')
      );
    }
  }

  showImage();

  illustration.append(
    imageArea,
    uploadControl(
      selected.id,
      number,
      '📤 Upload Gambar Halaman ' + number,
      url => {
        page.imageUrl = url;
        showImage();
      }
    )
  );

  const textBox = el('div', 'storybook-text-box');
  const textarea = el('textarea', 'storybook-text-area');
  textarea.value = page.text;
  textarea.setAttribute(
    'aria-label',
    'Teks cerita halaman ' + number
  );

  const counter = el('div', 'word-counter');

  function updateCounter() {
    const count = words(textarea.value);
    counter.textContent = `${count} / ${MAX_WORDS} perkataan`;
    if (count > MAX_WORDS) {
      counter.textContent +=
        ` — Terlebih ${count - MAX_WORDS}!`;
    }
    counter.classList.toggle(
      'word-limit-exceeded',
      count > MAX_WORDS
    );
  }

  textarea.addEventListener('input', () => {
    page.text = textarea.value;
    updateCounter();
  });

  updateCounter();
  textBox.append(textarea, counter);
  pageBody.append(illustration, textBox);

  /* Image size, alignment and drag controls */

  const visualTools = el('div', 'visual-editor-tools');

  visualTools.append(
    el('div', 'visual-tools-heading', '🪄 Susun Gambar & Teks')
  );

  const slider = el('input');
  slider.type = 'range';
  slider.min = '40';
  slider.max = '100';
  slider.step = '10';
  slider.value = String(page.imageScale);

  const sizeValue = el(
    'span', 'image-size-value', `${page.imageScale}%`
  );

  slider.addEventListener('input', () => {
    page.imageScale = Number(slider.value);
    sizeValue.textContent = page.imageScale + '%';
    section.style.setProperty(
      '--page-image-scale',
      page.imageScale + '%'
    );
  });

  const alignSelect = selectControl(
    ALIGNMENTS,
    page.imageAlign,
    value => {
      page.imageAlign = value;
      section.dataset.imageAlign = value;
    }
  );

  visualTools.append(
    labeledControl('📐 Saiz Gambar', slider),
    sizeValue,
    labeledControl('↔️ Penjajaran Gambar', alignSelect)
  );

  const dragHelp = el(
    'p', 'drag-help',
    '🖱️ Seret label Gambar atau Teks untuk menukar susunan.'
  );

  const dragRow = el('div', 'drag-tool-row');
  const imageHandle = el('div', 'drag-handle', '🖼️ Gambar');
  const textHandle = el('div', 'drag-handle', '📝 Teks');

  imageHandle.draggable = true;
  textHandle.draggable = true;

  let dragged = null;

  imageHandle.addEventListener('dragstart', event => {
    dragged = 'image';
    event.dataTransfer.setData('text/plain', 'image');
  });

  textHandle.addEventListener('dragstart', event => {
    dragged = 'text';
    event.dataTransfer.setData('text/plain', 'text');
  });

  const changeLayout = value => {
    page.layout = value;
    layoutSelect.value = value;
    section.dataset.layout = value;

    // Inform Auto-Save of drag-only changes.
    layoutSelect.dispatchEvent(
      new Event('change', { bubbles: true })
    );
  };

  [imageHandle, textHandle].forEach(handle => {
    handle.addEventListener('dragover', event => {
      if (dragged) event.preventDefault();
    });

    handle.addEventListener('dragend', () => {
      dragged = null;
    });
  });

  imageHandle.addEventListener('drop', event => {
    event.preventDefault();
    if (dragged === 'text') changeLayout('top');
    dragged = null;
  });

  textHandle.addEventListener('drop', event => {
    event.preventDefault();
    if (dragged === 'image') changeLayout('bottom');
    dragged = null;
  });

  dragRow.append(imageHandle, textHandle);
  visualTools.append(dragHelp, dragRow);

  const details = el('details');
  details.append(
    el('summary', '', '💭 Idea Ilustrasi daripada Gemini'),
    el('p', '', page.illustrationPrompt || '')
  );

  section.append(
    pageNumber,
    designPanel,
    layoutLabel,
    pageBody,
    visualTools,
    details
  );

  return section;
}

/* =====================================
   RENDER EDITOR
   ===================================== */

function renderEditor() {
  if (!selected) return;

  const story = selected.pages;
  $('editor').hidden = false;

  $('bookTitle').textContent =
    story.title || 'Buku Cerita';

  $('moral').textContent =
    '💖 Pengajaran: ' + (story.moral || '');

  const pages = $('pages');
  pages.replaceChildren();
  pages.append(makeCover());

  story.pages.forEach((page, index) => {
    pages.append(makeStoryPage(page, index));
  });

  window.StorylandQuality?.mount?.(story);

  $('editor').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

/* =====================================
   GENERATE STORY
   ===================================== */

$('create').addEventListener('submit', async event => {
  event.preventDefault();

  const button = $('generate');
  if (button.disabled) return;

  button.disabled = true;
  button.textContent = '🪄 Gemini sedang menulis...';
  message('✨ Sedang menjana cerita...');

  try {
    const form = new FormData(event.target);

    const result = await api('/api/stories/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form))
    });

    await loadLibrary();
    await openBook(result.id);

    message('🎉 Cerita berjaya dijana!');
  } catch (error) {
    message('❌ ' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = '✨ Jana Cerita dengan Gemini';
  }
});

/* =====================================
   MANUAL SAVE
   ===================================== */

$('save').addEventListener('click', async () => {
  if (!selected) return;

  const button = $('save');
  button.disabled = true;
  button.textContent = '💾 Menyimpan...';

  try {
    const story = selected.pages;

    const invalid = story.pages.filter(p =>
      words(p.text) > MAX_WORDS
    );

    if (invalid.length) {
      throw new Error(
        'Halaman melebihi 35 perkataan: ' +
        invalid.map(p => p.number).join(', ')
      );
    }

    await api(
      '/api/books/' + encodeURIComponent(selected.id),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverAuthor: story.coverAuthor,
          coverSubtitle: story.coverSubtitle,
          pages: story.pages.map(p => ({
            number: p.number,
            text: p.text,
            layout: p.layout,
            imageScale: p.imageScale,
            imageAlign: p.imageAlign,
            theme: p.theme,
            decoration: p.decoration
          }))
        })
      }
    );

    window.StorylandAutosave?.manualSaveCompleted?.();

    message('✅ Semua perubahan berjaya disimpan!');
    await loadLibrary();
  } catch (error) {
    message('❌ ' + error.message);
  } finally {
    button.disabled = false;
    button.textContent = '💾 Simpan Perubahan';
  }
});

/* =====================================
   QUALITY CHECK + EXPORT PDF
   ===================================== */

$('print').addEventListener('click', () => {
  if (!selected) {
    message('Sila buka buku dahulu.');
    return;
  }

  if (!window.StorylandQuality) {
    message('❌ book-quality.js belum dimuatkan.');
    return;
  }

  const result =
    window.StorylandQuality.validateBeforeExport(
      selected.pages
    );

  if (!result.passed) {
    message(
      `⚠️ Sila baiki ${result.problems.length} masalah dahulu.`
    );
    return;
  }

  if (!window.StorylandPrint?.printBook) {
    message('❌ print-book.js belum dimuatkan.');
    return;
  }

  window.StorylandPrint.printBook(
    selected.pages,
    $('pdfSize')?.value || 'A4'
  );
});

/* =====================================
   RELOAD LIBRARY
   ===================================== */

$('refresh').addEventListener('click', loadLibrary);

loadLibrary();

console.log('Storyland AI App V12 ready');
