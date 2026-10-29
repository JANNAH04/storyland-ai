
/* =============================================
   STORYLAND AI DASHBOARD V12
   ============================================= */

(() => {
  'use strict';

  let books = [];
  let query = '';

  const $ = id => document.getElementById(id);

  function el(tag, className = '', value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function safeCover(url) {
  if (
    typeof url !== 'string' ||
    !url.trim()
  ) {
    return '';
  }

  const value = url.trim();

  // Gambar lama base64
  if (value.startsWith('data:image/')) {
    return value;
  }

  // Gambar baru dari Cloudflare KV
  if (value.startsWith('/api/images/')) {
    return value;
  }

  // Format lama Storyland
  if (value.startsWith('/generated/')) {
    return value;
  }

  // URL penuh
  if (
    value.startsWith('https://') ||
    value.startsWith('http://')
  ) {
    return value;
  }

  return '';
}

  async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  }

  function notify(text) {
    const node = $('dashboardStatus');
    if (node) node.textContent = text;
  }

  function card(book) {
    const article = el('article', 'dashboard-book-card');
    const cover = el('div', 'dashboard-cover');

    const coverUrl = safeCover(book.coverImageUrl);

    if (coverUrl) {
      const img = el('img');
      img.src = coverUrl;
      img.alt = 'Cover ' + book.title;
      img.loading = 'eager';
img.decoding = 'async';

img.style.display = 'block';
img.style.width = '100%';
img.style.height = '100%';
img.style.objectFit = 'cover';

      img.onerror = () => {
        cover.replaceChildren(
          el('div', 'dashboard-cover-empty', '📖')
        );
      };

      cover.append(img);
    } else {
      cover.append(
        el('div', 'dashboard-cover-empty', '📖')
      );
    }

    const info = el('div', 'dashboard-book-info');
    const title = el('h4', '', book.title);
    const date = new Date(book.updated_at);

    const meta = el(
      'p',
      '',
      `${book.pageCount || 0} halaman · ` +
      (Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleDateString('ms-MY'))
    );

    const actions = el('div', 'dashboard-actions');

    const edit = el('button', 'dashboard-edit', '✏️ Edit');
    edit.type = 'button';
    edit.onclick = () => {
      window.StorylandOpenBook?.(book.id);
    };

    const duplicate = el(
      'button', 'dashboard-duplicate', '📑 Salin'
    );
    duplicate.type = 'button';

    duplicate.onclick = async () => {
      duplicate.disabled = true;

      try {
        await api(
          `/api/books/${encodeURIComponent(book.id)}/duplicate`,
          { method: 'POST' }
        );

        await window.StorylandReloadLibrary?.();
        notify('✅ Buku berjaya disalin.');
      } catch (error) {
        notify('❌ ' + error.message);
      } finally {
        duplicate.disabled = false;
      }
    };

    const remove = el(
      'button', 'dashboard-delete', '🗑️ Padam'
    );
    remove.type = 'button';

    remove.onclick = async () => {
      const yes = window.confirm(
        `Adakah anda pasti mahu memadam "${book.title}"?\n\n` +
        'Buku dan gambarnya akan dipadam secara kekal.'
      );

      if (!yes) return;

      remove.disabled = true;

      try {
        await api(
          `/api/books/${encodeURIComponent(book.id)}`,
          { method: 'DELETE' }
        );

        // Reload also stops editing the deleted book.
        window.location.reload();
      } catch (error) {
        notify('❌ ' + error.message);
        remove.disabled = false;
      }
    };

    actions.append(edit, duplicate, remove);
    info.append(title, meta, actions);
    article.append(cover, info);

    return article;
  }

  function renderGrid() {
    const grid = $('dashboardGrid');
    if (!grid) return;

    grid.replaceChildren();

    const filtered = books.filter(book =>
      book.title.toLocaleLowerCase('ms-MY')
        .includes(query.toLocaleLowerCase('ms-MY'))
    );

    if (!filtered.length) {
      grid.append(
        el(
          'p',
          'dashboard-empty',
          query
            ? '🔎 Tiada buku ditemui.'
            : '✨ Belum ada buku. Jom cipta cerita!'
        )
      );
      return;
    }

    filtered.forEach(book => {
      grid.append(card(book));
    });
  }

  function render(nextBooks) {
    books = Array.isArray(nextBooks) ? nextBooks : [];

    const library = $('library');
    if (!library) return;

    library.replaceChildren();

    const wrapper = el('div', 'dashboard-wrapper');
    const toolbar = el('div', 'dashboard-toolbar');

    const heading = el('div', 'dashboard-heading');
    heading.append(
      el('h3', '', '📚 Perpustakaan Ajaib'),
      el('p', '', 'Cari, edit, salin atau padam buku.')
    );

    const search = el('input', 'dashboard-search');
    search.type = 'search';
    search.placeholder = '🔎 Cari tajuk buku...';
    search.value = query;

    search.addEventListener('input', () => {
      query = search.value;
      renderGrid();
    });

    const count = el(
      'div', 'dashboard-count', `${books.length} Buku`
    );

    toolbar.append(heading, search, count);

    const grid = el('div', 'dashboard-grid');
    grid.id = 'dashboardGrid';

    const status = el('p', 'dashboard-status');
    status.id = 'dashboardStatus';
    status.setAttribute('role', 'status');

    wrapper.append(toolbar, grid, status);
    library.append(wrapper);

    renderGrid();
  }

  window.StorylandDashboard = { render };

  console.log('Storyland Dashboard V12 ready');
})();
