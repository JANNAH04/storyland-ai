
/* ============================================================
   STORYLAND AI V18.9 — COMPLETE SERVER
   Bahasa Melayu Malaysia

   Gemini Story Generator
   6–50 Muka Surat
   Gemini Cover Idea
   Cloudflare AI Images
   Character Profiles
   Image History & Restore
   Backup & Auto Backup
   Multi-Device Revision Protection
   Conflict Copy
   User Profile
   ============================================================ */

import 'dotenv/config';

import express from 'express';
import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';

import { mkdirSync } from 'node:fs';
import { writeFile, cp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash
} from 'node:crypto';

/* ============================================================
   1. KONFIGURASI
   ============================================================ */

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

const PORT = Number(process.env.PORT || 3000);

const PRODUCTION =
  process.env.NODE_ENV === 'production';

const TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash';

const IMAGE_MODEL =
  process.env.CLOUDFLARE_IMAGE_MODEL ||
  '@cf/black-forest-labs/flux-1-schnell';

const DAILY_LIMIT = Math.max(
  1,
  Math.min(
    1000,
    Number.parseInt(
      process.env.IMAGE_DAILY_LIMIT || '100',
      10
    ) || 100
  )
);

const DATA_DIR = resolve(
  process.env.DATA_DIR || './data'
);

const IMAGE_DIR = join(DATA_DIR, 'generated');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_WORDS = 35;
const MAX_HISTORY = 12;
const MAX_BACKUPS = 20;

const AUTO_BACKUP_MS = 15 * 60 * 1000;

const SESSION_COOKIE = 'storyland_session';
const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;

const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const IMAGE_STYLES = {
  fantasy:
    'Magical fantasy children picture book, beautiful whimsical scenery, bright colors',

  cartoon:
    'Premium child-friendly 3D cartoon, expressive characters, soft lighting',

  watercolor:
    'Hand-painted watercolor children storybook, gentle brush textures',

  anime:
    'Original colorful children anime illustration, expressive characters'
};

const ALLOWED_LAYOUTS = new Set([
  'top',
  'bottom',
  'side'
]);

const ALLOWED_THEMES = new Set([
  'fantasy',
  'garden',
  'royal',
  'sky'
]);

const ALLOWED_DECORATIONS = new Set([
  'frame',
  'minimal'
]);

const ALLOWED_ALIGNS = new Set([
  'left',
  'center',
  'right'
]);

const ALLOWED_SCALES = new Set([
  40,
  50,
  60,
  70,
  80,
  90,
  100
]);

/* V18.9 — PILIHAN MUKA SURAT */

const ALLOWED_PAGE_COUNTS = new Set([
  6,
  8,
  10,
  12,
  16,
  20,
  24,
  30,
  40,
  50
]);

/* V18.6 — FONT KANAK-KANAK */

const KIDS_FONTS = [
  'Fredoka',
  'Baloo 2',
  'Bubblegum Sans',
  'Chewy',
  'Sniglet',
  'Comic Neue',
  'Comfortaa',
  'Quicksand',
  'Nunito',
  'Lexend',
  'ABeeZee',
  'Patrick Hand',
  'Varela Round',
  'Georgia',
  'Trebuchet MS',
  'Arial'
];

/* ============================================================
   2. DATABASE
   ============================================================ */

mkdirSync(IMAGE_DIR, {
  recursive: true
});

const db = new Database(
  join(DATA_DIR, 'books.sqlite')
);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    idea TEXT NOT NULL,
    age TEXT NOT NULL,
    language TEXT NOT NULL,
    pages TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const bookColumns = db.prepare(
  'PRAGMA table_info(books)'
).all();

if (!bookColumns.some(c => c.name === 'owner_id')) {
  db.exec(`
    ALTER TABLE books
    ADD COLUMN owner_id TEXT
  `);
}

if (!bookColumns.some(c => c.name === 'revision')) {
  db.exec(`
    ALTER TABLE books
    ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS image_daily_usage (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id, day)
  );

  CREATE TABLE IF NOT EXISTS book_backups (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    label TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_books_owner
    ON books(owner_id);

  CREATE INDEX IF NOT EXISTS idx_sessions_user
    ON sessions(user_id);

  CREATE INDEX IF NOT EXISTS idx_backups_book
    ON book_backups(owner_id, book_id, created_at);
`);


/* ======================================================
   STORYLAND AI V19.2
   DATABASE SEJARAH CERITA
   ====================================================== */

db.exec(`
  CREATE TABLE IF NOT EXISTS page_text_history (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_page_text_history
  ON page_text_history (
    owner_id,
    book_id,
    page_number,
    created_at DESC
  );
`);


/* ============================================================
   3. GEMINI
   ============================================================ */

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  : null;

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}


/* ==========================================
   V18.9.1 — GEMINI AUTO FALLBACK
   ========================================== */

async function geminiWithRetry(options) {
  if (!ai) {
    throw new Error('Gemini API Key belum ditetapkan.');
  }

  const primaryModel =
    process.env.GEMINI_TEXT_MODEL ||
    'gemini-3.8-flash';

  const fallbackModel =
    process.env.GEMINI_FALLBACK_MODEL ||
    'gemini-3.6-flash';

  const models = [...new Set([
    options.model || primaryModel,
    fallbackModel
  ])];

  let lastError = null;

  for (const model of models) {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(
          `[Gemini] Menjana menggunakan ${model}, ` +
          `percubaan ${attempt}/${maxAttempts}`
        );

        const result = await ai.models.generateContent({
          ...options,
          model
        });

        console.log(
          `[Gemini] Berjaya menggunakan ${model}`
        );

        return result;

      } catch (error) {
        lastError = error;

        const status = Number(
          error.status || error.code || 0
        );

        console.warn(
          `[Gemini] ${model} gagal: HTTP ${status}`
        );

        const temporaryError = [
          408, 429, 500, 502, 503, 504
        ].includes(status);

        // 404 may indicate an unavailable model.
        // Allow trying the fallback, but don't
        // repeatedly retry this model.
        if (status === 404) {
          break;
        }

        if (!temporaryError) {
          throw error;
        }

        if (attempt < maxAttempts) {
          const delay =
            1500 * Math.pow(2, attempt - 1) +
            Math.floor(Math.random() * 500);

          await sleep(delay);
        }
      }
    }

    console.warn(
      `[Gemini] Beralih daripada ${model} ` +
      'kepada model seterusnya jika tersedia.'
    );
  }

  throw lastError || new Error(
    'Semua model Gemini gagal.'
  );
}


/* ============================================================
   4. GENERAL HELPERS
   ============================================================ */

function nowISO() {
  return new Date().toISOString();
}

function todayUTC() {
  return nowISO().slice(0, 10);
}

function isUUID(value) {
  return (
    typeof value === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
      .test(value)
  );
}

function cleanText(value, max = 200) {
  return typeof value === 'string'
    ? value.trim().slice(0, max)
    : '';
}

function countWords(value) {
  return String(value || '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .length;
}

function pick(value, choices, fallback) {
  return choices.includes(value)
    ? value
    : fallback;
}

function bounded(value, min, max, fallback) {
  const number = Number(value);

  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, number))
    : fallback;
}

function getBook(id, userId) {
  if (!isUUID(id) || !userId) {
    return null;
  }

  return db.prepare(`
    SELECT *
    FROM books
    WHERE id = ? AND owner_id = ?
  `).get(id, userId) || null;
}

function saveStory(id, userId, story) {
  return db.prepare(`
    UPDATE books
    SET pages = ?,
        updated_at = ?
    WHERE id = ? AND owner_id = ?
  `).run(
    JSON.stringify(story),
    nowISO(),
    id,
    userId
  ).changes === 1;
}

/* ============================================================
   5. COVER DESIGN
   ============================================================ */

const COVER_DESIGN_DEFAULTS = {
  template: 'fantasy',
  font: 'Fredoka',
  titleSize: 36,
  titleColor: '#ffffff',
  align: 'center',
  position: 'bottom',
  overlay: 65
};

function normalizeCoverDesign(input) {
  const d =
    input &&
    typeof input === 'object' &&
    !Array.isArray(input)
      ? input
      : {};

  return {
    template: pick(
      d.template,
      [
        'fantasy',
        'pastel',
        'modern',
        'royal',
        'night',
        'minimal'
      ],
      'fantasy'
    ),

    font: pick(
      d.font,
      KIDS_FONTS,
      'Fredoka'
    ),

    titleSize: bounded(
      d.titleSize,
      22,
      60,
      36
    ),

    titleColor: pick(
      d.titleColor,
      [
        '#ffffff',
        '#fff4d8',
        '#3b2855',
        '#261e37',
        '#ffe6f3',
        '#fff0a8'
      ],
      '#ffffff'
    ),

    align: pick(
      d.align,
      ['left', 'center', 'right'],
      'center'
    ),

    position: pick(
      d.position,
      ['top', 'middle', 'bottom'],
      'bottom'
    ),

    overlay: bounded(
      d.overlay,
      0,
      85,
      65
    )
  };
}

/* ============================================================
   6. IMAGE HISTORY
   ============================================================ */

function ensureImageHistory(story) {
  if (
    !story.imageHistory ||
    typeof story.imageHistory !== 'object' ||
    Array.isArray(story.imageHistory)
  ) {
    story.imageHistory = {};
  }

  if (!Array.isArray(story.imageHistory.cover)) {
    story.imageHistory.cover = [];
  }

  if (
    !story.imageHistory.pages ||
    typeof story.imageHistory.pages !== 'object' ||
    Array.isArray(story.imageHistory.pages)
  ) {
    story.imageHistory.pages = {};
  }

  return story;
}

