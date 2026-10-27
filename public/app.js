
/* ======================================================
   STORYLAND V20.1 FIXED
   FULL APPLICATION

   Gemini Stories
   Cloudflare AI Images
   Character Consistency
   Image History
   Cover Designer
   Smart Book Layout
   Undo / Redo
   Auto-Save Protection
   Backup and Draft Recovery
   Revision Conflict Protection
   Kids Typography
   ====================================================== */

const $ = id => document.getElementById(id);

let selected = null;

const MAX_WORDS = 100;
const MIN_WORDS = 5;

const LAYOUTS = [
  
  ['top', 'Teks Atas'],
  ['bottom', 'Teks Bawah'],
  ['side', 'Sebelah (Asal)'],
  ['left', 'Sebelah'],
  ['right', 'Sebelah Terbalik'],

  ['full-top', 'Gambar Penuh + Teks Atas'],
  ['full-center', 'Gambar Penuh + Teks Tengah'],
  ['full-bottom', 'Gambar Penuh + Teks Bawah']
];

const THEMES = [
  ['fantasy', '✨ Dunia Fantasi'],
  ['garden', '🌸 Taman Ceria'],
  ['royal', '🏰 Istana Emas'],
  ['sky', '☁️ Langit Ajaib']
];

const DECORATIONS = [
  ['frame', '🖼️ Bingkai'],
  ['minimal', '📄 Minimal']
];

const ALIGNMENTS = [
  ['left', '⬅️ Kiri'],
  ['center', '↔️ Tengah'],
  ['right', '➡️ Kanan']
];

const STYLES = [
  ['fantasy', '🏰 Fantasi Ajaib'],
  ['cartoon', '🧸 Kartun 3D'],
  ['watercolor', '🎨 Cat Air'],
  ['anime', '🌸 Anime Comel']
];

const KIDS_FONTS = [
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

/* ======================================================
   BASIC HELPERS
   ====================================================== */

function el(tag, className = '', content) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (content !== undefined) {
    node.textContent = String(content);
  }

  return node;
}

function message(value) {
  const element = $('message');

  if (element) {
    element.textContent = String(value || '');
  }
}

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .length;
}

function choose(value, options, fallback) {
  return options.some(item => item[0] === value)
    ? value
    : fallback;
}

function labeled(title, input, className = '') {
  const label = el('label', className);

  const heading = el('span', '', title);

  label.append(heading, input);

  return label;
}

function selectControl(options, value, onChange) {
  const input = el('select');

  for (const [id, name] of options) {
    const option = el('option', '', name);

    option.value = id;
    input.append(option);
  }

  input.value = value;

  if (typeof onChange === 'function') {
    input.addEventListener('change', () => {
      onChange(input.value);
    });
  }

  return input;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });

  const result = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      result.error || `HTTP ${response.status}`
    );

    error.status = response.status;
    error.code = result.code;
    error.details = result;

    throw error;
  }

  return result;
}

function notifyEditing() {
  window.StorylandUndoRedo?.changed?.();

  window.StorylandAutosave?.changed?.();

  window.StorylandDraftRecovery?.capture?.();
}

function refreshQualityChecker() {
  if (!selected) return;

  const quality = window.StorylandQuality;

  if (!quality) return;

  try {
    if (typeof quality.refresh === 'function') {
      quality.refresh(selected.pages);
    } else if (
      typeof quality.mount === 'function'
    ) {
      quality.mount(selected.pages);
    }
  } catch (error) {
    console.error(
      '[Quality Checker]',
      error
    );
  }
}

function normalizeStory(story) {
  if (
    !story ||
    typeof story !== 'object' ||
    Array.isArray(story)
  ) {
    throw new Error('Data buku tidak sah.');
  }

  story.title ||= 'Cerita Baharu';
  story.moral ||= '';

  story.coverAuthor ??= 'Storyland AI';

  story.coverSubtitle ??=
    'Sebuah cerita penuh imaginasi dan pengajaran';

  story.coverImageUrl ??= null;

  story.coverIllustrationIdea ??= '';

  story.coverDesign ??= {
    template: 'fantasy',
    font: 'Fredoka',
    titleSize: 36,
    titleColor: '#ffffff',
    align: 'center',
    position: 'bottom',
    overlay: 65
  };

  story.characterGuide ??= '';

  story.characterProfiles =
    Array.isArray(story.characterProfiles)
      ? story.characterProfiles
      : [];

  story.readingFont =
    KIDS_FONTS.includes(story.readingFont)
      ? story.readingFont
      : 'Nunito';

  story.readingFontSize =
    Number.isFinite(Number(story.readingFontSize))
      ? Math.max(
          14,
          Math.min(
            30,
            Number(story.readingFontSize)
          )
        )
      : 18;

  story.pages = Array.isArray(story.pages)
    ? story.pages.map((page, index) => ({
        ...page,

        number:
          Number.isInteger(page.number)
            ? page.number
            : index + 1,

        text: String(page.text || ''),

        illustrationPrompt: String(
          page.illustrationPrompt || ''
        ),

        imageUrl: page.imageUrl || null,

        layout: choose(
          page.layout,
          LAYOUTS,
          'side'
        ),

        theme: choose(
          page.theme,
          THEMES,
          'fantasy'
        ),

        decoration: choose(
          page.decoration,
          DECORATIONS,
          'frame'
        ),

        imageScale:
          [40, 50, 60, 70, 80, 90, 100]
            .includes(Number(page.imageScale))
            ? Number(page.imageScale)
            : 100,

        imageAlign: choose(
          page.imageAlign,
          ALIGNMENTS,
          'center'
        )
      }))
    : [];

  return story;
}

/* ======================================================
   DASHBOARD AND BOOK LIBRARY
   ====================================================== */

async function loadLibrary() {
  try {
    const books = await api('/api/books');

    if (window.StorylandDashboard?.render) {
      window.StorylandDashboard.render(books);

      return books;
    }

    const library = $('library');

    if (!library) return books;

    library.replaceChildren();

    for (const book of books) {
      const button = el(
        'button',
        'book',
        '📖 ' + book.title
      );

      button.type = 'button';

      button.addEventListener('click', () => {
        openBook(book.id);
      });

      library.append(button);
    }

    return books;

  } catch (error) {
    console.error('[Library]', error);

    message(
      '❌ Gagal memuatkan buku: ' +
      error.message
    );

    return [];
  }
}

window.StorylandReloadLibrary = loadLibrary;

/* ======================================================
   OPEN BOOK
   ====================================================== */

