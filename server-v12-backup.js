
import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';

import { mkdirSync } from 'node:fs';
import { writeFile, cp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

const PORT = Number(process.env.PORT || 3000);
const TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL ||
  process.env.GEMINI_MODEL ||
  'gemini-3.8-flash';

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  : null;

const dataDir = resolve(process.env.DATA_DIR || './data');
const imageDir = join(dataDir, 'generated');

mkdirSync(imageDir, { recursive: true });

const db = new Database(join(dataDir, 'books.sqlite'));
db.pragma('journal_mode = WAL');

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
  )
`);

const allowedPages = new Set([6, 8, 12]);
const validLayouts = new Set(['top', 'bottom', 'side']);
const validThemes = new Set([
  'fantasy', 'garden', 'royal', 'sky'
]);
const validDecorations = new Set(['frame', 'minimal']);
const validAlignments = new Set(['left', 'center', 'right']);
const validScales = new Set([
  40, 50, 60, 70, 80, 90, 100
]);
const MAX_WORDS = 35;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const supportedImages = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function countWords(text) {
  const str = String(text || '').trim();
  return str ? str.split(/\s+/u).length : 0;
}

function validId(id) {
  return /^[a-f0-9-]{36}$/i.test(id);
}

function getBook(id) {
  if (!validId(id)) return null;
  return db.prepare(
    'SELECT * FROM books WHERE id=?'
  ).get(id);
}

function saveStory(id, story) {
  db.prepare(`
    UPDATE books
    SET pages=?, updated_at=?
    WHERE id=?
  `).run(
    JSON.stringify(story),
    new Date().toISOString(),
    id
  );
}

function normalizeStory(story) {
  story.coverImageUrl ??= null;
  story.coverAuthor ??= 'Storyland AI';
  story.coverSubtitle ??=
    'Sebuah cerita penuh imaginasi dan pengajaran';

  story.pages = Array.isArray(story.pages)
    ? story.pages
    : [];

  story.pages = story.pages.map(p => ({
    ...p,
    imageUrl: p.imageUrl || null,
    layout: validLayouts.has(p.layout) ? p.layout : 'side',
    theme: validThemes.has(p.theme) ? p.theme : 'fantasy',
    decoration: validDecorations.has(p.decoration)
      ? p.decoration
      : 'frame',
    imageScale: validScales.has(Number(p.imageScale))
      ? Number(p.imageScale)
      : 100,
    imageAlign: validAlignments.has(p.imageAlign)
      ? p.imageAlign
      : 'center'
  }));

  return story;
}

function validateDraft(body) {
  const title = String(body.title || '').trim();
  const idea = String(body.idea || '').trim();
  const age = String(body.age || '6-8');
  const language = String(body.language || 'Bahasa Melayu');
  const count = Number(body.pageCount);

  if (
    !title || title.length > 120 ||
    idea.length < 12 || idea.length > 2000 ||
    !allowedPages.has(count) ||
    !['3-5', '6-8', '9-12'].includes(age) ||
    !['Bahasa Melayu', 'English'].includes(language)
  ) return null;

  return { title, idea, age, language, count };
}

const storySchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    moral: { type: 'string' },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          text: { type: 'string' },
          illustrationPrompt: { type: 'string' }
        },
        required: ['number', 'text', 'illustrationPrompt']
      }
    }
  },
  required: ['title', 'moral', 'pages']
};

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: '12.0',
    textModel: TEXT_MODEL,
    imageProvider: 'manual-upload'
  });
});

/* =====================================
   V12 — LIBRARY
   ===================================== */

app.get('/api/books', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, title, age, language, pages,
             created_at, updated_at
      FROM books
      ORDER BY updated_at DESC
      LIMIT 100
    `).all();

    const books = rows.map(row => {
      const story = JSON.parse(row.pages);

      return {
        id: row.id,
        title: row.title,
        age: row.age,
        language: row.language,
        coverImageUrl: story.coverImageUrl || null,
        pageCount: Array.isArray(story.pages)
          ? story.pages.length
          : 0,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    });

    res.json(books);
  } catch (error) {
    console.error('Library error:', error);
    res.status(500).json({
      error: 'Gagal mendapatkan perpustakaan.'
    });
  }
});

app.get('/api/books/:id', (req, res) => {
  const book = getBook(req.params.id);

  if (!book) {
    return res.status(404).json({
      error: 'Buku tidak dijumpai.'
    });
  }

  res.json({
    ...book,
    pages: normalizeStory(JSON.parse(book.pages))
  });
});

/* =====================================
   GEMINI TEXT STORY ONLY
   ===================================== */

