/* ============================================================
   STORYLAND AI — CLOUDFLARE WORKER
   D1 + KV + GEMINI + CLOUDFLARE AI
   ============================================================ */

const SESSION_COOKIE = "storyland_session";
const SESSION_LIFETIME_MS =
  7 * 24 * 60 * 60 * 1000;

const PBKDF2_ITERATIONS = 10000;

const MAX_IMAGE_HISTORY = 12;
const MAX_BACKUPS = 20;

const AUTO_BACKUP_MS =
  15 * 60 * 1000;

const MAX_PAGE_TEXT_LENGTH = 6000;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};


/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function json(
  data,
  status = 200,
  headers = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-store",

        ...headers
      }
    }
  );
}


function cleanText(
  value,
  max = 200
) {
  return typeof value === "string"
    ? value.trim().slice(0, max)
    : "";
}


async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}


function sameOriginAllowed(request) {
  if (
    ["GET", "HEAD", "OPTIONS"]
      .includes(request.method)
  ) {
    return true;
  }

  const origin =
    request.headers.get("origin");

  if (!origin) {
    return true;
  }

  return (
    origin ===
    new URL(request.url).origin
  );
}


function countWords(value) {
  const text =
    String(value || "").trim();

  if (!text) return 0;

  return text
    .split(/\s+/u)
    .filter(Boolean)
    .length;
}


/* ============================================================
   CRYPTO HELPERS
   ============================================================ */

function bytesToHex(bytes) {
  return [...bytes]
    .map(byte =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}


function hexToBytes(hex) {
  if (
    !/^[a-f0-9]+$/i.test(hex) ||
    hex.length % 2 !== 0
  ) {
    throw new Error(
      "Invalid hex"
    );
  }

  const result =
    new Uint8Array(
      hex.length / 2
    );

  for (
    let i = 0;
    i < result.length;
    i++
  ) {
    result[i] =
      Number.parseInt(
        hex.slice(
          i * 2,
          i * 2 + 2
        ),
        16
      );
  }

  return result;
}


function randomHex(
  byteLength = 32
) {
  const bytes =
    new Uint8Array(
      byteLength
    );

  crypto.getRandomValues(bytes);

  return bytesToHex(bytes);
}


async function sha256Hex(value) {
  const data =
    new TextEncoder()
      .encode(value);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return bytesToHex(
    new Uint8Array(digest)
  );
}


async function hashPassword(
  password
) {
  const salt =
    new Uint8Array(16);

  crypto.getRandomValues(salt);

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",

      new TextEncoder()
        .encode(password),

      "PBKDF2",

      false,

      ["deriveBits"]
    );

  const derived =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations:
          PBKDF2_ITERATIONS
      },

      keyMaterial,

      256
    );

  return [
    "pbkdf2-sha256",
    PBKDF2_ITERATIONS,
    bytesToHex(salt),

    bytesToHex(
      new Uint8Array(
        derived
      )
    )

  ].join("$");
}


async function verifyPassword(
  password,
  stored
) {
  try {
    const [
      scheme,
      iterationText,
      saltHex,
      hashHex
    ] =
      String(stored || "")
        .split("$");

    const iterations =
      Number(iterationText);

    if (
      scheme !==
        "pbkdf2-sha256" ||

      !Number.isSafeInteger(
        iterations
      ) ||

      iterations < 10000
    ) {
      return false;
    }

    const salt =
      hexToBytes(
        saltHex
      );

    const expected =
      hexToBytes(
        hashHex
      );

    const keyMaterial =
      await crypto.subtle.importKey(
        "raw",

        new TextEncoder()
          .encode(password),

        "PBKDF2",

        false,

        ["deriveBits"]
      );

    const derived =
      new Uint8Array(
        await crypto.subtle
          .deriveBits(
            {
              name:
                "PBKDF2",

              hash:
                "SHA-256",

              salt,

              iterations
            },

            keyMaterial,

            expected.length * 8
          )
      );

    if (
      derived.length !==
      expected.length
    ) {
      return false;
    }

    let difference = 0;

    for (
      let i = 0;
      i < derived.length;
      i++
    ) {
      difference |=
        derived[i] ^
        expected[i];
    }

    return difference === 0;

  } catch {
    return false;
  }
}


/* ============================================================
   SESSION / COOKIE
   ============================================================ */

function cookieToken(request) {
  const cookie =
    request.headers
      .get("cookie") || "";

  for (
    const item of
    cookie.split(";")
  ) {
    const index =
      item.indexOf("=");

    if (index < 0) {
      continue;
    }

    const name =
      item
        .slice(0, index)
        .trim();

    if (
      name ===
      SESSION_COOKIE
    ) {
      return item
        .slice(index + 1)
        .trim();
    }
  }

  return null;
}


function sessionCookie(
  token,
  maxAgeSeconds
) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ].join("; ");
}


function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}


async function getSessionUser(
  request,
  env
) {
  const token =
    cookieToken(request);

  if (
    !token ||
    !/^[a-f0-9]{64}$/i
      .test(token)
  ) {
    return null;
  }

  const tokenHash =
    await sha256Hex(token);

  return await env.DB
    .prepare(`
      SELECT
        users.id,
        users.name,
        users.email

      FROM sessions

      JOIN users
        ON users.id =
           sessions.user_id

      WHERE
        sessions.token_hash = ?

        AND
        sessions.expires_at > ?

      LIMIT 1
    `)

    .bind(
      tokenHash,
      Date.now()
    )

    .first();
}


/* ============================================================
   AUTH
   ============================================================ */

async function register(
  request,
  env
) {
  const body =
    await readJson(request);

  if (!body) {
    return json(
      {
        error:
          "JSON tidak sah."
      },
      400
    );
  }

  const name =
    cleanText(
      body.name,
      80
    );

  const email =
    cleanText(
      body.email,
      255
    ).toLowerCase();

  const password =
    body.password;

  if (
    name.length < 2 ||

    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(email) ||

    typeof password !==
      "string" ||

    password.length < 10 ||

    password.length > 128
  ) {
    return json(
      {
        error:
          "Maklumat pendaftaran tidak sah."
      },
      400
    );
  }

  const existing =
    await env.DB
      .prepare(`
        SELECT id
        FROM users
        WHERE email = ?
        LIMIT 1
      `)

      .bind(email)
      .first();

  if (existing) {
    return json(
      {
        error:
          "E-mel sudah digunakan."
      },
      409
    );
  }

  try {
    await env.DB
      .prepare(`
        INSERT INTO users (
          id,
          name,
          email,
          password_hash,
          created_at
        )

        VALUES (
          ?, ?, ?, ?, ?
        )
      `)

      .bind(
        crypto.randomUUID(),
        name,
        email,

        await hashPassword(
          password
        ),

        new Date()
          .toISOString()
      )

      .run();

    return json(
      {
        ok: true,

        message:
          "Pendaftaran berjaya. Sila log masuk."
      },
      201
    );

  } catch (error) {
    console.error(
      "[Register]",
      error
    );

    return json(
      {
        error:
          "Pendaftaran gagal."
      },
      500
    );
  }
}


async function login(
  request,
  env
) {
  const body =
    await readJson(request);

  if (!body) {
    return json(
      {
        error:
          "JSON tidak sah."
      },
      400
    );
  }

  const email =
    cleanText(
      body.email,
      255
    ).toLowerCase();

  const password =
    body.password;

  if (
    !email ||

    typeof password !==
      "string" ||

    password.length > 128
  ) {
    return json(
      {
        error:
          "Maklumat log masuk tidak sah."
      },
      400
    );
  }

  try {
    const account =
      await env.DB
        .prepare(`
          SELECT
            id,
            name,
            email,
            password_hash

          FROM users

          WHERE email = ?

          LIMIT 1
        `)

        .bind(email)
        .first();

    if (
      !account ||

      !(
        await verifyPassword(
          password,
          account.password_hash
        )
      )
    ) {
      return json(
        {
          error:
            "E-mel atau kata laluan salah."
        },
        401
      );
    }

    const token =
      randomHex(32);

    const tokenHash =
      await sha256Hex(token);

    const expiresAt =
      Date.now() +
      SESSION_LIFETIME_MS;

    await env.DB.batch([
      env.DB
        .prepare(`
          DELETE FROM sessions

          WHERE
            user_id = ?

            OR
            expires_at <= ?
        `)

        .bind(
          account.id,
          Date.now()
        ),

      env.DB
        .prepare(`
          INSERT INTO sessions (
            token_hash,
            user_id,
            expires_at
          )

          VALUES (?, ?, ?)
        `)

        .bind(
          tokenHash,
          account.id,
          expiresAt
        )
    ]);

    return json(
      {
        ok: true,

        user: {
          id:
            account.id,

          name:
            account.name,

          email:
            account.email
        }
      },

      200,

      {
        "set-cookie":
          sessionCookie(
            token,

            Math.floor(
              SESSION_LIFETIME_MS /
              1000
            )
          )
      }
    );

  } catch (error) {
    console.error(
      "[Login]",
      error
    );

    return json(
      {
        error:
          "Ralat log masuk."
      },
      500
    );
  }
}


