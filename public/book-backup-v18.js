
/* ==========================================
   STORYLAND AI V18.2
   BOOK BACKUP CENTER — FIXED VERSION

   Features:
   - Manual Book Backup
   - Backup History
   - Restore Previous Backup
   - Auto-Save Protection Integration
   - Fixed Refresh Button
   - Single API Request Per Refresh
   - Clear Status Messages
   ========================================== */

(function () {
  'use strict';

  const VERSION = '18.2';

  /* ==========================================
     DOM HELPER
     ========================================== */

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }

    return node;
  }

  /* ==========================================
     API HELPER
     ========================================== */

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options
    });

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || `HTTP ${response.status}`
      );
    }

    return data;
  }

  /* ==========================================
     FORMAT DATE
     ========================================== */

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Tarikh tidak tersedia';
    }

    return date.toLocaleString('ms-MY', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /* ==========================================
     MOUNT BACKUP CENTER
     ========================================== */

  function mount({ bookId, onRestore } = {}) {
    if (!bookId) {
      throw new Error(
        'Book ID diperlukan untuk Backup Center.'
      );
    }

    const encodedBookId = encodeURIComponent(bookId);

    const baseUrl = `/api/books/${encodedBookId}/backups`;

    /* PANEL */

    const panel = el(
      'section',
      'book-backup-panel'
    );

    const heading = el(
      'h3',
      '',
      '🔐 Book Backup Center'
    );

    const description = el(
      'p',
      '',
      'Simpan versi buku dan pulihkan kandungan lama apabila diperlukan.'
    );

    /* CONTROLS */

    const controls = el(
      'div',
      'book-backup-controls'
    );

    const backupButton = el(
      'button',
      'book-backup-create',
      '💾 Backup Buku Sekarang'
    );

    backupButton.type = 'button';

    const refreshButton = el(
      'button',
      'book-backup-refresh',
      '↻ Refresh'
    );

    refreshButton.type = 'button';

    /* STATUS */

    const status = el(
      'p',
      'book-backup-status'
    );

    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    /* BACKUP LIST */

    const list = el(
      'div',
      'book-backup-list'
    );

    /* STATE */

    let busy = false;
    let lastBackups = [];

    function setBusy(value) {
      busy = Boolean(value);

      backupButton.disabled = busy;
      refreshButton.disabled = busy;

      panel.classList.toggle(
        'backup-is-busy',
        busy
      );
    }

    function setStatus(text, type = 'info') {
      status.textContent = text;
      status.dataset.state = type;
    }

    /* ==========================================
       RENDER BACKUP LIST
       ========================================== */

    function renderBackups(backups) {
      list.replaceChildren();

      if (!Array.isArray(backups)) {
        throw new Error(
          'Format senarai backup tidak sah.'
        );
      }

      lastBackups = backups;

      if (backups.length === 0) {
        list.append(
          el(
            'p',
            'book-backup-empty',
            'Belum ada backup untuk buku ini.'
          )
        );

        return;
      }

      for (const backup of backups) {
        const card = el(
          'div',
          'book-backup-card'
        );

        const info = el(
          'div',
          'book-backup-info'
        );

        const label = el(
          'strong',
          '',
          backup.label || 'Backup Buku'
        );

        const date = el(
          'small',
          '',
          formatDate(backup.created_at)
        );

        info.append(
          label,
          date
        );

        /* RESTORE BUTTON */

        const restoreButton = el(
          'button',
          'book-backup-restore',
          '↩ Restore'
        );

        restoreButton.type = 'button';

        restoreButton.addEventListener(
          'click',
          async () => {
            if (busy) return;

            const confirmed = window.confirm(
              'Pulihkan buku kepada versi backup ini?\n\n' +
              'Perubahan terkini akan digantikan.\n' +
              'Sistem akan mencipta backup keselamatan sebelum Restore.'
            );

            if (!confirmed) return;

            setBusy(true);

            setStatus(
              '⏳ Sedang memulihkan buku...',
              'loading'
            );

            restoreButton.disabled = true;

            try {
              /*
               * Save any pending edits first.
               * Uses Auto-Save Protection V17.9.
               */

              const autosave =
                window.StorylandAutosave;

              if (autosave?.saveNow) {
                const saved = await autosave.saveNow();

                if (
                  saved?.bookId &&
                  saved.bookId !== bookId
                ) {
                  throw new Error(
                    'Buku aktif telah berubah. Restore dibatalkan.'
                  );
                }
              }

              /*
               * Restore the selected version
               * from the existing backend API.
               */

              const result = await api(
                `${baseUrl}/${encodeURIComponent(backup.id)}/restore`,
                {
                  method: 'POST'
                }
              );

              if (result.ok !== true) {
                throw new Error(
                  'Server tidak mengesahkan Restore.'
                );
              }

              setStatus(
                '✅ Buku berjaya dipulihkan.',
                'success'
              );

              /*
               * Reload the book from server
               * so old in-memory state cannot
               * overwrite restored content.
               */

              if (typeof onRestore === 'function') {
                await onRestore();
              }

              /*
               * The old panel may be replaced
               * by renderEditor after Restore.
               */

              if (panel.isConnected) {
                await refresh();
              }

            } catch (error) {
              console.error(
                '[Book Backup Restore]',
                error
              );

              setStatus(
                '❌ Restore gagal: ' + error.message,
                'error'
              );

            } finally {
              setBusy(false);
              restoreButton.disabled = false;
            }
          }
        );

        card.append(
          info,
          restoreButton
        );

        list.append(card);
      }
    }

    /* ==========================================
       REFRESH BACKUP LIST — FIXED
       ========================================== */

    async function refresh() {
      /*
       * Only one API request.
       *
       * IMPORTANT:
       * Always return data, even when
       * the backup list is empty.
       */

      const data = await api(baseUrl);

      if (!Array.isArray(data.backups)) {
        throw new Error(
          'Server tidak memulangkan senarai backup yang sah.'
        );
      }

      renderBackups(data.backups);

      return data;
    }

    /* ==========================================
       MANUAL BACKUP
       ========================================== */

    backupButton.addEventListener(
      'click',
      async () => {
        if (busy) return;

        setBusy(true);

        setStatus(
          '⏳ Sedang menyimpan backup...',
          'loading'
        );

        try {
          /*
           * Ensure current editor edits
           * are saved before snapshot.
           */

          const autosave =
            window.StorylandAutosave;

          if (autosave?.saveNow) {
            const saved = await autosave.saveNow();

            if (
              saved?.bookId &&
              saved.bookId !== bookId
            ) {
              throw new Error(
                'Buku aktif telah berubah. Backup dibatalkan.'
              );
            }
          }

          const result = await api(baseUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              label: 'Backup Manual'
            })
          });

          if (result.ok !== true) {
            throw new Error(
              'Server tidak mengesahkan backup.'
            );
          }

          /*
           * Refresh once after successful
           * backup creation.
           */

          const updated = await refresh();

          setStatus(
            `✅ Backup berjaya disimpan. ` +
            `${updated.backups.length} backup tersedia.`,
            'success'
          );

        } catch (error) {
          console.error(
            '[Book Backup Create]',
            error
          );

          setStatus(
            '❌ Backup gagal: ' + error.message,
            'error'
          );

        } finally {
          setBusy(false);
        }
      }
    );

    /* ==========================================
       REFRESH BUTTON — FIXED
       ========================================== */

    refreshButton.addEventListener(
      'click',
      async () => {
        if (busy) return;

        setBusy(true);

        setStatus(
          '⏳ Sedang memuat semula senarai backup...',
          'loading'
        );

        try {
          /*
           * refresh() now RETURNS the data.
           * No duplicate API call.
           */

          const result = await refresh();

          const count = result.backups.length;

          setStatus(
            `✅ Refresh berjaya. ${count} backup dijumpai.`,
            'success'
          );

        } catch (error) {
          console.error(
            '[Backup Refresh]',
            error
          );

          setStatus(
            '❌ Refresh gagal: ' + error.message,
            'error'
          );

        } finally {
          setBusy(false);
        }
      }
    );

    /* ==========================================
       BUILD PANEL
       ========================================== */

    controls.append(
      backupButton,
      refreshButton
    );

    panel.append(
      heading,
      description,
      controls,
      status,
      list
    );

    /* ==========================================
       INITIAL LOAD
       ========================================== */

    setStatus(
      '⏳ Memuatkan senarai backup...',
      'loading'
    );

    refresh()
      .then(result => {
        if (!panel.isConnected) return;

        setStatus(
          `✅ ${result.backups.length} backup tersedia.`,
          'success'
        );
      })
      .catch(error => {
        console.error(
          '[Backup Initial Load]',
          error
        );

        setStatus(
          '❌ Tidak dapat membaca backup: ' +
          error.message,
          'error'
        );
      });

    /* ==========================================
       PUBLIC PANEL METHODS
       ========================================== */

    panel.refreshBackups = refresh;

    panel.getBackupStatus = () => ({
      version: VERSION,
      bookId,
      busy,
      backupCount: lastBackups.length
    });

    return panel;
  }

  /* ==========================================
     GLOBAL API
     ========================================== */

  window.StorylandBackup = {
    version: VERSION,
    mount
  };

  console.log(
    'Storyland Backup Center V18.2 Fixed loaded'
  );

})();
