document.querySelectorAll('[data-i18n]').forEach((el) => {
  el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
});

const shared = globalThis.CatGatekeeperShared;

const i18n = {
  emoji:           () => chrome.i18n.getMessage('emojiLabel'),
  name:            () => chrome.i18n.getMessage('categoryNameLabel'),
  limit:           () => chrome.i18n.getMessage('usageLimitShortLabel'),
  breakTime:       () => chrome.i18n.getMessage('breakTimeShortLabel'),
  sites:           () => chrome.i18n.getMessage('sitesLabel'),
  hint:            () => chrome.i18n.getMessage('customDomainsHint'),
  remove:          () => chrome.i18n.getMessage('removeCategoryButton'),
  addCat:          () => chrome.i18n.getMessage('addCategoryButton'),
  min:             () => chrome.i18n.getMessage('minuteUnit'),
  quickAddBtn:     () => chrome.i18n.getMessage('quickAddButton'),
  quickAddLabel:   (host) => chrome.i18n.getMessage('quickAddLabel', [host]),
};

document.getElementById('addCategoryBtn').textContent = i18n.addCat();
document.getElementById('quickAddBtn').textContent = i18n.quickAddBtn();

// Coordinate two async loads before showing quick-add
let _loadedCategories = null;
let _tabStatus = null;

function _tryShowQuickAdd() {
  if (!_loadedCategories || !_tabStatus) return;
  if (!_tabStatus.isTracked && _tabStatus.hostname) {
    showQuickAdd(_tabStatus.hostname, _loadedCategories);
  }
}

// Show dismiss button when cat is active; capture tab status for quick-add
const dismissBtn = document.getElementById('dismissBtn');
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CAT_STATUS' }, (res) => {
    void chrome.runtime.lastError;
    if (res?.catIsActive) dismissBtn.style.display = 'block';
    _tabStatus = res || { isTracked: true }; // treat error as tracked (no banner)
    _tryShowQuickAdd();
  });
});

dismissBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'DISMISS_CAT' }, () => {
      void chrome.runtime.lastError;
    });
    dismissBtn.style.display = 'none';
  });
});

// Load settings and render
chrome.storage.local.get(
  { categories: null, customDomains: null, usageLimit: shared.LEGACY_DEFAULTS.usageLimit, breakTime: shared.LEGACY_DEFAULTS.breakTime },
  (raw) => {
    const { categories } = shared.normalizeSettings(raw);
    _loadedCategories = categories;
    renderCategories(categories);
    _tryShowQuickAdd();
  }
);

