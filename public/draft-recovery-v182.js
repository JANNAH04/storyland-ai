
/* =============================================
   STORYLAND AI V18.2
   LOCAL DRAFT RECOVERY
   ============================================= */

(function () {
  'use strict';

  const VERSION = '18.2';
  const PREFIX = 'storyland:draft:v182:';
  const MAX_DRAFT_AGE = 7 * 24 * 60 * 60 * 1000;

  let active = null;
  let panel = null;
  let pendingDecision = false;
  let available = true;

  const clone = value =>
    JSON.parse(JSON.stringify(value));

  function make(tag, className = '', text = '') {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  function snapshot(story) {
    return {
      coverAuthor: story.coverAuthor || '',
      coverSubtitle: story.coverSubtitle || '',
      coverDesign: clone(story.coverDesign || {}),

      pages: (story.pages || []).map(p => ({
        number: p.number,
        text: p.text || '',
        layout: p.layout || 'side',
        theme: p.theme || 'fantasy',
        decoration: p.decoration || 'frame',
        imageScale: Number(p.imageScale) || 100,
        imageAlign: p.imageAlign || 'center'
      }))
    };
  }

  function keyFor(book) {
    const owner = String(
      book.owner_id || 'local-user'
    );

    return PREFIX + owner + ':' + book.id;
  }

  function readDraft(key) {
    try {
      const raw = localStorage.getItem(key);

      if (!raw) return null;

      const saved = JSON.parse(raw);

      if (
        !saved ||
        !saved.snapshot ||
        typeof saved.updatedAt !== 'number' ||
        Date.now() - saved.updatedAt >
          MAX_DRAFT_AGE
      ) {
        localStorage.removeItem(key);
        return null;
      }

      return saved;
    } catch (error) {
      console.warn('[Draft Recovery] Read:', error);
      return null;
    }
  }

  function writeDraft() {
    if (
      !active ||
      pendingDecision ||
      !available
    ) {
      return;
    }

    const data = {
      version: VERSION,
      bookId: active.book.id,
      updatedAt: Date.now(),
      snapshot: snapshot(active.book.pages)
    };

    try {
      localStorage.setItem(
        active.key,
        JSON.stringify(data)
      );
    } catch (error) {
      available = false;

      console.warn(
        '[Draft Recovery] Storage unavailable:',
        error
      );

      if (panel) {
        const status = panel.querySelector(
          '.draft-recovery-status'
        );

        if (status) {
          status.textContent =
            '⚠️ Browser tidak dapat menyimpan draf sementara.';
        }
      }
    }
  }

  function applyDraft(story, saved) {
    if (
      !saved ||
      !Array.isArray(saved.pages) ||
      !Array.isArray(story.pages)
    ) {
      throw new Error('Data draf tidak sah.');
    }

    const byNumber = new Map(
      saved.pages.map(p => [
        p.number,
        p
      ])
    );

    story.coverAuthor =
      String(saved.coverAuthor || '').slice(0, 100);

    story.coverSubtitle =
      String(saved.coverSubtitle || '').slice(0, 200);

    story.coverDesign = clone(
      saved.coverDesign || {}
    );

    for (const page of story.pages) {
      const previous = byNumber.get(page.number);

      if (!previous) continue;

      if (typeof previous.text === 'string') {
        page.text = previous.text;
      }

      if (
        ['top', 'bottom', 'side'].includes(
          previous.layout
        )
      ) {
        page.layout = previous.layout;
      }

      if (
        ['fantasy', 'garden', 'royal', 'sky'].includes(
          previous.theme
        )
      ) {
        page.theme = previous.theme;
      }

      if (
        ['frame', 'minimal'].includes(
          previous.decoration
        )
      ) {
        page.decoration = previous.decoration;
      }

      if (
        [40, 50, 60, 70, 80, 90, 100].includes(
          Number(previous.imageScale)
        )
      ) {
        page.imageScale =
          Number(previous.imageScale);
      }

      if (
        ['left', 'center', 'right'].includes(
          previous.imageAlign
        )
      ) {
        page.imageAlign = previous.imageAlign;
      }
    }

    // Never replace image URLs or AI history.
  }

  function removePanel() {
    panel?.remove();
    panel = null;
  }

  function showRecovery(draft, onRecover) {
    removePanel();

    pendingDecision = true;

    panel = make(
      'section',
      'draft-recovery-panel'
    );

    const title = make(
      'h3',
      '',
      '🛟 Draf Belum Disimpan Ditemui'
    );

    const date = make(
      'p',
      '',
      'Draf terakhir: ' +
      new Date(draft.updatedAt)
        .toLocaleString('ms-MY')
    );

    const description = make(
      'p',
      '',
      'Browser menyimpan versi yang berbeza ' +
      'daripada buku di server. ' +
      'Pilih sama ada mahu memulihkan draf ' +
      'atau mengekalkan versi server.'
    );

    const actions = make(
      'div',
      'draft-recovery-actions'
    );

    const recoverButton = make(
      'button',
      'draft-recovery-restore',
      '↩ Pulihkan Draf'
    );

    recoverButton.type = 'button';

    const discardButton = make(
      'button',
      'draft-recovery-discard',
      'Gunakan Versi Server'
    );

    discardButton.type = 'button';

    const status = make(
      'p',
      'draft-recovery-status'
    );

    recoverButton.onclick = () => {
      if (!active) return;

      try {
        applyDraft(
          active.book.pages,
          draft.snapshot
        );

        pendingDecision = false;

        if (typeof onRecover === 'function') {
          onRecover();
        }

        writeDraft();

        status.textContent =
          '✅ Draf dipulihkan. ' +
          'Tekan Simpan Buku untuk menyimpan ke server.';

        recoverButton.disabled = true;
        discardButton.disabled = true;

      } catch (error) {
        status.textContent =
          '❌ ' + error.message;
      }
    };

    discardButton.onclick = () => {
      if (!active) return;

      try {
        localStorage.removeItem(active.key);
      } catch {}

      pendingDecision = false;
      removePanel();
    };

    actions.append(
      recoverButton,
      discardButton
    );

    panel.append(
      title,
      date,
      description,
      actions,
      status
    );

    const editor = document.getElementById('editor');

    if (editor) {
      editor.prepend(panel);
    }
  }

  function attach(book, onRecover) {
    if (
      !book?.id ||
      !book?.pages ||
      !Array.isArray(book.pages.pages)
    ) {
      return;
    }

    pendingDecision = false;
    removePanel();

    active = {
      book,
      key: keyFor(book)
    };

    const previous = readDraft(active.key);

    if (
      previous &&
      JSON.stringify(previous.snapshot) !==
        JSON.stringify(snapshot(book.pages))
    ) {
      showRecovery(previous, onRecover);
    } else {
      if (previous) {
        try {
          localStorage.removeItem(active.key);
        } catch {}
      }
    }
  }

  
function capture() {
  if (!active || pendingDecision) {
    return;
  }

  const autosave = window.StorylandAutosave;

  // When current edits have already been
  // successfully saved, remove matching
  // temporary browser drafts.
  if (
    autosave?.isDirty &&
    !autosave.isDirty()
  ) {
    const draft = readDraft(active.key);

    if (
      draft &&
      JSON.stringify(draft.snapshot) ===
        JSON.stringify(snapshot(active.book.pages))
    ) {
      try {
        localStorage.removeItem(active.key);
      } catch {}
    }

    return;
  }

  writeDraft();
}


  document.addEventListener(
    'input',
    event => {
      const editor =
        document.getElementById('editor');

      if (editor?.contains(event.target)) {
        // Run after the editor's own input handler.
        queueMicrotask(capture);
      }
    }
  );

  document.addEventListener(
    'change',
    event => {
      const editor =
        document.getElementById('editor');

      if (editor?.contains(event.target)) {
        queueMicrotask(capture);
      }
    }
  );

  // Detect programmatic changes from Smart Layout
  // and Undo/Redo.
  setInterval(capture, 2500);

  window.addEventListener('pagehide', capture);

  window.StorylandDraftRecovery = {
    version: VERSION,
    attach,
    capture,

    getStatus() {
      return {
        version: VERSION,
        bookId: active?.book.id || null,
        storageAvailable: available,
        recoveryPending: pendingDecision,
        hasLocalDraft: active
          ? Boolean(readDraft(active.key))
          : false
      };
    }
  };

  console.log(
    'Storyland Draft Recovery V18.2 loaded'
  );
})();
