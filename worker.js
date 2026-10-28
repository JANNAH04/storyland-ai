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

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!sameOriginAllowed(request)) {
    return json({ error: "Asal permintaan tidak dibenarkan." }, 403);
  }

  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  if (path === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "Storyland AI",
      runtime: "Cloudflare Workers",
      database: "D1",
      auth: "ready",
    });
  }

  if (path === "/api/auth/register" && request.method === "POST") return register(request, env);
  if (path === "/api/auth/login" && request.method === "POST") return login(request, env);
  if (path === "/api/auth/logout" && request.method === "POST") return logout(request, env);
  if (path === "/api/auth/me" && request.method === "GET") return me(request, env);
  if (path === "/api/auth/profile" && request.method === "GET") return getProfile(request, env);
  if (path === "/api/auth/profile" && request.method === "PUT") return updateProfile(request, env);
  if (path === "/api/books" && request.method === "GET") {return getBooks(request, env);}
  if (path === "/api/stories/generate" && request.method === "POST") {return generateStory(request, env);}

  return json({ error: "API belum dipindahkan ke Cloudflare Worker.", path }, 404);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("[worker]", error);
      return json({ error: "Ralat dalaman server." }, 500);
    }
  },
};