async function logout(
  request,
  env
) {
  const token =
    cookieToken(request);

  if (
    token &&
    /^[a-f0-9]{64}$/i
      .test(token)
  ) {
    try {
      await env.DB
        .prepare(`
          DELETE FROM sessions
          WHERE token_hash = ?
        `)

        .bind(
          await sha256Hex(token)
        )

        .run();

    } catch (error) {
      console.error(
        "[Logout]",
        error
      );
    }
  }

  return json(
    {
      ok: true
    },
    200,
    {
      "set-cookie":
        clearSessionCookie()
    }
  );
}


async function me(
  request,
  env
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Belum log masuk."
      },
      401
    );
  }

  return json({
    user
  });
}


/* ============================================================
   PROFILE
   ============================================================ */

async function getProfile(
  request,
  env
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  return json({
    ok: true,
    user
  });
}


async function updateProfile(
  request,
  env
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const body =
    await readJson(request);

  const name =
    body?.name;

  if (
    typeof name !== "string" ||

    name.trim().length < 2 ||

    name.trim().length > 80 ||

    /[\u0000-\u001f\u007f]/u
      .test(name)
  ) {
    return json(
      {
        error:
          "Nama mestilah antara 2 hingga 80 aksara."
      },
      400
    );
  }

  const newName =
    name.trim();

  const result =
    await env.DB
      .prepare(`
        UPDATE users

        SET name = ?

        WHERE id = ?
      `)

      .bind(
        newName,
        user.id
      )

      .run();

  if (
    !result.success
  ) {
    return json(
      {
        error:
          "Gagal mengemas kini profil."
      },
      500
    );
  }

  return json({
    ok: true,

    message:
      "Profil berjaya dikemas kini.",

    user: {
      id:
        user.id,

      name:
        newName,

      email:
        user.email
    }
  });
}


/* ============================================================
   STORY NORMALIZATION
   ============================================================ */

function normalizeStory(story) {
  if (
    !story ||
    typeof story !== "object" ||
    Array.isArray(story)
  ) {
    throw new Error(
      "Data buku tidak sah."
    );
  }

  story.title =
    String(
      story.title ||
      "Cerita Baharu"
    );

  story.moral =
    String(
      story.moral || ""
    );

  story.coverAuthor =
    String(
      story.coverAuthor ||
      "Storyland AI"
    );

  story.coverSubtitle =
    String(
      story.coverSubtitle ||
      "Sebuah cerita penuh imaginasi dan pengajaran"
    );

  story.coverImageUrl =
    story.coverImageUrl ||
    null;

  story.coverIllustrationIdea =
    String(
      story.coverIllustrationIdea ||
      ""
    );

  story.coverDesign =
    story.coverDesign &&
    typeof story.coverDesign ===
      "object" &&
    !Array.isArray(
      story.coverDesign
    )

      ? story.coverDesign

      : {
          template:
            "fantasy",

          font:
            "Fredoka",

          titleSize:
            36,

          titleColor:
            "#ffffff",

          align:
            "center",

          position:
            "bottom",

          overlay:
            65
        };

  story.characterGuide =
    String(
      story.characterGuide ||
      ""
    );

  story.characterProfiles =
    Array.isArray(
      story.characterProfiles
    )
      ? story.characterProfiles
      : [];

  story.readingFont =
    String(
      story.readingFont ||
      "Nunito"
    );

  story.readingFontSize =
    Number.isFinite(
      Number(
        story.readingFontSize
      )
    )
      ? Math.max(
          14,

          Math.min(
            30,

            Number(
              story.readingFontSize
            )
          )
        )
      : 18;

  story.pages =
    Array.isArray(story.pages)

      ? story.pages.map(
          (page, index) => ({
            ...page,

            number:
              Number.isInteger(
                Number(
                  page.number
                )
              )
                ? Number(
                    page.number
                  )
                : index + 1,

            text:
              String(
                page.text || ""
              ),

            illustrationPrompt:
              String(
                page
                  .illustrationPrompt ||
                ""
              ),

            imageUrl:
              page.imageUrl ||
              null,

            layout:
              String(
                page.layout ||
                "side"
              ),

            theme:
              String(
                page.theme ||
                "fantasy"
              ),

            decoration:
              String(
                page.decoration ||
                "frame"
              ),

            imageScale:
              Number.isFinite(
                Number(
                  page.imageScale
                )
              )
                ? Number(
                    page.imageScale
                  )
                : 100,

            imageAlign:
              String(
                page.imageAlign ||
                "center"
              )
          })
        )

      : [];

  ensureImageHistory(story);

  return story;
}


/* ============================================================
   BOOK LIBRARY
   ============================================================ */

async function getBooks(
  request,
  env
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  try {
    const result =
      await env.DB
        .prepare(`
          SELECT
            id,
            title,
            age,
            language,
            revision,
            created_at,
            updated_at,

            json_array_length(
              pages,
              '$.pages'
            ) AS page_count,

            CASE
              WHEN json_extract(
                pages,
                '$.coverImageUrl'
              ) LIKE '/api/images/%'
              THEN json_extract(
                pages,
                '$.coverImageUrl'
              )

              WHEN json_extract(
                pages,
                '$.coverImageUrl'
              ) LIKE 'https://%'
              THEN json_extract(
                pages,
                '$.coverImageUrl'
              )

              ELSE NULL
            END AS cover_image_url

          FROM books

          WHERE owner_id = ?

          ORDER BY updated_at DESC

          LIMIT 100
        `)

        .bind(user.id)
        .all();

    const books =
      Array.isArray(
        result.results
      )
        ? result.results.map(
            book => ({
              id:
                book.id,

              title:
                book.title,

              age:
                book.age,

              language:
                book.language,

              pageCount:
                Number(
                  book.page_count ||
                  0
                ),

              coverImageUrl:
                book.cover_image_url ||
                null,

              revision:
                Number(
                  book.revision ||
                  1
                ),

              created_at:
                book.created_at,

              updated_at:
                book.updated_at
            })
          )

        : [];

    return json(books);

  } catch (error) {
    console.error(
      "[Perpustakaan]",
      error
    );

    return json(
      {
        error:
          error?.message ||
          "Gagal membaca perpustakaan."
      },
      500
    );
  }
}