async function openBook(id) {
  if (!id || typeof id !== 'string') {
    message('❌ ID buku tidak sah.');
    return false;
  }

  try {
    // Save existing edits before switching books.
    if (selected && selected.id !== id) {
      const autosave = window.StorylandAutosave;

      if (autosave?.isDirty?.()) {
        await autosave.saveNow();
      }
    }

    const book = await api(
      `/api/books/${encodeURIComponent(id)}`
    );

    if (!book || !book.id) {
      throw new Error(
        'Server tidak memulangkan ID buku.'
      );
    }

    const story = normalizeStory(book.pages);

    // Always initialize selected before rendering.
    selected = {
      ...book,
      pages: story,
      revision: Number(book.revision)
    };

    if (
      !Number.isSafeInteger(selected.revision) ||
      selected.revision < 1
    ) {
      throw new Error(
        'Revision buku tidak sah.'
      );
    }

    // Auto-Save requires the complete book object.
    window.StorylandAutosave?.attach?.(
      selected
    );

    renderEditor();

    bindUndoRedo();

    // Load saved typography into book editor.
    document.dispatchEvent(
      new CustomEvent(
        'storyland:typography-load',
        {
          detail: {
            font:
              selected.pages.readingFont ||
              'Nunito',

            fontSize:
              selected.pages.readingFontSize ||
              18
          }
        }
      )
    );

    // Draft recovery must run only after book
    // and Auto-Save have been initialized.
    window.StorylandDraftRecovery?.attach?.(
      selected,
      () => {
        renderEditor();

        bindUndoRedo();

        refreshQualityChecker();

        window.StorylandAutosave
          ?.changed?.();

        message(
          '✅ Draf dipulihkan. ' +
          'Simpan buku untuk kekalkan perubahan.'
        );
      }
    );

    return true;

  } catch (error) {
    console.error(
      '[Open Book]',
      error
    );

    message(
      '❌ ' + error.message
    );

    return false;
  }
}

window.StorylandOpenBook = openBook;

/* ======================================================
   UNDO / REDO INTEGRATION
   ====================================================== */

function bindUndoRedo() {
  if (!selected) return;

  window.StorylandUndoRedo?.bind?.(
    selected.pages,
    () => {
      renderEditor();
      refreshQualityChecker();
    }
  );
}

/* ======================================================
   SHARED IMAGE QUOTA
   ====================================================== */

let quotaRequest = null;

function imageQuota() {
  if (!quotaRequest) {
    quotaRequest = api(
      '/api/image-studio/quota'
    ).finally(() => {
      quotaRequest = null;
    });
  }

  return quotaRequest;
}

/* ======================================================
   MANUAL IMAGE UPLOAD
   ====================================================== */