app.post('/api/stories/generate', async (req, res) => {
  const input = validateDraft(req.body || {});

  if (!input) {
    return res.status(400).json({
      error: 'Maklumat cerita tidak lengkap atau tidak sah.'
    });
  }

  if (!ai) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY belum ditetapkan.'
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `
Write an ORIGINAL children's story.

Title: ${input.title}
Idea: ${input.idea}
Age: ${input.age}
Language: ${input.language}
Number of pages: ${input.count}

RULES:
- Exactly ${input.count} pages, numbered sequentially.
- Write in ${input.language}.
- Short and engaging sentences for young children.
- Each page must contain 25–30 words.
- Absolute maximum: ${MAX_WORDS} words per page.
- Each page must have a complete thought.
- Include a moral lesson.
- Each page needs an English illustrationPrompt.
- Keep recurring characters consistent.
- Do not generate images.
- Respond with JSON matching the schema.
`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: storySchema
      }
    });

    if (!response.text) {
      throw new Error('Respons Gemini kosong.');
    }

    const story = JSON.parse(response.text);

    if (
      !Array.isArray(story.pages) ||
      story.pages.length !== input.count ||
      story.pages.some((p, i) =>
        p.number !== i + 1 ||
        typeof p.text !== 'string' ||
        !p.text.trim() ||
        countWords(p.text) > MAX_WORDS ||
        typeof p.illustrationPrompt !== 'string'
      )
    ) {
      return res.status(422).json({
        error:
          'Gemini menghasilkan teks tidak mengikut had 35 perkataan. Cuba jana semula.'
      });
    }

    story.title = story.title || input.title;
    story.coverImageUrl = null;
    story.coverAuthor = 'Storyland AI';
    story.coverSubtitle =
      'Sebuah cerita penuh imaginasi dan pengajaran';

    story.pages = story.pages.map(p => ({
      ...p,
      imageUrl: null,
      layout: 'side',
      imageScale: 100,
      imageAlign: 'center',
      theme: 'fantasy',
      decoration: 'frame'
    }));

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO books
      (id, title, idea, age, language, pages,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      story.title,
      input.idea,
      input.age,
      input.language,
      JSON.stringify(story),
      now,
      now
    );

    res.json({ id, ...story });
  } catch (error) {
    console.error('Gemini error:', error);

    const status = Number(error.status);

    let text = 'Gemini gagal menjana cerita.';

    if (status === 404) {
      text = 'Model Gemini tidak tersedia. Semak .env.';
    } else if (status === 429) {
      text = 'Kuota Gemini telah dicapai.';
    } else if (status === 401 || status === 403) {
      text = 'API key atau akses Gemini tidak sah.';
    }

    res.status(status === 429 ? 429 : 502).json({
      error: text
    });
  }
});

/* =====================================
   MANUAL IMAGE UPLOAD
   ===================================== */

app.post(
  '/api/books/:id/images/:target',
  express.raw({
    type: Object.keys(supportedImages),
    limit: MAX_IMAGE_SIZE
  }),
  async (req, res) => {
    const book = getBook(req.params.id);

    if (!book) {
      return res.status(404).json({
        error: 'Buku tidak dijumpai.'
      });
    }

    const target = req.params.target;
    const story = normalizeStory(JSON.parse(book.pages));
    const isCover = target === 'cover';
    const number = Number(target);

    if (
      !isCover &&
      (!Number.isInteger(number) ||
        !story.pages.some(p => p.number === number))
    ) {
      return res.status(400).json({
        error: 'Halaman tidak sah.'
      });
    }

    const mime = String(
      req.headers['content-type'] || ''
    ).split(';')[0].toLowerCase();

    const buffer = req.body;

    if (
      !supportedImages[mime] ||
      !Buffer.isBuffer(buffer) ||
      buffer.length === 0
    ) {
      return res.status(400).json({
        error: 'Gunakan JPG, PNG atau WebP.'
      });
    }

    const jpeg = buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;

    const png = buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from('89504e470d0a1a0a', 'hex')
      );

    const webp = buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';

    if (!(
      (mime === 'image/jpeg' && jpeg) ||
      (mime === 'image/png' && png) ||
      (mime === 'image/webp' && webp)
    )) {
      return res.status(400).json({
        error: 'Kandungan gambar tidak sah.'
      });
    }

    try {
      const id = book.id;
      const folder = join(imageDir, id);
      mkdirSync(folder, { recursive: true });

      const filename =
        `${isCover ? 'cover' : number}-${randomUUID()}.` +
        supportedImages[mime];

      await writeFile(join(folder, filename), buffer);

      const imageUrl = `/generated/${id}/${filename}`;
      const latest = getBook(id);
      const updated = normalizeStory(JSON.parse(latest.pages));

      if (isCover) {
        updated.coverImageUrl = imageUrl;
      } else {
        updated.pages = updated.pages.map(p =>
          p.number === number
            ? { ...p, imageUrl }
            : p
        );
      }

      saveStory(id, updated);
      res.json({ ok: true, imageUrl });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({
        error: 'Gagal menyimpan gambar.'
      });
    }
  }
);

/* =====================================
   SAVE STORY + COVER + PAGE DESIGN
   ===================================== */