function normalizeStory(story) {
  if (!story || typeof story !== 'object') {
    throw new Error('Data buku tidak sah.');
  }

  story.coverImageUrl ??= null;

  story.coverAuthor ??= 'Storyland AI';

  story.coverSubtitle ??=
    'Sebuah cerita penuh imaginasi dan pengajaran';

  story.coverIllustrationIdea =
    typeof story.coverIllustrationIdea === 'string'
      ? story.coverIllustrationIdea.slice(0, 1000)
      : '';

  story.coverDesign = normalizeCoverDesign(
    story.coverDesign
  );

  story.characterGuide =
    typeof story.characterGuide === 'string'
      ? story.characterGuide.slice(0, 1200)
      : '';

  story.characterProfiles =
    Array.isArray(story.characterProfiles)
      ? story.characterProfiles.slice(0, 10).map(c => ({
          id: isUUID(c?.id)
            ? c.id
            : randomUUID(),

          name: cleanText(c?.name, 80),

          role: cleanText(c?.role, 80),

          description: cleanText(
            c?.description,
            500
          ),

          imageUrl:
            typeof c?.imageUrl === 'string'
              ? c.imageUrl
              : null
        }))
      : [];

  story.pages = Array.isArray(story.pages)
    ? story.pages.map((p, i) => ({
        ...p,

        number: Number.isInteger(p.number)
          ? p.number
          : i + 1,

        text: String(p.text || ''),

        illustrationPrompt: String(
          p.illustrationPrompt || ''
        ),

        imageUrl: p.imageUrl || null,

        layout: ALLOWED_LAYOUTS.has(p.layout)
          ? p.layout
          : 'side',

        theme: ALLOWED_THEMES.has(p.theme)
          ? p.theme
          : 'fantasy',

        decoration:
          ALLOWED_DECORATIONS.has(p.decoration)
            ? p.decoration
            : 'frame',

        imageScale:
          ALLOWED_SCALES.has(Number(p.imageScale))
            ? Number(p.imageScale)
            : 100,

        imageAlign:
          ALLOWED_ALIGNS.has(p.imageAlign)
            ? p.imageAlign
            : 'center'
      }))
    : [];

  story.readingFont = pick(
    story.readingFont,
    KIDS_FONTS,
    'Nunito'
  );

  story.readingFontSize = bounded(
    story.readingFontSize,
    14,
    30,
    18
  );

  return ensureImageHistory(story);
}

function targetPage(story, target) {
  if (target === 'cover') {
    return {
      valid: true,
      cover: true,
      page: null
    };
  }

  const number = Number(target);

  if (
    !Number.isInteger(number) ||
    String(number) !== String(target)
  ) {
    return {
      valid: false
    };
  }

  const page = story.pages.find(
    p => p.number === number
  );

  return page
    ? {
        valid: true,
        cover: false,
        page,
        number
      }
    : {
        valid: false
      };
}

function historyList(story, target) {
  ensureImageHistory(story);

  if (target === 'cover') {
    return story.imageHistory.cover;
  }

  const key = String(target);

  if (
    !Array.isArray(
      story.imageHistory.pages[key]
    )
  ) {
    story.imageHistory.pages[key] = [];
  }

  return story.imageHistory.pages[key];
}

function currentImage(story, target) {
  if (target === 'cover') {
    return story.coverImageUrl || null;
  }

  return story.pages.find(
    p => p.number === Number(target)
  )?.imageUrl || null;
}

function setCurrentImage(story, target, url) {
  if (target === 'cover') {
    story.coverImageUrl = url;
    return;
  }

  const page = story.pages.find(
    p => p.number === Number(target)
  );

  if (!page) {
    throw new Error('Halaman tidak dijumpai.');
  }

  page.imageUrl = url;
}

function rememberImage(story, target, url) {
  if (!url) return;

  const images = historyList(story, target);

  const existing = images.indexOf(url);

  if (existing !== -1) {
    images.splice(existing, 1);
  }

  images.unshift(url);

  images.length = Math.min(
    images.length,
    MAX_HISTORY
  );
}

function replaceImageWithHistory(story, target, url) {
  const previous = currentImage(
    story,
    target
  );

  if (previous && previous !== url) {
    rememberImage(
      story,
      target,
      previous
    );
  }

  setCurrentImage(
    story,
    target,
    url
  );
}

/* ============================================================
   7. IMAGE VALIDATION & STORAGE
   ============================================================ */

function requestMime(req) {
  return String(
    req.headers['content-type'] || ''
  ).split(';')[0].trim().toLowerCase();
}

function validImage(buffer, mime) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 12 ||
    buffer.length > MAX_IMAGE_BYTES
  ) {
    return false;
  }

  if (mime === 'image/jpeg') {
    return (
      buffer[0] === 255 &&
      buffer[1] === 216 &&
      buffer[2] === 255
    );
  }

  if (mime === 'image/png') {
    return buffer.subarray(0, 8).equals(
      Buffer.from(
        '89504e470d0a1a0a',
        'hex'
      )
    );
  }

  if (mime === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }

  return false;
}

async function saveImage(
  bookId,
  prefix,
  buffer,
  mime,
  subfolder = ''
) {
  const folder = join(
    IMAGE_DIR,
    bookId,
    subfolder
  );

  mkdirSync(folder, {
    recursive: true
  });

  const filename =
    `${prefix}-${randomUUID()}.${IMAGE_EXTENSIONS[mime]}`;

  await writeFile(
    join(folder, filename),
    buffer
  );

  return subfolder
    ? `/generated/${bookId}/${subfolder}/${filename}`
    : `/generated/${bookId}/${filename}`;
}

/* ============================================================
   8. AUTHENTICATION
   ============================================================ */

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');

  const key = scryptSync(
    password,
    Buffer.from(salt, 'hex'),
    64
  );

  return `${salt}:${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, encoded] = stored.split(':');

    const expected = Buffer.from(
      encoded,
      'hex'
    );

    const actual = scryptSync(
      password,
      Buffer.from(salt, 'hex'),
      64
    );

    return (
      expected.length === 64 &&
      timingSafeEqual(expected, actual)
    );

  } catch {
    return false;
  }
}

function hashToken(token) {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

function cookieToken(req) {
  const cookies =
    (req.headers.cookie || '').split(';');

  for (const part of cookies) {
    const index = part.indexOf('=');

    if (
      index >= 0 &&
      part.slice(0, index).trim() === SESSION_COOKIE
    ) {
      return part.slice(index + 1).trim();
    }
  }

  return null;
}

function sessionUser(req) {
  const token = cookieToken(req);

  if (
    !token ||
    !/^[a-f0-9]{64}$/.test(token)
  ) {
    return null;
  }

  return db.prepare(`
    SELECT users.id, users.name, users.email
    FROM sessions
    JOIN users
      ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
  `).get(
    hashToken(token),
    Date.now()
  ) || null;
}

function requireAuth(req, res, next) {
  req.user = sessionUser(req);

  if (!req.user) {
    return res.status(401).json({
      error: 'Sila log masuk terlebih dahulu.'
    });
  }

  next();
}

function createSession(user, res) {
  const token = randomBytes(32).toString('hex');

  db.prepare(`
    INSERT INTO sessions (
      token_hash,
      user_id,
      expires_at
    )
    VALUES (?, ?, ?)
  `).run(
    hashToken(token),
    user.id,
    Date.now() + SESSION_LIFETIME
  );

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PRODUCTION,
    path: '/',
    maxAge: SESSION_LIFETIME
  });
}

/* Same-origin protection */

app.use((req, res, next) => {
  if (
    ['GET', 'HEAD', 'OPTIONS'].includes(
      req.method
    )
  ) {
    return next();
  }

  const origin = req.get('origin');

  if (
    origin &&
    origin !==
      `${req.protocol}://${req.get('host')}`
  ) {
    return res.status(403).json({
      error: 'Asal permintaan tidak dibenarkan.'
    });
  }

  next();
});

/* ============================================================
   9. REGISTER / LOGIN / LOGOUT
   ============================================================ */

const loginAttempts = new Map();

app.post('/api/auth/register', (req, res) => {
  const name = cleanText(
    req.body?.name,
    81
  );

  const email = cleanText(
    req.body?.email,
    255
  ).toLowerCase();

  const password = req.body?.password;

  if (
    name.length < 2 ||
    name.length > 80 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== 'string' ||
    password.length < 10 ||
    password.length > 128
  ) {
    return res.status(400).json({
      error: 'Maklumat pendaftaran tidak sah.'
    });
  }

  try {
    db.prepare(`
      INSERT INTO users (
        id,
        name,
        email,
        password_hash,
        created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      name,
      email,
      hashPassword(password),
      nowISO()
    );

    return res.status(201).json({
      ok: true,
      message: 'Pendaftaran berjaya. Sila log masuk.'
    });

  } catch (error) {
    return res.status(
      error.code?.startsWith('SQLITE_CONSTRAINT')
        ? 409
        : 500
    ).json({
      error: 'E-mel sudah digunakan atau pendaftaran gagal.'
    });
  }
});

app.post('/api/auth/login', (req, res) => {
  const key = req.ip;
  const stamp = Date.now();

  let state = loginAttempts.get(key);

  if (state?.blockedUntil > stamp) {
    return res.status(429).json({
      error: 'Cuba log masuk semula kemudian.'
    });
  }

  const email = cleanText(
    req.body?.email,
    255
  ).toLowerCase();

  const password = req.body?.password;

  if (
    typeof password !== 'string' ||
    password.length > 128
  ) {
    return res.status(400).json({
      error: 'Maklumat log masuk tidak sah.'
    });
  }

  const account = db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
  `).get(email);

  if (
    !account ||
    !verifyPassword(
      password,
      account.password_hash
    )
  ) {
    if (
      !state ||
      stamp - state.startedAt > 900000
    ) {
      state = {
        count: 0,
        startedAt: stamp,
        blockedUntil: 0
      };
    }

    state.count++;

    if (state.count >= 10) {
      state.blockedUntil =
        stamp + 900000;
    }

    loginAttempts.set(key, state);

    return res.status(401).json({
      error: 'E-mel atau kata laluan salah.'
    });
  }

  loginAttempts.delete(key);

  const user = {
    id: account.id,
    name: account.name,
    email: account.email
  };

  createSession(user, res);

  return res.json({
    ok: true,
    user
  });
});

app.get('/api/auth/me', (req, res) => {
  const user = sessionUser(req);

  return user
    ? res.json({ user })
    : res.status(401).json({
        error: 'Belum log masuk.'
      });
});

app.post('/api/auth/logout', (req, res) => {
  const token = cookieToken(req);

  if (
    token &&
    /^[a-f0-9]{64}$/.test(token)
  ) {
    db.prepare(`
      DELETE FROM sessions
      WHERE token_hash = ?
    `).run(hashToken(token));
  }

  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PRODUCTION,
    path: '/'
  });

  return res.json({
    ok: true
  });
});

