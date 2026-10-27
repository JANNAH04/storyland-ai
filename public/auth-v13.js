
/* =============================================
   STORYLAND AI AUTH V13.1

   REGISTER -> LOGIN -> DASHBOARD

   No automatic login after registration.
   ============================================= */

(() => {
  'use strict';

  let resolveReady;

  const ready = new Promise(resolve => {
    resolveReady = resolve;
  });

  const state = {
    user: null,
    authenticated: false
  };

  function create(tag, className = '', text) {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (text !== undefined) {
      node.textContent = text;
    }

    return node;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options
    });

    const result = await response.json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        result.error || `HTTP ${response.status}`
      );
    }

    return result;
  }

  /* ======================================
     LOGIN SUCCESS
     ====================================== */

  function finishLogin(user) {
    if (!user) {
      throw new Error('Data pengguna tidak sah.');
    }

    state.user = user;
    state.authenticated = true;

    document.body.classList.add('auth-ready');

    document.getElementById(
      'storylandAuthScreen'
    )?.remove();

    showAccountBar();

    resolveReady(user);
  }

  /* ======================================
     ACCOUNT BAR + LOGOUT
     ====================================== */

  function showAccountBar() {
    document.getElementById(
      'storylandAccountBar'
    )?.remove();

    const bar = create(
      'div',
      'storyland-account-bar'
    );

    bar.id = 'storylandAccountBar';

    const name = create(
      'span',
      '',
      '👋 ' + state.user.name
    );

    const logoutButton = create(
      'button',
      '',
      'Log Keluar'
    );

    logoutButton.type = 'button';

    logoutButton.addEventListener(
      'click',
      async (event) => {
  event.preventDefault();
  event.stopPropagation();
        logoutButton.disabled = true;

        try {
          
/* ==========================================
   STORYLAND AI V18.6 — LOGOUT FIX
   ========================================== */

// Only attempt to save when a book is open
// and there are unsaved changes.

const autosave = window.StorylandAutosave;

if (
  typeof autosave?.isDirty === 'function' &&
  autosave.isDirty()
) {
  const state = autosave.getStatus?.();

  if (state?.bookId) {
    // flush() in V17.9 calls saveNow()
    // and returns a result object, not a boolean.
    await autosave.saveNow();
  }
}


          await api('/api/auth/logout', {
            method: 'POST'
          });

          // Reload to clear dashboard and editor state.
          window.location.reload();

        } catch (error) {
          alert('❌ ' + error.message);
          logoutButton.disabled = false;
        }
      }
    );

    bar.append(name, logoutButton);

    document.querySelector('.navbar')?.append(bar);
  }

  /* ======================================
     CREATE LOGIN / REGISTER SCREEN
     ====================================== */

  function showAuthScreen() {
    document.body.classList.remove('auth-ready');

    document.getElementById(
      'storylandAuthScreen'
    )?.remove();

    const screen = create(
      'div',
      'storyland-auth-screen'
    );

    screen.id = 'storylandAuthScreen';

    const card = create(
      'div',
      'storyland-auth-card'
    );

    const heading = create(
      'h2',
      '',
      '🏰 Storyland AI'
    );

    const description = create(
      'p',
      '',
      'Selamat datang ke Dunia Cerita Ajaib!'
    );

    const tabs = create(
      'div',
      'storyland-auth-tabs'
    );

    const loginTab = create(
      'button',
      '',
      '🔐 Login'
    );

    const registerTab = create(
      'button',
      '',
      '✨ Daftar Akaun'
    );

    loginTab.type = 'button';
    registerTab.type = 'button';

    tabs.append(loginTab, registerTab);

    const form = create('form');

    // NAME
    const name = create('input');
    name.type = 'text';
    name.name = 'name';
    name.placeholder = 'Nama pengguna';
    name.autocomplete = 'name';
    name.maxLength = 80;

    // EMAIL
    const email = create('input');
    email.type = 'email';
    email.name = 'email';
    email.placeholder = 'Alamat e-mel';
    email.autocomplete = 'email';
    email.maxLength = 254;
    email.required = true;

    // PASSWORD
    const password = create('input');
    password.type = 'password';
    password.name = 'password';
    password.placeholder = 'Kata laluan';
    password.minLength = 10;
    password.maxLength = 128;
    password.required = true;

    // SUBMIT
    const submit = create(
      'button',
      'storyland-auth-submit'
    );

    submit.type = 'submit';

    // MESSAGE
    const status = create(
      'p',
      'storyland-auth-status'
    );

    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    let mode = 'login';

    /* ======================================
       CHANGE TAB
       ====================================== */

    function setMode(next, clearMessage = true) {
      mode = next;

      name.hidden = mode !== 'register';
      name.required = mode === 'register';

      password.autocomplete =
        mode === 'login'
          ? 'current-password'
          : 'new-password';

      loginTab.classList.toggle(
        'active',
        mode === 'login'
      );

      registerTab.classList.toggle(
        'active',
        mode === 'register'
      );

      submit.textContent =
        mode === 'login'
          ? '🔐 Masuk ke Dashboard'
          : '✨ Daftar Akaun Sekarang';

      if (clearMessage) {
        status.textContent = '';
      }
    }

    loginTab.addEventListener('click', () => {
      setMode('login');
    });

    registerTab.addEventListener('click', () => {
      setMode('register');
    });

    /* ======================================
       FORM SUBMISSION
       ====================================== */

    form.addEventListener('submit', async event => {
      event.preventDefault();

      if (submit.disabled) return;

      const isRegister = mode === 'register';

      submit.disabled = true;
      status.textContent = isRegister
        ? '⏳ Sedang mendaftar akaun...'
        : '⏳ Sedang login...';

      try {
        const payload = {
          email: email.value.trim(),
          password: password.value
        };

        if (isRegister) {
          payload.name = name.value.trim();
        }

        const result = await api(
          isRegister
            ? '/api/auth/register'
            : '/api/auth/login',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          }
        );

        /* ===================================
           SUCCESSFUL REGISTRATION

           Important:
           Do NOT call finishLogin().
           =================================== */

        if (isRegister) {
          setMode('login');

          // Keep email for convenience.
          email.value = payload.email;

          // User must type password again.
          password.value = '';

          status.textContent =
            '✅ Pendaftaran berjaya! ' +
            'Sila masukkan kata laluan untuk login.';

          // Stay on login page.
          password.focus();

          return;
        }

        /* ===================================
           SUCCESSFUL LOGIN

           Dashboard opens ONLY here.
           =================================== */

        if (!result.user) {
          throw new Error(
            'Server tidak memulangkan data pengguna.'
          );
        }

        finishLogin(result.user);

      } catch (error) {
        status.textContent =
          '❌ ' + error.message;

      } finally {
        submit.disabled = false;
      }
    });

    /* ======================================
       BUILD FORM
       ====================================== */

    form.append(
      name,
      email,
      password,
      submit,
      status
    );

    card.append(
      heading,
      description,
      tabs,
      form
    );

    screen.append(card);

    document.body.append(screen);

    setMode('login');
  }

  /* ======================================
     CHECK EXISTING SESSION
     ====================================== */

  async function initialize() {
    try {
      const result = await api('/api/auth/me');

      if (!result.user) {
        throw new Error('No active session');
      }

      finishLogin(result.user);

    } catch {
      showAuthScreen();
    }
  }

  /* ======================================
     PUBLIC API
     ====================================== */

  window.StorylandAuth = {
    ready,

    get user() {
      return state.user;
    },

    get authenticated() {
      return state.authenticated;
    }
  };

  initialize();

  console.log(
    'Storyland AI Auth V13.1 Ready'
  );

})();