function showQuickAdd(hostname, categories) {
  const banner = document.getElementById('quickAddBanner');
  const label = document.getElementById('quickAddLabel');
  const select = document.getElementById('quickAddSelect');
  const btn = document.getElementById('quickAddBtn');

  // Build label with bold hostname
  label.textContent = '';
  const msg = i18n.quickAddLabel(hostname);
  const parts = msg.split(hostname);
  if (parts.length === 2) {
    label.append(parts[0]);
    const strong = document.createElement('strong');
    strong.textContent = hostname;
    label.appendChild(strong);
    label.append(parts[1]);
  } else {
    label.textContent = msg;
  }

  // Populate category selector
  select.innerHTML = '';
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `${cat.emoji} ${cat.name}`;
    select.appendChild(opt);
  });

  banner.hidden = false;

  btn.addEventListener('click', () => {
    const selectedId = select.value;
    const card = document.querySelector(`.category-card[data-id="${CSS.escape(selectedId)}"]`);
    if (!card) return;

    // Append domain to the target category's textarea
    const textarea = card._inputs.domains;
    const current = textarea.value.trim();
    textarea.value = current ? `${current}\n${hostname}` : hostname;

    // Expand the card so the user can see the change
    const body = card.querySelector('.category-body');
    if (body.hidden) {
      body.hidden = false;
      card.querySelector('.toggle-arrow').textContent = '▼';
      card.querySelector('.category-header').setAttribute('aria-expanded', 'true');
    }

    banner.hidden = true;
    document.getElementById('saveBtn').click();
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function renderCategories(categories) {
  const container = document.getElementById('categoriesContainer');
  container.innerHTML = '';
  categories.forEach((cat) => container.appendChild(buildCategoryCard(cat, false)));
}

function buildCategoryCard(cat, expanded) {
  const card = document.createElement('div');
  card.className = 'category-card';
  card.dataset.id = cat.id;

  // ── Header ──────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'category-header';
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', String(expanded));

  const arrow = document.createElement('span');
  arrow.className = 'toggle-arrow';
  arrow.textContent = expanded ? '▼' : '▶';

  const headerEmoji = document.createElement('span');
  headerEmoji.className = 'header-emoji';
  headerEmoji.textContent = cat.emoji;

  const headerName = document.createElement('span');
  headerName.className = 'header-name';
  headerName.textContent = cat.name;

  const headerSummary = document.createElement('span');
  headerSummary.className = 'header-summary';
  headerSummary.textContent = `${cat.usageLimit} ${i18n.min()}`;

  header.append(arrow, headerEmoji, headerName, headerSummary);

  // ── Body ────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'category-body';
  body.hidden = !expanded;

  // Emoji + Name row
  const metaRow = document.createElement('div');
  metaRow.className = 'cat-meta-row';

  const emojiField = document.createElement('div');
  emojiField.className = 'field field-emoji';
  const emojiLabel = document.createElement('span');
  emojiLabel.className = 'field-label';
  emojiLabel.textContent = i18n.emoji();
  const emojiInput = document.createElement('input');
  emojiInput.type = 'text';
  emojiInput.className = 'emoji-input';
  emojiInput.value = cat.emoji;
  emojiInput.maxLength = 4;
  emojiInput.addEventListener('input', () => {
    headerEmoji.textContent = emojiInput.value || '📌';
  });
  emojiField.append(emojiLabel, emojiInput);

  const nameField = document.createElement('div');
  nameField.className = 'field field-name';
  const nameLabel = document.createElement('span');
  nameLabel.className = 'field-label';
  nameLabel.textContent = i18n.name();
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'name-input';
  nameInput.value = cat.name;
  nameInput.maxLength = 50;
  nameInput.placeholder = 'Category';
  nameInput.addEventListener('input', () => {
    headerName.textContent = nameInput.value || 'Category';
  });
  nameField.append(nameLabel, nameInput);

  metaRow.append(emojiField, nameField);

  // Usage limit + Break time row
  const timeRow = document.createElement('div');
  timeRow.className = 'cat-time-row';

  const usageLimitField = buildNumberField(i18n.limit(), cat.usageLimit, 1, 480, 'usage-limit-input');
  usageLimitField.input.addEventListener('input', () => {
    const val = Number.parseInt(usageLimitField.input.value, 10);
    if (!Number.isNaN(val) && val >= 1 && val <= 480) {
      headerSummary.textContent = `${val} ${i18n.min()}`;
    }
  });

  const breakTimeField = buildNumberField(i18n.breakTime(), cat.breakTime, 1, 60, 'break-time-input');

  timeRow.append(usageLimitField.el, breakTimeField.el);

  // Sites textarea
  const sitesLabel = document.createElement('label');
  sitesLabel.className = 'domains-label';
  sitesLabel.textContent = i18n.sites();

  const textarea = document.createElement('textarea');
  textarea.className = 'domains-textarea';
  textarea.spellcheck = false;
  textarea.placeholder = 'youtube.com\nexample.com';
  textarea.value = cat.domains.join('\n');

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = i18n.hint();

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = i18n.remove();
  removeBtn.addEventListener('click', () => card.remove());

  body.append(metaRow, timeRow, sitesLabel, textarea, hint, removeBtn);

  // Toggle expand/collapse
  header.addEventListener('click', () => {
    const willExpand = body.hidden;
    body.hidden = !willExpand;
    arrow.textContent = willExpand ? '▼' : '▶';
    header.setAttribute('aria-expanded', String(willExpand));
  });

  card.append(header, body);

  // Attach references for reading on save
  card._inputs = {
    emoji: emojiInput,
    name: nameInput,
    usageLimit: usageLimitField.input,
    breakTime: breakTimeField.input,
    domains: textarea,
  };

  return card;
}

function buildNumberField(labelText, value, min, max, className) {
  const el = document.createElement('div');
  el.className = 'cat-time-field';

  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = labelText;

  const inputUnit = document.createElement('div');
  inputUnit.className = 'input-unit';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = className;
  input.min = min;
  input.max = max;
  input.value = value;

  const unit = document.createElement('span');
  unit.className = 'unit';
  unit.textContent = i18n.min();

  inputUnit.append(input, unit);
  el.append(label, inputUnit);

  return { el, input };
}

function readCardCategories() {
  return Array.from(document.querySelectorAll('.category-card')).map((card, i) => {
    const inp = card._inputs;
    return shared.normalizeCategory({
      id: card.dataset.id || `cat_${Date.now()}_${i}`,
      emoji: inp.emoji.value,
      name: inp.name.value,
      usageLimit: Number.parseInt(inp.usageLimit.value, 10),
      breakTime: Number.parseInt(inp.breakTime.value, 10),
      domains: inp.domains.value,
    });
  }).filter(Boolean);
}

// Add category
document.getElementById('addCategoryBtn').addEventListener('click', () => {
  const cat = shared.normalizeCategory({
    id: `cat_${Date.now()}`,
    name: '',
    emoji: '📌',
    usageLimit: 30,
    breakTime: 5,
    domains: [],
  });
  const card = buildCategoryCard(cat, true);
  document.getElementById('categoriesContainer').appendChild(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  card._inputs.name.focus();
});

// Save
document.getElementById('saveBtn').addEventListener('click', () => {
  const categories = readCardCategories();

  // Reflect normalized values back into inputs
  document.querySelectorAll('.category-card').forEach((card, i) => {
    const cat = categories[i];
    if (!cat) return;
    const inp = card._inputs;
    inp.emoji.value = cat.emoji;
    inp.name.value = cat.name;
    inp.usageLimit.value = cat.usageLimit;
    inp.breakTime.value = cat.breakTime;
    inp.domains.value = cat.domains.join('\n');
    card.querySelector('.header-emoji').textContent = cat.emoji;
    card.querySelector('.header-name').textContent = cat.name;
    card.querySelector('.header-summary').textContent = `${cat.usageLimit} ${i18n.min()}`;
  });

  chrome.storage.local.set({ categories }, () => {
    const msg = document.getElementById('savedMsg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: 'UPDATE_SETTINGS', settings: { categories } },
        () => { void chrome.runtime.lastError; }
      );
    });
  });
});
