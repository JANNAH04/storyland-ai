const R2_FREE_GUARD_BYTES =
  8 * 1024 * 1024 * 1024; // 8 GB

const R2_WARNING_BYTES =
  7 * 1024 * 1024 * 1024; // warning 7 GB

const SESSION_COOKIE = "storyland_session";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 10000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function cleanText(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error("Invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function randomHex(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256,
  );

  return [
    "pbkdf2-sha256",
    PBKDF2_ITERATIONS,
    bytesToHex(salt),
    bytesToHex(new Uint8Array(derived)),
  ].join("$");
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, iterationText, saltHex, hashHex] = String(stored).split("$");
    const iterations = Number(iterationText);
    if (scheme !== "pbkdf2-sha256" || !Number.isSafeInteger(iterations) || iterations < 10000) return false;

    const salt = hexToBytes(saltHex);
    const expected = hexToBytes(hashHex);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );

    const derived = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations },
        keyMaterial,
        expected.length * 8,
      ),
    );

    if (derived.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

function cookieToken(request) {
  const cookie = request.headers.get("cookie") || "";
  for (const item of cookie.split(";")) {
    const index = item.indexOf("=");
    if (index < 0) continue;
    if (item.slice(0, index).trim() === SESSION_COOKIE) {
      return item.slice(index + 1).trim();
    }
  }
  return null;
}

function sessionCookie(token, maxAgeSeconds) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function sameOriginAllowed(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

async function getSessionUser(request, env) {
  const token = cookieToken(request);
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const tokenHash = await sha256Hex(token);

  return await env.DB.prepare(`
    SELECT users.id, users.name, users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
      AND sessions.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, Date.now()).first();
}

async function register(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: "JSON tidak sah." }, 400);

  const name = cleanText(body.name, 80);
  const email = cleanText(body.email, 255).toLowerCase();
  const password = body.password;

  if (
    name.length < 2 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  ) {
    return json({ error: "Maklumat pendaftaran tidak sah." }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
    .bind(email).first();

  if (existing) return json({ error: "E-mel sudah digunakan." }, 409);

  try {
    await env.DB.prepare(`
      INSERT INTO users (id, name, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      name,
      email,
      await hashPassword(password),
      new Date().toISOString(),
    ).run();

    return json({ ok: true, message: "Pendaftaran berjaya. Sila log masuk." }, 201);
  } catch (error) {
    console.error("[register]", error);
    return json({ error: "Pendaftaran gagal." }, 500);
  }
}

async function login(request, env) {
  const body = await readJson(request);
  if (!body) return json({ error: "JSON tidak sah." }, 400);

  const email = cleanText(body.email, 255).toLowerCase();
  const password = body.password;

  if (!email || typeof password !== "string" || password.length > 128) {
    return json({ error: "Maklumat log masuk tidak sah." }, 400);
  }

  const account = await env.DB.prepare(`
    SELECT id, name, email, password_hash
    FROM users
    WHERE email = ?
    LIMIT 1
  `).bind(email).first();

  if (!account || !(await verifyPassword(password, account.password_hash))) {
    return json({ error: "E-mel atau kata laluan salah." }, 401);
  }

  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = Date.now() + SESSION_LIFETIME_MS;

  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? OR expires_at <= ?")
      .bind(account.id, Date.now()),
    env.DB.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at)
      VALUES (?, ?, ?)
    `).bind(tokenHash, account.id, expiresAt),
  ]);

  return json(
    { ok: true, user: { id: account.id, name: account.name, email: account.email } },
    200,
    { "set-cookie": sessionCookie(token, Math.floor(SESSION_LIFETIME_MS / 1000)) },
  );
}

async function logout(request, env) {
  const token = cookieToken(request);
  if (token && /^[a-f0-9]{64}$/i.test(token)) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await sha256Hex(token)).run();
  }
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

async function me(request, env) {
  const user = await getSessionUser(request, env);
  return user ? json({ user }) : json({ error: "Belum log masuk." }, 401);
}

async function getProfile(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Sila log masuk terlebih dahulu." }, 401);
  return json({ ok: true, user });
}

async function updateProfile(request, env) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Sila log masuk terlebih dahulu." }, 401);

  const body = await readJson(request);
  const name = body?.name;

  if (
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 80 ||
    /[\u0000-\u001f\u007f]/u.test(name)
  ) {
    return json({ error: "Nama mestilah antara 2 hingga 80 aksara." }, 400);
  }

  const newName = name.trim();
  const result = await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?")
    .bind(newName, user.id).run();

  if (!result.success) return json({ error: "Gagal mengemas kini profil." }, 500);

  return json({
    ok: true,
    message: "Profil berjaya dikemas kini.",
    user: { id: user.id, name: newName, email: user.email },
  });
}

async function getBooks(request, env) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  try {
    const result = await env.DB.prepare(`
      SELECT
        id,
        title,
        age,
        language,
        pages,
        revision,
        created_at,
        updated_at
      FROM books
      WHERE owner_id = ?
      ORDER BY updated_at DESC
      LIMIT 100
    `)
      .bind(user.id)
      .all();

    const books = (result.results || []).map(book => {
      let story = {};

      try {
        story = JSON.parse(book.pages || "{}");
      } catch {
        story = {};
      }

      return {
        id: book.id,
        title: book.title,
        age: book.age,
        language: book.language,
        pageCount: Array.isArray(story.pages)
          ? story.pages.length
          : 0,
        coverImageUrl: story.coverImageUrl || null,
        revision: book.revision,
        created_at: book.created_at,
        updated_at: book.updated_at
      };
    });

    return json(books);

  } catch (error) {
    console.error("[Books]", error);

    return json(
      { error: "Gagal membaca perpustakaan." },
      500
    );
  }
}

function countWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .length;
}

function normalizeAge(value) {
  const raw = String(value || "6-8")
    .trim()
    .replace(/[–—]/g, "-")
    .toLowerCase();

  const values = {
    "3-5": "3-5",
    "3-5 tahun": "3-5",
    "6-8": "6-8",
    "6-8 tahun": "6-8",
    "9-12": "9-12",
    "9-12 tahun": "9-12"
  };

  return values[raw] || raw;
}

function normalizeLanguage(value) {
  const raw = String(value || "Bahasa Melayu").trim();

  const values = {
    "bm": "Bahasa Melayu",
    "ms": "Bahasa Melayu",
    "malay": "Bahasa Melayu",
    "bahasa melayu": "Bahasa Melayu",
    "bahasa malaysia": "Bahasa Melayu",
    "en": "English",
    "english": "English"
  };

  return values[raw.toLowerCase()] || raw;
}

async function generateStory(request, env) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  const body = await readJson(request);

  if (!body) {
    return json({ error: "JSON tidak sah." }, 400);
  }

  const title = cleanText(body.title, 120);
  const idea = cleanText(body.idea, 2000);
  const age = normalizeAge(body.age);
  const language = normalizeLanguage(body.language);
  const pageCount = Number(body.pageCount);

  const allowedPages = new Set([
    6, 8, 10, 12, 16, 20, 24, 30, 40, 50
  ]);

  if (!title) {
    return json(
      { error: "Tajuk buku diperlukan." },
      400
    );
  }

  if (idea.length < 12) {
    return json(
      { error: "Idea cerita terlalu pendek." },
      400
    );
  }

  if (!allowedPages.has(pageCount)) {
    return json(
      { error: "Bilangan muka surat tidak sah." },
      400
    );
  }

  if (!env.GEMINI_API_KEY) {
    return json(
      { error: "Gemini API Key belum dikonfigurasi." },
      503
    );
  }

  const model =
    env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";

  const prompt = `
You are a professional children's book author.

Create one original children's story.

BOOK TITLE:
${title}

STORY IDEA:
${idea}

TARGET AGE:
${age}

LANGUAGE:
${language}

NUMBER OF PAGES:
${pageCount}

STRICT RULES:
- Return valid JSON only.
- Exactly ${pageCount} pages.
- Page numbers must start at 1 and increase consecutively.
- Maximum 35 words of story text per page.
- Keep characters consistent.
- Each page must contain an English illustrationPrompt.
- Include a moral.
- Include an English coverIllustrationIdea.
- No Markdown.

Return exactly this structure:

{
  "title": "Book title",
  "moral": "Story moral",
  "coverIllustrationIdea": "English cover description",
  "pages": [
    {
      "number": 1,
      "text": "Story text",
      "illustrationPrompt": "English illustration description"
    }
  ]
}
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 32768
          }
        })
      }
    );

    const geminiData = await response.json();

    if (!response.ok) {
      console.error("[Gemini]", geminiData);

      return json(
        {
          error:
            geminiData?.error?.message ||
            `Gemini HTTP ${response.status}`
        },
        response.status
      );
    }

    const raw =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) {
      return json(
        { error: "Gemini tidak memulangkan cerita." },
        502
      );
    }

    let story;

    try {
      story = JSON.parse(raw);
    } catch (error) {
      console.error("[Gemini JSON]", raw);

      return json(
        { error: "Format jawapan Gemini tidak sah." },
        502
      );
    }

    if (
      !Array.isArray(story.pages) ||
      story.pages.length !== pageCount
    ) {
      return json(
        {
          error:
            "Gemini tidak menghasilkan jumlah muka surat yang tepat."
        },
        422
      );
    }

    for (let i = 0; i < story.pages.length; i++) {
      const page = story.pages[i];

      if (
        page.number !== i + 1 ||
        typeof page.text !== "string" ||
        !page.text.trim() ||
        countWords(page.text) > 35 ||
        typeof page.illustrationPrompt !== "string"
      ) {
        return json(
          {
            error:
              "Format halaman daripada Gemini tidak sah."
          },
          422
        );
      }
    }

    story.title = cleanText(
      story.title || title,
      120
    );

    story.coverImageUrl = null;
    story.coverAuthor = "Storyland AI";
    story.coverSubtitle =
      "Sebuah cerita penuh imaginasi dan pengajaran";

    story.coverDesign = {
      template: "fantasy",
      font: "Fredoka",
      titleSize: 36,
      titleColor: "#ffffff",
      align: "center",
      position: "bottom",
      overlay: 65
    };

    story.characterGuide = "";
    story.characterProfiles = [];

    story.imageHistory = {
      cover: [],
      pages: {}
    };

    story.readingFont = "Nunito";
    story.readingFontSize = 18;

    story.pages = story.pages.map(page => ({
      ...page,
      imageUrl: null,
      layout: "side",
      theme: "fantasy",
      decoration: "frame",
      imageScale: 100,
      imageAlign: "center"
    }));

    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    await env.DB.prepare(`
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
    `)
      .bind(
        id,
        story.title,
        idea,
        age,
        language,
        JSON.stringify(story),
        timestamp,
        timestamp,
        user.id
      )
      .run();

    return json({
      id,
      ...story
    });

  } catch (error) {
    console.error("[Jana Cerita]", error);

    return json(
      {
        error:
          error?.message ||
          "Gagal menjana cerita."
      },
      500
    );
  }
}