async function getBookById(
  request,
  env,
  bookId
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  try {
    const book =
      await env.DB
        .prepare(`
          SELECT *

          FROM books

          WHERE
            id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          bookId,
          user.id
        )

        .first();

    if (!book) {
      return json(
        {
          error:
            "Buku tidak dijumpai."
        },
        404
      );
    }

    let story;

    try {
      story =
        normalizeStory(
          JSON.parse(
            book.pages ||
            "{}"
          )
        );

    } catch (error) {
      console.error(
        "[Book Parse]",
        error
      );

      return json(
        {
          error:
            "Data buku rosak."
        },
        500
      );
    }

    return json({
      ...book,

      pages:
        story
    });

  } catch (error) {
    console.error(
      "[Get Book]",
      error
    );

    return json(
      {
        error:
          "Gagal membaca buku."
      },
      500
    );
  }
}


/* ============================================================
   BACKUP HELPERS
   ============================================================ */

function removeLegacyBase64(
  story
) {
  const copy =
    structuredClone(story);

  if (
    typeof copy.coverImageUrl ===
      "string" &&

    copy.coverImageUrl
      .startsWith(
        "data:image/"
      )
  ) {
    copy.coverImageUrl =
      null;
  }

  if (
    Array.isArray(
      copy.pages
    )
  ) {
    copy.pages =
      copy.pages.map(page => {
        const next = {
          ...page
        };

        if (
          typeof next.imageUrl ===
            "string" &&

          next.imageUrl
            .startsWith(
              "data:image/"
            )
        ) {
          next.imageUrl =
            null;
        }

        return next;
      });
  }

  /*
    Jangan backup sejarah base64 lama.
    URL KV masih dikekalkan.
  */
  ensureImageHistory(copy);

  copy.imageHistory.cover =
    copy.imageHistory.cover
      .filter(
        value =>
          typeof value ===
            "string" &&

          !value.startsWith(
            "data:image/"
          )
      );

  for (
    const key of
    Object.keys(
      copy.imageHistory.pages
    )
  ) {
    copy.imageHistory.pages[key] =
      (
        copy.imageHistory.pages[
          key
        ] || []
      )
        .filter(
          value =>
            typeof value ===
              "string" &&

            !value.startsWith(
              "data:image/"
            )
        );
  }

  return copy;
}


async function createBookBackup(
  env,
  book,
  ownerId,
  label =
    "Backup Automatik"
) {
  const id =
    crypto.randomUUID();

  const createdAt =
    new Date()
      .toISOString();

  let story;

  try {
    story =
      normalizeStory(
        JSON.parse(
          book.pages ||
          "{}"
        )
      );

  } catch {
    throw new Error(
      "Data buku tidak sah untuk backup."
    );
  }

  /*
    Ini penting untuk mengelakkan
    SQLITE_TOOBIG daripada base64 lama.
  */
  const safeStory =
    removeLegacyBase64(
      story
    );

  const snapshot =
    JSON.stringify({
      title:
        book.title || "",

      idea:
        book.idea || "",

      age:
        book.age || "",

      language:
        book.language || "",

      story:
        safeStory
    });

  await env.DB
    .prepare(`
      INSERT INTO book_backups (
        id,
        book_id,
        owner_id,
        label,
        snapshot,
        created_at
      )

      VALUES (
        ?, ?, ?, ?, ?, ?
      )
    `)

    .bind(
      id,
      book.id,
      ownerId,
      String(
        label ||
        "Backup Manual"
      ).slice(0, 80),
      snapshot,
      createdAt
    )

    .run();

  /*
    Kekalkan hanya 20 backup
    terbaru bagi setiap buku.
  */
  const oldBackups =
    await env.DB
      .prepare(`
        SELECT id

        FROM book_backups

        WHERE
          book_id = ?

          AND
          owner_id = ?

        ORDER BY
          created_at DESC

        LIMIT -1 OFFSET ?
      `)

      .bind(
        book.id,
        ownerId,
        MAX_BACKUPS
      )

      .all();

  for (
    const old of
    oldBackups.results || []
  ) {
    await env.DB
      .prepare(`
        DELETE FROM book_backups

        WHERE
          id = ?

          AND
          owner_id = ?
      `)

      .bind(
        old.id,
        ownerId
      )

      .run();
  }

  return id;
}


async function shouldAutoBackup(
  env,
  bookId,
  ownerId
) {
  const record =
    await env.DB
      .prepare(`
        SELECT created_at

        FROM book_backups

        WHERE
          book_id = ?

          AND
          owner_id = ?

          AND
          label =
            'Backup Automatik'

        ORDER BY
          created_at DESC

        LIMIT 1
      `)

      .bind(
        bookId,
        ownerId
      )

      .first();

  if (!record) {
    return true;
  }

  const time =
    Date.parse(
      record.created_at
    );

  return (
    !Number.isFinite(time) ||

    Date.now() - time >=
      AUTO_BACKUP_MS
  );
}


/* ============================================================
   UPDATE / AUTOSAVE BOOK
   ============================================================ */

async function updateBook(
  request,
  env,
  bookId
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const body =
    await readJson(request);

  if (!body) {
    return json(
      {
        error:
          "JSON tidak sah."
      },
      400
    );
  }

  const book =
    await env.DB
      .prepare(`
        SELECT *

        FROM books

        WHERE
          id = ?

          AND
          owner_id = ?

        LIMIT 1
      `)

      .bind(
        bookId,
        user.id
      )

      .first();

  if (!book) {
    return json(
      {
        error:
          "Buku tidak dijumpai."
      },
      404
    );
  }

  const expectedRevision =
    Number(
      body.revision
    );

  if (
    !Number.isSafeInteger(
      expectedRevision
    ) ||

    expectedRevision < 1
  ) {
    return json(
      {
        code:
          "REVISION_REQUIRED",

        error:
          "Versi buku diperlukan. Sila buka semula buku."
      },
      428
    );
  }

  if (
    Number(book.revision) !==
    expectedRevision
  ) {
    return json(
      {
        code:
          "BOOK_CONFLICT",

        error:
          "Buku telah diubah pada tab atau peranti lain.",

        currentRevision:
          Number(
            book.revision
          )
      },
      409
    );
  }

  let story;

  try {
    story =
      normalizeStory(
        JSON.parse(
          book.pages ||
          "{}"
        )
      );

  } catch {
    return json(
      {
        error:
          "Data buku rosak."
      },
      500
    );
  }

  if (
    !Array.isArray(
      body.pages
    )
  ) {
    return json(
      {
        error:
          "Senarai halaman tidak sah."
      },
      400
    );
  }

  if (
    body.pages.length !==
    story.pages.length
  ) {
    return json(
      {
        error:
          "Bilangan halaman tidak sepadan."
      },
      400
    );
  }

  const incomingMap =
    new Map();

  for (
    const page of
    body.pages
  ) {
    const number =
      Number(
        page?.number
      );

    if (
      !Number.isInteger(
        number
      ) ||

      typeof page.text !==
        "string" ||

      page.text.length >
        MAX_PAGE_TEXT_LENGTH
    ) {
      return json(
        {
          error:
            "Data halaman tidak sah."
        },
        400
      );
    }

    incomingMap.set(
      number,
      page
    );
  }

  story.pages =
    story.pages.map(
      oldPage => {
        const incoming =
          incomingMap.get(
            Number(
              oldPage.number
            )
          );

        if (!incoming) {
          return oldPage;
        }

        return {
          ...oldPage,

          /*
            Jangan overwrite imageUrl
            dari autosave biasa.
          */
          text:
            incoming.text,

          layout:
            typeof incoming.layout ===
              "string"
              ? incoming.layout
              : oldPage.layout,

          theme:
            typeof incoming.theme ===
              "string"
              ? incoming.theme
              : oldPage.theme,

          decoration:
            typeof incoming.decoration ===
              "string"
              ? incoming.decoration
              : oldPage.decoration,

          imageScale:
            Number.isFinite(
              Number(
                incoming.imageScale
              )
            )
              ? Number(
                  incoming.imageScale
                )
              : oldPage.imageScale,

          imageAlign:
            typeof incoming.imageAlign ===
              "string"
              ? incoming.imageAlign
              : oldPage.imageAlign
        };
      }
    );

  if (
    typeof body.coverAuthor ===
      "string"
  ) {
    story.coverAuthor =
      body.coverAuthor
        .slice(0, 100);
  }

  if (
    typeof body.coverSubtitle ===
      "string"
  ) {
    story.coverSubtitle =
      body.coverSubtitle
        .slice(0, 200);
  }

  if (
    typeof
      body.coverIllustrationIdea ===
      "string"
  ) {
    story.coverIllustrationIdea =
      body
        .coverIllustrationIdea
        .slice(0, 1000);
  }

  if (
    body.coverDesign &&
    typeof body.coverDesign ===
      "object" &&
    !Array.isArray(
      body.coverDesign
    )
  ) {
    story.coverDesign =
      body.coverDesign;
  }

  if (
    typeof body.readingFont ===
      "string"
  ) {
    story.readingFont =
      body.readingFont
        .slice(0, 80);
  }

  if (
    Number.isFinite(
      Number(
        body.readingFontSize
      )
    )
  ) {
    story.readingFontSize =
      Math.max(
        14,

        Math.min(
          30,

          Number(
            body.readingFontSize
          )
        )
      );
  }

  const nextJSON =
    JSON.stringify(story);

  if (
    nextJSON ===
    book.pages
  ) {
    return json({
      ok: true,

      revision:
        Number(
          book.revision
        ),

      unchanged:
        true
    });
  }

  /*
    Backup automatik tidak patut
    menggagalkan autosave.
  */
  try {
    if (
      await shouldAutoBackup(
        env,
        book.id,
        user.id
      )
    ) {
      await createBookBackup(
        env,
        book,
        user.id,
        "Backup Automatik"
      );
    }
  } catch (error) {
    console.error(
      "[Auto Backup]",
      error
    );
  }

  const nextRevision =
    expectedRevision + 1;

  const result =
    await env.DB
      .prepare(`
        UPDATE books

        SET
          pages = ?,
          updated_at = ?,
          revision = ?

        WHERE
          id = ?

          AND
          owner_id = ?

          AND
          revision = ?
      `)

      .bind(
        nextJSON,

        new Date()
          .toISOString(),

        nextRevision,

        bookId,
        user.id,
        expectedRevision
      )

      .run();

  if (
    !result.success ||

    Number(
      result.meta?.changes ||
      0
    ) !== 1
  ) {
    return json(
      {
        code:
          "BOOK_CONFLICT",

        error:
          "Buku berubah semasa proses simpan."
      },
      409
    );
  }

  return json({
    ok: true,

    revision:
      nextRevision
  });
}


/* ============================================================
   GEMINI STORY GENERATOR
   ============================================================ */

function normalizeAge(value) {
  const raw =
    String(
      value ||
      "6-8"
    )
      .trim()
      .replace(/[–—]/g, "-")
      .toLowerCase();

  const values = {
    "3-5":
      "3-5",

    "3-5 tahun":
      "3-5",

    "6-8":
      "6-8",

    "6-8 tahun":
      "6-8",

    "9-12":
      "9-12",

    "9-12 tahun":
      "9-12"
  };

  return (
    values[raw] ||
    raw
  );
}


function normalizeLanguage(
  value
) {
  const raw =
    String(
      value ||
      "Bahasa Melayu"
    ).trim();

  const values = {
    bm:
      "Bahasa Melayu",

    ms:
      "Bahasa Melayu",

    malay:
      "Bahasa Melayu",

    "bahasa melayu":
      "Bahasa Melayu",

    "bahasa malaysia":
      "Bahasa Melayu",

    en:
      "English",

    english:
      "English"
  };

  return (
    values[
      raw.toLowerCase()
    ] ||
    raw
  );
}


async function callGeminiJSON(
  env,
  prompt,
  temperature = 0.7
) {
  if (
    !env.GEMINI_API_KEY
  ) {
    throw new Error(
      "Gemini API Key belum dikonfigurasi."
    );
  }

  const model =
    env.GEMINI_TEXT_MODEL ||
    "gemini-3.8-flash";

  const response =
    await fetch(
      "https://generativelanguage.googleapis.com/" +
      "v1beta/models/" +
      encodeURIComponent(
        model
      ) +
      ":generateContent?key=" +
      encodeURIComponent(
        env.GEMINI_API_KEY
      ),

      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text:
                      prompt
                  }
                ]
              }
            ],

            generationConfig: {
              responseMimeType:
                "application/json",

              temperature,

              maxOutputTokens:
                32768
            }
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      `Gemini HTTP ${response.status}`
    );
  }

  const raw =
    data
      ?.candidates
      ?.[0]
      ?.content
      ?.parts
      ?.[0]
      ?.text;

  if (!raw) {
    throw new Error(
      "Gemini tidak memulangkan jawapan."
    );
  }

  try {
    return JSON.parse(raw);

  } catch {
    console.error(
      "[Gemini JSON]",
      raw
    );

    throw new Error(
      "Format jawapan Gemini tidak sah."
    );
  }
}


async function generateStory(
  request,
  env
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const body =
    await readJson(request);

  if (!body) {
    return json(
      {
        error:
          "JSON tidak sah."
      },
      400
    );
  }

  const title =
    cleanText(
      body.title,
      120
    );

  const idea =
    cleanText(
      body.idea,
      2000
    );

  const age =
    normalizeAge(
      body.age
    );

  const language =
    normalizeLanguage(
      body.language
    );

  const pageCount =
    Number(
      body.pageCount
    );

  const allowed =
    new Set([
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

  if (!title) {
    return json(
      {
        error:
          "Tajuk buku diperlukan."
      },
      400
    );
  }

  if (
    idea.length < 12
  ) {
    return json(
      {
        error:
          "Idea cerita terlalu pendek."
      },
      400
    );
  }

  if (
    !allowed.has(
      pageCount
    )
  ) {
    return json(
      {
        error:
          "Bilangan muka surat tidak sah."
      },
      400
    );
  }

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
- Page numbers start at 1.
- Maximum 35 words of story text per page.
- Keep characters consistent.
- Every page must include an English illustrationPrompt.
- Include a moral.
- Include an English coverIllustrationIdea.
- No Markdown.

Return:

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
    const generated =
      await callGeminiJSON(
        env,
        prompt,
        0.7
      );

    if (
      !Array.isArray(
        generated.pages
      ) ||

      generated.pages.length !==
        pageCount
    ) {
      return json(
        {
          error:
            "Gemini tidak menghasilkan jumlah muka surat yang tepat."
        },
        422
      );
    }

    for (
      let i = 0;
      i <
      generated.pages.length;
      i++
    ) {
      const page =
        generated.pages[i];

      if (
        Number(
          page.number
        ) !==
          i + 1 ||

        typeof page.text !==
          "string" ||

        !page.text.trim() ||

        countWords(
          page.text
        ) > 35 ||

        typeof
          page
            .illustrationPrompt !==
          "string"
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

    const story =
      normalizeStory({
        ...generated,

        title:
          cleanText(
            generated.title ||
            title,
            120
          ),

        coverImageUrl:
          null,

        coverAuthor:
          "Storyland AI",

        coverSubtitle:
          "Sebuah cerita penuh imaginasi dan pengajaran",

        imageHistory: {
          cover: [],
          pages: {}
        },

        readingFont:
          "Nunito",

        readingFontSize:
          18,

        pages:
          generated.pages.map(
            page => ({
              ...page,

              imageUrl:
                null,

              layout:
                "side",

              theme:
                "fantasy",

              decoration:
                "frame",

              imageScale:
                100,

              imageAlign:
                "center"
            })
          )
      });

    const id =
      crypto.randomUUID();

    const timestamp =
      new Date()
        .toISOString();

    await env.DB
      .prepare(`
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

        VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, 1
        )
      `)

      .bind(
        id,
        story.title,
        idea,
        age,
        language,

        JSON.stringify(
          story
        ),

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
    console.error(
      "[Generate Story]",
      error
    );

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


/* ============================================================
   IMAGE HISTORY HELPERS
   ============================================================ */

function ensureImageHistory(
  story
) {
  if (
    !story.imageHistory ||
    typeof story.imageHistory !==
      "object" ||
    Array.isArray(
      story.imageHistory
    )
  ) {
    story.imageHistory = {};
  }

  if (
    !Array.isArray(
      story.imageHistory.cover
    )
  ) {
    story.imageHistory.cover = [];
  }

  if (
    !story.imageHistory.pages ||
    typeof
      story.imageHistory.pages !==
      "object" ||
    Array.isArray(
      story.imageHistory.pages
    )
  ) {
    story.imageHistory.pages = {};
  }

  return story;
}


function getCurrentImage(
  story,
  target
) {
  if (
    target === "cover"
  ) {
    return (
      story.coverImageUrl ||
      null
    );
  }

  const page =
    story.pages?.find(
      item =>
        Number(
          item.number
        ) ===
        Number(target)
    );

  return (
    page?.imageUrl ||
    null
  );
}


function setCurrentImage(
  story,
  target,
  imageUrl
) {
  if (
    target === "cover"
  ) {
    story.coverImageUrl =
      imageUrl;

    return true;
  }

  const page =
    story.pages?.find(
      item =>
        Number(
          item.number
        ) ===
        Number(target)
    );

  if (!page) {
    return false;
  }

  page.imageUrl =
    imageUrl;

  return true;
}


function getImageHistoryList(
  story,
  target
) {
  ensureImageHistory(
    story
  );

  if (
    target === "cover"
  ) {
    return (
      story
        .imageHistory
        .cover
    );
  }

  const key =
    String(target);

  if (
    !Array.isArray(
      story
        .imageHistory
        .pages[key]
    )
  ) {
    story
      .imageHistory
      .pages[key] = [];
  }

  return (
    story
      .imageHistory
      .pages[key]
  );
}


function rememberOldImage(
  story,
  target,
  imageUrl
) {
  if (!imageUrl) {
    return;
  }

  /*
    Jangan masukkan base64 lama
    ke history baru.
  */
  if (
    typeof imageUrl ===
      "string" &&

    imageUrl.startsWith(
      "data:image/"
    )
  ) {
    return;
  }

  const list =
    getImageHistoryList(
      story,
      target
    );

  const index =
    list.indexOf(
      imageUrl
    );

  if (
    index >= 0
  ) {
    list.splice(
      index,
      1
    );
  }

  list.unshift(
    imageUrl
  );

  if (
    list.length >
    MAX_IMAGE_HISTORY
  ) {
    list.length =
      MAX_IMAGE_HISTORY;
  }
}


/* ============================================================
   KV IMAGE HELPERS
   ============================================================ */

function base64ToBytes(
  base64
) {
  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


function extensionForType(
  contentType
) {
  return (
    IMAGE_EXTENSIONS[
      contentType
    ] ||
    "jpg"
  );
}


function imageKeyToUrl(
  key
) {
  return (
    "/api/images/" +
    encodeURIComponent(key)
  );
}


async function saveImageToKV(
  env,
  userId,
  bookId,
  bytes,
  contentType
) {
  if (
    !env.IMAGES_KV
  ) {
    throw new Error(
      "Binding IMAGES_KV belum dikonfigurasi."
    );
  }

  const extension =
    extensionForType(
      contentType
    );

  const key =
    `${userId}/${bookId}/${crypto.randomUUID()}.${extension}`;

  await env.IMAGES_KV.put(
    key,
    bytes,
    {
      metadata: {
        contentType
      }
    }
  );

  return {
    key,
    imageUrl:
      imageKeyToUrl(key)
  };
}


async function serveImageFromKV(
  request,
  env,
  encodedKey
) {
  try {
    if (
      !env.IMAGES_KV
    ) {
      return new Response(
        "Storage gambar belum dikonfigurasi.",
        {
          status: 503
        }
      );
    }

    const key =
      decodeURIComponent(
        encodedKey
      );

    const result =
      await env.IMAGES_KV
        .getWithMetadata(
          key,
          {
            type:
              "arrayBuffer"
          }
        );

    if (
      !result?.value
    ) {
      return new Response(
        "Gambar tidak dijumpai.",
        {
          status: 404
        }
      );
    }

    const contentType =
      result.metadata
        ?.contentType ||
      "image/jpeg";

    return new Response(
      result.value,
      {
        status: 200,

        headers: {
          "Content-Type":
            contentType,

          "Cache-Control":
            "public, max-age=31536000, immutable"
        }
      }
    );

  } catch (error) {
    console.error(
      "[Serve KV Image]",
      error
    );

    return new Response(
      "Gagal membaca gambar.",
      {
        status: 500
      }
    );
  }
}


/* ============================================================
   IMAGE QUOTA
   ============================================================ */

async function getImageQuota(
  request,
  env
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const day =
    new Date()
      .toISOString()
      .slice(0, 10);

  const row =
    await env.DB
      .prepare(`
        SELECT used

        FROM image_daily_usage

        WHERE
          user_id = ?

          AND
          day = ?

        LIMIT 1
      `)

      .bind(
        user.id,
        day
      )

      .first();

  const used =
    Number(
      row?.used ||
      0
    );

  const limit =
    Math.max(
      1,

      Math.min(
        1000,

        Number(
          env
            .IMAGE_DAILY_LIMIT ||
          500
        ) || 500
      )
    );

  return json({
    ok: true,
    used,
    limit,

    remaining:
      Math.max(
        0,
        limit - used
      )
  });
}


async function incrementImageUsage(
  env,
  userId
) {
  const day =
    new Date()
      .toISOString()
      .slice(0, 10);

  await env.DB
    .prepare(`
      INSERT INTO
        image_daily_usage (
          user_id,
          day,
          used
        )

      VALUES (
        ?, ?, 1
      )

      ON CONFLICT(
        user_id,
        day
      )

      DO UPDATE SET
        used =
          used + 1
    `)

    .bind(
      userId,
      day
    )

    .run();
}


async function assertImageQuota(
  env,
  userId
) {
  const day =
    new Date()
      .toISOString()
      .slice(0, 10);

  const row =
    await env.DB
      .prepare(`
        SELECT used

        FROM image_daily_usage

        WHERE
          user_id = ?

          AND
          day = ?

        LIMIT 1
      `)

      .bind(
        userId,
        day
      )

      .first();

  const used =
    Number(
      row?.used ||
      0
    );

  const limit =
    Math.max(
      1,

      Math.min(
        1000,

        Number(
          env
            .IMAGE_DAILY_LIMIT ||
          500
        ) || 500
      )
    );

  return {
    allowed:
      used < limit,

    used,
    limit,

    remaining:
      Math.max(
        0,
        limit - used
      )
  };
}


/* ============================================================
   CLOUDFLARE AI IMAGE GENERATION
   ============================================================ */

async function generateImage(
  request,
  env,
  bookId
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const quota =
    await assertImageQuota(
      env,
      user.id
    );

  if (!quota.allowed) {
    return json(
      {
        error:
          "Kuota gambar harian telah habis.",

        used:
          quota.used,

        limit:
          quota.limit,

        remaining:
          0
      },
      429
    );
  }

  const body =
    await readJson(request);

  if (!body) {
    return json(
      {
        error:
          "JSON tidak sah."
      },
      400
    );
  }

  const target =
    String(
      body.target || ""
    );

  const customPrompt =
    cleanText(
      body.customPrompt,
      500
    );

  const style =
    cleanText(
      body.style,
      50
    ) ||
    "fantasy";

  try {
    const book =
      await env.DB
        .prepare(`
          SELECT *

          FROM books

          WHERE
            id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          bookId,
          user.id
        )

        .first();

    if (!book) {
      return json(
        {
          error:
            "Buku tidak dijumpai."
        },
        404
      );
    }

    const story =
      normalizeStory(
        JSON.parse(
          book.pages ||
          "{}"
        )
      );

    let scene;

    if (
      target ===
      "cover"
    ) {
      scene =
        story
          .coverIllustrationIdea ||
        `Portrait children's book cover for "${book.title}".`;

    } else {
      const pageNumber =
        Number(target);

      const page =
        story.pages.find(
          item =>
            Number(
              item.number
            ) ===
            pageNumber
        );

      if (!page) {
        return json(
          {
            error:
              "Halaman tidak dijumpai."
          },
          404
        );
      }

      scene =
        page
          .illustrationPrompt ||

        page.text ||

        `Children's book illustration for page ${pageNumber}.`;
    }

    const stylePrompt = {
      fantasy:
        "Magical fantasy children's picture book illustration, whimsical, colorful, polished.",

      cartoon:
        "Premium cute child-friendly cartoon illustration, expressive characters, vibrant scenery.",

      watercolor:
        "Hand-painted watercolor children's picture book illustration, gentle artistic textures.",

      anime:
        "Original child-friendly 2D anime illustration, expressive characters and detailed scenery."
    }[style] ||
      "Premium children's picture book illustration.";

    const prompt = [
      stylePrompt,
      scene,
      customPrompt,

      "No text.",
      "No watermark."
    ]
      .filter(Boolean)
      .join(" ");

    if (
      !env
        .CLOUDFLARE_ACCOUNT_ID
    ) {
      return json(
        {
          error:
            "CLOUDFLARE_ACCOUNT_ID belum dikonfigurasi."
        },
        503
      );
    }

    if (
      !env
        .CLOUDFLARE_API_TOKEN
    ) {
      return json(
        {
          error:
            "CLOUDFLARE_API_TOKEN belum dikonfigurasi."
        },
        503
      );
    }

    const model =
      env
        .CLOUDFLARE_IMAGE_MODEL ||
      "@cf/black-forest-labs/flux-1-schnell";

    const response =
      await fetch(
        "https://api.cloudflare.com/client/v4/accounts/" +
        encodeURIComponent(
          env
            .CLOUDFLARE_ACCOUNT_ID
        ) +
        "/ai/run/" +
        model,

        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${env.CLOUDFLARE_API_TOKEN}`,

            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              prompt
            })
        }
      );

    const data =
      await response.json();

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
            data
              ?.errors
              ?.[0]
              ?.message ||

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

    const bytes =
      base64ToBytes(
        base64
      );

    const stored =
      await saveImageToKV(
        env,
        user.id,
        bookId,
        bytes.buffer,
        "image/jpeg"
      );

    const previousImage =
      getCurrentImage(
        story,
        target
      );

    if (
      previousImage &&
      previousImage !==
        stored.imageUrl
    ) {
      rememberOldImage(
        story,
        target,
        previousImage
      );
    }

    if (
      !setCurrentImage(
        story,
        target,
        stored.imageUrl
      )
    ) {
      await env.IMAGES_KV
        .delete(
          stored.key
        );

      return json(
        {
          error:
            "Target gambar tidak sah."
        },
        400
      );
    }

    try {
      await env.DB
        .prepare(`
          UPDATE books

          SET
            pages = ?,
            updated_at = ?,
            revision =
              revision + 1

          WHERE
            id = ?

            AND
            owner_id = ?
        `)

        .bind(
          JSON.stringify(
            story
          ),

          new Date()
            .toISOString(),

          bookId,
          user.id
        )

        .run();

    } catch (error) {
      /*
        Elakkan orphan KV object
        kalau D1 update gagal.
      */
      await env.IMAGES_KV
        .delete(
          stored.key
        );

      throw error;
    }

    await incrementImageUsage(
      env,
      user.id
    );

    return json({
      ok: true,

      imageUrl:
        stored.imageUrl
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


/* ============================================================
   MANUAL IMAGE UPLOAD -> KV
   ============================================================ */

async function uploadBookImage(
  request,
  env,
  bookId,
  target
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const contentType =
    String(
      request.headers.get(
        "content-type"
      ) || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

  if (
    !ALLOWED_IMAGE_TYPES
      .has(contentType)
  ) {
    return json(
      {
        error:
          "Format gambar mesti JPG, PNG atau WebP."
      },
      400
    );
  }

  const bytes =
    await request
      .arrayBuffer();

  if (
    !bytes.byteLength
  ) {
    return json(
      {
        error:
          "Fail gambar kosong."
      },
      400
    );
  }

  if (
    bytes.byteLength >
      8 * 1024 * 1024
  ) {
    return json(
      {
        error:
          "Gambar melebihi 8MB."
      },
      413
    );
  }

  try {
    const book =
      await env.DB
        .prepare(`
          SELECT *

          FROM books

          WHERE
            id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          bookId,
          user.id
        )

        .first();

    if (!book) {
      return json(
        {
          error:
            "Buku tidak dijumpai."
        },
        404
      );
    }

    const story =
      normalizeStory(
        JSON.parse(
          book.pages ||
          "{}"
        )
      );

    if (
      target !== "cover" &&
      !story.pages.some(
        page =>
          Number(
            page.number
          ) ===
          Number(target)
      )
    ) {
      return json(
        {
          error:
            "Halaman tidak dijumpai."
        },
        404
      );
    }

    const stored =
      await saveImageToKV(
        env,
        user.id,
        bookId,
        bytes,
        contentType
      );

    const previous =
      getCurrentImage(
        story,
        target
      );

    if (
      previous &&
      previous !==
        stored.imageUrl
    ) {
      rememberOldImage(
        story,
        target,
        previous
      );
    }

    setCurrentImage(
      story,
      target,
      stored.imageUrl
    );

    try {
      await env.DB
        .prepare(`
          UPDATE books

          SET
            pages = ?,
            updated_at = ?,
            revision =
              revision + 1

          WHERE
            id = ?

            AND
            owner_id = ?
        `)

        .bind(
          JSON.stringify(
            story
          ),

          new Date()
            .toISOString(),

          bookId,
          user.id
        )

        .run();

    } catch (error) {
      await env.IMAGES_KV
        .delete(
          stored.key
        );

      throw error;
    }

    return json({
      ok: true,

      imageUrl:
        stored.imageUrl
    });

  } catch (error) {
    console.error(
      "[Upload Image]",
      error
    );

    return json(
      {
        error:
          error?.message ||
          "Gagal menyimpan gambar."
      },
      500
    );
  }
}