function imageUpload(
  bookId,
  target,
  labelText,
  onDone
) {
  const box = el(
    'div',
    'manual-upload-label'
  );

  const input = el(
    'input',
    'manual-image-input'
  );

  input.type = 'file';
  input.accept =
    'image/jpeg,image/png,image/webp';

  const status = el(
    'p',
    'image-status'
  );

  input.addEventListener(
    'change',
    async () => {
      const file = input.files?.[0];

      if (!file) return;

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp'
      ];

      if (
        !allowedTypes.includes(file.type) ||
        !file.size ||
        file.size > 8 * 1024 * 1024
      ) {
        status.textContent =
          '❌ Gunakan JPG, PNG atau WebP maksimum 8MB.';

        input.value = '';
        return;
      }

      input.disabled = true;

      status.textContent =
        '⏳ Upload gambar...';

      try {
        const result = await api(
          `/api/books/${encodeURIComponent(bookId)}` +
          `/images/${encodeURIComponent(target)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': file.type
            },
            body: file
          }
        );

        if (typeof onDone === 'function') {
          onDone(result.imageUrl);
        }

        refreshQualityChecker();

        window.dispatchEvent(
          new Event('storyland:image-updated')
        );

        if (target === 'cover') {
          await loadLibrary();
        }

        status.textContent =
          '✅ Gambar berjaya disimpan.';

      } catch (error) {
        status.textContent =
          '❌ ' + error.message;

      } finally {
        input.disabled = false;
        input.value = '';
      }
    }
  );

  box.append(
    labeled(labelText, input),
    status
  );

  return box;
}

/* ======================================================
   AI IMAGE STUDIO
   GENERATE / REGENERATE / CUSTOM PROMPT
   ====================================================== */

function aiImageButton(
  bookId,
  target,
  onDone
) {
  const box = el(
    'div',
    'ai-image-studio'
  );

  const heading = el(
    'div',
    'ai-studio-heading',
    '✨ AI Image Studio'
  );

  const style = selectControl(
    STYLES,
    'fantasy',
    () => {}
  );

  const customPromptInput = el(
    'textarea',
    'ai-custom-prompt'
  );

  customPromptInput.rows = 4;
  customPromptInput.maxLength = 500;

  customPromptInput.placeholder =
    'Contoh: Kekalkan watak utama. ' +
    'Tukar latar belakang kepada istana ajaib.';

  const promptCounter = el(
    'div',
    'ai-prompt-counter',
    '0/500 aksara'
  );

  customPromptInput.addEventListener(
    'input',
    () => {
      promptCounter.textContent =
        `${customPromptInput.value.length}/500 aksara`;
    }
  );

  const promptHelp = el(
    'p',
    'ai-prompt-help',
    'Kosongkan untuk menggunakan idea ilustrasi asal.'
  );

  const quota = el(
    'p',
    'ai-studio-quota',
    'Memeriksa kuota...'
  );

  const quotaBar = el(
    'div',
    'ai-quota-bar'
  );

  const quotaFill = el(
    'div',
    'ai-quota-fill'
  );

  quotaBar.append(quotaFill);

  const button = el(
    'button',
    'ai-image-button'
  );

  button.type = 'button';

  const status = el(
    'p',
    'ai-image-status'
  );

  status.setAttribute(
    'role',
    'status'
  );

  let running = false;
  let remaining = 0;
  let quotaLoaded = false;

  function hasImage() {
    if (
      !selected ||
      selected.id !== bookId
    ) {
      return false;
    }

    const story = selected.pages;

    if (target === 'cover') {
      return Boolean(
        story.coverImageUrl
      );
    }

    const page = story.pages.find(
      item =>
        item.number === Number(target)
    );

    return Boolean(
      page?.imageUrl
    );
  }

  function updateButton() {
    button.textContent = running
      ? '⏳ Sedang menjana gambar...'
      : hasImage()
        ? '🔄 Jana Semula Gambar'
        : target === 'cover'
          ? '✨ Jana Cover AI'
          : '✨ Jana Gambar AI';

    button.disabled =
      running ||
      !quotaLoaded ||
      remaining <= 0;
  }

  async function refreshQuota() {
    if (!box.isConnected && quotaLoaded) {
      return;
    }

    try {
      const data = await imageQuota();

      quotaLoaded = true;

      remaining = Number(
        data.remaining || 0
      );

      const limit = Number(
        data.limit || 0
      );

      const used = Number(
        data.used || 0
      );

      quota.textContent =
        `🎨 Baki hari ini: ${remaining} daripada ${limit} gambar`;

      const percentage =
        limit > 0
          ? Math.min(
              100,
              (used / limit) * 100
            )
          : 0;

      quotaFill.style.width =
        `${percentage}%`;

      quotaFill.classList.toggle(
        'quota-full',
        remaining <= 0
      );

    } catch (error) {
      remaining = 0;
      quotaLoaded = false;

      quota.textContent =
        '⚠️ Tidak dapat membaca kuota gambar.';
    }

    updateButton();
  }

  button.addEventListener(
    'click',
    async () => {
      if (
        running ||
        !quotaLoaded ||
        remaining <= 0
      ) {
        return;
      }

      if (
        !selected ||
        selected.id !== bookId
      ) {
        status.textContent =
          '❌ Buku aktif telah berubah.';

        return;
      }

      const regenerating = hasImage();

      if (regenerating) {
        const confirmed = window.confirm(
          'Jana semula gambar ini?\n\n' +
          'Penjanaan menggunakan satu kuota harian.\n' +
          'Gambar lama akan disimpan dalam sejarah.'
        );

        if (!confirmed) return;
      }

      running = true;
      updateButton();

      status.textContent =
        '⏳ AI sedang menjana gambar...';

      try {
        const result = await api(
          `/api/books/${encodeURIComponent(bookId)}/generate-image`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              target,
              style: style.value,
              customPrompt:
                customPromptInput.value.trim()
            })
          }
        );

        if (
          selected &&
          selected.id === bookId
        ) {
          onDone?.(result.imageUrl);

          refreshQualityChecker();
        }

        window.dispatchEvent(
          new Event('storyland:image-updated')
        );

        window.dispatchEvent(
          new Event('storyland:image-used')
        );

        if (target === 'cover') {
          await loadLibrary();
        }

        status.textContent =
          '✅ Gambar baharu berjaya dijana.';

      } catch (error) {
        status.textContent =
          '❌ ' + error.message +
          ' Gambar lama tidak diubah.';

      } finally {
        running = false;

        await refreshQuota();
      }
    }
  );

  const quotaListener = () => {
    if (!box.isConnected) {
      window.removeEventListener(
        'storyland:image-used',
        quotaListener
      );
      return;
    }

    refreshQuota();
  };

  window.addEventListener(
    'storyland:image-used',
    quotaListener
  );

  box.append(
    heading,
    labeled('Gaya Ilustrasi', style),
    labeled(
      '✍️ Arahan Tambahan untuk AI',
      customPromptInput
    ),
    promptCounter,
    promptHelp,
    quota,
    quotaBar,
    button,
    status
  );

  updateButton();
  refreshQuota();

  return box;
}

/* ======================================================
   IMAGE HISTORY & RESTORE
   ====================================================== */

function imageHistoryPanel(
  bookId,
  target,
  onRestore
) {
  const panel = el(
    'section',
    'image-history-panel'
  );

  const title = el(
    'h4',
    'image-history-heading',
    '🖼️ Sejarah Gambar'
  );

  const description = el(
    'p',
    'image-history-description',
    'Gunakan semula gambar lama tanpa mengurangkan kuota AI.'
  );

  const button = el(
    'button',
    'image-history-refresh',
    '↻ Muat Semula Sejarah'
  );

  button.type = 'button';

  const status = el(
    'p',
    'image-history-status'
  );

  const gallery = el(
    'div',
    'image-history-gallery'
  );

  let busy = false;

  async function refreshHistory() {
    const result = await api(
      `/api/books/${encodeURIComponent(bookId)}` +
      `/image-history/${encodeURIComponent(target)}`
    );

    const history =
      Array.isArray(result.history)
        ? result.history
        : [];

    gallery.replaceChildren();

    if (!history.length) {
      gallery.append(
        el(
          'p',
          'image-history-empty',
          'Belum ada versi gambar terdahulu.'
        )
      );

      return;
    }

    for (
      let index = 0;
      index < history.length;
      index++
    ) {
      const imageUrl = history[index];

      const card = el(
        'div',
        'image-history-card'
      );

      const image = el(
        'img',
        'image-history-preview'
      );

      image.src = imageUrl;
      image.alt = `Versi terdahulu ${index + 1}`;
      image.loading = 'lazy';

      const label = el(
        'p',
        'image-history-label',
        `Versi terdahulu ${index + 1}`
      );

      const restore = el(
        'button',
        'image-history-restore',
        '↩ Gunakan Semula'
      );

      restore.type = 'button';

      restore.addEventListener(
        'click',
        async () => {
          if (busy) return;

          const confirmed = window.confirm(
            'Pulihkan gambar ini?\n\n' +
            'Gambar aktif akan masuk ke sejarah.\n' +
            'Tiada kuota AI digunakan.'
          );

          if (!confirmed) return;

          busy = true;
          restore.disabled = true;

          try {
            const result = await api(
              `/api/books/${encodeURIComponent(bookId)}` +
              `/image-history/${encodeURIComponent(target)}/restore`,
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json'
                },
                body: JSON.stringify({
                  imageUrl
                })
              }
            );

            if (
              selected &&
              selected.id === bookId
            ) {
              onRestore?.(result.imageUrl);

              refreshQualityChecker();
            }

            if (target === 'cover') {
              await loadLibrary();
            }

            status.textContent =
              '✅ Gambar berjaya dipulihkan.';

            await refreshHistory();

          } catch (error) {
            status.textContent =
              '❌ ' + error.message;

          } finally {
            busy = false;
            restore.disabled = false;
          }
        }
      );

      card.append(
        image,
        label,
        restore
      );

      gallery.append(card);
    }
  }

  button.addEventListener(
    'click',
    async () => {
      if (busy) return;

      busy = true;
      button.disabled = true;

      status.textContent =
        '⏳ Memuatkan sejarah...';

      try {
        await refreshHistory();

        status.textContent =
          '✅ Senarai sejarah dikemas kini.';

      } catch (error) {
        status.textContent =
          '❌ ' + error.message;

      } finally {
        busy = false;
        button.disabled = false;
      }
    }
  );

  const updateListener = () => {
    if (!panel.isConnected) {
      window.removeEventListener(
        'storyland:image-updated',
        updateListener
      );

      return;
    }

    refreshHistory().catch(error => {
      status.textContent =
        '❌ ' + error.message;
    });
  };

  window.addEventListener(
    'storyland:image-updated',
    updateListener
  );

  panel.append(
    title,
    description,
    button,
    status,
    gallery
  );

  refreshHistory().catch(error => {
    status.textContent =
      '❌ Tidak dapat membaca sejarah: ' +
      error.message;
  });

  return panel;
}

/* ======================================================
   CHARACTER BIBLE
   ====================================================== */

function makeCharacterBible() {
  const story = selected.pages;
  const bookId = selected.id;

  const box = el(
    'section',
    'character-bible-panel'
  );

  const title = el(
    'h3',
    '',
    '🎭 Kunci Identiti Watak'
  );

  const description = el(
    'p',
    '',
    'Terangkan rupa dan pakaian watak supaya digunakan dalam semua prompt gambar.'
  );

  const input = el(
    'textarea',
    'character-bible-input'
  );

  input.rows = 5;
  input.maxLength = 1200;

  input.value =
    story.characterGuide || '';

  input.placeholder =
    'Contoh: Siti memakai tudung dusty pink, ' +
    'baju krim dan kasut merah jambu.';

  const counter = el(
    'p',
    'character-bible-counter'
  );

  function updateCounter() {
    counter.textContent =
      `${input.value.length}/1200 aksara`;
  }

  input.addEventListener(
    'input',
    () => {
      updateCounter();
    }
  );

  const status = el(
    'p',
    'character-bible-status'
  );

  const save = el(
    'button',
    'character-bible-save',
    '🔒 Simpan Character Bible'
  );

  save.type = 'button';

  save.addEventListener(
    'click',
    async () => {
      if (save.disabled) return;

      save.disabled = true;

      try {
        const result = await api(
          `/api/books/${encodeURIComponent(bookId)}/character-guide`,
          {
            method: 'PUT',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              guide: input.value
            })
          }
        );

        story.characterGuide =
          result.characterGuide;

        status.textContent =
          '✅ Character Bible berjaya disimpan.';

      } catch (error) {
        status.textContent =
          '❌ ' + error.message;

      } finally {
        save.disabled = false;
      }
    }
  );

  updateCounter();

  box.append(
    title,
    description,
    input,
    counter,
    save,
    status
  );

  return box;
}

/* ======================================================
   CHARACTER CONSISTENCY STUDIO
   ====================================================== */

function makeCharacterStudio() {
  const story = selected.pages;
  const bookId = selected.id;

  story.characterProfiles ??= [];

  const panel = el(
    'section',
    'character-studio-panel'
  );

  const heading = el(
    'h3',
    '',
    '🎭 Character Consistency Pro'
  );

  const description = el(
    'p',
    '',
    'Tambah watak, tetapkan rupa dan simpan gambar rujukan.'
  );

  const list = el(
    'div',
    'character-card-list'
  );

  const status = el(
    'p',
    'character-upload-status'
  );

  const add = el(
    'button',
    'character-add-button',
    '➕ Tambah Watak'
  );

  add.type = 'button';

  async function saveProfiles() {
    const result = await api(
      `/api/books/${encodeURIComponent(bookId)}/characters`,
      {
        method: 'PUT',
        headers: {
          'Content-Type':
            'application/json'
        },
        body: JSON.stringify({
          characters: story.characterProfiles
        })
      }
    );

    const existing = new Map(
      story.characterProfiles.map(c => [
        c.id,
        c
      ])
    );

    story.characterProfiles =
      result.characterProfiles.map(c => {
        const local = existing.get(c.id);

        if (local) {
          Object.assign(local, c);
          return local;
        }

        return c;
      });

    return result;
  }

  function renderCharacters() {
    list.replaceChildren();

    story.characterProfiles.forEach(
      (character, index) => {
        const card = el(
          'div',
          'character-card'
        );

        if (character.imageUrl) {
          const image = el(
            'img',
            'character-preview'
          );

          image.src = character.imageUrl;
          image.alt =
            character.name || 'Watak';

          card.append(image);
        }

        const name = el('input');
        name.maxLength = 80;
        name.placeholder = 'Nama watak';
        name.value = character.name || '';

        const role = el('input');
        role.maxLength = 80;
        role.placeholder =
          'Watak utama / Haiwan';
        role.value = character.role || '';

        const appearance = el('textarea');
        appearance.maxLength = 500;
        appearance.rows = 4;

        appearance.placeholder =
          'Deskripsi rupa watak, pakaian dan aksesori.';

        appearance.value =
          character.description || '';

        name.addEventListener(
          'input',
          () => {
            character.name = name.value;
          }
        );

        role.addEventListener(
          'input',
          () => {
            character.role = role.value;
          }
        );

        appearance.addEventListener(
          'input',
          () => {
            character.description =
              appearance.value;
          }
        );

        const upload = el('input');
        upload.type = 'file';
        upload.accept =
          'image/jpeg,image/png,image/webp';

        const uploadStatus = el(
          'p',
          'character-upload-status'
        );

        upload.addEventListener(
          'change',
          async () => {
            const file = upload.files?.[0];

            if (!file) return;

            if (
              ![
                'image/jpeg',
                'image/png',
                'image/webp'
              ].includes(file.type) ||
              file.size > 8 * 1024 * 1024
            ) {
              uploadStatus.textContent =
                '❌ Format atau saiz gambar tidak sah.';

              return;
            }

            upload.disabled = true;

            try {
              await saveProfiles();

              const result = await api(
                `/api/books/${encodeURIComponent(bookId)}` +
                `/characters/${encodeURIComponent(character.id)}/image`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type':
                      file.type
                  },
                  body: file
                }
              );

              character.imageUrl =
                result.imageUrl;

              renderCharacters();

              status.textContent =
                '✅ Gambar watak berjaya disimpan.';

            } catch (error) {
              uploadStatus.textContent =
                '❌ ' + error.message;

            } finally {
              upload.disabled = false;
              upload.value = '';
            }
          }
        );

        const save = el(
          'button',
          'character-mini-save',
          '💾 Simpan Watak'
        );

        save.type = 'button';

        save.addEventListener(
          'click',
          async () => {
            save.disabled = true;

            try {
              await saveProfiles();

              status.textContent =
                '✅ Profil watak berjaya disimpan.';

            } catch (error) {
              status.textContent =
                '❌ ' + error.message;

            } finally {
              save.disabled = false;
            }
          }
        );

        const remove = el(
          'button',
          'character-remove',
          '🗑 Buang Watak'
        );

        remove.type = 'button';

        remove.addEventListener(
          'click',
          async () => {
            const confirmed = window.confirm(
              `Buang watak "${character.name}"?`
            );

            if (!confirmed) return;

            const previous =
              [...story.characterProfiles];

            story.characterProfiles.splice(
              index,
              1
            );

            try {
              await saveProfiles();

              renderCharacters();

            } catch (error) {
              story.characterProfiles =
                previous;

              status.textContent =
                '❌ ' + error.message;
            }
          }
        );

        card.append(
          labeled('Nama Watak', name),
          labeled('Peranan', role),
          labeled('Deskripsi Rupa', appearance),
          labeled('Gambar Rujukan', upload),
          uploadStatus,
          save,
          remove
        );

        list.append(card);
      }
    );
  }

  add.addEventListener(
    'click',
    async () => {
      if (story.characterProfiles.length >= 10) {
        status.textContent =
          'Maksimum 10 watak setiap buku.';

        return;
      }

      const character = {
        id: crypto.randomUUID(),
        name: '',
        role: '',
        description: '',
        imageUrl: null
      };

      story.characterProfiles.push(
        character
      );

      try {
        await saveProfiles();

        renderCharacters();

        status.textContent =
          '✅ Watak baharu ditambah.';

      } catch (error) {
        story.characterProfiles =
          story.characterProfiles.filter(
            c => c.id !== character.id
          );

        status.textContent =
          '❌ ' + error.message;
      }
    }
  );

  renderCharacters();

  panel.append(
    heading,
    description,
    add,
    status,
    list
  );

  return panel;
}

/* ======================================================
   PREMIUM COVER DESIGNER
   ====================================================== */

function makeCover() {
  const story = selected.pages;
  const bookId = selected.id;

  const section = el(
    'section',
    'cover-page premium-cover-page'
  );

  const shell = el(
    'div',
    'premium-cover-shell'
  );

  const left = el(
    'div',
    'premium-book-cover'
  );

  const visual = el(
    'div',
    'premium-cover-visual'
  );

  const overlay = el(
    'div',
    'premium-cover-overlay'
  );

  const ribbon = el(
    'div',
    'premium-cover-ribbon',
    'CERITA KANAK-KANAK'
  );

  const title = el(
    'h3',
    'premium-cover-title',
    story.title
  );

  const subtitle = el(
    'p',
    'premium-cover-subtitle',
    story.coverSubtitle
  );

  const author = el(
    'div',
    'premium-cover-author',
    'Oleh ' + story.coverAuthor
  );

  function updateCover() {
    visual.replaceChildren();

    if (story.coverImageUrl) {
      const image = el('img');

      image.src =
        story.coverImageUrl;

      image.alt = 'Cover buku';

      visual.append(image);

    } else {
      visual.append(
        el(
          'div',
          'premium-placeholder',
          '📘 Belum ada cover'
        )
      );
    }

    overlay.replaceChildren(
      ribbon,
      title,
      subtitle,
      author
    );

    visual.append(overlay);

    window.StorylandCoverDesigner
      ?.applyPreview?.(
        visual,
        overlay,
        title,
        story.coverDesign
      );
  }

  const panel = el(
    'div',
    'premium-cover-side-panel'
  );

  const authorInput = el('input');

  authorInput.maxLength = 100;
  authorInput.value =
    story.coverAuthor || '';

  authorInput.addEventListener(
    'input',
    () => {
      story.coverAuthor =
        authorInput.value;

      author.textContent =
        'Oleh ' + authorInput.value;

      notifyEditing();
    }
  );

  const subtitleInput = el('input');

  subtitleInput.maxLength = 200;
  subtitleInput.value =
    story.coverSubtitle || '';

  subtitleInput.addEventListener(
    'input',
    () => {
      story.coverSubtitle =
        subtitleInput.value;

      subtitle.textContent =
        subtitleInput.value;

      notifyEditing();
    }
  );

  // V18.6 Cover Designer
  const coverDesignerPanel =
    window.StorylandCoverDesigner
      ?.mount?.({
        story,
        visual,
        overlay,
        title,

        onChange: () => {
          notifyEditing();
        }
      }) || el('div');

  // V18.5 Gemini Cover Idea
  const geminiCoverIdeaPanel =
    window.StorylandCoverIdea
      ?.mount?.({
        bookId,
        story,

        onChange: value => {
          story.coverIllustrationIdea =
            value;

          notifyEditing();
        }
      }) || el('div');

  // V17.5 Smart Book Layout
  const smartBookPanel =
    window.StorylandSmartLayout
      ?.mountBook?.({
        story,

        onApply: results => {
          notifyEditing();

          renderEditor();

          refreshQualityChecker();

          message(
            `✅ Smart Layout menyusun ${results.length} halaman.`
          );
        }
      }) || el('div');

  panel.append(
    el(
      'div',
      'cover-badge',
      '✨ PREMIUM COVER'
    ),

    el(
      'h4',
      'premium-side-title',
      'Reka Cover Buku Anda'
    ),

    labeled(
      '✍️ Nama Penulis',
      authorInput
    ),

    labeled(
      '💖 Subtitle Buku',
      subtitleInput
    ),

    geminiCoverIdeaPanel,

    coverDesignerPanel,

    smartBookPanel,

    aiImageButton(
      bookId,
      'cover',
      url => {
        story.coverImageUrl = url;
        updateCover();
      }
    ),

    imageUpload(
      bookId,
      'cover',
      '📤 Upload Gambar Cover',
      url => {
        story.coverImageUrl = url;
        updateCover();
      }
    ),

    imageHistoryPanel(
      bookId,
      'cover',
      url => {
        story.coverImageUrl = url;
        updateCover();
      }
    )
  );

  updateCover();

  left.append(visual);

  shell.append(
    left,
    panel
  );

  section.append(shell);

  return section;
}


/* ======================================================
   STORYLAND AI V19
   STORY PAGE RENDERER + GEMINI PAGE GENERATOR
   ====================================================== */


function makeStoryPage(page, index) {
  if (!page) {
    throw new Error(
      `Data halaman ${index + 1} tidak sah.`
    );
  }

  const bookId = selected.id;
  const number = page.number || index + 1;

  const section = el('section', 'page');

  /* ==========================================
     V20 — GAMBAR PENUH SATU HALAMAN
     ========================================== */

  let isFullImageLayout = [
    'full-top',
    'full-center',
    'full-bottom'
  ].includes(page.layout);

  let fullTextPosition =
    page.layout === 'full-top'
      ? 'top'
      : page.layout === 'full-center'
        ? 'center'
        : page.layout === 'full-bottom'
          ? 'bottom'
          : '';

  section.dataset.layout = page.layout;
  section.dataset.theme = page.theme;
  section.dataset.decoration = page.decoration;
  section.dataset.imageAlign = page.imageAlign;

  section.dataset.fullImage =
    String(isFullImageLayout);

  section.dataset.textPosition =
    fullTextPosition;

  section.style.setProperty(
    '--page-image-scale',
    page.imageScale + '%'
  );

  /* ==========================================
     PAGE DESIGN
     ========================================== */

  const design = el(
    'div',
    'page-design-panel'
  );

  const themeControl = selectControl(
    THEMES,
    page.theme,
    value => {
      page.theme = value;
      section.dataset.theme = value;
      notifyEditing();
    }
  );

  const decorationControl = selectControl(
    DECORATIONS,
    page.decoration,
    value => {
      page.decoration = value;
      section.dataset.decoration = value;
      notifyEditing();
    }
  );

  design.append(
    el('h3', '', '🎨 Tema & Hiasan'),
    labeled('Tema', themeControl),
    labeled('Hiasan', decorationControl)
  );

  /* ==========================================
     LAYOUT
     ========================================== */

  
/* FIXED IMAGE SIZE */

// Gunakan deklarasi buttons dan updateButtons
// yang sudah wujud dalam fungsi ini.


const layout = selectControl(
  LAYOUTS,
  page.layout,
  value => {
    page.layout = value;

    isFullImageLayout = [
      'full-top',
      'full-center',
      'full-bottom'
    ].includes(value);

    fullTextPosition =
      value === 'full-top'
        ? 'top'
        : value === 'full-center'
          ? 'center'
          : value === 'full-bottom'
            ? 'bottom'
            : '';

    section.dataset.layout = value;

    section.dataset.fullImage =
      String(isFullImageLayout);

    section.dataset.textPosition =
      fullTextPosition;

    updateButtons();
    updateFullPagePreview();
    notifyEditing();
  }
);



  layout.className = 'page-layout-select';

  /* ==========================================
     PAGE BODY
     ========================================== */

  const body = el(
    'div',
    'storybook-page-body'
  );

  const picture = el(
    'div',
    'story-illustration storybook-image-area'
  );

  const preview = el(
    'div',
    'story-image-preview'
  );

  function showImage() {
    preview.replaceChildren();

    if (page.imageUrl) {
      const image = el('img');

      image.src = page.imageUrl;
      image.alt = `Ilustrasi halaman ${number}`;

      preview.append(image);
    } else {
      preview.append(
        el(
          'div',
          'illustration-empty',
          '🖼️ Belum ada gambar'
        )
      );
    }
  }

  showImage();

  picture.append(
    preview,

    aiImageButton(
      bookId,
      number,
      url => {
        page.imageUrl = url;
        showImage();
        updateFullPagePreview();
      }
    ),

    imageUpload(
      bookId,
      number,
      '📤 Upload Gambar Halaman ' + number,
      url => {
        page.imageUrl = url;
        showImage();
        updateFullPagePreview();
      }
    ),

    imageHistoryPanel(
      bookId,
      number,
      url => {
        page.imageUrl = url;
        showImage();
        updateFullPagePreview();
      }
    )
  );

  /* ==========================================
     STORY TEXT
     ========================================== */

  const textBox = el(
    'div',
    'storybook-text-box'
  );

  const textarea = el(
    'textarea',
    'storybook-text-area'
  );

  textarea.value = page.text || '';

  const counter = el(
    'div',
    'word-counter'
  );

  function updateCounter() {
    const count = wordCount(textarea.value);

    counter.textContent =
      `${count}/${MAX_WORDS} perkataan`;

    counter.classList.toggle(
      'word-limit-exceeded',
      count > MAX_WORDS
    );

    if (count > MAX_WORDS) {
      counter.textContent += ' — Terlebih!';
    }
  }

  textarea.addEventListener('input', () => {
    page.text = textarea.value;
    updateFullPagePreview();

    updateCounter();
    notifyEditing();
    refreshQualityChecker();
  });

  updateCounter();

  
/* ==========================================
   V19.3 — AUTO STORY HISTORY
   ========================================== */

const autoHistorySession =
  window.StorylandAutoStoryHistory?.attach?.({
    bookId: bookId,
    pageNumber: number,
    textarea: textarea
  });


  
/* ==========================================
   V19.2 — SEJARAH CERITA
   ========================================== */

const storyHistory =
  window.StorylandStoryHistory?.mount?.({
    bookId,
    page,

    onRestore: async oldText => {
      // Pulihkan teks halaman terpilih sahaja.
      page.text = oldText;
      textarea.value = oldText;
      updateFullPagePreview();

      updateCounter();

      // Rekod perubahan melalui sistem sedia ada.
      notifyEditing();
      refreshQualityChecker();

      message(
        `✅ Cerita halaman ${number} berjaya dipulihkan.`
      );
    }
  });

// Simpan versi sebelum suntingan manual bermula.
let textBeforeEdit = '';

textarea.addEventListener('focus', () => {
  textBeforeEdit = page.text || '';
});

textarea.addEventListener('blur', () => {
  if (
    textBeforeEdit.trim() &&
    textBeforeEdit !== page.text
  ) {
    storyHistory?.capture(textBeforeEdit)
      .catch(error => {
        console.error(
          '[Sejarah Suntingan Manual]',
          error
        );
      });
  }

  textBeforeEdit = page.text || '';
});


  /* ==========================================
     V19 — JANA SEMULA CERITA SETIAP HALAMAN
     ========================================== */

  const generatorContainer = el(
    'div',
    'storyland-page-generator-container'
  );

  if (
    window.StorylandPageGenerator &&
    typeof window.StorylandPageGenerator.mount ===
      'function'
  ) {
    const generatorPanel =
      window.StorylandPageGenerator.mount({
        bookId,
        page,

        onApply: newText => {
          const text = String(
            newText || ''
          ).trim();

          const words = wordCount(text);

          if (!text || words > MAX_WORDS) {
            message(
              '❌ Cerita mesti mempunyai ' +
              '1 hingga 35 perkataan.'
            );
            return;
          }

          
// Simpan satu versi terdahulu sahaja.
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

          // Update halaman sahaja.
          page.text = text;

          // Update paparan tanpa reset editor.
          textarea.value = text;
          updateFullPagePreview();
          autoHistorySession?.syncCurrent(text);

          updateCounter();

          // Rekod perubahan pada modul sedia ada.
          notifyEditing();

          refreshQualityChecker();

          message(
            `✅ Cerita halaman ${number} ` +
            'berjaya dikemas kini.'
          );

          console.log(
            '[V19 Page Story Updated]',
            {
              bookId,
              pageNumber: number,
              wordCount: words
            }
          );
        }
      });

    if (generatorPanel instanceof HTMLElement) {
      generatorContainer.appendChild(
        generatorPanel
      );
    }
  } else {
    generatorContainer.appendChild(
      el(
        'p',
        'page-generator-warning',
        '⚠️ Modul Jana Semula Cerita ' +
        'belum dimuatkan.'
      )
    );
  }

  
textBox.append(
  textarea,
  counter,
  generatorContainer,
  ...(storyHistory ? [storyHistory.element] : [])
);


  
/* ==========================================
   V20 — FULL PAGE IMAGE + TEXT OVERLAY
   ========================================== */

// Paparan buku yang boleh memaparkan gambar
// secara penuh apabila layout dipilih.

const pageCanvas = el(
  'div',
  'storyland-page-canvas'
);

const imageDisplay = el(
  'div',
  'storyland-full-image-display'
);

const overlayText = el(
  'div',
  'storyland-full-overlay-text'
);

function updateFullPagePreview() {
  imageDisplay.replaceChildren();

  if (page.imageUrl) {
    const image = el(
      'img',
      'storyland-full-image-photo'
    );

    image.src = page.imageUrl;
    image.alt = `Ilustrasi halaman ${number}`;

    imageDisplay.append(image);

  } else {
    imageDisplay.append(
      el(
        'div',
        'storyland-full-image-placeholder',
        '🖼️ Belum ada gambar'
      )
    );
  }

  overlayText.textContent = page.text || '';

  // Paparkan canvas apabila layout gambar penuh.
  pageCanvas.hidden = ![
    'full-top',
    'full-center',
    'full-bottom'
  ].includes(page.layout);
}

pageCanvas.append(
  imageDisplay,
  overlayText
);

// Kawalan gambar dan editor teks asal kekal.
body.append(
  pageCanvas,
  picture,
  textBox
);

// Kemas kini paparan awal.
updateFullPagePreview();


  /* ==========================================
     VISUAL EDITOR TOOLS
     ========================================== */

  
/* ======================================================
   STORYLAND AI V19.7
   FIXED IMAGE SIZE — NO USER RESIZING
   ====================================================== */

// Semua halaman menggunakan saiz gambar tetap.
page.imageScale = 100;
page.imageAlign = 'center';

section.dataset.imageAlign = 'center';

section.style.setProperty(
  '--page-image-scale',
  '100%'
);

// Kekalkan pemboleh ubah untuk keserasian
// dengan Smart Layout sedia ada.
const tools = el('div', 'visual-editor-tools');
const sizeSlider = el('input');
const align = el('select');

const layoutButtons = [];

let updateButtons = () => {};

const buttons = el(
  'div',
  'drag-tool-row'
);

for (const [value, label] of LAYOUTS) {
  const button = el(
    'button',
    'layout-choice-button',
    label
  );

  button.type = 'button';

  button.addEventListener('click', () => {
    layout.value = value;

    layout.dispatchEvent(
      new Event('change', {
        bubbles: true
      })
    );
  });

  buttons.append(button);

  layoutButtons.push([
    button,
    value
  ]);
}

updateButtons = () => {
  for (const [button, value] of layoutButtons) {
    const active = page.layout === value;

    button.classList.toggle(
      'active',
      active
    );

    button.setAttribute(
      'aria-pressed',
      String(active)
    );
  }
};

updateButtons();

tools.append(
  el(
    'div',
    'visual-tools-heading',
    '📖 Susun Atur Halaman'
  ),
  buttons
);


  /* ==========================================
     SMART LAYOUT
     ========================================== */

  const smartLayoutPanel =
    window.StorylandSmartLayout
      ?.mountPage?.({
        page,
        index,

        onApply: result => {
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
        }
      }) || el('div');

  /* ==========================================
     GEMINI ILLUSTRATION IDEA
     ========================================== */

  
/* ==========================================
   STORYLAND AI V19.5
   IDEA ILUSTRASI BAHASA MELAYU
   ========================================== */

const details = el('details');

const ideaTitle = el(
  'summary',
  '',
  '💬 Idea Ilustrasi dalam Bahasa Melayu'
);

const ideaText = el(
  'p',
  'storyland-idea-malay',
  ''
);

details.append(
  ideaTitle,
  ideaText
);

let translatedSource = '';
let translating = false;

async function loadMalayIdea() {
  const source = String(
    page.illustrationPrompt || ''
  ).trim();

  if (!source) {
    ideaText.textContent =
      'Belum ada idea ilustrasi.';
    return;
  }

  // Jangan terjemah semula idea yang sama.
  if (translatedSource === source) {
    return;
  }

  if (translating) return;

  translating = true;
  ideaText.textContent =
    '⏳ Sedang menterjemah idea ilustrasi...';

  try {
    const result = await api(
      `/api/books/${encodeURIComponent(bookId)}` +
      `/pages/${number}/translate-idea`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: source
        })
      }
    );

    if (!result.translation) {
      throw new Error(
        'Gemini tidak memulangkan terjemahan.'
      );
    }

    // Elakkan terjemahan lama jika idea berubah.
    if (
      source !== String(
        page.illustrationPrompt || ''
      ).trim()
    ) {
      return;
    }

    ideaText.textContent =
      result.translation;

    translatedSource = source;

  } catch (error) {
    ideaText.textContent =
      '❌ ' + error.message;

  } finally {
    translating = false;
  }
}

details.addEventListener(
  'toggle',
  () => {
    if (details.open) {
      loadMalayIdea();
    }
  }
);


  /* ==========================================
     FINISH PAGE
     ========================================== */

  section.append(
    el(
      'b',
      '',
      '📖 HALAMAN ' + number
    ),

    design,

    labeled(
      '📖 Susun Atur Halaman',
      layout,
      'page-layout-label'
    ),

    body,

    tools,

    smartLayoutPanel,

    details
  );

  return section;
}


/* ======================================================
   BACKUP CENTER INTEGRATION
   ====================================================== */

function mountBackupCenter(editor, container) {
  const oldPanel = editor.querySelector(
    '.book-backup-panel'
  );

  oldPanel?.remove();

  if (
    !selected ||
    !window.StorylandBackup?.mount
  ) {
    return;
  }

  const bookId = selected.id;

  const panel = window.StorylandBackup.mount({
    bookId,

    onRestore: async () => {
      const opened = await openBook(bookId);

      if (opened) {
        await loadLibrary();

        message(
          '✅ Buku berjaya dipulihkan daripada backup.'
        );
      }
    }
  });

  if (panel) {
    editor.insertBefore(
      panel,
      container
    );
  }
}

/* ======================================================
   SAFE EDITOR RENDERING
   ====================================================== */

function renderEditor() {
  if (!selected) return;

  const editor = $('editor');
  const container = $('pages');

  if (!editor || !container) {
    console.warn(
      '[Editor] #editor atau #pages tiada.'
    );

    return;
  }

  const story = selected.pages;

  const fragment =
    document.createDocumentFragment();

  try {
    // Cover is the first direct child.
    fragment.append(
      makeCover()
    );

    // Add all story pages as direct children.
    story.pages.forEach(
      (page, index) => {
        const node = makeStoryPage(
          page,
          index
        );

        if (!(node instanceof HTMLElement)) {
          throw new Error(
            `Halaman ${index + 1} gagal dibina.`
          );
        }

        fragment.append(node);
      }
    );

    container.replaceChildren(
      fragment
    );

    editor.hidden = false;

    if ($('bookTitle')) {
      $('bookTitle').textContent =
        story.title;
    }

    if ($('moral')) {
      $('moral').textContent =
        '💖 Pengajaran: ' +
        (story.moral || '');
    }

    // Preserve the V18 backup center.
    mountBackupCenter(
      editor,
      container
    );

    window.StorylandQuality
      ?.mount?.(story);

    requestAnimationFrame(() => {
      window.StorylandEditor
        ?.refresh?.();

      console.log(
        'Storyland V18.6 rendered pages:',
        container.querySelectorAll(
          ':scope > .page'
        ).length
      );
    });

  } catch (error) {
    console.error(
      '[Render Editor]',
      error
    );

    message(
      '❌ Gagal memaparkan editor: ' +
      error.message
    );
  }
}

/* ======================================================
   CREATE STORY WITH GEMINI
   ====================================================== */

const createForm = $('create');

if (createForm) {
  createForm.addEventListener(
    'submit',
    async event => {
      event.preventDefault();

      const button = $('generate');

      if (button?.disabled) return;

      const originalText =
        button?.textContent || '';

      if (button) {
        button.disabled = true;

        button.textContent =
          '🪄 Gemini sedang menulis cerita...';
      }

      try {
        const form = new FormData(
          createForm
        );

        const payload =
          Object.fromEntries(
            form.entries()
          );

          
console.log(
  'Bilangan halaman dipilih:',
  payload.pageCount
);


        const result = await api(
          '/api/stories/generate',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify(payload)
          }
        );

        // Fix for null selected.id errors:
        // Always use the newly returned book ID.
        if (
          !result ||
          typeof result.id !== 'string' ||
          !result.id
        ) {
          throw new Error(
            'Gemini tidak memulangkan ID buku.'
          );
        }

        const newBookId = result.id;

        await loadLibrary();

        const opened = await openBook(
          newBookId
        );

        if (!opened) {
          throw new Error(
            'Cerita dijana tetapi editor gagal membuka buku.'
          );
        }

        message(
          '✅ Cerita baharu berjaya dijana!'
        );

      } catch (error) {
        console.error(
          '[Generate Story]',
          error
        );

        message(
          '❌ ' + error.message
        );

      } finally {
        if (button) {
          button.disabled = false;

          button.textContent =
            originalText ||
            '✨ Jana Cerita dengan Gemini';
        }
      }
    }
  );
}

/* ======================================================
   MANUAL SAVE — AUTO-SAVE PROTECTION V17.9 / V18.3
   ====================================================== */

const saveButton = $('save');

if (saveButton) {
  saveButton.addEventListener(
    'click',
    async () => {
      if (!selected || saveButton.disabled) {
        return;
      }

      const bookId = selected.id;

      const originalText =
        saveButton.textContent;

      saveButton.disabled = true;

      saveButton.textContent =
        '⏳ Menyimpan...';

      try {
        const autosave =
          window.StorylandAutosave;

        if (!autosave?.saveNow) {
          throw new Error(
            'Auto-Save Protection tidak dimuatkan.'
          );
        }

        if (
          selected.pages.pages.some(
            page =>
              wordCount(page.text) > MAX_WORDS
          )
        ) {
          throw new Error(
            'Ada halaman melebihi 35 perkataan.'
          );
        }

        const result = await autosave.saveNow();

        if (
          result?.bookId &&
          result.bookId !== bookId
        ) {
          throw new Error(
            'Buku aktif telah berubah.'
          );
        }

        message(
          '✅ Semua perubahan berjaya disimpan.'
        );

        await loadLibrary();

      } catch (error) {
        console.error(
          '[Manual Save]',
          error
        );

        message(
          '❌ Gagal menyimpan: ' +
          error.message
        );

      } finally {
        saveButton.disabled = false;

        saveButton.textContent =
          originalText;
      }
    }
  );
}

/* ======================================================
   EXPORT PDF
   ====================================================== */

const printButton = $('print');

if (printButton) {
  printButton.addEventListener(
    'click',
    () => {
      if (!selected) {
        message(
          '❌ Sila buka buku dahulu.'
        );

        return;
      }

      const story = selected.pages;

      const invalidPage = story.pages.find(
        page =>
          wordCount(page.text) > MAX_WORDS
      );

      if (invalidPage) {
        message(
          `❌ Halaman ${invalidPage.number} melebihi 35 perkataan.`
        );

        return;
      }

      const quality =
        window.StorylandQuality;

      if (
        typeof quality
          ?.validateBeforeExport === 'function'
      ) {
        const result =
          quality.validateBeforeExport(
            story
          );

        if (
          result &&
          result.passed === false
        ) {
          message(
            '⚠️ Lengkapkan semakan kualiti sebelum Export PDF.'
          );

          return;
        }
      }

      if (
        !window.StorylandPrint
          ?.printBook
      ) {
        message(
          '❌ Modul Export PDF tidak tersedia.'
        );

        return;
      }

      const size =
        $('pdfSize')?.value || 'A4';

      window.StorylandPrint.printBook(
        story,
        size
      );
    }
  );
}

/* ======================================================
   DASHBOARD REFRESH
   ====================================================== */

$('refresh')?.addEventListener(
  'click',
  () => {
    loadLibrary();
  }
);

/* ======================================================
   V18.6 — READING FONT SYNC
   ====================================================== */

document.addEventListener(
  'storyland:typography-change',
  event => {
    if (!selected?.pages) return;

    const data =
      event.detail || {};

    if (
      KIDS_FONTS.includes(data.font)
    ) {
      selected.pages.readingFont =
        data.font;
    }

    if (
      Number.isFinite(
        Number(data.fontSize)
      )
    ) {
      selected.pages.readingFontSize =
        Math.max(
          14,
          Math.min(
            30,
            Number(data.fontSize)
          )
        );
    }

    // The Auto-Save module tracks edits
    // in the selected story object.
    window.StorylandAutosave
      ?.changed?.();

    window.StorylandDraftRecovery
      ?.capture?.();
  }
);

/* ======================================================
   V18.3 / V18.4
   MULTI-DEVICE CONFLICT + SAVE AS COPY
   ====================================================== */

window.addEventListener(
  'storyland:book-conflict',
  event => {
    const data =
      event.detail || {};

    if (
      !selected ||
      selected.id !== data.bookId
    ) {
      return;
    }

    window.StorylandDraftRecovery
      ?.capture?.();

    const editor = $('editor');

    if (!editor) return;

    editor.querySelector(
      '.storyland-conflict-panel'
    )?.remove();

    const panel = el(
      'section',
      'storyland-conflict-panel'
    );

    const title = el(
      'h3',
      '',
      '⚠️ Konflik Suntingan Dikesan'
    );

    const description = el(
      'p',
      '',
      'Buku telah diubah pada tab atau peranti lain. ' +
      'Auto-Save dihentikan untuk mengelakkan perubahan terbaru ditimpa.'
    );

    const actions = el(
      'div',
      'storyland-conflict-actions'
    );

    const saveCopy = el(
      'button',
      'storyland-save-conflict-copy',
      '💾 Simpan Draf Sebagai Buku Baharu'
    );

    const reload = el(
      'button',
      '',
      '↻ Buka Versi Server'
    );

    const dismiss = el(
      'button',
      '',
      'Terus Semak Draf'
    );

    saveCopy.type = 'button';
    reload.type = 'button';
    dismiss.type = 'button';

    let busy = false;

    saveCopy.addEventListener(
      'click',
      async () => {
        if (busy || !selected) return;

        const confirmed = window.confirm(
          'Simpan draf sebagai buku baharu?\n\n' +
          'Buku asal tidak diubah.'
        );

        if (!confirmed) return;

        busy = true;
        saveCopy.disabled = true;

        try {
          window.StorylandUndoRedo
            ?.flush?.();

          window.StorylandDraftRecovery
            ?.capture?.();

          const story = selected.pages;

          const payload = {
            coverAuthor:
              story.coverAuthor || '',

            coverSubtitle:
              story.coverSubtitle || '',

            coverDesign:
              story.coverDesign || {},

            coverIllustrationIdea:
              story.coverIllustrationIdea || '',

            readingFont:
              story.readingFont || 'Nunito',

            readingFontSize:
              story.readingFontSize || 18,

            pages: story.pages.map(
              page => ({
                number: page.number,
                text: page.text,
                layout: page.layout,
                theme: page.theme,
                decoration:
                  page.decoration,
                imageScale:
                  page.imageScale,
                imageAlign:
                  page.imageAlign
              })
            )
          };

          const result = await api(
            `/api/books/${encodeURIComponent(data.bookId)}/conflict-copy`,
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json'
              },
              body: JSON.stringify(
                payload
              )
            }
          );

          if (!result?.id) {
            throw new Error(
              'Server tidak memulangkan ID salinan.'
            );
          }

          const opened =
            await openBook(result.id);

          if (!opened) {
            throw new Error(
              'Salinan berjaya dibuat tetapi gagal dibuka.'
            );
          }

          await loadLibrary();

          message(
            '✅ Draf berjaya diselamatkan sebagai buku baharu.'
          );

        } catch (error) {
          console.error(
            '[Conflict Copy]',
            error
          );

          message(
            '❌ ' + error.message
          );

          saveCopy.disabled = false;

        } finally {
          busy = false;
        }
      }
    );

    reload.addEventListener(
      'click',
      async () => {
        const confirmed = window.confirm(
          'Buka versi terbaru dari server?\n\n' +
          'Pastikan draf tempatan telah disimpan jika diperlukan.'
        );

        if (!confirmed) return;

        window.StorylandDraftRecovery
          ?.capture?.();

        await openBook(
          data.bookId
        );
      }
    );

    dismiss.addEventListener(
      'click',
      () => {
        panel.remove();

        message(
          '⚠️ Konflik masih aktif. ' +
          'Simpan sebagai salinan untuk melindungi draf.'
        );
      }
    );

    actions.append(
      saveCopy,
      reload,
      dismiss
    );

    panel.append(
      title,
      description,
      actions
    );

    editor.prepend(panel);

    panel.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }
);

/* ======================================================
   INITIALIZE LIBRARY AFTER LOGIN
   ====================================================== */

if (window.StorylandAuth?.ready) {
  window.StorylandAuth.ready
    .then(() => {
      loadLibrary();
    })
    .catch(error => {
      console.error(
        '[Auth Ready]',
        error
      );
    });
} else {
  console.warn(
    '[Storyland] Auth module not ready.'
  );
}

/* ======================================================
   DEBUG UTILITIES
   ====================================================== */

window.StorylandAppDebug = {
  getStatus() {
    return {
      selectedId:
        selected?.id || null,

      revision:
        selected?.revision || null,

      storyPages:
        selected?.pages?.pages?.length || 0,

      renderedPages:
        document.querySelectorAll(
          '#pages > .page'
        ).length,

      navigation:
        window.StorylandEditor
          ?.getStatus?.() || null,

      autosave:
        window.StorylandAutosave
          ?.getStatus?.() || null,

      undoRedo:
        window.StorylandUndoRedo
          ?.getStatus?.() || null
    };
  },

  renderAgain() {
    renderEditor();
  },

  loadLibrary,

  openBook
};

console.log(
  'Storyland AI App V18.6 Ready'
);
