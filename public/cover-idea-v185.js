
/* ==============================================
   STORYLAND AI V18.5
   GEMINI COVER ILLUSTRATION IDEA
   ============================================== */

(function () {
  'use strict';

  function createElement(tag, className = '', text = '') {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  }

  function mount({ bookId, story, onChange }) {
    const panel = createElement(
      'section',
      'cover-gemini-idea'
    );

    const heading = createElement(
      'h3',
      '',
      '💬 Idea Ilustrasi Cover daripada Gemini'
    );

    const description = createElement(
      'p',
      '',
      'Gemini mencadangkan ilustrasi berdasarkan keseluruhan cerita. ' +
      'Awak boleh mengubah idea ini sebelum menjana cover.'
    );

    const input = createElement(
      'textarea',
      'cover-gemini-idea-box'
    );

    input.rows = 6;
    input.maxLength = 1000;

    input.placeholder =
      'Idea ilustrasi cover akan muncul di sini.';

    input.value = story.coverIllustrationIdea || '';

    const counter = createElement(
      'p',
      'cover-gemini-idea-counter'
    );

    const status = createElement(
      'p',
      'cover-gemini-idea-status'
    );

    status.setAttribute('role', 'status');

    const generateButton = createElement(
      'button',
      'cover-gemini-idea-generate',
      '✨ Jana Idea Cover dengan Gemini'
    );

    generateButton.type = 'button';

    function updateCounter() {
      counter.textContent =
        `${input.value.length}/1000 aksara`;
    }

    function updateLocalStory() {
      story.coverIllustrationIdea =
        input.value;

      if (typeof onChange === 'function') {
        onChange(input.value);
      }
    }

    input.addEventListener('input', () => {
      updateLocalStory();
      updateCounter();
    });

    generateButton.addEventListener('click', async () => {
      if (generateButton.disabled) return;

      const confirmed =
        !input.value.trim() ||
        window.confirm(
          'Gantikan idea cover sekarang dengan cadangan baharu daripada Gemini?'
        );

      if (!confirmed) return;

      generateButton.disabled = true;
      status.textContent =
        '⏳ Gemini sedang mencipta idea cover...';

      try {
        const result = await request(
          `/api/books/${encodeURIComponent(bookId)}/cover-idea/generate`,
          { method: 'POST' }
        );

        input.value = result.coverIllustrationIdea || '';

        updateLocalStory();
        updateCounter();

        status.textContent =
          '✅ Idea cover berjaya dijana dan disimpan.';

      } catch (error) {
        status.textContent =
          '❌ ' + error.message;

      } finally {
        generateButton.disabled = false;
      }
    });

    updateCounter();

    panel.append(
      heading,
      description,
      input,
      counter,
      generateButton,
      status
    );

    return panel;
  }

  window.StorylandCoverIdea = {
    version: '18.5',
    mount
  };

  console.log(
    'Storyland Gemini Cover Idea V18.5 loaded'
  );
})();