/* ============================================================
   IMAGE HISTORY
   ============================================================ */

async function getImageHistory(
  request,
  env,
  bookId,
  target
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  try {
    const book =
      await env.DB
        .prepare(`
          SELECT pages

          FROM books

          WHERE
            id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          bookId,
          user.id
        )

        .first();

    if (!book) {
      return json(
        {
          error:
            "Buku tidak dijumpai."
        },
        404
      );
    }

    const story =
      normalizeStory(
        JSON.parse(
          book.pages ||
          "{}"
        )
      );

    if (
      target !== "cover" &&
      !story.pages.some(
        page =>
          Number(
            page.number
          ) ===
          Number(target)
      )
    ) {
      return json(
        {
          error:
            "Halaman tidak dijumpai."
        },
        404
      );
    }

    return json({
      ok: true,

      target,

      currentImageUrl:
        getCurrentImage(
          story,
          target
        ),

      history:
        [
          ...getImageHistoryList(
            story,
            target
          )
        ]
    });

  } catch (error) {
    console.error(
      "[Image History]",
      error
    );

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


async function restoreImageHistory(
  request,
  env,
  bookId,
  target
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const body =
    await readJson(request);

  const imageUrl =
    String(
      body?.imageUrl ||
      ""
    );

  if (!imageUrl) {
    return json(
      {
        error:
          "URL gambar diperlukan."
      },
      400
    );
  }

  try {
    const book =
      await env.DB
        .prepare(`
          SELECT *

          FROM books

          WHERE
            id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          bookId,
          user.id
        )

        .first();

    if (!book) {
      return json(
        {
          error:
            "Buku tidak dijumpai."
        },
        404
      );
    }

    const story =
      normalizeStory(
        JSON.parse(
          book.pages ||
          "{}"
        )
      );

    const history =
      getImageHistoryList(
        story,
        target
      );

    if (
      !history.includes(
        imageUrl
      )
    ) {
      return json(
        {
          error:
            "Gambar tiada dalam sejarah."
        },
        400
      );
    }

    const current =
      getCurrentImage(
        story,
        target
      );

    history.splice(
      history.indexOf(
        imageUrl
      ),
      1
    );

    if (
      current &&
      current !==
        imageUrl
    ) {
      rememberOldImage(
        story,
        target,
        current
      );
    }

    if (
      !setCurrentImage(
        story,
        target,
        imageUrl
      )
    ) {
      return json(
        {
          error:
            "Target gambar tidak sah."
        },
        404
      );
    }

    await env.DB
      .prepare(`
        UPDATE books

        SET
          pages = ?,
          updated_at = ?,
          revision =
            revision + 1

        WHERE
          id = ?

          AND
          owner_id = ?
      `)

      .bind(
        JSON.stringify(
          story
        ),

        new Date()
          .toISOString(),

        bookId,
        user.id
      )

      .run();

    return json({
      ok: true,

      imageUrl,

      history:
        [
          ...getImageHistoryList(
            story,
            target
          )
        ]
    });

  } catch (error) {
    console.error(
      "[Restore Image]",
      error
    );

    return json(
      {
        error:
          "Gagal memulihkan gambar."
      },
      500
    );
  }
}