/* ============================================================
   10. USER PROFILE
   ============================================================ */

app.get(
  '/api/auth/profile',
  requireAuth,
  (req, res) => {
    return res.json({
      ok: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email
      }
    });
  }
);

app.put(
  '/api/auth/profile',
  requireAuth,
  (req, res) => {
    const name = req.body?.name;

    if (
      typeof name !== 'string' ||
      name.trim().length < 2 ||
      name.trim().length > 80 ||
      /[\u0000-\u001f\u007f]/u.test(name)
    ) {
      return res.status(400).json({
        error: 'Nama mestilah antara 2 hingga 80 aksara.'
      });
    }

    try {
      const newName = name.trim();

      const result = db.prepare(`
        UPDATE users
        SET name = ?
        WHERE id = ?
      `).run(
        newName,
        req.user.id
      );

      if (result.changes !== 1) {
        return res.status(404).json({
          error: 'Akaun tidak dijumpai.'
        });
      }

      return res.json({
        ok: true,
        message: 'Profil berjaya dikemas kini.',
        user: {
          id: req.user.id,
          name: newName,
          email: req.user.email
        }
      });

    } catch (error) {
      console.error('[Profil]', error);

      return res.status(500).json({
        error: 'Gagal mengemas kini profil.'
      });
    }
  }
);

/* ============================================================
   11. HEALTH CHECK
   ============================================================ */

app.get('/api/health', (_req, res) => {
  return res.json({
    ok: true,
    version: '18.9',
    textModel: TEXT_MODEL,
    imageModel: IMAGE_MODEL,
    dailyImageLimit: DAILY_LIMIT,
    availableFonts: KIDS_FONTS.length,
    pageOptions: [...ALLOWED_PAGE_COUNTS]
  });
});

/* Protect private endpoints */

app.use('/api/books', requireAuth);

app.use(
  '/api/image-studio',
  requireAuth
);

app.use(
  '/api/stories/generate',
  requireAuth
);

/* ============================================================
   12. BACKUP HELPERS
   ============================================================ */

