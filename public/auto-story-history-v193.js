
/* =====================================================
   STORYLAND AI V19.3
   AUTO SAVE STORY TEXT HISTORY

   - Saves previous text on manual editing
   - Saves previous text before AI replacement
   - Preserves existing book Auto-Save
   - Maximum history managed by server (20/page)
   ===================================================== */

(function () {
  'use strict';

  const sessions = new Map();
  const DELAY = 1500;

  function countWords(value) {
    return String(value || '')
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .length;
  }

  function key(bookId, pageNumber) {
    return `${bookId}:${pageNumber}`;
  }

  function endpoint(bookId, pageNumber) {
    return (
      `/api/books/${encodeURIComponent(bookId)}` +
      `/pages/${encodeURIComponent(pageNumber)}` +
      '/text-history'
    );
  }

  async function saveVersion(
    bookId,
    pageNumber,
    text
  ) {
    const value = String(text || '').trim();

    if (!value || countWords(value) > 35) {
      return false;
    }

    const response = await fetch(
      endpoint(bookId, pageNumber),
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: value
        })
      }
    );

    const type =
      response.headers.get('content-type') || '';

    if (!type.includes('application/json')) {
      throw new Error(
        `API sejarah tidak tersedia: HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || 'Gagal menyimpan sejarah.'
      );
    }

    window.dispatchEvent(
      new CustomEvent(
        'storyland:story-history-updated',
        {
          detail: {
            bookId,
            pageNumber
          }
        }
      )
    );

    return true;
  }

  function attach({
    bookId,
    pageNumber,
    textarea
  }) {
    const id = key(bookId, pageNumber);

    // Avoid registering listeners twice.
    if (sessions.has(id)) {
      sessions.get(id).dispose();
    }

    let previousText = textarea.value;
    let timer = null;
    let disposed = false;

    let queue = Promise.resolve();

    function queueSave(value) {
      const text = String(value || '').trim();

      if (!text || countWords(text) > 35) {
        return;
      }

      queue = queue
        .catch(() => {})
        .then(() => saveVersion(
          bookId,
          pageNumber,
          text
        ))
        .catch(error => {
          console.error(
            '[Auto Story History]',
            error
          );
        });
    }

    function recordChange() {
      if (disposed) return;

      const current = textarea.value;

      if (current === previousText) return;

      const oldVersion = previousText;

      previousText = current;

      clearTimeout(timer);

      timer = setTimeout(() => {
        queueSave(oldVersion);
      }, DELAY);
    }

    // For regular typing: wait for a short pause.
    textarea.addEventListener(
      'input',
      recordChange
    );

    function onBlur() {
      clearTimeout(timer);

      // Save only the previous text snapshot.
      if (previousText !== textarea.value) {
        recordChange();
      }
    }

    textarea.addEventListener('blur', onBlur);

    const session = {
      recordBeforeReplace(oldText) {
        clearTimeout(timer);

        const value = String(oldText || '').trim();

        if (value && value !== textarea.value) {
          queueSave(value);
        } else if (value) {
          queueSave(value);
        }

        previousText = textarea.value;
      },

      syncCurrent(newText) {
        clearTimeout(timer);
        previousText = String(newText || '');
      },

      dispose() {
        disposed = true;
        clearTimeout(timer);

        textarea.removeEventListener(
          'input',
          recordChange
        );

        textarea.removeEventListener(
          'blur',
          onBlur
        );

        sessions.delete(id);
      }
    };

    sessions.set(id, session);

    return session;
  }

  window.StorylandAutoStoryHistory = {
    attach,
    saveVersion,

    getStatus() {
      return {
        activePages: sessions.size
      };
    }
  };

  console.log(
    'Storyland Auto Story History V19.3 Ready'
  );
})();