/* ============================================================
   PAGE TEXT HISTORY
   ============================================================ */

async function getTextHistory(
  request,
  env,
  bookId,
  pageNumber
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const number =
    Number(pageNumber);

  if (
    !Number.isInteger(
      number
    )
  ) {
    return json(
      {
        error:
          "Nombor halaman tidak sah."
      },
      400
    );
  }

  const result =
    await env.DB
      .prepare(`
        SELECT
          id,
          text,
          created_at

        FROM page_text_history

        WHERE
          owner_id = ?

          AND
          book_id = ?

          AND
          page_number = ?

        ORDER BY
          created_at DESC

        LIMIT 20
      `)

      .bind(
        user.id,
        bookId,
        number
      )

      .all();

  return json({
    ok: true,

    pageNumber:
      number,

    history:
      result.results || []
  });
}


async function saveTextHistory(
  request,
  env,
  bookId,
  pageNumber
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const body =
    await readJson(request);

  const number =
    Number(pageNumber);

  const text =
    body?.text;

  if (
    !Number.isInteger(
      number
    ) ||

    typeof text !==
      "string" ||

    !text.trim() ||

    text.length >
      MAX_PAGE_TEXT_LENGTH
  ) {
    return json(
      {
        error:
          "Versi cerita tidak sah."
      },
      400
    );
  }

  const latest =
    await env.DB
      .prepare(`
        SELECT text

        FROM page_text_history

        WHERE
          owner_id = ?

          AND
          book_id = ?

          AND
          page_number = ?

        ORDER BY
          created_at DESC

        LIMIT 1
      `)

      .bind(
        user.id,
        bookId,
        number
      )

      .first();

  if (
    latest?.text === text
  ) {
    return json({
      ok: true,
      duplicate: true
    });
  }

  const id =
    crypto.randomUUID();

  await env.DB
    .prepare(`
      INSERT INTO
        page_text_history (
          id,
          book_id,
          owner_id,
          page_number,
          text,
          created_at
        )

      VALUES (
        ?, ?, ?, ?, ?, ?
      )
    `)

    .bind(
      id,
      bookId,
      user.id,
      number,
      text,

      new Date()
        .toISOString()
    )

    .run();

  return json(
    {
      ok: true,
      id
    },
    201
  );
}