const createBookBackup = db.transaction(
  (book, ownerId, label) => {
    const id = randomUUID();

    const snapshot = JSON.stringify({
      title: book.title,
      idea: book.idea,
      age: book.age,
      language: book.language,
      story: JSON.parse(book.pages)
    });

    db.prepare(`
      INSERT INTO book_backups (
        id,
        book_id,
        owner_id,
        label,
        snapshot,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      book.id,
      ownerId,
      label,
      snapshot,
      nowISO()
    );

    db.prepare(`
      DELETE FROM book_backups
      WHERE book_id = ?
        AND owner_id = ?
        AND id NOT IN (
          SELECT id
          FROM book_backups
          WHERE book_id = ?
            AND owner_id = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT ?
        )
    `).run(
      book.id,
      ownerId,
      book.id,
      ownerId,
      MAX_BACKUPS
    );

    return id;
  }
);

function shouldAutoBackup(book, ownerId) {
  const record = db.prepare(`
    SELECT created_at
    FROM book_backups
    WHERE book_id = ?
      AND owner_id = ?
      AND label = 'Backup Automatik'
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).get(
    book.id,
    ownerId
  );

  if (!record) return true;

  const lastTime = Date.parse(
    record.created_at
  );

  return (
    !Number.isFinite(lastTime) ||
    Date.now() - lastTime >= AUTO_BACKUP_MS
  );
}

/* ============================================================
   13. BOOK LIBRARY
   ============================================================ */

app.get('/api/books', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT *
      FROM books
      WHERE owner_id = ?
      ORDER BY updated_at DESC
      LIMIT 100
    `).all(req.user.id);

    return res.json(
      rows.map(book => {
        const story = JSON.parse(
          book.pages
        );

        return {
          id: book.id,
          title: book.title,
          age: book.age,
          language: book.language,
          pageCount:
            story.pages?.length || 0,
          coverImageUrl:
            story.coverImageUrl || null,
          revision: book.revision,
          created_at: book.created_at,
          updated_at: book.updated_at
        };
      })
    );

  } catch (error) {
    console.error('[Perpustakaan]', error);

    return res.status(500).json({
      error: 'Gagal membaca perpustakaan.'
    });
  }
});

app.get('/api/books/:id', (req, res) => {
  const book = getBook(
    req.params.id,
    req.user.id
  );

  if (!book) {
    return res.status(404).json({
      error: 'Buku tidak dijumpai.'
    });
  }

  return res.json({
    ...book,
    pages: normalizeStory(
      JSON.parse(book.pages)
    )
  });
});

/* ============================================================
   14. GEMINI STORY GENERATOR
   V18.9 — FIX INPUT + 6–50 PAGES
   ============================================================ */

const STORY_SCHEMA = {
  type: 'object',

  properties: {
    title: {
      type: 'string'
    },

    moral: {
      type: 'string'
    },

    coverIllustrationIdea: {
      type: 'string'
    },

    pages: {
      type: 'array',

      items: {
        type: 'object',

        properties: {
          number: {
            type: 'integer'
          },

          text: {
            type: 'string'
          },

          illustrationPrompt: {
            type: 'string'
          }
        },

        required: [
          'number',
          'text',
          'illustrationPrompt'
        ]
      }
    }
  },

  required: [
    'title',
    'moral',
    'coverIllustrationIdea',
    'pages'
  ]
};

function normalizeAge(value) {
  const raw = String(value || '6-8')
    .trim()
    .replace(/[–—]/g, '-')
    .toLowerCase();

  const values = {
    '3-5': '3-5',
    '3-5 tahun': '3-5',
    '3 hingga 5 tahun': '3-5',

    '6-8': '6-8',
    '6-8 tahun': '6-8',
    '6 hingga 8 tahun': '6-8',

    '9-12': '9-12',
    '9-12 tahun': '9-12',
    '9 hingga 12 tahun': '9-12'
  };

  return values[raw] || raw;
}

function normalizeLanguage(value) {
  const raw = String(
    value || 'Bahasa Melayu'
  ).trim();

  const values = {
    'bm': 'Bahasa Melayu',
    'ms': 'Bahasa Melayu',
    'ms-my': 'Bahasa Melayu',
    'malay': 'Bahasa Melayu',
    'bahasa melayu': 'Bahasa Melayu',
    'bahasa malaysia': 'Bahasa Melayu',

    'en': 'English',
    'en-us': 'English',
    'en-gb': 'English',
    'english': 'English',
    'bahasa inggeris': 'English'
  };

  return values[raw.toLowerCase()] || raw;
}

function validateStoryInput(data) {
  const title = cleanText(
    data?.title,
    120
  );

  const idea = cleanText(
    data?.idea,
    2000
  );

  const age = normalizeAge(
    data?.age
  );

  const language = normalizeLanguage(
    data?.language
  );

  const count = Number(
    data?.pageCount
  );

  const errors = [];

  if (!title) {
    errors.push(
      'Tajuk buku diperlukan.'
    );
  }

  if (idea.length < 12) {
    errors.push(
      'Idea cerita mesti mempunyai sekurang-kurangnya 12 aksara.'
    );
  }

  if (!ALLOWED_PAGE_COUNTS.has(count)) {
    errors.push(
      `Bilangan muka surat "${data?.pageCount}" tidak sah.`
    );
  }

  if (!['3-5', '6-8', '9-12'].includes(age)) {
    errors.push(
      `Kategori umur "${data?.age}" tidak sah.`
    );
  }

  if (
    !['Bahasa Melayu', 'English'].includes(
      language
    )
  ) {
    errors.push(
      `Pilihan bahasa "${data?.language}" tidak sah.`
    );
  }

  return {
    title,
    idea,
    age,
    language,
    count,
    errors
  };
}

app.post(
  '/api/stories/generate',
  async (req, res) => {
    const input = validateStoryInput(
      req.body || {}
    );

    console.log('[SEMAKAN JANA CERITA]', {
      panjangTajuk: input.title.length,
      panjangIdea: input.idea.length,
      umur: input.age,
      bahasa: input.language,
      mukaSurat: input.count,
      ralat: input.errors
    });

    if (input.errors.length > 0) {
      return res.status(400).json({
        error: input.errors.join(' '),
        details: input.errors
      });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API Key belum dikonfigurasi.'
      });
    }

    try {
      const response = await geminiWithRetry({
        model: TEXT_MODEL,

        contents: `
You are a professional children's book author.

Create one original, age-appropriate,
coherent children's story.

BOOK TITLE:
${input.title}

STORY IDEA:
${input.idea}

TARGET AGE:
${input.age}

STORY LANGUAGE:
${input.language}

NUMBER OF PAGES:
${input.count}

STRICT REQUIREMENTS:
- Exactly ${input.count} numbered story pages.
- Number pages consecutively from 1.
- Maximum 35 words of story text per page.
- Use simple language suitable for the age.
- Keep all recurring characters consistent.
- Each page must have an English
  illustrationPrompt describing the scene.
- Provide a clear moral.
- Provide an English coverIllustrationIdea.
- Cover artwork should have portrait composition.
- Leave visual space for the book title.
- No words or watermark inside the artwork.
- Story must have a beginning, middle and ending.
- Return a JSON object matching the schema.
`,

        config: {
          responseMimeType:
            'application/json',

          responseSchema:
            STORY_SCHEMA,

          maxOutputTokens: 32768
        }
      });

      const story = JSON.parse(
        response.text || '{}'
      );

      if (
        !Array.isArray(story.pages) ||
        story.pages.length !== input.count ||
        story.pages.some(
          (page, index) =>
            page.number !== index + 1 ||
            typeof page.text !== 'string' ||
            !page.text.trim() ||
            countWords(page.text) > MAX_WORDS ||
            typeof page.illustrationPrompt !== 'string' ||
            !page.illustrationPrompt.trim()
        )
      ) {
        return res.status(422).json({
          error:
            'Gemini tidak menghasilkan bilangan halaman atau format yang tepat. Cuba semula.'
        });
      }

      story.title = cleanText(
        story.title || input.title,
        120
      );

      story.coverIllustrationIdea =
        cleanText(
          story.coverIllustrationIdea,
          1000
        ) ||
        `Portrait children's book cover about ` +
        `${story.title}. ${input.idea.slice(0, 500)}. ` +
        `No text or watermark.`;

      story.coverImageUrl = null;
      story.coverAuthor = 'Storyland AI';

      story.coverSubtitle =
        'Sebuah cerita penuh imaginasi dan pengajaran';

      story.coverDesign = {
        ...COVER_DESIGN_DEFAULTS
      };

      story.characterGuide = '';
      story.characterProfiles = [];

      story.imageHistory = {
        cover: [],
        pages: {}
      };

      story.readingFont = 'Nunito';
      story.readingFontSize = 18;

      story.pages = story.pages.map(page => ({
        ...page,

        imageUrl: null,

        layout: 'side',

        theme: 'fantasy',

        decoration: 'frame',

        imageScale: 100,

        imageAlign: 'center'
      }));

      const id = randomUUID();
      const timestamp = nowISO();

      db.prepare(`
        INSERT INTO books (
          id,
          title,
          idea,
          age,
          language,
          pages,
          created_at,
          updated_at,
          owner_id,
          revision
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        id,
        story.title,
        input.idea,
        input.age,
        input.language,
        JSON.stringify(story),
        timestamp,
        timestamp,
        req.user.id
      );

      return res.json({
        id,
        ...story
      });

    } catch (error) {
      console.error(
        '[Jana Cerita Gemini]',
        error
      );

      const status = Number(
        error.status || 0
      );

      return res.status(
        status === 429 ? 429 :
        status === 503 ? 503 : 502
      ).json({
        error:
          status === 429
            ? 'Had permintaan Gemini dicapai.'
            : status === 503
              ? 'Gemini sedang sibuk. Cuba semula kemudian.'
              : 'Gagal menjana cerita. Semak log server.'
      });
    }
  }
);


/* ==================================================
   V19 — JANA CERITA SETIAP HALAMAN
   Preview dahulu, simpan selepas pengguna setuju
   ================================================== */

app.post(
  '/api/books/:id/pages/:number/generate-text',
  async (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.status(404).json({
        error: 'Buku tidak dijumpai.'
      });
    }

    const number = Number(req.params.number);
    const story = normalizeStory(
      JSON.parse(book.pages)
    );

    const index = story.pages.findIndex(
      p => p.number === number
    );

    if (index < 0) {
      return res.status(404).json({
        error: 'Halaman tidak dijumpai.'
      });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API Key belum tersedia.'
      });
    }

    const instructions = cleanText(
      req.body?.instructions || '',
      500
    );

    const current = story.pages[index];
    const previous = story.pages[index - 1];
    const next = story.pages[index + 1];

    try {
      const prompt = `
You are a professional children's story writer.

Rewrite ONLY page ${number} of a children's book.

BOOK TITLE:
${book.title}

MAIN STORY IDEA:
${book.idea}

TARGET AGE:
${book.age}

LANGUAGE:
${book.language}

BOOK MORAL:
${story.moral || ''}

CHARACTERS:
${story.characterGuide || ''}

PREVIOUS PAGE:
${previous?.text || 'Beginning of story'}

CURRENT PAGE:
${current.text || ''}

NEXT PAGE:
${next?.text || 'End of story'}

USER INSTRUCTIONS:
${instructions || 'Improve this page naturally.'}

RULES:
- Write ONLY the replacement story text.
- Maximum 35 words.
- Minimum 5 words.
- Use the selected story language.
- Maintain character names and personality.
- Maintain continuity with neighboring pages.
- Do not change the overall storyline.
- Do not add a title or page number.
- No Markdown.
`;

      let generated = '';

      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await geminiWithRetry({
          model: TEXT_MODEL,
          contents: prompt,
          config: {
            temperature: 0.7,
            maxOutputTokens: 400
          }
        });

        generated = String(response.text || '')
          .trim()
          .replace(/^["“]|["”]$/g, '');

        if (
          generated &&
          countWords(generated) >= 5 &&
          countWords(generated) <= MAX_WORDS
        ) {
          break;
        }
      }

      if (
        !generated ||
        countWords(generated) < 5 ||
        countWords(generated) > MAX_WORDS
      ) {
        return res.status(422).json({
          error:
            'Gemini tidak menghasilkan teks mengikut had 35 perkataan.'
        });
      }

      // Tidak mengubah database di sini.
      return res.json({
        ok: true,
        pageNumber: number,
        originalText: current.text,
        generatedText: generated,
        wordCount: countWords(generated)
      });

    } catch (error) {
      console.error(
        '[Jana Teks Halaman]',
        error
      );

      const status = Number(error.status || 0);

      return res.status(
        status === 429 ? 429 :
        status === 503 ? 503 : 502
      ).json({
        error:
          status === 429
            ? 'Kuota Gemini Text telah dicapai.'
            : status === 503
              ? 'Gemini sedang sibuk. Cuba semula.'
              : 'Gagal menjana teks halaman.'
      });
    }
  }
);

/* ==========================================
   GEMINI COVER IDEA
   ========================================== */

app.post(
  '/api/books/:id/cover-idea/generate',
  async (req, res) => {
    // Kekalkan kod asal Gemini Cover Idea.
  }
);

app.post(
  '/api/books/:id/cover-idea/generate',
  async (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini belum dikonfigurasi.'
      });
    }

    try {
      const story = normalizeStory(
        JSON.parse(book.pages)
      );

      const summary = story.pages
        .map(p => p.text)
        .join('\n')
        .slice(0, 6000);

      const characters = story.characterProfiles
        .map(c =>
          `${c.name}: ${c.description}`
        )
        .join('\n')
        .slice(0, 1000);

      const response = await geminiWithRetry({
        model: TEXT_MODEL,

        contents: `
Create one premium English illustration
description for a children's book front cover.

Title: ${book.title}

Story:
${summary}

Characters:
${characters}

Character appearance guide:
${story.characterGuide}

Requirements:
- Portrait composition.
- Attractive child-friendly illustration.
- Maintain recurring character appearance.
- Beautiful balanced colors.
- Keep visual space for the book title.
- No text, letters or watermark.
- Maximum 1000 characters.
- Return the illustration description only.
`,

        config: {
          temperature: 0.7
        }
      });

      const idea = cleanText(
        response.text,
        1000
      );

      if (!idea) {
        throw new Error(
          'Gemini tidak memulangkan idea kulit buku.'
        );
      }

      const latest = getBook(
        book.id,
        req.user.id
      );

      if (!latest) {
        return res.sendStatus(404);
      }

      const updated = normalizeStory(
        JSON.parse(latest.pages)
      );

      updated.coverIllustrationIdea = idea;

      if (!saveStory(
        book.id,
        req.user.id,
        updated
      )) {
        throw new Error(
          'Gagal menyimpan idea kulit buku.'
        );
      }

      return res.json({
        ok: true,
        coverIllustrationIdea: idea
      });

    } catch (error) {
      console.error(
        '[Idea Kulit Gemini]',
        error
      );

      const status = Number(
        error.status || 0
      );

      return res.status(
        status === 429 ? 429 :
        status === 503 ? 503 : 502
      ).json({
        error:
          status === 503
            ? 'Gemini sedang sibuk. Cuba semula kemudian.'
            : 'Gagal menjana idea kulit buku.'
      });
    }
  }
);

/* ============================================================
   16. REVISION-PROTECTED SAVE
   ============================================================ */

const saveWithRevision = db.transaction(
  (bookId, ownerId, expectedRevision, incoming) => {
    const latest = getBook(
      bookId,
      ownerId
    );

    if (!latest) {
      return {
        status: 404,
        error: 'Buku tidak dijumpai.'
      };
    }

    if (latest.revision !== expectedRevision) {
      return {
        status: 409,
        code: 'BOOK_CONFLICT',
        error:
          'Buku telah diubah pada tab atau peranti lain.',
        currentRevision: latest.revision
      };
    }

    const story = normalizeStory(
      JSON.parse(latest.pages)
    );

    const byNumber = new Map(
      incoming.pages.map(p => [
        p.number,
        p
      ])
    );

    story.pages = story.pages.map(page => {
      const update = byNumber.get(
        page.number
      );

      return {
        ...page,

        text: update.text,

        layout:
          ALLOWED_LAYOUTS.has(update.layout)
            ? update.layout
            : page.layout,

        theme:
          ALLOWED_THEMES.has(update.theme)
            ? update.theme
            : page.theme,

        decoration:
          ALLOWED_DECORATIONS.has(update.decoration)
            ? update.decoration
            : page.decoration,

        imageScale:
          ALLOWED_SCALES.has(
            Number(update.imageScale)
          )
            ? Number(update.imageScale)
            : page.imageScale,

        imageAlign:
          ALLOWED_ALIGNS.has(update.imageAlign)
            ? update.imageAlign
            : page.imageAlign
      };
    });

    story.coverAuthor =
      incoming.coverAuthor;

    story.coverSubtitle =
      incoming.coverSubtitle;

    story.coverDesign = normalizeCoverDesign(
      incoming.coverDesign
    );

    story.coverIllustrationIdea =
      incoming.coverIllustrationIdea;

    story.readingFont = pick(
      incoming.readingFont,
      KIDS_FONTS,
      'Nunito'
    );

    story.readingFontSize = bounded(
      incoming.readingFontSize,
      14,
      30,
      18
    );

    const nextJSON = JSON.stringify(story);

    if (nextJSON === latest.pages) {
      return {
        ok: true,
        revision: latest.revision,
        unchanged: true
      };
    }

    if (shouldAutoBackup(latest, ownerId)) {
      createBookBackup(
        latest,
        ownerId,
        'Backup Automatik'
      );
    }

    const changed = db.prepare(`
      UPDATE books
      SET pages = ?,
          updated_at = ?,
          revision = revision + 1
      WHERE id = ?
        AND owner_id = ?
        AND revision = ?
    `).run(
      nextJSON,
      nowISO(),
      bookId,
      ownerId,
      expectedRevision
    ).changes;

    if (changed !== 1) {
      throw new Error(
        'Simpanan serentak tidak dapat diselesaikan.'
      );
    }

    return {
      ok: true,
      revision: expectedRevision + 1
    };
  }
);

app.put('/api/books/:id', (req, res) => {
  const book = getBook(
    req.params.id,
    req.user.id
  );

  if (!book) {
    return res.sendStatus(404);
  }

  const revision = req.body?.revision;

  if (
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    return res.status(428).json({
      code: 'REVISION_REQUIRED',
      error:
        'Versi buku diperlukan. Sila buka semula buku.'
    });
  }

  const story = normalizeStory(
    JSON.parse(book.pages)
  );

  const pages = req.body?.pages;

  if (
    !Array.isArray(pages) ||
    pages.length !== story.pages.length ||
    pages.some(p =>
      !p ||
      !Number.isInteger(p.number) ||
      typeof p.text !== 'string' ||
      p.text.length > 6000 ||
      countWords(p.text) > MAX_WORDS
    ) ||
    new Set(
      pages.map(p => p.number)
    ).size !== pages.length ||
    !story.pages.every(p =>
      pages.some(u => u.number === p.number)
    )
  ) {
    return res.status(400).json({
      error:
        'Halaman tidak sah atau melebihi 35 perkataan.'
    });
  }

  const author =
    req.body?.coverAuthor ?? story.coverAuthor;

  const subtitle =
    req.body?.coverSubtitle ?? story.coverSubtitle;

  const coverIdea =
    req.body?.coverIllustrationIdea ??
    story.coverIllustrationIdea;

  if (
    typeof author !== 'string' ||
    author.length > 100 ||
    typeof subtitle !== 'string' ||
    subtitle.length > 200 ||
    typeof coverIdea !== 'string' ||
    coverIdea.length > 1000
  ) {
    return res.status(400).json({
      error: 'Maklumat kulit buku tidak sah.'
    });
  }

  if (
    req.body.coverDesign !== undefined &&
    (
      !req.body.coverDesign ||
      typeof req.body.coverDesign !== 'object' ||
      Array.isArray(req.body.coverDesign)
    )
  ) {
    return res.status(400).json({
      error: 'Reka bentuk kulit buku tidak sah.'
    });
  }

  try {
    const result = saveWithRevision(
      book.id,
      req.user.id,
      revision,
      {
        pages,

        coverAuthor: author,

        coverSubtitle: subtitle,

        coverIllustrationIdea: coverIdea,

        coverDesign:
          req.body.coverDesign ??
          story.coverDesign,

        readingFont:
          req.body.readingFont ??
          story.readingFont,

        readingFontSize:
          req.body.readingFontSize ??
          story.readingFontSize
      }
    );

    if (!result.ok) {
      return res.status(
        result.status || 500
      ).json(result);
    }

    return res.json(result);

  } catch (error) {
    console.error(
      '[Simpan Buku]',
      error
    );

    return res.status(500).json({
      error: 'Gagal menyimpan buku.'
    });
  }
});

/* ============================================================
   17. MANUAL IMAGE UPLOAD
   ============================================================ */

app.post(
  '/api/books/:id/images/:target',

  express.raw({
    type: Object.keys(IMAGE_EXTENSIONS),
    limit: MAX_IMAGE_BYTES
  }),

  async (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    const story = normalizeStory(
      JSON.parse(book.pages)
    );

    const target = req.params.target;

    if (!targetPage(story, target).valid) {
      return res.status(400).json({
        error: 'Halaman tidak sah.'
      });
    }

    const mime = requestMime(req);

    if (
      !IMAGE_EXTENSIONS[mime] ||
      !validImage(req.body, mime)
    ) {
      return res.status(400).json({
        error: 'Gambar tidak sah.'
      });
    }

    try {
      const url = await saveImage(
        book.id,
        target,
        req.body,
        mime
      );

      const latest = getBook(
        book.id,
        req.user.id
      );

      if (!latest) {
        return res.sendStatus(404);
      }

      const updated = normalizeStory(
        JSON.parse(latest.pages)
      );

      replaceImageWithHistory(
        updated,
        target,
        url
      );

      if (!saveStory(
        book.id,
        req.user.id,
        updated
      )) {
        throw new Error('Gagal menyimpan gambar.');
      }

      return res.json({
        ok: true,
        imageUrl: url
      });

    } catch (error) {
      console.error(
        '[Muat Naik Gambar]',
        error
      );

      return res.status(500).json({
        error: 'Gagal memuat naik gambar.'
      });
    }
  }
);

/* ============================================================
   18. CHARACTER BIBLE
   ============================================================ */

app.put(
  '/api/books/:id/character-guide',
  (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    if (
      typeof req.body?.guide !== 'string' ||
      req.body.guide.length > 1200
    ) {
      return res.status(400).json({
        error:
          'Panduan identiti watak maksimum 1200 aksara.'
      });
    }

    const story = normalizeStory(
      JSON.parse(book.pages)
    );

    story.characterGuide =
      req.body.guide.trim();

    saveStory(
      book.id,
      req.user.id,
      story
    );

    return res.json({
      ok: true,
      characterGuide: story.characterGuide
    });
  }
);

/* ============================================================
   19. CHARACTER PROFILES
   ============================================================ */

app.put(
  '/api/books/:id/characters',
  (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    const items = req.body?.characters;

    if (
      !Array.isArray(items) ||
      items.length > 10 ||
      items.some(c =>
        !c ||
        !isUUID(c.id) ||
        typeof c.name !== 'string' ||
        c.name.length > 80 ||
        typeof c.role !== 'string' ||
        c.role.length > 80 ||
        typeof c.description !== 'string' ||
        c.description.length > 500
      ) ||
      new Set(
        items.map(c => c.id)
      ).size !== items.length
    ) {
      return res.status(400).json({
        error: 'Senarai watak tidak sah.'
      });
    }

    const story = normalizeStory(
      JSON.parse(book.pages)
    );

    const previous = new Map(
      story.characterProfiles.map(c => [
        c.id,
        c
      ])
    );

    story.characterProfiles = items.map(c => ({
      id: c.id,
      name: c.name.trim(),
      role: c.role.trim(),
      description: c.description.trim(),
      imageUrl:
        previous.get(c.id)?.imageUrl || null
    }));

    saveStory(
      book.id,
      req.user.id,
      story
    );

    return res.json({
      ok: true,
      characterProfiles: story.characterProfiles
    });
  }
);

/* ============================================================
   20. CHARACTER IMAGE UPLOAD
   ============================================================ */

app.post(
  '/api/books/:id/characters/:charId/image',

  express.raw({
    type: Object.keys(IMAGE_EXTENSIONS),
    limit: MAX_IMAGE_BYTES
  }),

  async (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    const story = normalizeStory(
      JSON.parse(book.pages)
    );

    const charId = req.params.charId;

    if (
      !isUUID(charId) ||
      !story.characterProfiles.some(
        c => c.id === charId
      )
    ) {
      return res.status(404).json({
        error: 'Watak tidak dijumpai.'
      });
    }

    const mime = requestMime(req);

    if (
      !IMAGE_EXTENSIONS[mime] ||
      !validImage(req.body, mime)
    ) {
      return res.status(400).json({
        error: 'Gambar watak tidak sah.'
      });
    }

    try {
      const url = await saveImage(
        book.id,
        charId,
        req.body,
        mime,
        'characters'
      );

      const latest = getBook(
        book.id,
        req.user.id
      );

      if (!latest) {
        return res.sendStatus(404);
      }

      const updated = normalizeStory(
        JSON.parse(latest.pages)
      );

      const character = updated.characterProfiles.find(
        c => c.id === charId
      );

      if (!character) {
        return res.sendStatus(404);
      }

      character.imageUrl = url;

      saveStory(
        book.id,
        req.user.id,
        updated
      );

      return res.json({
        ok: true,
        imageUrl: url
      });

    } catch (error) {
      console.error(
        '[Gambar Rujukan Watak]',
        error
      );

      return res.status(500).json({
        error: 'Gagal menyimpan gambar watak.'
      });
    }
  }
);

/* ============================================================
   21. IMAGE HISTORY & RESTORE
   ============================================================ */

app.get(
  '/api/books/:id/image-history/:target',
  (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    const story = normalizeStory(
      JSON.parse(book.pages)
    );

    const target = req.params.target;

    if (!targetPage(story, target).valid) {
      return res.status(400).json({
        error: 'Sasaran gambar tidak sah.'
      });
    }

    return res.json({
      ok: true,

      currentImageUrl:
        currentImage(story, target),

      history: [
        ...historyList(story, target)
      ]
    });
  }
);

app.post(
  '/api/books/:id/image-history/:target/restore',
  (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    const story = normalizeStory(
      JSON.parse(book.pages)
    );

    const target = req.params.target;

    if (!targetPage(story, target).valid) {
      return res.status(400).json({
        error: 'Sasaran gambar tidak sah.'
      });
    }

    const url = req.body?.imageUrl;

    const list = historyList(
      story,
      target
    );

    if (
      typeof url !== 'string' ||
      !list.includes(url)
    ) {
      return res.status(400).json({
        error:
          'Gambar tersebut tiada dalam sejarah buku.'
      });
    }

    list.splice(
      list.indexOf(url),
      1
    );

    const previous = currentImage(
      story,
      target
    );

    if (previous && previous !== url) {
      rememberImage(
        story,
        target,
        previous
      );
    }

    setCurrentImage(
      story,
      target,
      url
    );

    if (!saveStory(
      book.id,
      req.user.id,
      story
    )) {
      return res.status(500).json({
        error: 'Gagal memulihkan gambar.'
      });
    }

    return res.json({
      ok: true,
      imageUrl: url,
      history: [...historyList(story, target)]
    });
  }
);

/* ============================================================
   22. BACKUP CENTER
   ============================================================ */

app.get(
  '/api/books/:id/backups',
  (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    const backups = db.prepare(`
      SELECT id, label, created_at
      FROM book_backups
      WHERE book_id = ?
        AND owner_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    `).all(
      book.id,
      req.user.id,
      MAX_BACKUPS
    );

    return res.json({
      ok: true,
      backups
    });
  }
);

app.post(
  '/api/books/:id/backups',
  (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    if (
      req.body?.label !== undefined &&
      typeof req.body.label !== 'string'
    ) {
      return res.status(400).json({
        error: 'Nama sandaran tidak sah.'
      });
    }

    try {
      const label = cleanText(
        req.body?.label || 'Backup Manual',
        80
      ) || 'Backup Manual';

      const backupId = createBookBackup(
        book,
        req.user.id,
        label
      );

      return res.status(201).json({
        ok: true,
        backupId
      });

    } catch (error) {
      console.error(
        '[Backup Buku]',
        error
      );

      return res.status(500).json({
        error: 'Gagal membuat sandaran.'
      });
    }
  }
);

/* ============================================================
   23. RESTORE BOOK BACKUP
   ============================================================ */

const restoreBookBackup = db.transaction(
  (bookId, ownerId, backupId) => {
    const book = getBook(
      bookId,
      ownerId
    );

    if (!book) {
      return {
        status: 404,
        error: 'Buku tidak dijumpai.'
      };
    }

    const backup = db.prepare(`
      SELECT *
      FROM book_backups
      WHERE id = ?
        AND book_id = ?
        AND owner_id = ?
    `).get(
      backupId,
      bookId,
      ownerId
    );

    if (!backup) {
      return {
        status: 404,
        error: 'Sandaran tidak dijumpai.'
      };
    }

    const data = JSON.parse(
      backup.snapshot
    );

    if (
      typeof data.title !== 'string' ||
      typeof data.idea !== 'string' ||
      !Array.isArray(data.story?.pages)
    ) {
      return {
        status: 422,
        error: 'Format sandaran tidak sah.'
      };
    }

    createBookBackup(
      book,
      ownerId,
      'Sebelum Restore'
    );

    const restored = normalizeStory(
      data.story
    );

    const changed = db.prepare(`
      UPDATE books
      SET title = ?,
          idea = ?,
          age = ?,
          language = ?,
          pages = ?,
          updated_at = ?,
          revision = revision + 1
      WHERE id = ?
        AND owner_id = ?
    `).run(
      data.title,
      data.idea,
      data.age,
      data.language,
      JSON.stringify(restored),
      nowISO(),
      bookId,
      ownerId
    ).changes;

    if (changed !== 1) {
      throw new Error(
        'Gagal memulihkan sandaran.'
      );
    }

    return {
      ok: true
    };
  }
);

app.post(
  '/api/books/:id/backups/:backupId/restore',
  (req, res) => {
    try {
      const result = restoreBookBackup(
        req.params.id,
        req.user.id,
        req.params.backupId
      );

      if (!result.ok) {
        return res.status(
          result.status || 500
        ).json({
          error: result.error
        });
      }

      return res.json({
        ok: true,
        message: 'Buku berjaya dipulihkan.'
      });

    } catch (error) {
      console.error(
        '[Pulihkan Sandaran]',
        error
      );

      return res.status(500).json({
        error: 'Gagal memulihkan sandaran.'
      });
    }
  }
);

/* ============================================================
   24. DUPLICATE / CONFLICT COPY HELPERS
   ============================================================ */

async function copyBookImages(oldId, newId) {
  await cp(
    join(IMAGE_DIR, oldId),
    join(IMAGE_DIR, newId),
    {
      recursive: true,
      force: false,
      errorOnExist: true
    }
  ).catch(error => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });
}

function rewriteImageUrls(story, oldId, newId) {
  const rewrite = url =>
    typeof url === 'string'
      ? url.replace(
          `/generated/${oldId}/`,
          `/generated/${newId}/`
        )
      : url;

  story.coverImageUrl = rewrite(
    story.coverImageUrl
  );

  story.pages = story.pages.map(p => ({
    ...p,
    imageUrl: rewrite(p.imageUrl)
  }));

  story.characterProfiles =
    story.characterProfiles.map(c => ({
      ...c,
      imageUrl: rewrite(c.imageUrl)
    }));

  ensureImageHistory(story);

  story.imageHistory.cover =
    story.imageHistory.cover.map(rewrite);

  for (
    const [key, images] of
    Object.entries(story.imageHistory.pages)
  ) {
    if (Array.isArray(images)) {
      story.imageHistory.pages[key] =
        images.map(rewrite);
    }
  }
}

async function insertCopy(
  source,
  story,
  userId,
  label
) {
  const newId = randomUUID();

  try {
    await copyBookImages(
      source.id,
      newId
    );

    rewriteImageUrls(
      story,
      source.id,
      newId
    );

    story.title = source.title + label;

    const timestamp = nowISO();

    db.prepare(`
      INSERT INTO books (
        id,
        title,
        idea,
        age,
        language,
        pages,
        created_at,
        updated_at,
        owner_id,
        revision
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      newId,
      story.title,
      source.idea,
      source.age,
      source.language,
      JSON.stringify(story),
      timestamp,
      timestamp,
      userId
    );

    return {
      id: newId,
      title: story.title
    };

  } catch (error) {
    await rm(
      join(IMAGE_DIR, newId),
      {
        recursive: true,
        force: true
      }
    ).catch(() => {});

    throw error;
  }
}

/* ============================================================
   25. DUPLICATE BOOK
   ============================================================ */

app.post(
  '/api/books/:id/duplicate',
  async (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    try {
      const result = await insertCopy(
        book,
        normalizeStory(JSON.parse(book.pages)),
        req.user.id,
        ' (Salinan)'
      );

      return res.json({
        ok: true,
        id: result.id
      });

    } catch (error) {
      console.error(
        '[Salin Buku]',
        error
      );

      return res.status(500).json({
        error: 'Gagal menyalin buku.'
      });
    }
  }
);

/* ============================================================
   26. CONFLICT COPY
   ============================================================ */

app.post(
  '/api/books/:id/conflict-copy',
  async (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    const story = normalizeStory(
      JSON.parse(book.pages)
    );

    const input = req.body || {};
    const pages = input.pages;

    if (
      !Array.isArray(pages) ||
      pages.length !== story.pages.length ||
      pages.some(p =>
        !p ||
        !Number.isInteger(p.number) ||
        typeof p.text !== 'string' ||
        countWords(p.text) > MAX_WORDS
      ) ||
      new Set(
        pages.map(p => p.number)
      ).size !== pages.length ||
      !story.pages.every(p =>
        pages.some(x => x.number === p.number)
      )
    ) {
      return res.status(400).json({
        error: 'Draf halaman tidak sah.'
      });
    }

    if (
      typeof input.coverAuthor !== 'string' ||
      input.coverAuthor.length > 100 ||
      typeof input.coverSubtitle !== 'string' ||
      input.coverSubtitle.length > 200
    ) {
      return res.status(400).json({
        error: 'Maklumat kulit buku tidak sah.'
      });
    }

    const byNumber = new Map(
      pages.map(p => [
        p.number,
        p
      ])
    );

    story.pages = story.pages.map(page => {
      const edited = byNumber.get(
        page.number
      );

      return {
        ...page,

        text: edited.text,

        layout:
          ALLOWED_LAYOUTS.has(edited.layout)
            ? edited.layout
            : page.layout,

        theme:
          ALLOWED_THEMES.has(edited.theme)
            ? edited.theme
            : page.theme,

        decoration:
          ALLOWED_DECORATIONS.has(edited.decoration)
            ? edited.decoration
            : page.decoration,

        imageScale:
          ALLOWED_SCALES.has(
            Number(edited.imageScale)
          )
            ? Number(edited.imageScale)
            : page.imageScale,

        imageAlign:
          ALLOWED_ALIGNS.has(edited.imageAlign)
            ? edited.imageAlign
            : page.imageAlign
      };
    });

    story.coverAuthor =
      input.coverAuthor.trim();

    story.coverSubtitle =
      input.coverSubtitle.trim();

    if (input.coverDesign !== undefined) {
      story.coverDesign =
        normalizeCoverDesign(
          input.coverDesign
        );
    }

    if (
      typeof input.coverIllustrationIdea === 'string'
    ) {
      story.coverIllustrationIdea =
        input.coverIllustrationIdea.slice(0, 1000);
    }

    if (KIDS_FONTS.includes(input.readingFont)) {
      story.readingFont =
        input.readingFont;
    }

    if (
      Number.isFinite(
        Number(input.readingFontSize)
      )
    ) {
      story.readingFontSize = bounded(
        input.readingFontSize,
        14,
        30,
        18
      );
    }

    try {
      const result = await insertCopy(
        book,
        story,
        req.user.id,
        ' (Draf Diselamatkan)'
      );

      return res.status(201).json({
        ok: true,
        ...result
      });

    } catch (error) {
      console.error(
        '[Salinan Konflik]',
        error
      );

      return res.status(500).json({
        error: 'Gagal menyelamatkan draf.'
      });
    }
  }
);

/* ============================================================
   27. DELETE BOOK
   ============================================================ */

app.delete(
  '/api/books/:id',
  async (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    db.transaction(() => {
      db.prepare(`
        DELETE FROM book_backups
        WHERE book_id = ?
          AND owner_id = ?
      `).run(
        book.id,
        req.user.id
      );

      db.prepare(`
        DELETE FROM books
        WHERE id = ?
          AND owner_id = ?
      `).run(
        book.id,
        req.user.id
      );
    })();

    await rm(
      join(IMAGE_DIR, book.id),
      {
        recursive: true,
        force: true
      }
    ).catch(error => {
      console.warn(
        '[Pembersihan Gambar]',
        error.message
      );
    });

    return res.json({
      ok: true
    });
  }
);

/* ============================================================
   28. DAILY IMAGE QUOTA
   ============================================================ */

function usedImages(
  userId,
  day = todayUTC()
) {
  return db.prepare(`
    SELECT used
    FROM image_daily_usage
    WHERE user_id = ?
      AND day = ?
  `).get(
    userId,
    day
  )?.used || 0;
}

const reserveQuota = db.transaction(
  (userId, day) => {
    db.prepare(`
      INSERT OR IGNORE INTO image_daily_usage (
        user_id,
        day,
        used
      )
      VALUES (?, ?, 0)
    `).run(
      userId,
      day
    );

    return db.prepare(`
      UPDATE image_daily_usage
      SET used = used + 1
      WHERE user_id = ?
        AND day = ?
        AND used < ?
    `).run(
      userId,
      day,
      DAILY_LIMIT
    ).changes === 1;
  }
);

function refundQuota(userId, day) {
  db.prepare(`
    UPDATE image_daily_usage
    SET used = used - 1
    WHERE user_id = ?
      AND day = ?
      AND used > 0
  `).run(
    userId,
    day
  );
}

app.get(
  '/api/image-studio/quota',
  (req, res) => {
    const used = usedImages(
      req.user.id
    );

    return res.json({
      limit: DAILY_LIMIT,
      used,

      remaining: Math.max(
        0,
        DAILY_LIMIT - used
      ),

      reset: '00:00 UTC'
    });
  }
);

/* ============================================================
   29. CLOUDFLARE IMAGE GENERATOR
   ============================================================ */

async function generateCloudflareImage(prompt) {
  const account = String(
    process.env.CLOUDFLARE_ACCOUNT_ID || ''
  ).trim();

  const token = String(
    process.env.CLOUDFLARE_API_TOKEN || ''
  ).trim();

  if (
    !/^[a-f0-9]{32}$/i.test(account) ||
    !token
  ) {
    const error = new Error(
      'Cloudflare belum dikonfigurasi dengan betul.'
    );

    error.status = 503;
    throw error;
  }

  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${encodeURIComponent(account)}/ai/run/${IMAGE_MODEL}`;

  const response = await fetch(endpoint, {
    method: 'POST',

    headers: {
      Authorization:
        `Bearer ${token}`,

      'Content-Type':
        'application/json'
    },

    body: JSON.stringify({
      prompt: prompt.slice(0, 2048),
      steps: 4
    }),

    signal: AbortSignal.timeout(90000)
  });

  const data = await response
    .json()
    .catch(() => ({}));

  if (
    !response.ok ||
    data.success === false
  ) {
    const error = new Error(
      data.errors?.[0]?.message ||
      `Cloudflare HTTP ${response.status}`
    );

    error.status =
      response.status;

    throw error;
  }

  const buffer = Buffer.from(
    data.result?.image || '',
    'base64'
  );

  if (!validImage(buffer, 'image/jpeg')) {
    throw new Error(
      'Cloudflare memulangkan format imej yang tidak sah.'
    );
  }

  return buffer;
}

/* ============================================================
   30. GENERATE / REGENERATE AI IMAGE
   ============================================================ */

const imageJobs = new Set();

app.post(
  '/api/books/:id/generate-image',
  async (req, res) => {
    const book = getBook(
      req.params.id,
      req.user.id
    );

    if (!book) {
      return res.sendStatus(404);
    }

    const story = normalizeStory(
      JSON.parse(book.pages)
    );

    const target = req.body?.target;

    const info = targetPage(
      story,
      target
    );

    if (!info.valid) {
      return res.status(400).json({
        error: 'Halaman tidak sah.'
      });
    }

    const style = String(
      req.body?.style || 'fantasy'
    );

    const customPrompt =
      req.body?.customPrompt ?? '';

    if (
      !Object.hasOwn(IMAGE_STYLES, style) ||
      typeof customPrompt !== 'string' ||
      customPrompt.length > 500
    ) {
      return res.status(400).json({
        error:
          'Gaya gambar atau arahan tambahan tidak sah.'
      });
    }

    if (imageJobs.has(req.user.id)) {
      return res.status(409).json({
        error: 'Masih ada gambar sedang dijana.'
      });
    }

    const day = todayUTC();

    if (
      !reserveQuota(req.user.id, day)
    ) {
      return res.status(429).json({
        error:
          'Kuota gambar harian telah habis.'
      });
    }

    imageJobs.add(req.user.id);

    let success = false;

    try {
      const characters =
        story.characterProfiles
          .map(c =>
            `${c.name}, ${c.role}: ${c.description}`
          )
          .join('; ')
          .slice(0, 900);

      const scene = info.cover
        ? (
            story.coverIllustrationIdea.trim() ||
            `Portrait cover for "${book.title}". ${book.idea}`
          )
        : String(
            info.page.illustrationPrompt ||
            info.page.text
          );

      
/* ==========================================
   STORYLAND AI V19.6
   GAMBAR SERAGAM UNTUK SEMUA HALAMAN
   ========================================== */

const prompt = [
  'Create one original premium child-friendly picture book illustration.',

  IMAGE_STYLES[style],

  'VISUAL FORMAT: Portrait orientation with a 3:4 aspect ratio.',

  'Use the same 3:4 composition for all illustrations in this storybook.',

  'Keep the main subject clearly visible and centered within the composition.',

  'Leave comfortable margins around important characters. Avoid cropping faces or bodies.',

  'Keep recurring characters visually consistent in face, clothing, colors and accessories.',

  story.characterGuide
    ? `CHARACTER BIBLE: ${story.characterGuide.slice(0, 600)}`
    : '',

  characters
    ? `CHARACTER PROFILES: ${characters}`
    : '',

  info.cover
    ? 'PORTRAIT FRONT COVER. Leave enough space for the title.'
    : 'STORYBOOK PAGE COMPOSITION.',

  `SCENE: ${scene}`,

  customPrompt.trim()
    ? `ADDITIONAL VISUAL DIRECTION: ${customPrompt.trim()}`
    : '',

  'No text, no lettering, no watermark.'
]
  .filter(Boolean)
  .join('\n')
  .slice(0, 2048);


      const buffer =
        await generateCloudflareImage(prompt);

      const latest = getBook(
        book.id,
        req.user.id
      );

      if (!latest) {
        throw new Error(
          'Buku sudah tiada.'
        );
      }

      const updated = normalizeStory(
        JSON.parse(latest.pages)
      );

      const url = await saveImage(
        book.id,
        target,
        buffer,
        'image/jpeg'
      );

      replaceImageWithHistory(
        updated,
        target,
        url
      );

      if (!saveStory(
        book.id,
        req.user.id,
        updated
      )) {
        throw new Error(
          'Gagal menyimpan gambar AI.'
        );
      }

      success = true;

      return res.json({
        ok: true,

        imageUrl: url,

        style,

        remaining: Math.max(
          0,
          DAILY_LIMIT -
            usedImages(req.user.id, day)
        )
      });

    } catch (error) {
      console.error(
        '[Studio Gambar AI]',
        error
      );

      return res.status(
        error.status === 429 ? 429 :
        error.status === 503 ? 503 : 502
      ).json({
        error: PRODUCTION
          ? 'Gagal menjana gambar.'
          : `${error.name}: ${error.message}`
      });

    } finally {
      if (!success) {
        refundQuota(
          req.user.id,
          day
        );
      }

      imageJobs.delete(
        req.user.id
      );
    }
  }
);

/* ============================================================
   31. PRIVATE IMAGE ROUTES
   ============================================================ */

function sendOwnedImage(
  req,
  res,
  character = false
) {
  const book = getBook(
    req.params.id,
    req.user.id
  );

  if (!book) {
    return res.sendStatus(404);
  }

  const filename = req.params.filename;

  const pattern = character
    ? /^[a-f0-9-]{36}-[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/i
    : /^(cover|\d+)-[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/i;

  if (!pattern.test(filename)) {
    return res.sendStatus(404);
  }

  const story = normalizeStory(
    JSON.parse(book.pages)
  );

  const url = character
    ? `/generated/${book.id}/characters/${filename}`
    : `/generated/${book.id}/${filename}`;

  const history = [
    ...story.imageHistory.cover,

    ...Object.values(
      story.imageHistory.pages
    ).flatMap(list =>
      Array.isArray(list)
        ? list
        : []
    )
  ];

  const permitted = character
    ? story.characterProfiles.some(
        c => c.imageUrl === url
      )
    : [
        story.coverImageUrl,
        ...story.pages.map(p => p.imageUrl),
        ...history
      ].includes(url);

  if (!permitted) {
    return res.sendStatus(404);
  }

  const path = character
    ? join(
        IMAGE_DIR,
        book.id,
        'characters',
        filename
      )
    : join(
        IMAGE_DIR,
        book.id,
        filename
      );

  res.sendFile(
    path,
    {
      headers: {
        'Cache-Control':
          'private, no-store'
      }
    },
    error => {
      if (error && !res.headersSent) {
        res.status(404).end();
      }
    }
  );
}

app.get(
  '/generated/:id/:filename',
  requireAuth,
  (req, res) => {
    sendOwnedImage(
      req,
      res,
      false
    );
  }
);

app.get(
  '/generated/:id/characters/:filename',
  requireAuth,
  (req, res) => {
    sendOwnedImage(
      req,
      res,
      true
    );
  }
);

/* ============================================================
   32. STATIC FILES
   ============================================================ */

   
/* ==========================================
   V19.1 — JANA IDEA ILUSTRASI
   ========================================== */

// TAMPAH DI SINI:
// Keseluruhan API POST
// /api/books/:id/pages/:number/illustration-idea
//
// Dan API PUT
// /api/books/:id/pages/:number/illustration-idea
//
// Gunakan kod penuh yang saya berikan
// dalam mesej sebelum ini.


/* ==========================================
   STATIC FILES
   ========================================== */


/* ======================================================
   STORYLAND AI V19.2
   SEJARAH TEKS SETIAP HALAMAN
   ====================================================== */

function getHistoryPage(req, res) {
  const book = getBook(
    req.params.id,
    req.user.id
  );

  if (!book) {
    res.status(404).json({
      error: 'Buku tidak dijumpai.'
    });
    return null;
  }

  const number = Number(req.params.number);

  const story = normalizeStory(
    JSON.parse(book.pages)
  );

  if (
    !Number.isInteger(number) ||
    !story.pages.some(p => p.number === number)
  ) {
    res.status(404).json({
      error: 'Halaman tidak dijumpai.'
    });
    return null;
  }

  return { book, number };
}

/* BACA SEJARAH */

app.get(
  '/api/books/:id/pages/:number/text-history',
  requireAuth,
  (req, res) => {
    const info = getHistoryPage(req, res);
    if (!info) return;

    const history = db.prepare(`
      SELECT id, text, created_at
      FROM page_text_history
      WHERE owner_id = ?
        AND book_id = ?
        AND page_number = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 20
    `).all(
      req.user.id,
      info.book.id,
      info.number
    );

    return res.json({
      ok: true,
      pageNumber: info.number,
      history
    });
  }
);

/* SIMPAN SATU VERSI TEKS */

app.post(
  '/api/books/:id/pages/:number/text-history',
  requireAuth,
  (req, res) => {
    const info = getHistoryPage(req, res);
    if (!info) return;

    const text = req.body?.text;

    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 6000 ||
      countWords(text) > MAX_WORDS
    ) {
      return res.status(400).json({
        error:
          'Versi cerita mesti mempunyai 1–35 perkataan.'
      });
    }

    const clean = text.trim();

    try {
      const result = db.transaction(() => {
        // Elakkan menyimpan versi yang sama berulang.
        const latest = db.prepare(`
          SELECT id, text
          FROM page_text_history
          WHERE owner_id = ?
            AND book_id = ?
            AND page_number = ?
          ORDER BY created_at DESC, rowid DESC
          LIMIT 1
        `).get(
          req.user.id,
          info.book.id,
          info.number
        );

        if (latest?.text === clean) {
          return {
            ok: true,
            duplicate: true
          };
        }

        const id = randomUUID();

        db.prepare(`
          INSERT INTO page_text_history (
            id,
            book_id,
            owner_id,
            page_number,
            text,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          id,
          info.book.id,
          req.user.id,
          info.number,
          clean,
          nowISO()
        );

        db.prepare(`
          DELETE FROM page_text_history
          WHERE owner_id = ?
            AND book_id = ?
            AND page_number = ?
            AND id NOT IN (
              SELECT id
              FROM page_text_history
              WHERE owner_id = ?
                AND book_id = ?
                AND page_number = ?
              ORDER BY created_at DESC, rowid DESC
              LIMIT 20
            )
        `).run(
          req.user.id,
          info.book.id,
          info.number,
          req.user.id,
          info.book.id,
          info.number
        );

        return {
          ok: true,
          id
        };
      })();

      return res.status(
        result.duplicate ? 200 : 201
      ).json(result);

    } catch (error) {
      console.error(
        '[Sejarah Cerita]',
        error
      );

      return res.status(500).json({
        error: 'Gagal menyimpan sejarah cerita.'
      });
    }
  }
);