app.put('/api/books/:id', (req, res) => {
  const book = getBook(req.params.id);

  if (!book) {
    return res.status(404).json({
      error: 'Buku tidak dijumpai.'
    });
  }

  try {
    const story = normalizeStory(JSON.parse(book.pages));
    const incoming = req.body?.pages;

    if (
      !Array.isArray(incoming) ||
      incoming.length !== story.pages.length ||
      incoming.some(p =>
        !p ||
        !Number.isInteger(p.number) ||
        typeof p.text !== 'string' ||
        p.text.length > 6000 ||
        countWords(p.text) > MAX_WORDS
      ) ||
      new Set(incoming.map(p => p.number)).size !==
        incoming.length ||
      !story.pages.every(p =>
        incoming.some(u => u.number === p.number)
      )
    ) {
      return res.status(400).json({
        error:
          'Teks melebihi 35 perkataan atau data halaman tidak sah.'
      });
    }

    const byNumber = new Map(
      incoming.map(p => [p.number, p])
    );

    story.pages = story.pages.map(p => {
      const u = byNumber.get(p.number);

      return {
        ...p,
        text: u.text,
        layout: validLayouts.has(u.layout)
          ? u.layout : p.layout,
        imageScale: validScales.has(Number(u.imageScale))
          ? Number(u.imageScale) : p.imageScale,
        imageAlign: validAlignments.has(u.imageAlign)
          ? u.imageAlign : p.imageAlign,
        theme: validThemes.has(u.theme)
          ? u.theme : p.theme,
        decoration: validDecorations.has(u.decoration)
          ? u.decoration : p.decoration
      };
    });

    if (req.body.coverAuthor !== undefined) {
      if (
        typeof req.body.coverAuthor !== 'string' ||
        req.body.coverAuthor.length > 100
      ) {
        return res.status(400).json({
          error: 'Nama penulis tidak sah.'
        });
      }
      story.coverAuthor = req.body.coverAuthor.trim();
    }

    if (req.body.coverSubtitle !== undefined) {
      if (
        typeof req.body.coverSubtitle !== 'string' ||
        req.body.coverSubtitle.length > 200
      ) {
        return res.status(400).json({
          error: 'Subtitle terlalu panjang.'
        });
      }
      story.coverSubtitle = req.body.coverSubtitle.trim();
    }

    saveStory(book.id, story);
    res.json({ ok: true });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({
      error: 'Gagal menyimpan buku.'
    });
  }
});

/* =====================================
   V12 — DUPLICATE BOOK
   ===================================== */

app.post('/api/books/:id/duplicate', async (req, res) => {
  const original = getBook(req.params.id);

  if (!original) {
    return res.status(404).json({
      error: 'Buku tidak dijumpai.'
    });
  }

  const newId = randomUUID();
  const source = join(imageDir, original.id);
  const destination = join(imageDir, newId);

  try {
    const story = normalizeStory(JSON.parse(original.pages));

    await cp(source, destination, {
      recursive: true,
      force: false,
      errorOnExist: true
    }).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });

    const rewrite = url => {
      if (typeof url !== 'string') return url;
      const prefix = `/generated/${original.id}/`;
      return url.startsWith(prefix)
        ? `/generated/${newId}/` + url.slice(prefix.length)
        : url;
    };

    story.coverImageUrl = rewrite(story.coverImageUrl);

    story.pages = story.pages.map(p => ({
      ...p,
      imageUrl: rewrite(p.imageUrl)
    }));

    const title =
      `${story.title || original.title} (Salinan)`;

    story.title = title;

    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO books
      (id, title, idea, age, language, pages,
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      title,
      original.idea,
      original.age,
      original.language,
      JSON.stringify(story),
      now,
      now
    );

    res.json({
      ok: true,
      id: newId,
      message: 'Buku berjaya disalin.'
    });
  } catch (error) {
    await rm(destination, {
      recursive: true,
      force: true
    }).catch(() => {});

    console.error('Duplicate error:', error);
    res.status(500).json({
      error: 'Gagal menyalin buku.'
    });
  }
});

/* =====================================
   V12 — DELETE BOOK
   ===================================== */

app.delete('/api/books/:id', async (req, res) => {
  const book = getBook(req.params.id);

  if (!book) {
    return res.status(404).json({
      error: 'Buku tidak dijumpai.'
    });
  }

  try {
    db.prepare('DELETE FROM books WHERE id=?').run(book.id);

    await rm(join(imageDir, book.id), {
      recursive: true,
      force: true
    }).catch(error => {
      console.warn('Image cleanup:', error);
    });

    res.json({
      ok: true,
      message: 'Buku berjaya dipadam.'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      error: 'Gagal memadam buku.'
    });
  }
});

/* =====================================
   STATIC FILES
   ===================================== */

app.use('/generated', express.static(imageDir));
app.use(express.static(resolve('./public')));

app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Maksimum 8MB untuk setiap gambar.'
    });
  }

  res.status(500).json({
    error: 'Ralat dalaman server.'
  });
});

app.listen(PORT, () => {
  console.log('==================================');
  console.log('STORYLAND AI V12 — READY');
  console.log(`http://localhost:${PORT}`);
  console.log(`Gemini Text: ${TEXT_MODEL}`);
  console.log('Images: Manual Upload');
  console.log('Dashboard: Enabled');
  console.log('==================================');
});