/* ============================================================
   GENERATE PAGE TEXT
   ============================================================ */

async function generatePageText(
  request,
  env,
  bookId,
  pageNumber
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const number =
    Number(pageNumber);

  if (
    !Number.isInteger(
      number
    )
  ) {
    return json(
      {
        error:
          "Nombor halaman tidak sah."
      },
      400
    );
  }

  try {
    const book =
      await env.DB
        .prepare(`
          SELECT *

          FROM books

          WHERE
            id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          bookId,
          user.id
        )

        .first();

    if (!book) {
      return json(
        {
          error:
            "Buku tidak dijumpai."
        },
        404
      );
    }

    const story =
      normalizeStory(
        JSON.parse(
          book.pages ||
          "{}"
        )
      );

    const page =
      story.pages.find(
        item =>
          Number(
            item.number
          ) ===
          number
      );

    if (!page) {
      return json(
        {
          error:
            "Halaman tidak dijumpai."
        },
        404
      );
    }

    const prompt = `
Return valid JSON only.

Write replacement story text for page ${number}
of a children's story.

Book title:
${book.title}

Book idea:
${book.idea || ""}

Language:
${book.language || "Bahasa Melayu"}

Current page text:
${page.text || ""}

Rules:
- Maximum 100 words.
- Natural child-friendly language.
- Keep continuity with the story.
- No Markdown.

Return:
{
  "text": "..."
}
`;

    const result =
      await callGeminiJSON(
        env,
        prompt,
        0.75
      );

    const text =
      String(
        result?.text ||
        ""
      ).trim();

    if (
      !text ||
      text.length >
        MAX_PAGE_TEXT_LENGTH
    ) {
      return json(
        {
          error:
            "Gemini tidak memulangkan teks yang sah."
        },
        502
      );
    }

    page.text =
      text;

    await env.DB
      .prepare(`
        UPDATE books

        SET
          pages = ?,
          updated_at = ?,
          revision =
            revision + 1

        WHERE
          id = ?

          AND
          owner_id = ?
      `)

      .bind(
        JSON.stringify(
          story
        ),

        new Date()
          .toISOString(),

        bookId,
        user.id
      )

      .run();

    return json({
      ok: true,
      text
    });

  } catch (error) {
    console.error(
      "[Generate Page Text]",
      error
    );

    return json(
      {
        error:
          error?.message ||
          "Gagal menjana teks halaman."
      },
      500
    );
  }
}


/* ============================================================
   COVER IDEA
   ============================================================ */

async function generateCoverIdea(
  request,
  env,
  bookId
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  try {
    const book =
      await env.DB
        .prepare(`
          SELECT *

          FROM books

          WHERE
            id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          bookId,
          user.id
        )

        .first();

    if (!book) {
      return json(
        {
          error:
            "Buku tidak dijumpai."
        },
        404
      );
    }

    const story =
      normalizeStory(
        JSON.parse(
          book.pages ||
          "{}"
        )
      );

    const prompt = `
Return valid JSON only.

Create one concise English illustration idea
for the cover of this children's book.

Title:
${book.title}

Idea:
${book.idea || ""}

Moral:
${story.moral || ""}

Rules:
- Describe characters, setting, mood and composition.
- No text or typography inside the artwork.
- Maximum 120 words.

Return:
{
  "idea": "..."
}
`;

    const result =
      await callGeminiJSON(
        env,
        prompt,
        0.7
      );

    const idea =
      cleanText(
        result?.idea,
        1000
      );

    if (!idea) {
      return json(
        {
          error:
            "Gemini tidak memulangkan idea cover."
        },
        502
      );
    }

    story.coverIllustrationIdea =
      idea;

    await env.DB
      .prepare(`
        UPDATE books

        SET
          pages = ?,
          updated_at = ?,
          revision =
            revision + 1

        WHERE
          id = ?

          AND
          owner_id = ?
      `)

      .bind(
        JSON.stringify(
          story
        ),

        new Date()
          .toISOString(),

        bookId,
        user.id
      )

      .run();

    return json({
      ok: true,
      idea
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
          "Gagal menjana idea cover."
      },
      500
    );
  }
}


