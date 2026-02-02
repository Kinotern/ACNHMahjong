const ADDRESS_CONFIG = {
  baseTop: 0xB27BB758,
  baseBottom: 0xB27BB6A0,
  rowStride: 0x50,
  colStride: 0x8,
  playerStride: 0x131F70,
  rows: 4,
  cols: 10,
  maxPlayers: 8,
};

const DIY_MARKER = 0x000016A2;
const EMPTY_ITEM = 0x0000FFFE;

const IMAGE_NAME_OVERRIDES = [
  { match: (name) => name.startsWith('PltMoney'), target: 'PltMoney' },
  { match: (name) => name.startsWith('PltCedar'), target: 'PltConifer' },
  { match: (name) => name.startsWith('PltOak'), target: 'PltOak' },
  { match: (name) => name.startsWith('PltPalm'), target: 'PltPalm' },
  { match: (name) => name.startsWith('PltBamboo'), target: 'PltBamboo' },
  { match: (name) => name.startsWith('PltApple'), target: 'PltApple' },
  { match: (name) => name === 'PltOrange0', target: 'PltApple' },
  { match: (name) => name.startsWith('PltOrange'), target: 'PltOrange' },
  { match: (name) => name.startsWith('PltPear'), target: 'PltPear' },
  { match: (name) => name.startsWith('PltPeach'), target: 'PltPeach' },
  { match: (name) => name.startsWith('PltCherry'), target: 'PltPeach' },
  {
    match: (name) => name.startsWith('PltCosmos') && /\d$/.test(name),
    target: (name) => stripTrailingDigits(name),
  },
  { match: (name) => name.startsWith('PltSquashYellow'), target: 'PltSquashYellow' },
  { match: (name) => name.startsWith('PltSquashGreen'), target: 'PltSquashGreen' },
  { match: (name) => name.startsWith('PltSquashWhite'), target: 'PltSquashWhite' },
  {
    match: (name) =>
      name.startsWith('PltSquash') && !name.startsWith('PltSquashOrange'),
    target: 'PltSquashOrange',
  },
];

const state = {
  itemsById: new Map(),
  recipesById: new Map(),
  flowersById: new Map(),
  variantsByName: new Set(),
  ready: false,
  dataWarning: '',
};

const addressToSlot = buildAddressMap();

const gridEl = document.getElementById('grid');
const statsEl = document.getElementById('stats');
const parseBtn = document.getElementById('parseBtn');
const inputEl = document.getElementById('codeInput');
const langSelect = document.getElementById('langSelect');
const autoParseEl = document.getElementById('autoParse');
const pageSelectEl = document.getElementById('pageSelect');
const pagerEl = document.getElementById('pager');
const pageJumpEl = document.getElementById('pageJump');
const pageJumpBtnEl = document.getElementById('pageJumpBtn');
const noticeBackdropEl = document.getElementById('noticeBackdrop');
const noticeCloseEl = document.getElementById('noticeClose');
const refundBtnEl = document.getElementById('refundBtn');
const refundTipEl = document.getElementById('refundTip');
const noticeLicenseEl = document.getElementById('noticeLicense');

let lastParsedSignature = '';
let parseTimer = null;
let pages = [{ title: '第1页', text: '' }];
let currentPageIndex = 0;
let renderToken = 0;

init();

