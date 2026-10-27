
/* ==================================================
   STORYLAND AI V18.7
   ANTARA MUKA BAHASA MELAYU MALAYSIA

   - Terjemah teks UI sedia ada
   - Sokong komponen dinamik
   - Kekalkan data buku dan prompt AI
   - Tiada panggilan API
   ================================================== */

(function () {
  'use strict';

  const VERSION = '18.7';
  const LANGUAGE = 'ms-MY';

  /*
   * Only translate interface labels.
   * Do not translate book content, user input,
   * AI illustration descriptions or code values.
   */

  const DICTIONARY = {
    // Main interface
    'Dashboard': 'Papan Pemuka',
    'Home': 'Laman Utama',
    'Library': 'Perpustakaan',
    'My Library': 'Perpustakaan Saya',
    'My Books': 'Buku Saya',
    'Book Library': 'Perpustakaan Buku',
    'Create Story': 'Cipta Cerita',
    'Create New Story': 'Cipta Cerita Baharu',
    'Generate Story': 'Jana Cerita',
    'Generate Story with Gemini': 'Jana Cerita dengan Gemini',
    'Story Title': 'Tajuk Cerita',
    'Story Idea': 'Idea Cerita',
    'Story Pages': 'Halaman Cerita',
    'Page Count': 'Bilangan Halaman',
    'Age Group': 'Kumpulan Umur',
    'Language': 'Bahasa',
    'Refresh': 'Muat Semula',
    'Reload': 'Muat Semula',
    'Search': 'Cari',
    'Search books': 'Cari buku',
    'Loading': 'Sedang Memuatkan',
    'Cancel': 'Batal',
    'Confirm': 'Sahkan',
    'Close': 'Tutup',
    'Continue': 'Teruskan',
    'Back': 'Kembali',
    'Next': 'Seterusnya',
    'Previous': 'Sebelum',
    'Done': 'Selesai',
    'Success': 'Berjaya',
    'Error': 'Ralat',
    'Warning': 'Amaran',
    'Settings': 'Tetapan',
    'Save': 'Simpan',
    'Save Changes': 'Simpan Perubahan',
    'Saved': 'Disimpan',
    'Saving': 'Sedang Menyimpan',
    'Edit': 'Sunting',
    'Delete': 'Padam',
    'Duplicate': 'Salin',
    'Copy': 'Salin',
    'Preview': 'Pratonton',
    'Book Preview': 'Pratonton Buku',
    'Print': 'Cetak',
    'Export': 'Eksport',
    'Export PDF': 'Eksport PDF',
    'Export Book PDF': 'Eksport Buku PDF',
    'Download': 'Muat Turun',
    'Upload': 'Muat Naik',
    'Choose File': 'Pilih Fail',
    'No file chosen': 'Tiada fail dipilih',
    'Book Size': 'Saiz Buku',
    'Paper Size': 'Saiz Kertas',

    // Accounts
    'Login': 'Log Masuk',
    'Log In': 'Log Masuk',
    'Sign In': 'Log Masuk',
    'Logout': 'Log Keluar',
    'Log Out': 'Log Keluar',
    'Register': 'Daftar',
    'Sign Up': 'Daftar Akaun',
    'Create Account': 'Cipta Akaun',
    'Email': 'E-mel',
    'Password': 'Kata Laluan',
    'Confirm Password': 'Sahkan Kata Laluan',
    'Full Name': 'Nama Penuh',
    'Forgot Password': 'Lupa Kata Laluan',
    'Welcome Back': 'Selamat Kembali',
    'Account': 'Akaun',
    'My Account': 'Akaun Saya',

    // Story editor
    'Storybook Editor': 'Editor Buku Cerita',
    'Book Editor': 'Editor Buku',
    'Book Design': 'Reka Bentuk Buku',
    'Page Design': 'Reka Bentuk Halaman',
    'Layout': 'Susun Atur',
    'Page Layout': 'Susun Atur Halaman',
    'Image Top': 'Gambar Atas',
    'Text Top': 'Teks Atas',
    'Side by Side': 'Sebelah-menyebelah',
    'Top Image': 'Gambar Atas',
    'Bottom Image': 'Gambar Bawah',
    'Theme': 'Tema',
    'Decoration': 'Hiasan',
    'Frame': 'Bingkai',
    'Minimal': 'Minimal',
    'Fantasy': 'Fantasi',
    'Garden': 'Taman',
    'Royal': 'Diraja',
    'Sky': 'Langit',
    'Image Size': 'Saiz Gambar',
    'Image Alignment': 'Penjajaran Gambar',
    'Left': 'Kiri',
    'Center': 'Tengah',
    'Right': 'Kanan',
    'Words': 'Perkataan',
    'Word Count': 'Bilangan Perkataan',
    'Reading Font': 'Font Bacaan',
    'Font Type': 'Jenis Font',
    'Font Family': 'Jenis Font',
    'Font Size': 'Saiz Font',
    'Text Size': 'Saiz Tulisan',
    'Text Color': 'Warna Tulisan',
    'Paper Color': 'Warna Kertas',
    'Background Color': 'Warna Latar',
    'Line Spacing': 'Jarak Baris',
    'Text Alignment': 'Penjajaran Teks',
    'Edit Mode': 'Mod Sunting',
    'Preview Mode': 'Mod Pratonton',

    // Image Studio
    'AI Image Studio': 'Studio Gambar AI',
    'Image Studio': 'Studio Gambar',
    'Generate Image': 'Jana Gambar',
    'Generate AI Image': 'Jana Gambar AI',
    'Generate Illustration': 'Jana Ilustrasi',
    'Generate Illustration AI': 'Jana Ilustrasi AI',
    'Regenerate Image': 'Jana Semula Gambar',
    'Regenerate Cover': 'Jana Semula Kulit Buku',
    'Generate Cover': 'Jana Kulit Buku',
    'Generate AI Cover': 'Jana Kulit Buku AI',
    'Upload Image': 'Muat Naik Gambar',
    'Upload Cover Image': 'Muat Naik Gambar Kulit Buku',
    'Upload Page Image': 'Muat Naik Gambar Halaman',
    'Image Style': 'Gaya Ilustrasi',
    'Illustration Style': 'Gaya Ilustrasi',
    'Custom Image Prompt': 'Arahan Gambar Tambahan',
    'Custom Prompt': 'Arahan Tambahan',
    'Additional Visual Direction': 'Arahan Visual Tambahan',
    'Daily Image Limit': 'Had Gambar Harian',
    'Daily Quota': 'Kuota Harian',
    'Image Quota': 'Kuota Gambar',
    'Remaining Images': 'Baki Gambar',
    'Images Remaining': 'Baki Gambar',
    'Image Generation': 'Penjanaan Gambar',
    'Cartoon': 'Kartun',
    'Watercolor': 'Cat Air',
    'Anime': 'Anime',
    'Image Preview': 'Pratonton Gambar',

    // Cover Studio
    'AI Book Cover Designer': 'Pereka Kulit Buku AI',
    'Book Cover Designer': 'Pereka Kulit Buku',
    'Cover Designer': 'Pereka Kulit Buku',
    'Premium Cover': 'Kulit Buku Premium',
    'Cover Page': 'Halaman Kulit Buku',
    'Cover Image': 'Gambar Kulit Buku',
    'Book Cover': 'Kulit Buku',
    'Cover Template': 'Templat Kulit Buku',
    'Choose Cover Template': 'Pilih Templat Kulit Buku',
    'Choose Template': 'Pilih Templat',
    'Title Font': 'Font Tajuk',
    'Title Size': 'Saiz Tajuk',
    'Title Color': 'Warna Tajuk',
    'Title Alignment': 'Penjajaran Tajuk',
    'Title Position': 'Kedudukan Tajuk',
    'Overlay Darkness': 'Kegelapan Lapisan',
    'Overlay': 'Lapisan Warna',
    'Reset Cover Design': 'Tetapkan Semula Reka Bentuk Kulit',
    'Book Author': 'Penulis Buku',
    'Author': 'Penulis',
    'Subtitle': 'Subtajuk',
    'Book Subtitle': 'Subtajuk Buku',
    'Gemini Cover Illustration Idea':
      'Idea Ilustrasi Kulit Buku daripada Gemini',
    'Cover Illustration Idea': 'Idea Ilustrasi Kulit Buku',
    'Generate Cover Idea with Gemini':
      'Jana Idea Kulit Buku dengan Gemini',
    'Fantasy Classic': 'Fantasi Klasik',
    'Sweet Pastel': 'Pastel Ceria',
    'Modern Storybook': 'Buku Cerita Moden',
    'Royal Gold': 'Emas Diraja',
    'Dreamy Night': 'Malam Berfantasi',

    // Character Studio
    'Character Bible': 'Panduan Identiti Watak',
    'Character Guide': 'Panduan Watak',
    'Character Consistency Pro': 'Studio Konsistensi Watak',
    'Character Studio': 'Studio Watak',
    'Character Profile': 'Profil Watak',
    'Character Profiles': 'Profil Watak',
    'Character Name': 'Nama Watak',
    'Character Role': 'Peranan Watak',
    'Character Appearance': 'Rupa Watak',
    'Character Description': 'Penerangan Watak',
    'Character Reference': 'Rujukan Watak',
    'Reference Image': 'Gambar Rujukan',
    'Upload Reference Image': 'Muat Naik Gambar Rujukan',
    'Add Character': 'Tambah Watak',
    'Remove Character': 'Buang Watak',
    'Delete Character': 'Padam Watak',
    'Save Character': 'Simpan Watak',
    'Save Character Bible': 'Simpan Panduan Identiti Watak',
    'Lock Character Identity': 'Kunci Identiti Watak',
    'Main Character': 'Watak Utama',
    'Side Character': 'Watak Sampingan',
    'Animal': 'Haiwan',

    // Smart Layout
    'Smart Book Layout': 'Susun Atur Buku Pintar',
    'Smart Layout': 'Susun Atur Pintar',
    'Auto Layout': 'Susun Atur Automatik',
    'Apply Layout': 'Gunakan Susun Atur',
    'Apply to Page': 'Gunakan pada Halaman',
    'Apply to All Pages': 'Gunakan pada Semua Halaman',
    'Layout Suggestion': 'Cadangan Susun Atur',
    'Suggested Layout': 'Susun Atur Dicadangkan',
    'Arrange This Page': 'Susun Halaman Ini',
    'Arrange All Pages': 'Susun Semua Halaman',
    'Reason': 'Sebab Cadangan',

    // History / Undo Redo
    'Image History': 'Sejarah Gambar',
    'Image History & Restore': 'Sejarah dan Pemulihan Gambar',
    'History': 'Sejarah',
    'Restore Image': 'Pulihkan Gambar',
    'Restore': 'Pulihkan',
    'Use Again': 'Gunakan Semula',
    'Previous Version': 'Versi Terdahulu',
    'Current Version': 'Versi Semasa',
    'No Image History': 'Tiada Sejarah Gambar',
    'Undo': 'Buat Asal',
    'Redo': 'Buat Semula',
    'Undo & Redo': 'Buat Asal dan Buat Semula',
    'History Steps': 'Langkah Sejarah',

    // Backup / Draft / Conflicts
    'Book Backup Center': 'Pusat Sandaran Buku',
    'Backup Center': 'Pusat Sandaran',
    'Backup': 'Sandaran',
    'Backups': 'Senarai Sandaran',
    'Backup Now': 'Sandarkan Sekarang',
    'Backup Book Now': 'Sandarkan Buku Sekarang',
    'Manual Backup': 'Sandaran Manual',
    'Automatic Backup': 'Sandaran Automatik',
    'Backup History': 'Sejarah Sandaran',
    'Restore Backup': 'Pulihkan Sandaran',
    'Before Restore': 'Sebelum Pemulihan',
    'Auto-Save': 'Simpan Automatik',
    'Auto-Save Protection': 'Perlindungan Simpan Automatik',
    'Draft Recovery': 'Pemulihan Draf',
    'Recover Draft': 'Pulihkan Draf',
    'Restore Draft': 'Pulihkan Draf',
    'Discard Draft': 'Buang Draf',
    'Use Server Version': 'Gunakan Versi Pelayan',
    'Reload Server Version': 'Muat Versi Pelayan',
    'Unsaved Draft Found': 'Draf Belum Disimpan Ditemui',
    'Unsaved Changes': 'Perubahan Belum Disimpan',
    'Conflict Detected': 'Konflik Suntingan Dikesan',
    'Editing Conflict Detected': 'Konflik Suntingan Dikesan',
    'Multi-Device Conflict': 'Konflik Antara Peranti',
    'Save as Copy': 'Simpan Sebagai Salinan',
    'Save Draft as New Book': 'Simpan Draf Sebagai Buku Baharu',
    'Save Copy': 'Simpan Salinan',
    'Reload Book': 'Muat Semula Buku',
    'Retry': 'Cuba Semula',

    // Quality
    'Book Quality Checker': 'Pemeriksa Kualiti Buku',
    'Quality Checker': 'Pemeriksa Kualiti',
    'Check Book': 'Semak Buku',
    'Check Book Now': 'Semak Buku Sekarang',
    'Check Quality': 'Semak Kualiti',
    'Missing Image': 'Gambar Belum Ada',
    'Missing Cover': 'Kulit Buku Belum Ada',
    'Too Many Words': 'Terlalu Banyak Perkataan',
    'All Checks Passed': 'Semua Semakan Lulus',
    'Moral of the Story': 'Pengajaran Cerita',

    // Common statuses
    'Please wait': 'Sila tunggu',
    'Generating': 'Sedang Menjana',
    'Uploading': 'Sedang Memuat Naik',
    'Saving changes': 'Sedang Menyimpan Perubahan',
    'Changes saved': 'Perubahan Berjaya Disimpan',
    'No changes to save': 'Tiada Perubahan untuk Disimpan',
    'Something went wrong': 'Sesuatu Ralat Berlaku',
    'Try Again': 'Cuba Lagi',
    'No books yet': 'Belum Ada Buku',
    'No backups found': 'Tiada Sandaran Ditemui',
    'No previous images': 'Tiada Gambar Terdahulu',
    'Not available': 'Tidak Tersedia'
  };

  // Only a controlled selection of UI elements.
  const TEXT_SELECTOR = [
    'button',
    'label',
    'summary',
    '.nav-label',
    '.cover-badge',
    '.eyebrow',
    '.ai-studio-heading',
    '.cover-designer-heading',
    '.character-bible-panel h3',
    '.character-studio-panel h3',
    '.image-history-heading',
    '.book-backup-panel h3',
    '.smart-layout-heading',
    '.storybook-tools-title',
    '.visual-tools-heading',
    '.draft-recovery-panel h3',
    '.storyland-conflict-panel h3',
    '.quality-heading h3',
    'option'
  ].join(',');

  const EXCLUDED_SELECTOR = [
    '.storybook-text-area',
    '.storybook-text-box',
    '.page-story',
    '.storybook-page-body p',
    '.premium-cover-title',
    '.premium-cover-subtitle',
    '.premium-cover-author',
    '.cover-gemini-idea-box',
    '.ai-custom-prompt',
    '.character-bible-input',
    '.character-card textarea',
    '.image-history-label',
    'script',
    'style',
    'code',
    'pre'
  ].join(',');

  function translate(value) {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();

    if (!trimmed) {
      return value;
    }

    // Preserve decorative emoji and surrounding whitespace.
    const translated = DICTIONARY[trimmed];

    if (translated) {
      return value.replace(trimmed, translated);
    }

    // Support UI labels such as "🎨 Image History".
    const found = trimmed.match(
      /^([^\p{L}\p{N}]*)(.+)$/u
    );

    if (found) {
      const [, prefix, content] = found;
      const replacement = DICTIONARY[content.trim()];

      if (replacement) {
        return value.replace(
          trimmed,
          prefix + replacement
        );
      }
    }

    return value;
  }

  function translateOption(option) {
    if (!(option instanceof HTMLOptionElement)) {
      return;
    }

    const originalValue = option.value;

    const updated = translate(option.textContent);

    if (updated !== option.textContent) {
      option.textContent = updated;

      // Do not change the underlying option value.
      option.value = originalValue;
    }
  }

  function translateElement(element) {
    if (!(element instanceof Element)) {
      return;
    }

    if (element.matches(EXCLUDED_SELECTOR) ||
        element.closest(EXCLUDED_SELECTOR)) {
      return;
    }

    if (element instanceof HTMLOptionElement) {
      translateOption(element);
      return;
    }

    if (!element.matches(TEXT_SELECTOR)) {
      return;
    }

    // Translate only direct text nodes, not entire
    // component trees, to preserve event listeners.
    for (const node of element.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) {
        continue;
      }

      const updated = translate(node.textContent);

      if (updated !== node.textContent) {
        node.textContent = updated;
      }
    }

    for (const attribute of [
      'title',
      'aria-label'
    ]) {
      const current = element.getAttribute(attribute);

      if (current) {
        const updated = translate(current);

        if (updated !== current) {
          element.setAttribute(attribute, updated);
        }
      }
    }
  }

  function translateInputs(root) {
    const elements = root.querySelectorAll?.(
      'input[placeholder],textarea[placeholder]'
    ) || [];

    for (const input of elements) {
      if (input.matches(EXCLUDED_SELECTOR)) {
        continue;
      }

      const current = input.placeholder;
      const updated = translate(current);

      if (updated !== current) {
        input.placeholder = updated;
      }
    }
  }

  function translateTree(root = document) {
    if (root instanceof Element) {
      translateElement(root);
    }

    const elements = root.querySelectorAll?.(
      TEXT_SELECTOR
    ) || [];

    for (const element of elements) {
      translateElement(element);
    }

    translateInputs(root);
  }

  let pending = false;

  function scheduleTranslation() {
    if (pending) return;

    pending = true;

    queueMicrotask(() => {
      pending = false;
      translateTree(document);
    });
  }

  function start() {
    document.documentElement.lang = 'ms';

    translateTree(document);

    const observer = new MutationObserver(records => {
      const relevant = records.some(
        record =>
          record.type === 'childList' ||
          record.type === 'characterData'
      );

      if (relevant) {
        scheduleTranslation();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    console.log(
      `Storyland AI Bahasa Melayu V${VERSION} aktif`
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      start,
      { once: true }
    );
  } else {
    start();
  }

  window.StorylandBM = {
    version: VERSION,
    language: LANGUAGE,
    translate,
    translateTree,
    dictionary: DICTIONARY
  };

})();
