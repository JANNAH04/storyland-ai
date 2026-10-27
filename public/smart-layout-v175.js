
/* ============================================
   STORYLAND AI V17.5
   SMART BOOK LAYOUT ENGINE
   No API required
   ============================================ */

(function () {
  'use strict';

  const VERSION = '17.5';

  const VALID_LAYOUTS = new Set([
    'top',
    'bottom',
    'side'
  ]);

  function countWords(text) {
    return String(text || '')
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .length;
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  function analyzePage(page, index = 0) {
    const words = countWords(page?.text);
    const hasImage = Boolean(page?.imageUrl);
    const hasPrompt = Boolean(
      String(page?.illustrationPrompt || '').trim()
    );

    let layout = 'side';
    let imageScale = 100;
    let imageAlign = 'center';
    let reason = '';

    /*
      Layout rules:

      0-12 words:
        Short, punchy text can appear above image.

      13-24 words:
        Image and text side by side.

      25+ words:
        Image above, text below.
        This prevents narrow text columns.
    */

    if (words <= 12) {
      layout = 'bottom';
      imageScale = 90;
      reason =
        'Teks pendek: gambar diberi ruang lebih besar.';
    } else if (words <= 24) {
      layout = 'side';
      imageScale = 100;
      reason =
        'Teks sederhana: gambar dan cerita seimbang.';
    } else {
      layout = 'top';
      imageScale = 100;
      reason =
        'Teks panjang: ruang bacaan lebih luas.';
    }

    // When no illustration is available yet,
    // keep a sensible layout ready for upload.
    if (!hasImage && !hasPrompt) {
      reason +=
        ' Ilustrasi belum tersedia.';
    }

    // Gentle visual variation for adjacent
    // long-text pages, without sacrificing
    // readability.
    if (words <= 12 && index % 3 === 2) {
      layout = 'top';
      reason =
        'Halaman pendek: variasi visual dengan gambar di atas.';
    }

    return {
      layout,
      imageScale,
      imageAlign,
      wordCount: words,
      hasImage,
      reason
    };
  }

  function applySuggestion(page, index = 0) {
    if (!page || typeof page !== 'object') {
      throw new Error('Data halaman tidak sah.');
    }

    const result = analyzePage(page, index);

    page.layout = VALID_LAYOUTS.has(result.layout)
      ? result.layout
      : 'side';

    page.imageScale = result.imageScale;
    page.imageAlign = result.imageAlign;

    /*
      Important:
      Do NOT change page.text, imageUrl,
      illustrationPrompt, theme, decoration,
      or image history.
    */

    return result;
  }

  function applyAll(story) {
    if (!story || !Array.isArray(story.pages)) {
      throw new Error('Data buku tidak sah.');
    }

    const results = [];

    story.pages.forEach((page, index) => {
      const result = applySuggestion(page, index);

      results.push({
        page: page.number || index + 1,
        ...result
      });
    });

    return results;
  }

  function layoutName(layout) {
    const names = {
      top: 'Gambar Atas',
      bottom: 'Teks Atas',
      side: 'Sebelah'
    };

    return names[layout] || 'Sebelah';
  }

  function mountPage({
    page,
    index,
    onApply
  }) {
    const panel = make(
      'section',
      'smart-layout-panel'
    );

    const heading = make(
      'h3',
      'smart-layout-heading',
      '✨ Smart Book Layout'
    );

    const explanation = make(
      'p',
      'smart-layout-description',
      'Susun kedudukan gambar dan teks secara automatik.'
    );

    const suggestion = make(
      'div',
      'smart-layout-suggestion'
    );

    const button = make(
      'button',
      'smart-layout-button',
      '✨ Susun Halaman Ini'
    );

    button.type = 'button';

    const status = make(
      'p',
      'smart-layout-status'
    );

    status.setAttribute('role', 'status');

    function refreshSuggestion() {
      const result = analyzePage(page, index);

      suggestion.replaceChildren();

      const name = make(
        'strong',
        '',
        'Cadangan: ' + layoutName(result.layout)
      );

      const detail = make(
        'p',
        '',
        `${result.wordCount} perkataan. ${result.reason}`
      );

      suggestion.append(name, detail);
    }

    button.addEventListener('click', () => {
      try {
        const result = applySuggestion(
          page,
          index
        );

        if (typeof onApply === 'function') {
          onApply(result);
        }

        status.textContent =
          '✅ Layout digunakan: ' +
          layoutName(result.layout) +
          '. Tekan Simpan Buku untuk kekalkan perubahan.';

        refreshSuggestion();

      } catch (error) {
        status.textContent =
          '❌ ' + error.message;
      }
    });

    panel.append(
      heading,
      explanation,
      suggestion,
      button,
      status
    );

    refreshSuggestion();

    return panel;
  }

  function mountBook({
    story,
    onApply
  }) {
    const panel = make(
      'section',
      'smart-layout-book-panel'
    );

    const title = make(
      'h3',
      '',
      '📖 Susun Semua Halaman'
    );

    const description = make(
      'p',
      '',
      'Gunakan cadangan layout automatik untuk semua halaman cerita. Gambar dan teks tidak diubah.'
    );

    const button = make(
      'button',
      'smart-layout-all-button',
      '✨ Smart Layout Semua Halaman'
    );

    button.type = 'button';

    const status = make(
      'p',
      'smart-layout-status'
    );

    status.setAttribute('role', 'status');

    button.addEventListener('click', () => {
      const confirmed = window.confirm(
        'Susun semua halaman secara automatik?\n\n' +
        'Susunan manual sedia ada akan diganti ' +
        'dengan cadangan Smart Layout.\n\n' +
        'Teks dan gambar tidak akan diubah.'
      );

      if (!confirmed) return;

      try {
        const result = applyAll(story);

        status.textContent =
          `✅ ${result.length} halaman disusun.`;

        if (typeof onApply === 'function') {
          onApply(result);
        }

      } catch (error) {
        status.textContent =
          '❌ ' + error.message;
      }
    });

    panel.append(
      title,
      description,
      button,
      status
    );

    return panel;
  }

  window.StorylandSmartLayout = {
    version: VERSION,
    analyzePage,
    applySuggestion,
    applyAll,
    mountPage,
    mountBook,
    layoutName,
    countWords
  };

  console.log(
    'Storyland Smart Layout V17.5 loaded'
  );
})();