function init() {
  showNotice();
  renderGrid(new Array(ADDRESS_CONFIG.rows * ADDRESS_CONFIG.cols).fill(null));
  statsEl.textContent = '正在加载数据…';
  loadData()
    .then(() => {
      state.ready = true;
      parseAndRender();
    })
    .catch((err) => {
      console.error(err);
      state.ready = true;
      state.dataWarning = buildDataWarning(err);
      parseAndRender();
    });

  parseBtn.addEventListener('click', parseAndRender);
  inputEl.addEventListener('input', scheduleAutoParse);
  langSelect.addEventListener('change', parseAndRender);
  if (autoParseEl) {
    autoParseEl.addEventListener('change', () => {
      if (autoParseEl.checked) scheduleAutoParse();
    });
  }
  if (pageSelectEl) {
    pageSelectEl.addEventListener('change', () => {
      currentPageIndex = Number(pageSelectEl.value) || 0;
      parseAndRender(true);
    });
  }
  if (pageJumpEl && pageJumpBtnEl) {
    const doJump = () => {
      const value = Number(pageJumpEl.value);
      if (!Number.isFinite(value)) return;
      const target = Math.min(Math.max(value, 1), pages.length);
      currentPageIndex = target - 1;
      parseAndRender(true);
    };
    pageJumpBtnEl.addEventListener('click', doJump);
    pageJumpEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') doJump();
    });
  }

  if (noticeBackdropEl && noticeCloseEl) {
    noticeCloseEl.addEventListener('click', hideNotice);
    noticeBackdropEl.addEventListener('click', (event) => {
      if (event.target === noticeBackdropEl) hideNotice();
    });
  }
  if (refundBtnEl && refundTipEl) {
    refundBtnEl.addEventListener('click', () => {
      refundTipEl.classList.add('show');
      if (noticeLicenseEl) noticeLicenseEl.classList.add('show');
    });
  }
}

function buildAddressMap() {
  const map = new Map();
  for (let player = 0; player < ADDRESS_CONFIG.maxPlayers; player += 1) {
    const playerOffset = player * ADDRESS_CONFIG.playerStride;
    for (let row = 0; row < ADDRESS_CONFIG.rows; row += 1) {
      const base =
        (row < 2 ? ADDRESS_CONFIG.baseTop : ADDRESS_CONFIG.baseBottom) +
        (row % 2) * ADDRESS_CONFIG.rowStride +
        playerOffset;
      for (let col = 0; col < ADDRESS_CONFIG.cols; col += 1) {
        const addr = base + col * ADDRESS_CONFIG.colStride;
        const slot = row * ADDRESS_CONFIG.cols + col;
        map.set(addr, { slot, row, col, player: player + 1 });
      }
    }
  }
  return map;
}

async function loadData() {
  const [items, recipes, flowers, variations] = await Promise.all([
    fetchCsv('csv/items.csv'),
    fetchCsv('csv/recipes.csv'),
    fetchCsv('csv/flowers.csv'),
    fetchCsv('csv/variations.csv').catch(() => []),
  ]);

  items.forEach((row) => {
    const id = parseHex(row.id, 4);
    if (Number.isFinite(id)) state.itemsById.set(id, row);
  });

  recipes.forEach((row) => {
    const id = parseHex(row.id, 4);
    if (Number.isFinite(id)) state.recipesById.set(id, row);
  });

  flowers.forEach((row) => {
    const id = parseHex(row.id, 4);
    if (Number.isFinite(id)) state.flowersById.set(id, row);
  });

  variations.forEach((row) => {
    if (row.iName) state.variantsByName.add(row.iName);
  });
}

