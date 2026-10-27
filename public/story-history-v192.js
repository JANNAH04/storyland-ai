
/* ======================================================
   STORYLAND AI V19.2
   SEJARAH CERITA SETIAP HALAMAN
   ====================================================== */

(function () {
  'use strict';

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options
    });

    const type =
      response.headers.get('content-type') || '';

    if (!type.includes('application/json')) {
      throw new Error(
        `API sejarah tidak tersedia (HTTP ${response.status}).`
      );
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || `HTTP ${response.status}`
      );
    }

    return data;
  }

  function countWords(value) {
    return String(value || '')
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .length;
  }

  function mount({
    bookId,
    page,
    onRestore
  }) {
    const panel = document.createElement('section');
    panel.className = 'story-history-panel';

    const title = document.createElement('h4');
    title.textContent =
      `📚 Sejarah Cerita — Halaman ${page.number}`;

    const description = document.createElement('p');
    description.textContent =
      'Lihat dan pulihkan teks cerita terdahulu ' +
      'tanpa menggunakan kuota Gemini.';

    const refreshButton =
      document.createElement('button');

    refreshButton.type = 'button';
    refreshButton.className =
      'story-history-refresh';

    refreshButton.textContent =
      '↻ Muat Semula Sejarah Cerita';

    const status = document.createElement('p');
    status.setAttribute('role', 'status');

    const list = document.createElement('div');
    list.className = 'story-history-list';

    const base =
      `/api/books/${encodeURIComponent(bookId)}` +
      `/pages/${encodeURIComponent(page.number)}` +
      '/text-history';

    let busy = false;

    function setStatus(value) {
      status.textContent = value;
    }

    async function capture(text) {
      const value = String(text || '').trim();

      if (!value || countWords(value) > 35) {
        return false;
      }

      await request(base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: value })
      });

      await refresh();

      return true;
    }

    async function refresh() {
      const data = await request(base);

      list.replaceChildren();

      const history = Array.isArray(data.history)
        ? data.history
        : [];

      if (!history.length) {
        const empty = document.createElement('p');
        empty.textContent =
          'Belum ada versi terdahulu. ' +
          'Sejarah bermula apabila teks diubah.';

        list.appendChild(empty);
        return;
      }

      for (const item of history) {
        const card = document.createElement('article');
        card.className = 'story-history-card';

        const date = document.createElement('small');

        const parsed = new Date(item.created_at);

        date.textContent = Number.isNaN(parsed.getTime())
          ? 'Versi terdahulu'
          : parsed.toLocaleString('ms-MY');

        const text = document.createElement('p');
        text.textContent = item.text;

        const words = document.createElement('small');
        words.textContent =
          `${countWords(item.text)}/35 perkataan`;

        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'story-history-restore';
        restore.textContent = '↩ Gunakan Semula Cerita';

        restore.addEventListener('click', async () => {
          if (busy) return;

          if (
            !window.confirm(
              `Pulihkan versi cerita halaman ${page.number}?\n\n` +
              'Versi semasa akan disimpan dalam sejarah dahulu.'
            )
          ) {
            return;
          }

          busy = true;
          restore.disabled = true;

          try {
            // Lindungi teks semasa sebelum dipulihkan.
            const current = String(page.text || '').trim();

            if (
              current &&
              current !== item.text
            ) {
              await capture(current);
            }

            if (typeof onRestore !== 'function') {
              throw new Error(
                'Fungsi pemulihan belum disambungkan.'
              );
            }

            await onRestore(item.text);

            setStatus(
              '✅ Teks dipulihkan. Auto-Save akan menyimpan perubahan.'
            );

            await refresh();

          } catch (error) {
            setStatus(`❌ ${error.message}`);

          } finally {
            busy = false;
            restore.disabled = false;
          }
        });

        card.append(
          date,
          text,
          words,
          restore
        );

        list.appendChild(card);
      }
    }

    refreshButton.addEventListener(
      'click',
      async () => {
        if (busy) return;

        busy = true;
        refreshButton.disabled = true;

        setStatus('⏳ Memuatkan sejarah cerita...');

        try {
          await refresh();
          setStatus('✅ Sejarah dikemas kini.');

        } catch (error) {
          setStatus(`❌ ${error.message}`);

        } finally {
          busy = false;
          refreshButton.disabled = false;
        }
      }
    );

    panel.append(
      title,
      description,
      refreshButton,
      status,
      list
    );

    refresh().catch(error => {
      setStatus(`❌ ${error.message}`);
    });

    return {
      element: panel,
      capture,
      refresh
    };
  }

  window.StorylandStoryHistory = { mount };

  console.log(
    'Storyland Story History V19.2 Ready'
  );
})();