/* ============================================================
   BACKUP CENTER
   ============================================================ */

async function getBookBackups(
  request,
  env,
  bookId
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  const book =
    await env.DB
      .prepare(`
        SELECT id

        FROM books

        WHERE
          id = ?

          AND
          owner_id = ?

        LIMIT 1
      `)

      .bind(
        bookId,
        user.id
      )

      .first();

  if (!book) {
    return json(
      {
        error:
          "Buku tidak dijumpai."
      },
      404
    );
  }

  const result =
    await env.DB
      .prepare(`
        SELECT
          id,
          label,
          created_at

        FROM book_backups

        WHERE
          book_id = ?

          AND
          owner_id = ?

        ORDER BY
          created_at DESC

        LIMIT 20
      `)

      .bind(
        bookId,
        user.id
      )

      .all();

  return json({
    ok: true,

    backups:
      result.results || []
  });
}


async function createManualBookBackup(
  request,
  env,
  bookId
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  try {
    const book =
      await env.DB
        .prepare(`
          SELECT *

          FROM books

          WHERE
            id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          bookId,
          user.id
        )

        .first();

    if (!book) {
      return json(
        {
          error:
            "Buku tidak dijumpai."
        },
        404
      );
    }

    const body =
      await readJson(request);

    const label =
      typeof body?.label ===
        "string" &&
      body.label.trim()

        ? body.label
            .trim()
            .slice(0, 80)

        : "Backup Manual";

    const backupId =
      await createBookBackup(
        env,
        book,
        user.id,
        label
      );

    return json(
      {
        ok: true,
        backupId
      },
      201
    );

  } catch (error) {
    console.error(
      "[Manual Backup]",
      error
    );

    return json(
      {
        error:
          error?.message ||
          "Gagal membuat sandaran."
      },
      500
    );
  }
}


async function restoreBookBackup(
  request,
  env,
  bookId,
  backupId
) {
  const user =
    await getSessionUser(
      request,
      env
    );

  if (!user) {
    return json(
      {
        error:
          "Sila log masuk terlebih dahulu."
      },
      401
    );
  }

  try {
    const book =
      await env.DB
        .prepare(`
          SELECT *

          FROM books

          WHERE
            id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          bookId,
          user.id
        )

        .first();

    if (!book) {
      return json(
        {
          error:
            "Buku tidak dijumpai."
        },
        404
      );
    }

    const backup =
      await env.DB
        .prepare(`
          SELECT *

          FROM book_backups

          WHERE
            id = ?

            AND
            book_id = ?

            AND
            owner_id = ?

          LIMIT 1
        `)

        .bind(
          backupId,
          bookId,
          user.id
        )

        .first();

    if (!backup) {
      return json(
        {
          error:
            "Sandaran tidak dijumpai."
        },
        404
      );
    }

    let snapshot;

    try {
      snapshot =
        JSON.parse(
          backup.snapshot
        );

    } catch {
      return json(
        {
          error:
            "Data sandaran rosak."
        },
        422
      );
    }

    if (
      !snapshot?.story ||
      !Array.isArray(
        snapshot
          .story
          .pages
      )
    ) {
      return json(
        {
          error:
            "Format sandaran tidak sah."
        },
        422
      );
    }

    /*
      Backup keadaan semasa
      sebelum restore.
    */
    try {
      await createBookBackup(
        env,
        book,
        user.id,
        "Sebelum Restore"
      );
    } catch (error) {
      console.error(
        "[Pre Restore Backup]",
        error
      );
    }

    const restored =
      normalizeStory(
        snapshot.story
      );

    const result =
      await env.DB
        .prepare(`
          UPDATE books

          SET
            title = ?,
            idea = ?,
            age = ?,
            language = ?,
            pages = ?,
            updated_at = ?,
            revision =
              revision + 1

          WHERE
            id = ?

            AND
            owner_id = ?
        `)

        .bind(
          snapshot.title ||
            book.title,

          snapshot.idea ??
            book.idea,

          snapshot.age ||
            book.age,

          snapshot.language ||
            book.language,

          JSON.stringify(
            restored
          ),

          new Date()
            .toISOString(),

          bookId,
          user.id
        )

        .run();

    if (
      !result.success ||

      Number(
        result.meta?.changes ||
        0
      ) !== 1
    ) {
      return json(
        {
          error:
            "Gagal memulihkan sandaran."
        },
        500
      );
    }

    return json({
      ok: true,

      message:
        "Buku berjaya dipulihkan."
    });

  } catch (error) {
    console.error(
      "[Restore Backup]",
      error
    );

    return json(
      {
        error:
          error?.message ||
          "Gagal memulihkan sandaran."
      },
      500
    );
  }
}