async function getBookById(request, env, bookId) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  try {
    const book = await env.DB.prepare(`
      SELECT *
      FROM books
      WHERE id = ?
        AND owner_id = ?
      LIMIT 1
    `)
      .bind(bookId, user.id)
      .first();

    if (!book) {
      return json(
        { error: "Buku tidak dijumpai." },
        404
      );
    }

    let story;

    try {
      story = JSON.parse(book.pages || "{}");
    } catch {
      return json(
        { error: "Data buku rosak." },
        500
      );
    }

    return json({
      ...book,
      pages: story
    });

  } catch (error) {
    console.error("[Get Book]", error);

    return json(
      { error: "Gagal membuka buku." },
      500
    );
  }
}

async function getImageQuota(request, env) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  const limit = Number(env.IMAGE_DAILY_LIMIT || 500);
  const day = new Date().toISOString().slice(0, 10);

  try {
    const row = await env.DB.prepare(`
      SELECT used
      FROM image_daily_usage
      WHERE user_id = ?
        AND day = ?
      LIMIT 1
    `)
      .bind(user.id, day)
      .first();

    const used = Number(row?.used || 0);

    return json({
      limit,
      used,
      remaining: Math.max(0, limit - used),
      reset: "00:00 UTC"
    });

  } catch (error) {
    console.error("[Image Quota]", error);

    return json(
      { error: "Tidak dapat membaca kuota gambar." },
      500
    );
  }
}