/* ==========================================
   V19.5 — TERJEMAH IDEA ILUSTRASI
   ========================================== */

app.post(
  '/api/books/:id/pages/:number/translate-idea',
  requireAuth,
  async (req, res) => {
    const book = getBook(req.params.id, req.user.id);

    if (!book) {
      return res.status(404).json({
        error: 'Buku tidak dijumpai.'
      });
    }

    const story = normalizeStory(JSON.parse(book.pages));
    const number = Number(req.params.number);

    const page = story.pages.find(
      p => p.number === number
    );

    if (!page) {
      return res.status(404).json({
        error: 'Halaman tidak dijumpai.'
      });
    }

    const sourceText = String(
      req.body?.text || page.illustrationPrompt || ''
    ).trim();

    if (!sourceText || sourceText.length > 2000) {
      return res.status(400).json({
        error: 'Idea ilustrasi tidak sah.'
      });
    }

    try {
      const response = await geminiWithRetry({
        model: TEXT_MODEL,
        contents: `
Translate this children's storybook illustration
description into natural Bahasa Melayu Malaysia.

Keep character names unchanged.
Preserve all visual details.
Do not add new story details.
Return only the Malay translation.

TEXT:
${sourceText}
`,
        config: {
          temperature: 0.2
        }
      });

      return res.json({
        ok: true,
        translation: String(response.text || '').trim()
      });

    } catch (error) {
      console.error('[Terjemah Idea]', error);

      return res.status(
        error.status === 429 ? 429 : 502
      ).json({
        error: 'Gagal menterjemah idea ilustrasi.'
      });
    }
  }
);



