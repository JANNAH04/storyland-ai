
/* ==========================================
   STORYLAND AI — QUALITY CHECKER V10
   ========================================== */

(() => {
  "use strict";

  const MAX_WORDS = 35;

  function wordCount(text) {
    const clean = String(text || "").trim();
    return clean ? clean.split(/\s+/u).length : 0;
  }

  function hasImage(url) {
  if (
    typeof url !== "string" ||
    !url.trim()
  ) {
    return false;
  }

  const value = url.trim();

  return (
    value.startsWith("data:image/") ||
    value.startsWith("/api/images/") ||
    value.startsWith("/generated/") ||
    value.startsWith("https://") ||
    value.startsWith("http://")
  );
}

  function checkBook(story) {
    const pages = Array.isArray(story?.pages)
      ? story.pages
      : [];

    const problems = [];

    if (!String(story?.title || "").trim()) {
      problems.push({
        page: 0,
        message: "Tajuk buku belum lengkap."
      });
    }

    if (!String(story?.coverAuthor || "").trim()) {
      problems.push({
        page: 0,
        message: "Nama penulis belum diisi."
      });
    }

    if (!hasImage(story?.coverImageUrl)) {
      problems.push({
        page: 0,
        message: "Gambar cover belum diupload."
      });
    }

    if (!pages.length) {
      problems.push({
        page: 0,
        message: "Buku belum mempunyai halaman cerita."
      });
    }

    pages.forEach((page, index) => {
      const number = index + 1;
      const count = wordCount(page.text);

      if (!String(page.text || "").trim()) {
        problems.push({
          page: number,
          message: `Halaman ${number}: teks cerita kosong.`
        });
      } else if (count > MAX_WORDS) {
        problems.push({
          page: number,
          message:
            `Halaman ${number}: ${count}/${MAX_WORDS} perkataan. ` +
            `Kurangkan ${count - MAX_WORDS} perkataan.`
        });
      }

      if (!hasImage(page.imageUrl)) {
        problems.push({
          page: number,
          message:
            `Halaman ${number}: gambar belum diupload.`
        });
      }
    });

    return {
      passed: problems.length === 0,
      problems,
      totalPages: pages.length
    };
  }

  function createPanel() {
    const panel = document.createElement("section");
    panel.id = "bookQualityPanel";
    panel.className = "book-quality-panel";

    panel.innerHTML = `
      <div class="quality-heading">
        <div>
          <h3>✅ Semakan Kualiti Buku</h3>
          <p>Periksa buku sebelum eksport PDF.</p>
        </div>
        <span id="qualityStatus" class="quality-status">
          Belum disemak
        </span>
      </div>

      <div id="qualityResult"
           class="quality-result"
           role="status"
           aria-live="polite"></div>

      <button id="qualityCheckButton"
              type="button"
              class="quality-check-button">
        🔍 Semak Buku Sekarang
      </button>
    `;

    return panel;
  }

  function renderResult(result) {
    const status = document.getElementById(
      "qualityStatus"
    );

    const container = document.getElementById(
      "qualityResult"
    );

    if (!status || !container) return;

    container.replaceChildren();

    status.textContent = result.passed
      ? "LULUS"
      : "PERLU DIBAIKI";

    status.className = result.passed
      ? "quality-status quality-success"
      : "quality-status quality-warning";

    const heading = document.createElement("p");
    heading.className = "quality-summary";

    heading.textContent = result.passed
      ? `🎉 Buku lengkap! ${result.totalPages} halaman lulus semakan kandungan.`
      : `⚠️ ${result.problems.length} perkara perlu diperbaiki.`;

    container.append(heading);

    if (result.problems.length) {
      const list = document.createElement("ul");

      result.problems.forEach(problem => {
        const item = document.createElement("li");
        item.textContent = problem.message;
        list.append(item);
      });

      container.append(list);
    } else {
      const note = document.createElement("p");

      note.textContent =
        "Gambar, tajuk dan teks telah disemak. " +
        "Sila periksa susun atur akhir dalam Print Preview.";

      container.append(note);
    }
  }

  function mount(story) {
    const editor = document.getElementById("editor");
    if (!editor || !story) return;

    document.getElementById(
      "bookQualityPanel"
    )?.remove();

    const panel = createPanel();

    const navigation = editor.querySelector(
      ".storybook-navigation"
    );

    if (navigation) {
      navigation.before(panel);
    } else {
      editor.prepend(panel);
    }

    document.getElementById(
      "qualityCheckButton"
    ).addEventListener("click", () => {
      renderResult(checkBook(story));
    });

    renderResult(checkBook(story));
  }

  function validateBeforeExport(story) {
    const result = checkBook(story);
    renderResult(result);

    if (!result.passed) {
      document.getElementById(
        "bookQualityPanel"
      )?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      return result;
    }

    return result;
  }

/* =====================================
   AUTO REFRESH QUALITY CHECKER V14.2
   ===================================== */

let currentStory = null;

const originalMount = mount;

function mountWithStory(story) {
  currentStory = story;
  originalMount(story);
}

function refresh(story = currentStory) {
  if (!story) return;

  currentStory = story;

  const result = checkBook(story);

  // Update existing panel without recreating it.
  if (document.getElementById('bookQualityPanel')) {
    renderResult(result);
  } else {
    mountWithStory(story);
  }

  return result;
}

window.StorylandQuality = {
  checkBook,
  mount: mountWithStory,
  refresh,
  validateBeforeExport
};


  console.log(
    "Storyland AI Quality Checker V10 ready"
  );
})();