async function fetchCsv(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(path, { signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to load ${path}`);
    const text = await res.text();
    return parseCsv(text);
  } finally {
    clearTimeout(timer);
  }
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let header = null;
  const rows = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = rawLine.split(';').map((cell) => cell.trim());
    if (!header) {
      header = cols.filter((cell) => cell !== '');
      continue;
    }
    const row = {};
    for (let i = 0; i < header.length; i += 1) {
      row[header[i]] = cols[i] ? cols[i].trim() : '';
    }
    rows.push(row);
  }
  return rows;
}

function parseAndRender() {
  if (!state.ready) {
    statsEl.textContent = '正在加载数据…';
    return;
  }

  const text = inputEl.value;
  pages = splitPages(text);
  clampCurrentPage();
  renderPageOptions();
  renderPager();
  const pageText = pages[currentPageIndex]?.text || '';
  const signature = `${langSelect.value}::${currentPageIndex}::${pageText}`;
  if (signature === lastParsedSignature) return;
  lastParsedSignature = signature;

  if (!state.dataWarning) {
    state.dataWarning = buildDataWarningIfEmpty();
  }

  statsEl.textContent = '解析中…';
  const result = parseCodes(pageText);
  renderGrid(result.slots);

  const used = result.slots.filter(Boolean).length;
  let message = `识别 ${result.matched} 条代码，填充 ${used} 个格子，未识别 ${result.unmatched} 条。`;
  if (pages.length > 1) {
    message += ` 当前页 ${currentPageIndex + 1}/${pages.length}。`;
  }
  if (state.dataWarning) message += ` ${state.dataWarning}`;
  statsEl.textContent = message;
}

function scheduleAutoParse() {
  if (!autoParseEl || !autoParseEl.checked) return;
  if (parseTimer) clearTimeout(parseTimer);
  parseTimer = setTimeout(parseAndRender, 300);
}

function splitPages(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const result = [];
  let current = { title: '第1页', lines: [] };
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\[(.+)]$/);
    if (match) {
      if (current.lines.join('').trim().length > 0) {
        result.push({
          title: current.title,
          text: current.lines.join('\n'),
        });
      }
      current = { title: match[1], lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.join('').trim().length > 0) {
    result.push({ title: current.title, text: current.lines.join('\n') });
  }
  if (!result.length) {
    result.push({ title: '第1页', text: '' });
  }
  return result;
}

function renderPageOptions() {
  if (!pageSelectEl) return;
  pageSelectEl.innerHTML = '';
  pages.forEach((page, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = page.title || `第${index + 1}页`;
    if (index === currentPageIndex) option.selected = true;
    pageSelectEl.appendChild(option);
  });
  pageSelectEl.disabled = pages.length <= 1;
  if (pageJumpEl) {
    pageJumpEl.max = String(pages.length || 1);
    pageJumpEl.value = '';
  }
}

function clampCurrentPage() {
  if (currentPageIndex < 0) currentPageIndex = 0;
  if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
}

function showNotice() {
  if (!noticeBackdropEl) return;
  document.body.classList.add('modal-open');
  noticeBackdropEl.classList.add('show');
  noticeBackdropEl.setAttribute('aria-hidden', 'false');
}

function hideNotice() {
  if (!noticeBackdropEl) return;
  document.body.classList.remove('modal-open');
  noticeBackdropEl.classList.remove('show');
  noticeBackdropEl.setAttribute('aria-hidden', 'true');
}

function renderPager() {
  if (!pagerEl) return;
  pagerEl.innerHTML = '';
  if (pages.length <= 1) return;

  const buttons = [];
  const total = pages.length;
  const current = currentPageIndex + 1;

  if (total <= 7) {
    for (let i = 1; i <= total; i += 1) buttons.push(i);
  } else {
    const windowStart = Math.max(1, current - 3);
    const windowEnd = Math.min(total, current + 3);
    if (windowStart > 1) {
      buttons.push(1);
      if (windowStart > 2) buttons.push('...');
    }
    for (let i = windowStart; i <= windowEnd; i += 1) buttons.push(i);
    if (windowEnd < total) {
      if (windowEnd < total - 1) buttons.push('...');
      buttons.push(total);
    }
  }

  for (const token of buttons) {
    if (token === '...') {
      const span = document.createElement('span');
      span.className = 'page-ellipsis';
      span.textContent = '...';
      pagerEl.appendChild(span);
      continue;
    }
    const idx = token - 1;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn';
    if (idx === currentPageIndex) btn.classList.add('active');
    btn.textContent = String(token);
    btn.addEventListener('click', () => {
      currentPageIndex = idx;
      parseAndRender(true);
    });
    pagerEl.appendChild(btn);
  }
}

function parseCodes(text) {
  const slots = new Array(ADDRESS_CONFIG.rows * ADDRESS_CONFIG.cols).fill(null);
  const regex = /([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})\s+([0-9A-Fa-f]{8})/g;
  let match = null;
  let matched = 0;
  let unmatched = 0;

  while ((match = regex.exec(text)) !== null) {
    const addr = parseInt(match[2], 16);
    const slotInfo = addressToSlot.get(addr);
    if (!slotInfo) {
      unmatched += 1;
      continue;
    }

    const third = parseInt(match[3], 16);
    const fourth = parseInt(match[4], 16);
    if (fourth === EMPTY_ITEM) {
      matched += 1;
      slots[slotInfo.slot] = null;
      continue;
    }
    const entry = buildEntry(third, fourth, match, slotInfo);
    slots[slotInfo.slot] = entry;
    matched += 1;
  }

  return { slots, matched, unmatched };
}

function buildEntry(third, fourth, rawMatch, slotInfo) {
  let type = 'item';
  let diy = false;
  let flower = false;
  let record = null;
  let iName = '';
  let display = '';
  let quantity = null;

  if (fourth === DIY_MARKER) {
    type = 'diy';
    diy = true;
    record = state.recipesById.get(third);
    if (record) {
      iName = record.iName || '';
      display = getDisplayName(record);
    }
  } else if ((third & 0x00800000) !== 0 && state.flowersById.has(fourth)) {
    type = 'flower';
    flower = true;
    record = state.flowersById.get(fourth);
    if (record) {
      iName = record.iName || '';
      display = getDisplayName(record);
    }
  } else {
    record = state.itemsById.get(fourth);
    if (record) {
      iName = record.iName || '';
      display = getDisplayName(record);
    }
  }

  if (!display) display = '未知物品';

  const hasVariants =
    !diy && !flower && record && state.variantsByName.has(record.iName);
  if (!diy && !flower && !hasVariants && Number.isFinite(third) && third <= 0x63) {
    quantity = third + 1;
  }

  const variantIndex = !diy && !flower ? third : null;

  return {
    type,
    diy,
    flower,
    record,
    iName,
    display,
    quantity,
    third,
    fourth,
    raw: {
      op: rawMatch[1].toUpperCase(),
      addr: rawMatch[2].toUpperCase(),
      third: rawMatch[3].toUpperCase(),
      fourth: rawMatch[4].toUpperCase(),
    },
    variantIndex,
    slotInfo,
  };
}

function getDisplayName(record) {
  const lang = langSelect.value;
  if (!record) return '';
  return record[lang] || record.schi || record.eng || '';
}

function renderGrid(slots) {
  const token = ++renderToken;
  gridEl.classList.add('loading');
  const fragment = document.createDocumentFragment();
  const images = [];
  slots.forEach((entry, index) => {
    const card = document.createElement('div');
    card.className = 'slot';
    card.style.setProperty('--i', index);

    const slotLabel = document.createElement('div');
    slotLabel.className = 'slot-id';
    slotLabel.textContent = `#${index + 1}`;
    card.appendChild(slotLabel);

    if (!entry) {
      card.classList.add('empty');
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = '空';
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = '等待解析';
      card.appendChild(name);
      card.appendChild(meta);
      fragment.appendChild(card);
      return;
    }

    const img = document.createElement('img');
    const candidates = buildImageCandidates(entry.iName, entry.variantIndex);
    applyImageCandidates(img, candidates);
    img.alt = entry.display;
    images.push(img);

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = entry.display;

    const metaTop = document.createElement('div');
    metaTop.className = 'meta';
    if (entry.diy) {
      metaTop.textContent = `DIY 0x${entry.third.toString(16).toUpperCase().padStart(4, '0')}`;
    } else {
      metaTop.textContent = `ID 0x${entry.fourth.toString(16).toUpperCase().padStart(4, '0')}`;
    }

    const metaMid = document.createElement('div');
    metaMid.className = 'meta';
    if (entry.diy) {
      metaMid.textContent = '';
    } else if (entry.flower) {
      metaMid.textContent = `基因 0x${entry.third.toString(16).toUpperCase().padStart(8, '0')}`;
    } else if (Number.isFinite(entry.quantity)) {
      metaMid.textContent = `数量 ${entry.quantity} (0x${entry.third.toString(16).toUpperCase().padStart(8, '0')})`;
    } else {
      metaMid.textContent = `值 0x${entry.third.toString(16).toUpperCase().padStart(8, '0')}`;
    }

    const metaBottom = document.createElement('div');
    metaBottom.className = 'meta';
    metaBottom.textContent = `P${entry.slotInfo.player} R${entry.slotInfo.row + 1}C${entry.slotInfo.col + 1}`;

    if (entry.display === '未知物品') card.classList.add('unknown');

    if (entry.diy) {
      const badge = document.createElement('div');
      badge.className = 'badge';
      const badgeImg = document.createElement('img');
      badgeImg.src = 'ico/DIY.png';
      badgeImg.alt = 'DIY';
      badge.appendChild(badgeImg);
      card.appendChild(badge);
    }

    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(metaTop);
    card.appendChild(metaMid);
    card.appendChild(metaBottom);
    fragment.appendChild(card);
  });
  const doReplace = () => {
    if (token !== renderToken) return;
    gridEl.replaceChildren(fragment);
    gridEl.classList.remove('switch-out');
    gridEl.classList.add('switch-in');
    setTimeout(() => {
      if (token === renderToken) gridEl.classList.remove('switch-in');
    }, 180);
    waitImages(images, 600).then(() => {
      if (token === renderToken) gridEl.classList.remove('loading');
    });
  };

  if (gridEl.childElementCount > 0) {
    gridEl.classList.add('switch-out');
    gridEl.classList.remove('switch-in');
    setTimeout(doReplace, 160);
  } else {
    doReplace();
  }
}