/* ==========================================
   STATIC FILES
   ========================================== */

app.use(
  express.static(
    resolve('./public')
  )
);

/* ==========================================
   GLOBAL ERROR HANDLER
   ========================================== */

// Kekalkan kod asal selepas ini.

app.use(
  express.static(
    resolve('./public')
  )
);

/* ============================================================
   33. GLOBAL ERROR HANDLER
   ============================================================ */

app.use((error, req, res, next) => {
  console.error(
    '[Ralat Server]',
    error
  );

  if (res.headersSent) {
    return next(error);
  }

  return res.status(
    error.type === 'entity.too.large'
      ? 413
      : 500
  ).json({
    error:
      error.type === 'entity.too.large'
        ? 'Saiz gambar maksimum 8MB.'
        : 'Ralat dalaman server.'
  });
});

/* ============================================================
   34. START SERVER
   ============================================================ */

app.listen(PORT, () => {
  console.log('========================================');
  console.log('STORYLAND AI V18.9 READY');
  console.log(`http://localhost:${PORT}`);
  console.log('========================================');

  console.log('Gemini Model:', TEXT_MODEL);

  console.log('Image Model:', IMAGE_MODEL);

  console.log('Daily Image Limit:', DAILY_LIMIT);

  console.log('Available Fonts:', KIDS_FONTS.length);

  console.log(
    'Allowed Pages:',
    [...ALLOWED_PAGE_COUNTS].join(', ')
  );

  console.log('Cover Idea: Enabled');
  console.log('Image History: Enabled');
  console.log('Backup Center: Enabled');
  console.log('Revision Protection: Enabled');
  console.log('User Profile: Enabled');
});
