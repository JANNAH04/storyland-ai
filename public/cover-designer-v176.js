
/* ==========================================
   STORYLAND AI V17.6
   COVER DESIGN STUDIO
   ========================================== */

(function () {
  'use strict';

  const DEFAULTS = {
    template: 'fantasy',
    font: 'Fredoka',
    titleSize: 36,
    titleColor: '#ffffff',
    align: 'center',
    position: 'bottom',
    overlay: 65
  };

  const TEMPLATES = [
    ['fantasy', '🏰 Fantasy Classic'],
    ['pastel', '🌸 Sweet Pastel'],
    ['modern', '✨ Modern Storybook'],
    ['royal', '👑 Royal Gold'],
    ['night', '🌙 Dreamy Night'],
    ['minimal', '📖 Minimal']
  ];

  
/* ==========================================
   V18.6 — KIDS FONT COLLECTION
   ========================================== */

const FONTS = [
  ['Fredoka', 'Fredoka — Ceria & Bulat'],
  ['Baloo 2', 'Baloo 2 — Kartun Comel'],
  ['Bubblegum Sans', 'Bubblegum Sans — Bubble'],
  ['Chewy', 'Chewy — Fantasi'],
  ['Sniglet', 'Sniglet — Playful'],
  ['Comic Neue', 'Comic Neue — Komik'],
  ['Comfortaa', 'Comfortaa — Lembut'],
  ['Quicksand', 'Quicksand — Minimal Ceria'],
  ['Nunito', 'Nunito — Mudah Dibaca'],
  ['Lexend', 'Lexend — Bacaan Jelas'],
  ['ABeeZee', 'ABeeZee — Mesra Kanak-kanak'],
  ['Patrick Hand', 'Patrick Hand — Tulisan Tangan'],
  ['Varela Round', 'Varela Round — Bulat Kemas'],
  ['Georgia', 'Georgia — Klasik'],
  ['Trebuchet MS', 'Trebuchet — Moden'],
  ['Arial', 'Arial — Ringkas']
];


  const COLORS = [
    ['#ffffff', 'Putih'],
    ['#fff4d8', 'Krim'],
    ['#3b2855', 'Ungu Gelap'],
    ['#261e37', 'Hitam Lembut'],
    ['#ffe6f3', 'Pink Lembut'],
    ['#fff0a8', 'Emas Lembut']
  ];

  function make(tag, className = '', text) {
    const node = document.createElement(tag);

    if (className) {
      node.className = className;
    }

    if (text !== undefined) {
      node.textContent = text;
    }

    return node;
  }

  function clamp(value, min, max, fallback) {
    const number = Number(value);

    return Number.isFinite(number)
      ? Math.max(min, Math.min(max, number))
      : fallback;
  }

  function allowed(value, values, fallback) {
    return values.includes(value)
      ? value
      : fallback;
  }

  function normalize(input = {}) {
    if (!input || typeof input !== 'object') {
      input = {};
    }

    return {
      template: allowed(
        input.template,
        TEMPLATES.map(item => item[0]),
        DEFAULTS.template
      ),

      font: allowed(
        input.font,
        FONTS.map(item => item[0]),
        DEFAULTS.font
      ),

      titleSize: clamp(
        input.titleSize,
        22,
        60,
        DEFAULTS.titleSize
      ),

      titleColor: allowed(
        input.titleColor,
        COLORS.map(item => item[0]),
        DEFAULTS.titleColor
      ),

      align: allowed(
        input.align,
        ['left', 'center', 'right'],
        DEFAULTS.align
      ),

      position: allowed(
        input.position,
        ['top', 'middle', 'bottom'],
        DEFAULTS.position
      ),

      overlay: clamp(
        input.overlay,
        0,
        85,
        DEFAULTS.overlay
      )
    };
  }

  function getTemplateTone(template) {
    const tones = {
      fantasy: [42, 22, 75],
      pastel: [78, 40, 80],
      modern: [19, 38, 68],
      royal: [70, 42, 20],
      night: [13, 18, 57],
      minimal: [40, 40, 48]
    };

    return tones[template] || tones.fantasy;
  }

  function applyPreview(
    visual,
    overlay,
    title,
    design
  ) {
    const d = normalize(design);

    visual.dataset.coverTemplate = d.template;
    visual.dataset.coverPosition = d.position;
    visual.dataset.coverAlign = d.align;

    visual.style.setProperty(
      '--cover-title-size',
      `${d.titleSize}px`
    );

    visual.style.setProperty(
      '--cover-title-color',
      d.titleColor
    );

    const font =
      d.font === 'Georgia'
        ? 'Georgia, serif'
        : d.font === 'Trebuchet MS'
          ? '"Trebuchet MS", sans-serif'
          : `"${d.font}", sans-serif`;

    visual.style.setProperty(
      '--cover-title-font',
      font
    );

    title.style.fontFamily = font;
    title.style.fontSize = `${d.titleSize}px`;
    title.style.color = d.titleColor;
    title.style.textAlign = d.align;

    const [r, g, b] = getTemplateTone(d.template);
    const alpha = d.overlay / 100;

    overlay.style.background =
      `linear-gradient(
        180deg,
        rgba(${r},${g},${b},${Math.min(alpha * 0.25, 0.2)}) 0%,
        rgba(${r},${g},${b},${Math.min(alpha * 0.65, 0.6)}) 48%,
        rgba(${r},${g},${b},${alpha}) 100%
      )`;

    overlay.style.textAlign = d.align;
    overlay.style.alignItems =
      d.align === 'left'
        ? 'flex-start'
        : d.align === 'right'
          ? 'flex-end'
          : 'center';

    overlay.style.justifyContent =
      d.position === 'top'
        ? 'flex-start'
        : d.position === 'middle'
          ? 'center'
          : 'flex-end';

    return d;
  }

  function mount({
    story,
    visual,
    overlay,
    title,
    onChange
  }) {
    const panel = make(
      'section',
      'cover-designer-panel'
    );

    const heading = make(
      'h3',
      'cover-designer-heading',
      '🎨 AI Book Cover Designer'
    );

    const introduction = make(
      'p',
      'cover-designer-intro',
      'Reka cover profesional tanpa menggunakan kuota gambar AI.'
    );

    story.coverDesign = normalize(
      story.coverDesign
    );

    const design = story.coverDesign;

    const controls = make(
      'div',
      'cover-designer-controls'
    );

    const status = make(
      'p',
      'cover-designer-status',
      'Perubahan boleh dilihat terus pada cover.'
    );

    const templates = make(
      'div',
      'cover-template-grid'
    );

    function update(patch) {
      Object.assign(design, patch);

      story.coverDesign = normalize(design);

      Object.assign(
        design,
        story.coverDesign
      );

      applyPreview(
        visual,
        overlay,
        title,
        design
      );

      if (typeof onChange === 'function') {
        onChange(story.coverDesign);
      }

      status.textContent =
        '✅ Design dikemas kini. Tekan Simpan Buku.';
    }

    function selectInput(
      labelText,
      options,
      initial,
      property
    ) {
      const label = make(
        'label',
        'cover-designer-field'
      );

      label.append(
        make('span', '', labelText)
      );

      const select = make('select');

      options.forEach(([value, name]) => {
        const option = make(
          'option',
          '',
          name
        );

        option.value = value;
        select.append(option);
      });

      select.value = initial;

      select.addEventListener('change', () => {
        update({
          [property]: select.value
        });
      });

      label.append(select);

      return label;
    }

    TEMPLATES.forEach(([value, name]) => {
      const button = make(
        'button',
        'cover-template-button',
        name
      );

      button.type = 'button';
      button.dataset.value = value;

      button.addEventListener('click', () => {
        update({ template: value });
        syncTemplates();
      });

      templates.append(button);
    });

    function syncTemplates() {
      templates.querySelectorAll('button')
        .forEach(button => {
          const active =
            button.dataset.value === design.template;

          button.classList.toggle(
            'active',
            active
          );

          button.setAttribute(
            'aria-pressed',
            String(active)
          );
        });
    }

    syncTemplates();

    const fontControl = selectInput(
      'Jenis Font Tajuk',
      FONTS,
      design.font,
      'font'
    );

    const colorControl = selectInput(
      'Warna Tajuk',
      COLORS,
      design.titleColor,
      'titleColor'
    );

    const alignControl = selectInput(
      'Penjajaran Tajuk',
      [
        ['left', 'Kiri'],
        ['center', 'Tengah'],
        ['right', 'Kanan']
      ],
      design.align,
      'align'
    );

    const positionControl = selectInput(
      'Kedudukan Tajuk',
      [
        ['top', 'Atas'],
        ['middle', 'Tengah Cover'],
        ['bottom', 'Bawah']
      ],
      design.position,
      'position'
    );

    function sliderControl(
      labelText,
      property,
      min,
      max,
      step,
      suffix
    ) {
      const wrapper = make(
        'label',
        'cover-designer-field'
      );

      const header = make(
        'div',
        'cover-slider-header'
      );

      const name = make(
        'span',
        '',
        labelText
      );

      const valueLabel = make(
        'strong',
        '',
        String(design[property]) + suffix
      );

      header.append(
        name,
        valueLabel
      );

      const slider = make('input');

      slider.type = 'range';
      slider.min = String(min);
      slider.max = String(max);
      slider.step = String(step);
      slider.value = String(design[property]);

      slider.addEventListener('input', () => {
        const value = Number(slider.value);

        valueLabel.textContent =
          value + suffix;

        update({
          [property]: value
        });
      });

      wrapper.append(
        header,
        slider
      );

      return wrapper;
    }

    const sizeControl = sliderControl(
      'Saiz Tajuk',
      'titleSize',
      22,
      60,
      1,
      'px'
    );

    const overlayControl = sliderControl(
      'Kegelapan Overlay',
      'overlay',
      0,
      85,
      5,
      '%'
    );

    const reset = make(
      'button',
      'cover-designer-reset',
      '↺ Reset Design Cover'
    );

    reset.type = 'button';

    reset.addEventListener('click', () => {
      update(DEFAULTS);

      // Rebuild controls so their displayed
      // values match the reset settings.
      const replacement = mount({
        story,
        visual,
        overlay,
        title,
        onChange
      });

      panel.replaceWith(replacement);
    });

    controls.append(
      fontControl,
      colorControl,
      alignControl,
      positionControl,
      sizeControl,
      overlayControl
    );

    panel.append(
      heading,
      introduction,
      make(
        'p',
        'cover-template-label',
        'Pilih Template Cover'
      ),
      templates,
      controls,
      reset,
      status
    );

    applyPreview(
      visual,
      overlay,
      title,
      story.coverDesign
    );

    return panel;
  }

  window.StorylandCoverDesigner = {
    version: '17.6',
    defaults: { ...DEFAULTS },
    normalize,
    applyPreview,
    mount
  };

  console.log(
    'Storyland Cover Designer V17.6 loaded'
  );
})();
