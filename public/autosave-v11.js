
/* ===============================================
   STORYLAND AI V17.9
   AUTO-SAVE PROTECTION
   Serialized saves + Undo/Redo support
   =============================================== */

(function () {
  'use strict';

  const VERSION = '17.9';
  const SAVE_DELAY = 1200;
  const CHECK_INTERVAL = 1200;
  const MAX_WORDS = 35;

  let current = null;
  let statusElement = null;
  let debounceTimer = null;

  const clone = value =>
    JSON.parse(JSON.stringify(value));

  const wordCount = value =>
    String(value || '')
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .length;

  function buildPayload(story) {
    return {
      
coverIllustrationIdea:
  story.coverIllustrationIdea || '',

readingFont:
  story.readingFont || 'Nunito',

readingFontSize:
  story.readingFontSize || 18,

      coverAuthor: story.coverAuthor || '',
      coverSubtitle: story.coverSubtitle || '',
      coverDesign: clone(story.coverDesign || {}),

      pages: story.pages.map(page => ({
        number: page.number,
        text: page.text || '',
        layout: page.layout || 'side',
        theme: page.theme || 'fantasy',
        decoration: page.decoration || 'frame',
        imageScale: Number(page.imageScale) || 100,
        imageAlign: page.imageAlign || 'center'
      }))
    };
  }

  function signature(payload) {
    return JSON.stringify(payload);
  }

  function validate(payload) {
    if (
      !Array.isArray(payload.pages) ||
      !payload.pages.length
    ) {
      throw new Error('Buku tidak mempunyai halaman.');
    }

    const tooLong = payload.pages.find(
      page => wordCount(page.text) > MAX_WORDS
    );

    if (tooLong) {
      throw new Error(
        `Halaman ${tooLong.number} melebihi ${MAX_WORDS} perkataan.`
      );
    }
  }

  function ensureStatus() {
    const editor = document.getElementById('editor');

    if (!editor) return;

    if (!statusElement) {
      statusElement = document.createElement('div');
      statusElement.className = 'autosave-status';
      statusElement.setAttribute('role', 'status');
      statusElement.setAttribute('aria-live', 'polite');
    }

    if (!editor.contains(statusElement)) {
      editor.prepend(statusElement);
    }
  }

  function setStatus(text, state = 'idle', session = current) {
    // Prevent an old book's save from changing
    // the status of the newly opened book.
    if (session && session !== current) return;

    ensureStatus();

    if (!statusElement) return;

    statusElement.textContent = text;
    statusElement.dataset.state = state;
  }

  function isDirty(session) {
    if (!session) return false;

    return signature(buildPayload(session.book.pages)) !==
      session.lastSaved;
  }

  function schedule(session = current) {
    if (!session || session !== current) return;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    setStatus(
      '✏️ Ada perubahan belum disimpan...',
      'warning',
      session
    );

    debounceTimer = setTimeout(() => {
      debounceTimer = null;

      if (session !== current) return;

      saveSession(session).catch(error => {
        console.error('[Auto-Save]', error);
      });
    }, SAVE_DELAY);
  }

  /*
   * Save queue:
   *
   * Only one PUT request is running per session.
   * When changes happen during a request,
   * the loop sends the newest snapshot next.
   */

  function saveSession(session) {
    if (!session) {
      return Promise.reject(
        new Error('Tiada buku sedang dibuka.')
      );
    }

    if (session.inFlight) {
      return session.inFlight;
    }

    const task = (async () => {
      let saveCount = 0;

      while (isDirty(session)) {
        const payload = buildPayload(session.book.pages);
        const serialized = signature(payload);

        validate(payload);

        setStatus(
          '⏳ Menyimpan perubahan...',
          'saving',
          session
        );

        const response = await fetch(
          `/api/books/${encodeURIComponent(session.book.id)}`,
          {
            method: 'PUT',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json'
            },
            
body: JSON.stringify({
  ...payload,
  revision: session.revision
})

          }
        );

        const result = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.error || `HTTP ${response.status}`
          );
        }

        // Only mark the exact successfully
        // submitted version as saved.
        
if (!Number.isSafeInteger(result.revision)) {
  throw new Error(
    'Server tidak memulangkan revision terkini.'
  );
}

session.revision = result.revision;
session.book.revision = result.revision;

session.lastSaved = serialized;
session.lastSavedAt = new Date();


        saveCount++;
      }

      if (session === current) {
        setStatus(
          saveCount > 0
            ? '✅ Semua perubahan telah disimpan.'
            : '✅ Tiada perubahan belum disimpan.',
          'success',
          session
        );
      }
    })();

    session.inFlight = task;

    // Release the queue when the request chain
    // ends, regardless of success or failure.
    task.then(
      () => {
        if (session.inFlight === task) {
          session.inFlight = null;
        }
      },
      error => {
        if (session.inFlight === task) {
          session.inFlight = null;
        }

        setStatus(
          '❌ Auto-Save gagal: ' + error.message,
          'warning',
          session
        );
      }
    );

    return task;
  }

  async function saveNow() {
    const session = current;

    if (!session) {
      throw new Error('Buka buku dahulu.');
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Capture unfinished edits for Undo & Redo.
    window.StorylandUndoRedo?.flush?.();

    /*
     * If a save is already running, finish it,
     * then save again if the user made a later edit.
     */
    while (true) {
      const pending = saveSession(session);
      await pending;

      if (!isDirty(session)) break;
    }

    return {
      ok: true,
      bookId: session.book.id,
      savedAt: session.lastSavedAt
    };
  }

  function attach(book) {
    if (
      !book?.id ||
      !book?.pages ||
      !Array.isArray(book.pages.pages)
    ) {
      throw new Error(
        'Data buku untuk Auto-Save tidak sah.'
      );
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // A previously started save for another
    // book is allowed to finish independently.
    
current = {
  book,
  revision: Number(book.revision),
  lastSaved: signature(buildPayload(book.pages)),
  lastSavedAt: null,
  inFlight: null,
  conflict: false,
  conflictMessage: ''
};


    setStatus(
      '✅ Auto-Save Protection aktif.',
      'success'
    );
  }

  function checkChanges() {
    const session = current;

    if (!session) return;

    if (isDirty(session) && !debounceTimer &&
        !session.inFlight) {
      schedule(session);
    }
  }

  // Detect text edits and standard form edits.
  document.addEventListener('input', event => {
    const editor = document.getElementById('editor');

    if (editor?.contains(event.target)) {
      if (current && isDirty(current)) {
        schedule();
      }
    }
  }, true);

  document.addEventListener('change', event => {
    const editor = document.getElementById('editor');

    if (editor?.contains(event.target)) {
      if (current && isDirty(current)) {
        schedule();
      }
    }
  }, true);

  /*
   * Polling also catches JavaScript updates from:
   * - Undo/Redo
   * - Smart Book Layout
   * - Cover Designer
   */
  setInterval(checkChanges, CHECK_INTERVAL);

  window.addEventListener('beforeunload', event => {
    if (current && isDirty(current)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  window.StorylandAutosave = {
    version: VERSION,
    attach,
    saveNow,
    flush: saveNow,
    changed: () => schedule(),
    isDirty: () => isDirty(current),

    // Compatibility with older app.js code.
    // No premature "saved" marking.
    manualSaveCompleted() {
      checkChanges();
    },

    getStatus() {
      return {
        version: VERSION,
        bookId: current?.book.id || null,
        dirty: isDirty(current),
        saving: Boolean(current?.inFlight),
        savedAt: current?.lastSavedAt?.toISOString() || null
      };
    }
  };

  console.log(
    'Storyland Auto-Save Protection V17.9 loaded'
  );
})();