function waitImages(images, timeoutMs) {
  if (!images.length) return Promise.resolve();
  return new Promise((resolve) => {
    let remaining = images.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
    };
    for (const img of images) {
      if (img.complete && img.naturalWidth > 0) {
        done();
      } else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    }
    if (timeoutMs > 0) setTimeout(resolve, timeoutMs);
  });
}

function buildImageCandidates(iName, variantIndex) {
  const list = [];
  if (iName) {
    const candidates = [];
    candidates.push(iName);
    if (!iName.startsWith('Ftr')) {
      candidates.push(normalizeImageName(iName));
      candidates.push(stripTrailingDigits(iName));
      if (iName.startsWith('Plt')) {
        const flwName = `Flw${iName.slice(3)}`;
        candidates.push(flwName);
        candidates.push(stripTrailingDigits(flwName));
      }
    }
    const unique = [];
    for (const name of candidates) {
      if (!name) continue;
      if (!unique.includes(name)) unique.push(name);
    }
    for (const name of unique) {
      if (Number.isFinite(variantIndex)) {
        const series = Math.floor(variantIndex / 8);
        const color = variantIndex % 8;
        const altIndexes = buildVariantIndexFallbacks(variantIndex);
        list.push(`img/${name}_Remake_${series}_${color}.png`);
        for (const alt of altIndexes) {
          list.push(`img/${name}_Remake_${alt}_0.png`);
          list.push(`img/${name}_Remake_0_${alt}.png`);
        }
      }
      list.push(`img/${name}.png`);
      list.push(`img/${name}_Remake_0_0.png`);
    }
  }
  list.push('ico/ERROR.png');
  return list;
}