async function generateImage(request, env, bookId) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  const body = await readJson(request);

  if (!body) {
    return json(
      { error: "JSON tidak sah." },
      400
    );
  }

  const book = await env.DB.prepare(`
    SELECT *
    FROM books
    WHERE id = ?
      AND owner_id = ?
    LIMIT 1
  `)
    .bind(bookId, user.id)
    .first();

  if (!book) {
    return json(
      { error: "Buku tidak dijumpai." },
      404
    );
  }

  let story;

  try {
    story = JSON.parse(book.pages || "{}");
  } catch {
    return json(
      { error: "Data buku rosak." },
      500
    );
  }

  const target = String(body.target || "");
  const style = String(body.style || "fantasy");
  const customPrompt = String(
    body.customPrompt || ""
  ).slice(0, 500);

  let scene = "";

  if (target === "cover") {
    scene =
      story.coverIllustrationIdea ||
      `Portrait children's book cover for "${book.title}".`;
  } else {
    const pageNumber = Number(target);

    const page = Array.isArray(story.pages)
      ? story.pages.find(
          p => Number(p.number) === pageNumber
        )
      : null;

    if (!page) {
      return json(
        { error: "Halaman tidak sah." },
        400
      );
    }

    scene =
      page.illustrationPrompt ||
      page.text ||
      "";
  }

  const imageModel =
    env.CLOUDFLARE_IMAGE_MODEL ||
    "@cf/black-forest-labs/flux-1-schnell";

  if (
    !env.CLOUDFLARE_ACCOUNT_ID ||
    !env.CLOUDFLARE_API_TOKEN
  ) {
    return json(
      {
        error:
          "Cloudflare Image AI belum dikonfigurasi."
      },
      503
    );
  }

  const prompt = [
    "Create one premium child-friendly storybook illustration.",
    "Portrait orientation, 3:4 aspect ratio.",
    "Keep recurring characters visually consistent.",
    style === "anime"
      ? "Colorful children's anime illustration."
      : style === "watercolor"
        ? "Gentle watercolor children's storybook illustration."
        : style === "cartoon"
          ? "Premium child-friendly 3D cartoon."
          : "Magical fantasy children's picture book illustration.",
    `SCENE: ${scene}`,
    customPrompt
      ? `ADDITIONAL DIRECTION: ${customPrompt}`
      : "",
    "No text, no lettering, no watermark."
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2048);

  try {
    const endpoint =
      `https://api.cloudflare.com/client/v4/accounts/` +
      `${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}` +
      `/ai/run/${imageModel}`;

    const response = await fetch(endpoint, {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${env.CLOUDFLARE_API_TOKEN}`,

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        prompt,
        steps: 4
      })
    });

    const data = await response.json();

    if (
      !response.ok ||
      data.success === false
    ) {
      console.error(
        "[Cloudflare Image]",
        data
      );

      return json(
        {
          error:
            data?.errors?.[0]?.message ||
            `Cloudflare HTTP ${response.status}`
        },
        response.status
      );
    }

    const base64 =
      data?.result?.image;

    if (!base64) {
      return json(
        {
          error:
            "Cloudflare tidak memulangkan gambar."
        },
        502
      );
    }

    const imageUrl =
      `data:image/jpeg;base64,${base64}`;

      ensureImageHistory(story);

const previousImage =
  getCurrentImage(story, target);

// Simpan gambar lama ke history sebelum overwrite
if (
  previousImage &&
  previousImage !== imageUrl
) {
  rememberOldImage(
    story,
    target,
    previousImage
  );
}

// Letak gambar baru sebagai gambar aktif
if (target === "cover") {
  story.coverImageUrl = imageUrl;
} else {
  const page = story.pages.find(
    p => Number(p.number) === Number(target)
  );

  if (!page) {
    return json(
      { error: "Halaman tidak dijumpai." },
      404
    );
  }

  page.imageUrl = imageUrl;
}

    await env.DB.prepare(`
      UPDATE books
      SET pages = ?,
          updated_at = ?,
          revision = revision + 1
      WHERE id = ?
        AND owner_id = ?
    `)
      .bind(
        JSON.stringify(story),
        new Date().toISOString(),
        bookId,
        user.id
      )
      .run();


    await incrementImageUsage(
  env,
  user.id
);
    return json({
      ok: true,
      imageUrl
    });

  } catch (error) {
    console.error(
      "[Generate Image]",
      error
    );

    return json(
      {
        error:
          error?.message ||
          "Gagal menjana gambar."
      },
      500
    );
  }
}

async function generatePageText(request, env, bookId, pageNumber) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  const day = new Date().toISOString().slice(0, 10);

const quotaRow = await env.DB.prepare(`
  SELECT used
  FROM image_daily_usage
  WHERE user_id = ?
    AND day = ?
  LIMIT 1
`)
  .bind(user.id, day)
  .first();

const used = Number(quotaRow?.used || 0);
const limit = Number(env.IMAGE_DAILY_LIMIT || 500);

if (used >= limit) {
  return json(
    {
      error: "Kuota gambar harian telah habis.",
      used,
      limit,
      remaining: 0
    },
    429
  );
}

  const book = await env.DB.prepare(`
    SELECT *
    FROM books
    WHERE id = ?
      AND owner_id = ?
    LIMIT 1
  `)
    .bind(bookId, user.id)
    .first();

  if (!book) {
    return json(
      { error: "Buku tidak dijumpai." },
      404
    );
  }

  let story;

  try {
    story = JSON.parse(book.pages || "{}");
  } catch {
    return json(
      { error: "Data buku rosak." },
      500
    );
  }

  const number = Number(pageNumber);

  const index = Array.isArray(story.pages)
    ? story.pages.findIndex(
        p => Number(p.number) === number
      )
    : -1;

  if (index < 0) {
    return json(
      { error: "Halaman tidak dijumpai." },
      404
    );
  }

  const body = await readJson(request);
  const instructions = cleanText(
    body?.instructions || "",
    500
  );

  const current = story.pages[index];
  const previous = story.pages[index - 1];
  const next = story.pages[index + 1];

  if (!env.GEMINI_API_KEY) {
    return json(
      { error: "Gemini API Key belum dikonfigurasi." },
      503
    );
  }

  const model =
    env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";

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
${story.moral || ""}

PREVIOUS PAGE:
${previous?.text || "Beginning of story"}

CURRENT PAGE:
${current.text || ""}

NEXT PAGE:
${next?.text || "End of story"}

USER INSTRUCTIONS:
${instructions || "Improve this page naturally."}

RULES:
- Write ONLY the replacement story text.
- Maximum 35 words.
- Minimum 5 words.
- Maintain continuity.
- Keep character names consistent.
- No Markdown.
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 400
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return json(
        {
          error:
            data?.error?.message ||
            `Gemini HTTP ${response.status}`
        },
        response.status
      );
    }

    const generated =
      String(
        data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
      )
        .trim()
        .replace(/^["“]|["”]$/g, "");

    const words = generated
      .split(/\s+/u)
      .filter(Boolean).length;

    if (!generated || words < 5 || words > 35) {
      return json(
        {
          error:
            "Gemini tidak menghasilkan teks dalam had 5–35 perkataan."
        },
        422
      );
    }

    return json({
      ok: true,
      pageNumber: number,
      originalText: current.text,
      generatedText: generated,
      wordCount: words
    });

  } catch (error) {
    console.error("[Generate Page Text]", error);

    return json(
      { error: "Gagal menjana teks halaman." },
      500
    );
  }
}

async function getTextHistory(request, env, bookId, pageNumber) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  const number = Number(pageNumber);

  const rows = await env.DB.prepare(`
    SELECT id, text, created_at
    FROM page_text_history
    WHERE owner_id = ?
      AND book_id = ?
      AND page_number = ?
    ORDER BY created_at DESC
    LIMIT 20
  `)
    .bind(user.id, bookId, number)
    .all();

  return json({
    ok: true,
    pageNumber: number,
    history: rows.results || []
  });
}

async function saveTextHistory(request, env, bookId, pageNumber) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  const number = Number(pageNumber);
  const body = await readJson(request);
  const text = String(body?.text || "").trim();

  if (!text) {
    return json(
      { error: "Teks cerita diperlukan." },
      400
    );
  }

  const book = await env.DB.prepare(`
    SELECT id
    FROM books
    WHERE id = ?
      AND owner_id = ?
    LIMIT 1
  `)
    .bind(bookId, user.id)
    .first();

  if (!book) {
    return json(
      { error: "Buku tidak dijumpai." },
      404
    );
  }

  try {
    // Elakkan versi sama disimpan berulang kali
    const latest = await env.DB.prepare(`
      SELECT id, text
      FROM page_text_history
      WHERE owner_id = ?
        AND book_id = ?
        AND page_number = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
      .bind(
        user.id,
        bookId,
        number
      )
      .first();

    if (latest?.text === text) {
      return json({
        ok: true,
        duplicate: true
      });
    }

    const id = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO page_text_history (
        id,
        book_id,
        owner_id,
        page_number,
        text,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        bookId,
        user.id,
        number,
        text,
        new Date().toISOString()
      )
      .run();

    return json(
      {
        ok: true,
        id
      },
      201
    );

  } catch (error) {
    console.error(
      "[Save Text History]",
      error
    );

    return json(
      { error: "Gagal menyimpan sejarah cerita." },
      500
    );
  }
}

function ensureImageHistory(story) {
  if (
    !story.imageHistory ||
    typeof story.imageHistory !== "object"
  ) {
    story.imageHistory = {};
  }

  if (!Array.isArray(story.imageHistory.cover)) {
    story.imageHistory.cover = [];
  }

  if (
    !story.imageHistory.pages ||
    typeof story.imageHistory.pages !== "object"
  ) {
    story.imageHistory.pages = {};
  }

  return story;
}

function getCurrentImage(story, target) {
  if (target === "cover") {
    return story.coverImageUrl || null;
  }

  const page = story.pages?.find(
    p => Number(p.number) === Number(target)
  );

  return page?.imageUrl || null;
}

function getImageHistoryList(story, target) {
  ensureImageHistory(story);

  if (target === "cover") {
    return story.imageHistory.cover;
  }

  const key = String(target);

  if (!Array.isArray(story.imageHistory.pages[key])) {
    story.imageHistory.pages[key] = [];
  }

  return story.imageHistory.pages[key];
}

function rememberOldImage(story, target, imageUrl) {
  if (!imageUrl) return;

  const list = getImageHistoryList(
    story,
    target
  );

  const existing = list.indexOf(imageUrl);

  if (existing >= 0) {
    list.splice(existing, 1);
  }

  list.unshift(imageUrl);

  // Maksimum simpan 12 gambar lama
  if (list.length > 12) {
    list.length = 12;
  }
}

async function generateCoverIdea(request, env, bookId) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  const book = await env.DB.prepare(`
    SELECT *
    FROM books
    WHERE id = ?
      AND owner_id = ?
    LIMIT 1
  `)
    .bind(bookId, user.id)
    .first();

  if (!book) {
    return json(
      { error: "Buku tidak dijumpai." },
      404
    );
  }

  if (!env.GEMINI_API_KEY) {
    return json(
      { error: "Gemini belum dikonfigurasi." },
      503
    );
  }

  let story;

  try {
    story = JSON.parse(book.pages || "{}");
  } catch {
    return json(
      { error: "Data buku rosak." },
      500
    );
  }

  const summary = Array.isArray(story.pages)
    ? story.pages
        .map(p => p.text || "")
        .join("\n")
        .slice(0, 6000)
    : "";

  const characters =
    Array.isArray(story.characterProfiles)
      ? story.characterProfiles
          .map(c =>
            `${c.name}: ${c.description}`
          )
          .join("\n")
          .slice(0, 1000)
      : "";

  const model =
    env.GEMINI_TEXT_MODEL ||
    "gemini-3.8-flash";

  const prompt = `
Create one premium English illustration description
for a children's book front cover.

Title:
${book.title}

Story:
${summary}

Characters:
${characters}

Character appearance guide:
${story.characterGuide || ""}

Requirements:
- Portrait composition.
- Attractive child-friendly illustration.
- Maintain recurring character appearance.
- Beautiful balanced colors.
- Keep visual space for the book title.
- No text, letters or watermark.
- Maximum 1000 characters.
- Return the illustration description only.
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "[Cover Idea Gemini]",
        data
      );

      return json(
        {
          error:
            data?.error?.message ||
            `Gemini HTTP ${response.status}`
        },
        response.status
      );
    }

    const idea = String(
      data?.candidates?.[0]
        ?.content?.parts?.[0]?.text || ""
    )
      .trim()
      .slice(0, 1000);

    if (!idea) {
      return json(
        {
          error:
            "Gemini tidak memulangkan idea kulit buku."
        },
        502
      );
    }

    story.coverIllustrationIdea = idea;

    await env.DB.prepare(`
      UPDATE books
      SET pages = ?,
          updated_at = ?,
          revision = revision + 1
      WHERE id = ?
        AND owner_id = ?
    `)
      .bind(
        JSON.stringify(story),
        new Date().toISOString(),
        bookId,
        user.id
      )
      .run();

    return json({
      ok: true,
      coverIllustrationIdea: idea
    });

  } catch (error) {
    console.error(
      "[Generate Cover Idea]",
      error
    );

    return json(
      {
        error:
          error?.message ||
          "Gagal menjana idea kulit buku."
      },
      500
    );
  }
}

async function getStorageUsage(env) {
  const row = await env.DB.prepare(`
    SELECT total_bytes, total_objects
    FROM storage_usage
    WHERE id = 'r2-global'
    LIMIT 1
  `).first();

  return {
    totalBytes: Number(row?.total_bytes || 0),
    totalObjects: Number(row?.total_objects || 0)
  };
}

async function canStoreImage(env, newBytes) {
  const usage = await getStorageUsage(env);

  const projected =
    usage.totalBytes + Number(newBytes || 0);

  return {
    allowed:
      projected <= R2_FREE_GUARD_BYTES,

    warning:
      projected >= R2_WARNING_BYTES,

    currentBytes:
      usage.totalBytes,

    projectedBytes:
      projected,

    remainingBytes:
      Math.max(
        0,
        R2_FREE_GUARD_BYTES - usage.totalBytes
      )
  };
}

async function recordR2Upload(env, bytes) {
  await env.DB.prepare(`
    UPDATE storage_usage
    SET total_bytes = total_bytes + ?,
        total_objects = total_objects + 1,
        updated_at = ?
    WHERE id = 'r2-global'
  `)
    .bind(
      Number(bytes),
      new Date().toISOString()
    )
    .run();
}

async function recordR2Delete(env, bytes) {
  await env.DB.prepare(`
    UPDATE storage_usage
    SET total_bytes =
          MAX(0, total_bytes - ?),
        total_objects =
          MAX(0, total_objects - 1),
        updated_at = ?
    WHERE id = 'r2-global'
  `)
    .bind(
      Number(bytes),
      new Date().toISOString()
    )
    .run();
}

async function updateBook(request, env, bookId) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  const body = await readJson(request);

  if (!body) {
    return json(
      { error: "JSON tidak sah." },
      400
    );
  }

  const book = await env.DB.prepare(`
    SELECT *
    FROM books
    WHERE id = ?
      AND owner_id = ?
    LIMIT 1
  `)
    .bind(bookId, user.id)
    .first();

  if (!book) {
    return json(
      { error: "Buku tidak dijumpai." },
      404
    );
  }

  const expectedRevision = Number(body.revision);

  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1
  ) {
    return json(
      {
        code: "REVISION_REQUIRED",
        error:
          "Versi buku diperlukan. Sila buka semula buku."
      },
      428
    );
  }

  if (Number(book.revision) !== expectedRevision) {
    return json(
      {
        code: "BOOK_CONFLICT",
        error:
          "Buku telah diubah pada tab atau peranti lain.",
        currentRevision: Number(book.revision)
      },
      409
    );
  }

  let story;

  try {
    story = JSON.parse(book.pages || "{}");
  } catch {
    return json(
      { error: "Data buku rosak." },
      500
    );
  }

  if (!Array.isArray(story.pages)) {
    return json(
      { error: "Data halaman buku tidak sah." },
      500
    );
  }

  const incomingPages = body.pages;

  if (
    !Array.isArray(incomingPages) ||
    incomingPages.length !== story.pages.length
  ) {
    return json(
      { error: "Senarai halaman tidak sah." },
      400
    );
  }

  const incomingMap = new Map();

  for (const page of incomingPages) {
    if (
      !page ||
      !Number.isInteger(Number(page.number)) ||
      typeof page.text !== "string" ||
      page.text.length > 6000
    ) {
      return json(
        { error: "Data halaman tidak sah." },
        400
      );
    }

    incomingMap.set(
      Number(page.number),
      page
    );
  }

  for (const oldPage of story.pages) {
    const incoming =
      incomingMap.get(Number(oldPage.number));

    if (!incoming) {
      return json(
        { error: "Ada halaman yang hilang." },
        400
      );
    }
  }

  story.pages = story.pages.map(oldPage => {
    const incoming =
      incomingMap.get(Number(oldPage.number));

    return {
      ...oldPage,

      text:
        incoming.text,

      layout:
        typeof incoming.layout === "string"
          ? incoming.layout
          : oldPage.layout,

      theme:
        typeof incoming.theme === "string"
          ? incoming.theme
          : oldPage.theme,

      decoration:
        typeof incoming.decoration === "string"
          ? incoming.decoration
          : oldPage.decoration,

      imageScale:
        Number.isFinite(
          Number(incoming.imageScale)
        )
          ? Number(incoming.imageScale)
          : oldPage.imageScale,

      imageAlign:
        typeof incoming.imageAlign === "string"
          ? incoming.imageAlign
          : oldPage.imageAlign
    };
  });

  if (typeof body.coverAuthor === "string") {
    story.coverAuthor =
      body.coverAuthor.slice(0, 100);
  }

  if (typeof body.coverSubtitle === "string") {
    story.coverSubtitle =
      body.coverSubtitle.slice(0, 200);
  }

  if (
    typeof body.coverIllustrationIdea === "string"
  ) {
    story.coverIllustrationIdea =
      body.coverIllustrationIdea.slice(
        0,
        1000
      );
  }

  if (
    body.coverDesign &&
    typeof body.coverDesign === "object" &&
    !Array.isArray(body.coverDesign)
  ) {
    story.coverDesign =
      body.coverDesign;
  }

  if (typeof body.readingFont === "string") {
    story.readingFont =
      body.readingFont.slice(0, 80);
  }

  if (
    Number.isFinite(
      Number(body.readingFontSize)
    )
  ) {
    story.readingFontSize =
      Math.max(
        14,
        Math.min(
          30,
          Number(body.readingFontSize)
        )
      );
  }

  const nextRevision =
    expectedRevision + 1;

  const result = await env.DB.prepare(`
    UPDATE books
    SET pages = ?,
        updated_at = ?,
        revision = ?
    WHERE id = ?
      AND owner_id = ?
      AND revision = ?
  `)
    .bind(
      JSON.stringify(story),
      new Date().toISOString(),
      nextRevision,
      bookId,
      user.id,
      expectedRevision
    )
    .run();

  if (
    !result.success ||
    Number(result.meta?.changes || 0) !== 1
  ) {
    return json(
      {
        code: "BOOK_CONFLICT",
        error:
          "Buku berubah semasa proses simpan. Sila muat semula."
      },
      409
    );
  }

  return json({
    ok: true,
    revision: nextRevision
  });
}

async function restoreImageHistory(
  request,
  env,
  bookId,
  target
) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  const body = await readJson(request);
  const imageUrl = String(body?.imageUrl || "");

  if (!imageUrl) {
    return json(
      { error: "URL gambar diperlukan." },
      400
    );
  }

  const book = await env.DB.prepare(`
    SELECT *
    FROM books
    WHERE id = ?
      AND owner_id = ?
    LIMIT 1
  `)
    .bind(bookId, user.id)
    .first();

  if (!book) {
    return json(
      { error: "Buku tidak dijumpai." },
      404
    );
  }

  let story;

  try {
    story = JSON.parse(book.pages || "{}");
  } catch {
    return json(
      { error: "Data buku rosak." },
      500
    );
  }

  ensureImageHistory(story);

  const historyList =
    getImageHistoryList(story, target);

  if (!historyList.includes(imageUrl)) {
    return json(
      { error: "Gambar tiada dalam sejarah." },
      400
    );
  }

  const currentImage =
    getCurrentImage(story, target);

  // Buang gambar yang nak dipulihkan dari history
  const index =
    historyList.indexOf(imageUrl);

  historyList.splice(index, 1);

  // Simpan gambar semasa ke history
  if (
    currentImage &&
    currentImage !== imageUrl
  ) {
    rememberOldImage(
      story,
      target,
      currentImage
    );
  }

  // Jadikan gambar lama sebagai gambar aktif
  if (target === "cover") {
    story.coverImageUrl = imageUrl;
  } else {
    const page = story.pages?.find(
      p => Number(p.number) === Number(target)
    );

    if (!page) {
      return json(
        { error: "Halaman tidak dijumpai." },
        404
      );
    }

    page.imageUrl = imageUrl;
  }

  await env.DB.prepare(`
    UPDATE books
    SET pages = ?,
        updated_at = ?,
        revision = revision + 1
    WHERE id = ?
      AND owner_id = ?
  `)
    .bind(
      JSON.stringify(story),
      new Date().toISOString(),
      bookId,
      user.id
    )
    .run();

  return json({
    ok: true,
    imageUrl,
    history: historyList
  });
}

async function getImageHistory(
  request,
  env,
  bookId,
  target
) {
  const user = await getSessionUser(request, env);

  if (!user) {
    return json(
      { error: "Sila log masuk terlebih dahulu." },
      401
    );
  }

  try {
    const book = await env.DB.prepare(`
      SELECT pages
      FROM books
      WHERE id = ?
        AND owner_id = ?
      LIMIT 1
    `)
      .bind(bookId, user.id)
      .first();

    if (!book) {
      return json(
        { error: "Buku tidak dijumpai." },
        404
      );
    }

    const story = JSON.parse(book.pages || "{}");

    ensureImageHistory(story);

    let currentImageUrl = null;
    let history = [];

    if (target === "cover") {
      currentImageUrl =
        story.coverImageUrl || null;

      history =
        Array.isArray(story.imageHistory.cover)
          ? story.imageHistory.cover
          : [];
    } else {
      const pageNumber = Number(target);

      const page = Array.isArray(story.pages)
        ? story.pages.find(
            p => Number(p.number) === pageNumber
          )
        : null;

      if (!page) {
        return json(
          { error: "Halaman tidak dijumpai." },
          404
        );
      }

      currentImageUrl =
        page.imageUrl || null;

      history =
        Array.isArray(
          story.imageHistory.pages[
            String(pageNumber)
          ]
        )
          ? story.imageHistory.pages[
              String(pageNumber)
            ]
          : [];
    }

    return json({
      ok: true,
      target,
      currentImageUrl,
      history
    });

  } catch (error) {
    console.error("[Image History]", error);

    return json(
      {
        error:
          error?.message ||
          "Gagal membaca sejarah gambar."
      },
      500
    );
  }
}

async function incrementImageUsage(env, userId) {
  const day = new Date().toISOString().slice(0, 10);

  await env.DB.prepare(`
    INSERT INTO image_daily_usage (
      user_id,
      day,
      used
    )
    VALUES (?, ?, 1)

    ON CONFLICT(user_id, day)
    DO UPDATE SET
      used = used + 1
  `)
    .bind(userId, day)
    .run();
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!sameOriginAllowed(request)) {
    return json(
      { error: "Asal permintaan tidak dibenarkan." },
      403
    );
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  // HEALTH
  if (
    path === "/api/health" &&
    request.method === "GET"
  ) {
    return json({
      ok: true,
      service: "Storyland AI",
      runtime: "Cloudflare Workers",
      database: "D1",
      auth: "ready"
    });
  }

  // REGISTER
  if (
    path === "/api/auth/register" &&
    request.method === "POST"
  ) {
    return register(request, env);
  }

  // LOGIN
  if (
    path === "/api/auth/login" &&
    request.method === "POST"
  ) {
    return login(request, env);
  }

  // LOGOUT
  if (
    path === "/api/auth/logout" &&
    request.method === "POST"
  ) {
    return logout(request, env);
  }

  // CURRENT USER
  if (
    path === "/api/auth/me" &&
    request.method === "GET"
  ) {
    return me(request, env);
  }

  // PROFILE
  if (
    path === "/api/auth/profile" &&
    request.method === "GET"
  ) {
    return getProfile(request, env);
  }

  if (
    path === "/api/auth/profile" &&
    request.method === "PUT"
  ) {
    return updateProfile(request, env);
  }

  // BOOK LIBRARY
  if (
    path === "/api/books" &&
    request.method === "GET"
  ) {
    return getBooks(request, env);
  }

  // SINGLE BOOK
  const bookMatch = path.match(
    /^\/api\/books\/([a-f0-9-]{36})$/i
  );

  if (
  bookMatch &&
  request.method === "GET"
) {
  return getBookById(
    request,
    env,
    bookMatch[1]
  );
}

if (
  bookMatch &&
  request.method === "PUT"
) {
  return updateBook(
    request,
    env,
    bookMatch[1]
  );
}

  // GENERATE STORY
  if (
    path === "/api/stories/generate" &&
    request.method === "POST"
  ) {
    return generateStory(request, env);
  }

  // IMAGE QUOTA
  if (
    path === "/api/image-studio/quota" &&
    request.method === "GET"
  ) {
    return getImageQuota(request, env);
  }

  const generateImageMatch = path.match(
  /^\/api\/books\/([a-f0-9-]{36})\/generate-image$/i
);

if (
  generateImageMatch &&
  request.method === "POST"
) {
  return generateImage(
    request,
    env,
    generateImageMatch[1]
  );
}

const imageHistoryMatch = path.match(
  /^\/api\/books\/([a-f0-9-]{36})\/image-history\/([^/]+)$/i
);

if (
  imageHistoryMatch &&
  request.method === "GET"
) {
  return getImageHistory(
    request,
    env,
    imageHistoryMatch[1],
    decodeURIComponent(
      imageHistoryMatch[2]
    )
  );
}

const imageHistoryRestoreMatch = path.match(
  /^\/api\/books\/([a-f0-9-]{36})\/image-history\/([^/]+)\/restore$/i
);

if (
  imageHistoryRestoreMatch &&
  request.method === "POST"
) {
  return restoreImageHistory(
    request,
    env,
    imageHistoryRestoreMatch[1],
    decodeURIComponent(
      imageHistoryRestoreMatch[2]
    )
  );
}

const generatePageTextMatch = path.match(
  /^\/api\/books\/([a-f0-9-]{36})\/pages\/(\d+)\/generate-text$/i
);

if (
  generatePageTextMatch &&
  request.method === "POST"
) {
  return generatePageText(
    request,
    env,
    generatePageTextMatch[1],
    generatePageTextMatch[2]
  );
}

const textHistoryMatch = path.match(
  /^\/api\/books\/([a-f0-9-]{36})\/pages\/(\d+)\/text-history$/i
);

if (
  textHistoryMatch &&
  request.method === "GET"
) {
  return getTextHistory(
    request,
    env,
    textHistoryMatch[1],
    textHistoryMatch[2]
  );
}

if (
  textHistoryMatch &&
  request.method === "POST"
) {
  return saveTextHistory(
    request,
    env,
    textHistoryMatch[1],
    textHistoryMatch[2]
  );
}

const coverIdeaMatch = path.match(
  /^\/api\/books\/([a-f0-9-]{36})\/cover-idea\/generate$/i
);

if (
  coverIdeaMatch &&
  request.method === "POST"
) {
  return generateCoverIdea(
    request,
    env,
    coverIdeaMatch[1]
  );
}



  // FALLBACK
  return json(
    {
      error: "API belum dipindahkan ke Cloudflare Worker.",
      path,
      method: request.method
    },
    404
  );
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env);
      }

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error("[worker]", error);

      return json(
        { error: "Ralat dalaman server." },
        500
      );
    }
  }
};