/* ============================================================
   API ROUTER
   ============================================================ */

async function handleApi(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const path =
    url.pathname;

  if (
    !sameOriginAllowed(
      request
    )
  ) {
    return json(
      {
        error:
          "Asal permintaan tidak dibenarkan."
      },
      403
    );
  }

  if (
    request.method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status: 204
      }
    );
  }


  /* ----------------------------------------------------------
     KV IMAGE DELIVERY
     ---------------------------------------------------------- */

  const kvImageMatch =
    path.match(
      /^\/api\/images\/(.+)$/
    );

  if (
    kvImageMatch &&
    request.method === "GET"
  ) {
    return serveImageFromKV(
      request,
      env,
      kvImageMatch[1]
    );
  }


  /* ----------------------------------------------------------
     HEALTH
     ---------------------------------------------------------- */

  if (
    path ===
      "/api/health" &&

    request.method ===
      "GET"
  ) {
    return json({
      ok: true,

      service:
        "Storyland AI",

      runtime:
        "Cloudflare Workers",

      database:
        "D1",

      imageStorage:
        env.IMAGES_KV
          ? "KV"
          : "not-ready",

      auth:
        "ready"
    });
  }


  /* ----------------------------------------------------------
     AUTH
     ---------------------------------------------------------- */

  if (
    path ===
      "/api/auth/register" &&

    request.method ===
      "POST"
  ) {
    return register(
      request,
      env
    );
  }

  if (
    path ===
      "/api/auth/login" &&

    request.method ===
      "POST"
  ) {
    return login(
      request,
      env
    );
  }

  if (
    path ===
      "/api/auth/logout" &&

    request.method ===
      "POST"
  ) {
    return logout(
      request,
      env
    );
  }

  if (
    path ===
      "/api/auth/me" &&

    request.method ===
      "GET"
  ) {
    return me(
      request,
      env
    );
  }

  if (
    path ===
      "/api/auth/profile" &&

    request.method ===
      "GET"
  ) {
    return getProfile(
      request,
      env
    );
  }

  if (
    path ===
      "/api/auth/profile" &&

    request.method ===
      "PUT"
  ) {
    return updateProfile(
      request,
      env
    );
  }


  /* ----------------------------------------------------------
     LIBRARY
     ---------------------------------------------------------- */

  if (
    path ===
      "/api/books" &&

    request.method ===
      "GET"
  ) {
    return getBooks(
      request,
      env
    );
  }


  /* ----------------------------------------------------------
     STORY GENERATION
     ---------------------------------------------------------- */

  if (
    path ===
      "/api/stories/generate" &&

    request.method ===
      "POST"
  ) {
    return generateStory(
      request,
      env
    );
  }


  /* ----------------------------------------------------------
     IMAGE QUOTA
     ---------------------------------------------------------- */

  if (
    path ===
      "/api/image-studio/quota" &&

    request.method ===
      "GET"
  ) {
    return getImageQuota(
      request,
      env
    );
  }


  /* ----------------------------------------------------------
     SINGLE BOOK
     ---------------------------------------------------------- */

  const bookMatch =
    path.match(
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


  /* ----------------------------------------------------------
     GENERATE IMAGE
     ---------------------------------------------------------- */

  const generateImageMatch =
    path.match(
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


  /* ----------------------------------------------------------
     MANUAL IMAGE UPLOAD
     ---------------------------------------------------------- */

  const uploadImageMatch =
    path.match(
      /^\/api\/books\/([a-f0-9-]{36})\/images\/([^/]+)$/i
    );

  if (
    uploadImageMatch &&
    request.method === "POST"
  ) {
    return uploadBookImage(
      request,
      env,
      uploadImageMatch[1],
      decodeURIComponent(
        uploadImageMatch[2]
      )
    );
  }


  /* ----------------------------------------------------------
     IMAGE HISTORY
     ---------------------------------------------------------- */

  const imageHistoryMatch =
    path.match(
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


  const imageHistoryRestoreMatch =
    path.match(
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


  /* ----------------------------------------------------------
     PAGE TEXT GENERATION
     ---------------------------------------------------------- */

  const generatePageTextMatch =
    path.match(
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


  /* ----------------------------------------------------------
     TEXT HISTORY
     ---------------------------------------------------------- */

  const textHistoryMatch =
    path.match(
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


  /* ----------------------------------------------------------
     COVER IDEA
     ---------------------------------------------------------- */

  const coverIdeaMatch =
    path.match(
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


  /* ==========================================================
     BACKUP CENTER

     PENTING:
     SEMUA ROUTE BACKUP MESTI BERADA
     SEBELUM FALLBACK 404.
     ========================================================== */

  const backupListMatch =
    path.match(
      /^\/api\/books\/([a-f0-9-]{36})\/backups$/i
    );

  if (
    backupListMatch &&
    request.method === "GET"
  ) {
    return getBookBackups(
      request,
      env,
      backupListMatch[1]
    );
  }

  if (
    backupListMatch &&
    request.method === "POST"
  ) {
    return createManualBookBackup(
      request,
      env,
      backupListMatch[1]
    );
  }


  const backupRestoreMatch =
    path.match(
      /^\/api\/books\/([a-f0-9-]{36})\/backups\/([a-f0-9-]{36})\/restore$/i
    );

  if (
    backupRestoreMatch &&
    request.method === "POST"
  ) {
    return restoreBookBackup(
      request,
      env,
      backupRestoreMatch[1],
      backupRestoreMatch[2]
    );
  }


  /* ==========================================================
     FALLBACK — WAJIB PALING AKHIR
     ========================================================== */

  return json(
    {
      error:
        "API belum dipindahkan ke Cloudflare Worker.",

      path
    },
    404
  );
}


/* ============================================================
   WORKER ENTRYPOINT
   ============================================================ */

export default {
  async fetch(
    request,
    env
  ) {
    try {
      const url =
        new URL(
          request.url
        );

      if (
        url.pathname
          .startsWith(
            "/api/"
          )
      ) {
        return await handleApi(
          request,
          env
        );
      }

      return env.ASSETS.fetch(
        request
      );

    } catch (error) {
      console.error(
        "[Worker Fatal]",
        error
      );

      return json(
        {
          error:
            error?.message ||
            "Ralat dalaman server."
        },
        500
      );
    }
  }
};