function applyImageCandidates(img, candidates) {
  let idx = 0;
  const tryNext = () => {
    if (idx >= candidates.length) return;
    img.src = candidates[idx];
    idx += 1;
  };
  img.onerror = tryNext;
  tryNext();
}

function parseHex(value, width = 8) {
  if (!value) return NaN;
  const clean = value.trim().replace(/^0x/i, '');
  if (!clean) return NaN;
  const parsed = parseInt(clean, 16);
  if (!Number.isFinite(parsed)) return NaN;
  return parsed;
}

function normalizeImageName(iName) {
  if (!iName) return '';
  for (const rule of IMAGE_NAME_OVERRIDES) {
    if (rule.match(iName)) {
      return typeof rule.target === 'function' ? rule.target(iName) : rule.target;
    }
  }
  return iName;
}

function stripTrailingDigits(iName) {
  if (!iName) return '';
  return iName.replace(/\d+$/, '');
}

function buildVariantIndexFallbacks(variantIndex) {
  const list = [variantIndex];
  if (variantIndex >= 0x20 && variantIndex % 0x20 === 0) {
    list.push(variantIndex >> 5);
  }
  if (variantIndex > 7) {
    list.push(variantIndex & 0x7);
  }
  return Array.from(new Set(list));
}

function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function buildDataWarning(err) {
  if (location.protocol === 'file:') {
    return 'CSV 未加载：请用本地服务器打开页面。';
  }
  if (err && err.name === 'AbortError') {
    return 'CSV 加载超时，请检查是否能访问 csv/ 目录。';
  }
  return 'CSV 加载失败，请检查 csv/ 路径。';
}

function buildDataWarningIfEmpty() {
  if (state.itemsById.size || state.recipesById.size || state.flowersById.size) return '';
  if (location.protocol === 'file:') {
    return 'CSV 未加载：请用本地服务器打开页面。';
  }
  return 'CSV 未加载：请确认 csv/ 目录可访问。';
}
