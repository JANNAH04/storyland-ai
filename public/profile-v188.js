
/* ==========================================
   STORYLAND AI V18.8
   PROFIL PENGGUNA
   ========================================== */

(function () {
  'use strict';

  const VERSION = '18.8';

  let modal = null;
  let profileButton = null;
  let currentUser = null;

  function create(tag, className = '', text = '') {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    element.textContent = text;

    return element;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || `HTTP ${response.status}`
      );
    }

    return data;
  }

  function closeModal() {
    if (!modal) return;

    modal.remove();
    modal = null;

    if (profileButton?.isConnected) {
      profileButton.focus();
    }
  }

  async function openProfile() {
    if (modal) return;

    const overlay = create(
      'div',
      'storyland-profile-overlay'
    );

    modal = overlay;

    const dialog = create(
      'section',
      'storyland-profile-dialog'
    );

    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Profil Saya');

    const header = create(
      'div',
      'storyland-profile-header'
    );

    const heading = create(
      'h2',
      '',
      '👤 Profil Saya'
    );

    const close = create(
      'button',
      'storyland-profile-close',
      '✕'
    );

    close.type = 'button';
    close.setAttribute('aria-label', 'Tutup profil');

    close.onclick = closeModal;

    header.append(heading, close);

    const avatar = create(
      'div',
      'storyland-profile-avatar',
      '👤'
    );

    const nameLabel = create(
      'label',
      '',
      'Nama Pengguna'
    );

    const nameInput = create('input');
    nameInput.type = 'text';
    nameInput.maxLength = 80;
    nameInput.autocomplete = 'name';
    nameInput.placeholder = 'Masukkan nama pengguna';

    nameLabel.append(nameInput);

    const emailLabel = create(
      'label',
      '',
      'Alamat E-mel'
    );

    const emailInput = create('input');
    emailInput.type = 'email';
    emailInput.readOnly = true;
    emailInput.autocomplete = 'off';
    emailInput.setAttribute(
      'aria-description',
      'E-mel hanya boleh dilihat'
    );

    emailLabel.append(emailInput);

    const emailNote = create(
      'p',
      'storyland-profile-note',
      'Alamat e-mel ini digunakan untuk log masuk dan tidak boleh diubah di sini.'
    );

    const status = create(
      'p',
      'storyland-profile-status'
    );

    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const save = create(
      'button',
      'storyland-profile-save',
      '💾 Simpan Perubahan'
    );

    save.type = 'button';
    save.disabled = true;

    dialog.append(
      header,
      avatar,
      nameLabel,
      emailLabel,
      emailNote,
      status,
      save
    );

    overlay.append(dialog);
    document.body.append(overlay);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        closeModal();
      }
    });

    const handleEscape = event => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };

    overlay.addEventListener('keydown', handleEscape);

    status.textContent = '⏳ Memuatkan profil...';

    try {
      const data = await api('/api/auth/profile');

      if (modal !== overlay) return;

      currentUser = data.user;

      nameInput.value = currentUser.name || '';
      emailInput.value = currentUser.email || '';

      save.disabled = false;
      status.textContent = '';

      nameInput.focus();

    } catch (error) {
      status.textContent =
        '❌ Tidak dapat membaca profil: ' +
        error.message;
    }

    save.addEventListener('click', async () => {
      if (save.disabled) return;

      const name = nameInput.value.trim();

      if (name.length < 2 || name.length > 80) {
        status.textContent =
          '❌ Nama mestilah antara 2 hingga 80 aksara.';
        return;
      }

      save.disabled = true;
      save.textContent = '⏳ Menyimpan...';
      status.textContent = '';

      try {
        const result = await api('/api/auth/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name })
        });

        currentUser = result.user;

        nameInput.value = currentUser.name;

        status.textContent =
          '✅ Nama pengguna berjaya dikemas kini.';

        updateAccountName(currentUser.name);

        window.dispatchEvent(
          new CustomEvent('storyland:profile-updated', {
            detail: { user: currentUser }
          })
        );

      } catch (error) {
        status.textContent =
          '❌ ' + error.message;

      } finally {
        save.disabled = false;
        save.textContent = '💾 Simpan Perubahan';
      }
    });
  }

  function updateAccountName(name) {
    const bar = document.querySelector(
      '.storyland-account-bar'
    );

    if (!bar) return;

    // Find the name element without replacing
    // the logout button or its event handlers.
    const items = Array.from(bar.children);

    for (const item of items) {
      if (item.matches('button') ||
          item.querySelector('button') ||
          item.classList.contains('storyland-profile-button')) {
        continue;
      }

      if (
        item.textContent.includes(currentUser?.name || '') ||
        item.textContent.includes(name)
      ) {
        item.textContent = '👋 ' + name;
        return;
      }
    }

    // Existing account heading can also be
    // updated by the profile-updated event.
  }

  function mountButton() {
    const bar = document.querySelector(
      '.storyland-account-bar'
    );

    if (!bar) return;

    if (bar.querySelector(
      '.storyland-profile-button'
    )) {
      return;
    }

    const button = create(
      'button',
      'storyland-profile-button',
      '👤 Profil Saya'
    );

    button.type = 'button';

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      openProfile();
    });

    // Place profile before the existing logout button.
    const logoutButton = Array.from(
      bar.querySelectorAll('button')
    ).find(button =>
      /log keluar|logout|log out/i.test(button.textContent)
    );

    if (logoutButton) {
      logoutButton.before(button);
    } else {
      bar.append(button);
    }

    profileButton = button;
  }

  // Authentication creates the account bar
  // dynamically after login.
  const observer = new MutationObserver(() => {
    if (
      document.querySelector('.storyland-account-bar') &&
      !document.querySelector('.storyland-profile-button')
    ) {
      mountButton();
    }
  });

  function initialize() {
    mountButton();

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

  window.StorylandProfile = {
    version: VERSION,
    open: openProfile,
    close: closeModal
  };

  console.log(
    'Storyland Profil Pengguna V18.8 aktif'
  );

})();
