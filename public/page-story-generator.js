
/* ==========================================
   STORYLAND AI V19
   PAGE STORY GENERATOR
   ========================================== */

(function () {
  'use strict';

  function mount({
    bookId,
    page,
    onApply
  }) {
    const panel = document.createElement('div');
    panel.className = 'page-story-generator';

    panel.innerHTML = `
      <div class="page-story-title">
        ✨ Jana Cerita Halaman ${page.number}
      </div>

      <textarea
        class="page-story-instructions"
        maxlength="500"
        rows="3"
        placeholder="Contoh: Jadikan halaman ini lebih menarik dan penuh pengembaraan."
      ></textarea>

      <button
        type="button"
        class="page-story-generate"
      >
        ✨ Jana Cerita Halaman Ini
      </button>

      <div
        class="page-story-result"
        hidden
      >
        <div class="page-story-preview-label">
          Cadangan Gemini:
        </div>

        <textarea
          class="page-story-preview"
          rows="5"
        ></textarea>

        <div class="page-story-actions">
          <button
            type="button"
            class="page-story-apply"
          >
            ✅ Guna Teks Ini
          </button>

          <button
            type="button"
            class="page-story-cancel"
          >
            Batal
          </button>
        </div>
      </div>

      <p class="page-story-status"></p>
    `;

    const instructions = panel.querySelector(
      '.page-story-instructions'
    );

    const generateButton = panel.querySelector(
      '.page-story-generate'
    );

    const resultPanel = panel.querySelector(
      '.page-story-result'
    );

    const preview = panel.querySelector(
      '.page-story-preview'
    );

    const applyButton = panel.querySelector(
      '.page-story-apply'
    );

    const cancelButton = panel.querySelector(
      '.page-story-cancel'
    );

    const status = panel.querySelector(
      '.page-story-status'
    );

    generateButton.addEventListener(
      'click',
      async () => {
        generateButton.disabled = true;
        resultPanel.hidden = true;

        status.textContent =
          'Gemini sedang menulis cerita...';

        try {
          const response = await fetch(
            `/api/books/${encodeURIComponent(bookId)}` +
            `/pages/${page.number}/generate-text`,
            {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                instructions: instructions.value
              })
            }
          );

          
const contentType =
  response.headers.get('content-type') || '';

if (!contentType.includes('application/json')) {
  const raw = await response.text();

  console.error(
    '[Storyland Page Generator] Respons bukan JSON:',
    {
      url: response.url,
      status: response.status,
      preview: raw.slice(0, 300)
    }
  );

  throw new Error(
    'API Jana Cerita Halaman tidak memulangkan JSON. ' +
    `HTTP ${response.status}. ` +
    'Semak endpoint generate-text dalam server.js.'
  );
}

const data = await response.json();


          if (!response.ok) {
            throw new Error(
              data.error || 'Jana cerita gagal.'
            );
          }

          preview.value = data.generatedText;

          resultPanel.hidden = false;

          status.textContent =
            `${data.wordCount}/35 perkataan. ` +
            'Semak sebelum simpan.';

        } catch (error) {
          status.textContent =
            `❌ ${error.message}`;

        } finally {
          generateButton.disabled = false;
        }
      }
    );

    applyButton.addEventListener(
      'click',
      () => {
        const text = preview.value.trim();

        const words = text
          .split(/\s+/u)
          .filter(Boolean)
          .length;

        if (!text || words > 35) {
          status.textContent =
            'Teks mesti mempunyai 1–35 perkataan.';
          return;
        }

        if (typeof onApply !== 'function') {
          status.textContent =
            'Fungsi simpan belum disambungkan.';
          return;
        }

        onApply(text);

        status.textContent =
          '✅ Teks diterapkan.';

        resultPanel.hidden = true;
      }
    );

    cancelButton.addEventListener(
      'click',
      () => {
        resultPanel.hidden = true;
        status.textContent = '';
      }
    );

    return panel;
  }

  window.StorylandPageGenerator = {
    mount
  };

  console.log(
    'Storyland Page Generator V19 loaded'
  );
})();
