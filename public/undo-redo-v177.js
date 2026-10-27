
/* ============================================
   STORYLAND AI V17.8
   UNDO & REDO PRO
   ============================================ */

(function () {
  'use strict';

  const VERSION = '17.8';
  const MAX_HISTORY = 50;
  const EDIT_DELAY = 450;
  const CHECK_INTERVAL = 800;

  let story = null;
  let renderCallback = null;

  let entries = [];
  let cursor = -1;
  let timer = null;
  let restoring = false;

  let toolbar = null;
  let undoButton = null;
  let redoButton = null;
  let counter = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snapshot(book) {
    return {
      coverAuthor: book.coverAuthor || '',
      coverSubtitle: book.coverSubtitle || '',
      coverDesign: clone(book.coverDesign || {}),

      pages: book.pages.map(page => ({
        number: page.number,
        text: page.text || '',
        layout: page.layout || 'side',
        theme: page.theme || 'fantasy',
        decoration: page.decoration || 'frame',
        imageScale: page.imageScale || 100,
        imageAlign: page.imageAlign || 'center'
      }))
    };
  }

  function equal(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function updateButtons() {
    if (!toolbar) return;

    undoButton.disabled = !story || cursor <= 0;

    redoButton.disabled =
      !story || cursor >= entries.length - 1;

    counter.textContent = !story
      ? 'Tiada buku'
      : `${cursor + 1} / ${entries.length} versi`;
  }

  function record() {
    if (!story || restoring) return false;

    const next = snapshot(story);

    if (
      cursor >= 0 &&
      equal(entries[cursor], next)
    ) {
      return false;
    }

    // Remove future states after a new edit.
    entries = entries.slice(0, cursor + 1);

    entries.push(next);

    if (entries.length > MAX_HISTORY + 1) {
      entries.shift();
    }

    cursor = entries.length - 1;

    updateButtons();
    return true;
  }

  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    return record();
  }

  function changed() {
    if (!story || restoring) return;

    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      record();
    }, EDIT_DELAY);
  }

  /* ==========================================
     REMEMBER ACTIVE SPREAD
     ========================================== */

  function visibleSpreadIndex() {
    const pages = document.getElementById('pages');

    if (!pages) return 0;

    const nodes = Array.from(
      pages.querySelectorAll(
        ':scope > .cover-page, :scope > .page'
      )
    );

    if (!nodes.length) return 0;

    const firstVisible = nodes.findIndex(node => {
      const style = getComputedStyle(node);

      return (
        !node.hidden &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        node.getClientRects().length > 0
      );
    });

    if (firstVisible <= 0) return 0;

    // Spread 0 = cover
    // Spread 1 = story pages 1 and 2
    // Spread 2 = story pages 3 and 4
    return Math.ceil(firstVisible / 2);
  }

  function restoreSpread(index, savedScroll) {
    requestAnimationFrame(() => {
      // renderEditor uses requestAnimationFrame to
      // refresh StorylandEditor navigation.
      requestAnimationFrame(() => {
        const navigation = window.StorylandEditor;

        if (navigation?.next) {
          const steps = Math.max(
            0,
            Math.min(20, index)
          );

          for (let i = 0; i < steps; i++) {
            navigation.next();
          }
        }

        window.scrollTo({
          top: savedScroll,
          behavior: 'instant'
        });
      });
    });
  }

  /* ==========================================
     APPLY HISTORY STATE
     ========================================== */

  function applyState(state) {
    if (!story || !state) return;

    const currentSpread = visibleSpreadIndex();
    const scroll = window.scrollY;

    restoring = true;

    try {
      story.coverAuthor = state.coverAuthor;
      story.coverSubtitle = state.coverSubtitle;
      story.coverDesign = clone(state.coverDesign);

      const byNumber = new Map(
        state.pages.map(page => [
          page.number,
          page
        ])
      );

      for (const page of story.pages) {
        const previous = byNumber.get(page.number);

        if (!previous) continue;

        page.text = previous.text;
        page.layout = previous.layout;
        page.theme = previous.theme;
        page.decoration = previous.decoration;
        page.imageScale = previous.imageScale;
        page.imageAlign = previous.imageAlign;
      }

      // Image URLs, AI quota, image history
      // and character profiles remain untouched.
      renderCallback?.();

      restoreSpread(currentSpread, scroll);

      updateButtons();

    } finally {
      restoring = false;
    }
  }

  function undo() {
    flush();

    if (cursor <= 0) return;

    cursor--;
    applyState(entries[cursor]);
  }

  function redo() {
    flush();

    if (cursor >= entries.length - 1) return;

    cursor++;
    applyState(entries[cursor]);
  }

  /* ==========================================
     HISTORY TOOLBAR
     ========================================== */

  function makeToolbar() {
    const bar = document.createElement('div');
    bar.className = 'storyland-history-toolbar';

    undoButton = document.createElement('button');
    undoButton.type = 'button';
    undoButton.className = 'history-undo-button';
    undoButton.textContent = '↶ Undo';
    undoButton.title = 'Ctrl + Z';

    redoButton = document.createElement('button');
    redoButton.type = 'button';
    redoButton.className = 'history-redo-button';
    redoButton.textContent = '↷ Redo';
    redoButton.title = 'Ctrl + Y / Ctrl + Shift + Z';

    counter = document.createElement('span');
    counter.className = 'history-counter';

    undoButton.addEventListener('click', undo);
    redoButton.addEventListener('click', redo);

    bar.append(undoButton, redoButton, counter);

    return bar;
  }

  function ensureToolbar() {
    const editor = document.getElementById('editor');
    const pages = document.getElementById('pages');

    if (!editor || !pages) return;

    if (!toolbar) {
      toolbar = makeToolbar();
    }

    if (!editor.contains(toolbar)) {
      editor.insertBefore(toolbar, pages);
    }

    updateButtons();
  }

  function bind(book, onRender) {
    if (!book || !Array.isArray(book.pages)) {
      return;
    }

    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    story = book;
    renderCallback = onRender;

    entries = [snapshot(story)];
    cursor = 0;
    restoring = false;

    ensureToolbar();
    updateButtons();
  }

  /* ==========================================
     INPUT DETECTION
     ========================================== */

  document.addEventListener(
    'input',
    event => {
      const editor = document.getElementById('editor');

      if (
        editor &&
        editor.contains(event.target)
      ) {
        changed();
      }
    },
    true
  );

  document.addEventListener(
    'change',
    event => {
      const editor = document.getElementById('editor');

      if (
        editor &&
        editor.contains(event.target)
      ) {
        changed();
      }
    },
    true
  );

  // Detect programmatic changes from
  // Smart Layout and Cover Designer.
  setInterval(() => {
    if (!story || restoring || timer !== null) {
      return;
    }

    record();
  }, CHECK_INTERVAL);

  /* ==========================================
     KEYBOARD SHORTCUTS
     ========================================== */

  document.addEventListener('keydown', event => {
    if (
      event.altKey ||
      !(event.ctrlKey || event.metaKey)
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    const isUndo =
      key === 'z' && !event.shiftKey;

    const isRedo =
      key === 'y' ||
      (key === 'z' && event.shiftKey);

    if (!isUndo && !isRedo) return;

    const editor = document.getElementById('editor');
    const active = document.activeElement;

    // Do not intercept shortcuts in login,
    // dashboard search, or external forms.
    if (
      active &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) &&
      !editor?.contains(active)
    ) {
      return;
    }

    if (!story || !editor || editor.hidden) {
      return;
    }

    event.preventDefault();

    if (isUndo) undo();
    else redo();
  });

  window.StorylandUndoRedo = {
    version: VERSION,
    bind,
    changed,
    flush,
    undo,
    redo,

    getStatus() {
      return {
        version: VERSION,
        steps: entries.length,
        current: cursor,
        canUndo: cursor > 0,
        canRedo: cursor < entries.length - 1,
        activeSpread: visibleSpreadIndex()
      };
    }
  };

  console.log(
    'Storyland Undo & Redo V17.8 loaded'
  );
})();
