(function attachShared(root, factory) {
  const shared = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = shared;
  }

  root.CatGatekeeperShared = shared;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const DEFAULT_CATEGORIES = Object.freeze([
    Object.freeze({
      id: 'social',
      name: 'Social',
      emoji: '💬',
      usageLimit: 30,
      breakTime: 5,
      domains: Object.freeze([
        'x.com',
        'facebook.com',
        'threads.net',
        'instagram.com',
        'bsky.app',
        'xiaohongshu.com',
        'reddit.com',
      ]),
    }),
    Object.freeze({
      id: 'video',
      name: 'Video',
      emoji: '📺',
      usageLimit: 60,
      breakTime: 10,
      domains: Object.freeze([
        'youtube.com',
        'netflix.com',
        'twitch.com',
        'bilibili.com',
        'douyin.com',
        'tiktok.com',
        'yfsp.tv',
        'youku.com',
        'iqiyi.com',
        'v.qq.com',
      ]),
    }),
    Object.freeze({
      id: 'shopping',
      name: 'Shopping',
      emoji: '🛍️',
      usageLimit: 20,
      breakTime: 5,
      domains: Object.freeze([
        'amazon.com',
        'ebay.com',
        'taobao.com',
        'tmall.com',
        'jd.com',
      ]),
    }),
  ]);

  const DEFAULT_SETTINGS = Object.freeze({
    categories: DEFAULT_CATEGORIES,
  });

  // Kept for reading legacy storage during migration from v1
  const LEGACY_DEFAULTS = Object.freeze({
    usageLimit: 60,
    breakTime: 5,
  });

  function clampNumber(value, min, max, fallback) {
    const parsedValue = Number.parseInt(value, 10);

    if (Number.isNaN(parsedValue)) {
      return fallback;
    }

    return Math.min(Math.max(parsedValue, min), max);
  }

  function normalizeDomainEntry(entry) {
    if (typeof entry !== 'string') {
      return '';
    }

    let value = entry.trim().toLowerCase();

    if (!value) {
      return '';
    }

    value = value.replace(/^[*.]+/, '');

    try {
      const url = new URL(value.includes('://') ? value : `https://${value}`);
      value = url.hostname.toLowerCase();
    } catch (_error) {
      value = value.split(/[/?#]/, 1)[0].trim().toLowerCase();
      value = value.replace(/:\d+$/, '');
    }

    value = value.replace(/^[*.]+/, '');
    value = value.replace(/^www\./, '');
    value = value.replace(/\.+$/, '');

    if (!value || !value.includes('.') || !/^[a-z0-9.-]+$/.test(value)) {
      return '';
    }

    return value;
  }

  function normalizeDomainList(domains) {
    const inputList = Array.isArray(domains)
      ? domains
      : typeof domains === 'string'
        ? domains.split(/[\n,]+/)
        : [];
    const normalizedDomains = [];
    const seenDomains = new Set();

    inputList.forEach((domain) => {
      const normalizedDomain = normalizeDomainEntry(domain);

      if (!normalizedDomain || seenDomains.has(normalizedDomain)) {
        return;
      }

      seenDomains.add(normalizedDomain);
      normalizedDomains.push(normalizedDomain);
    });

    return normalizedDomains;
  }

  function hostnameMatchesDomain(hostname, domain) {
    const normalizedHostname = normalizeDomainEntry(hostname);
    const normalizedDomain = normalizeDomainEntry(domain);

    if (!normalizedHostname || !normalizedDomain) {
      return false;
    }

    return normalizedHostname === normalizedDomain ||
      normalizedHostname.endsWith(`.${normalizedDomain}`);
  }

  function isCustomDomain(hostname, customDomains) {
    return normalizeDomainList(customDomains).some((domain) =>
      hostnameMatchesDomain(hostname, domain)
    );
  }

  function normalizeCategory(cat) {
    if (!cat || typeof cat !== 'object') return null;

    const id = typeof cat.id === 'string' && cat.id.trim()
      ? cat.id.trim()
      : `cat_${Math.random().toString(36).slice(2, 9)}`;
    const name = (typeof cat.name === 'string' ? cat.name.trim() : '') || 'Category';
    const emoji = (typeof cat.emoji === 'string' ? [...cat.emoji.trim()].slice(0, 2).join('') : '') || '📌';
    const usageLimit = clampNumber(cat.usageLimit, 1, 480, 30);
    const breakTime = clampNumber(cat.breakTime, 1, 60, 5);
    const domains = normalizeDomainList(cat.domains || []);

    return { id, name, emoji, usageLimit, breakTime, domains };
  }

  function normalizeCategories(cats) {
    if (!Array.isArray(cats)) {
      return DEFAULT_CATEGORIES.map((c) => ({ ...c, domains: [...c.domains] }));
    }
    return cats.map(normalizeCategory).filter(Boolean);
  }

  function normalizeSettings(settings) {
    const s = settings && typeof settings === 'object' ? settings : {};

    if (Array.isArray(s.categories)) {
      return { categories: normalizeCategories(s.categories) };
    }

    // Migrate from v1 flat format
    if (Array.isArray(s.customDomains)) {
      return {
        categories: [normalizeCategory({
          id: 'migrated',
          name: 'My Sites',
          emoji: '📌',
          usageLimit: s.usageLimit,
          breakTime: s.breakTime,
          domains: s.customDomains,
        })].filter(Boolean),
      };
    }

    return { categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, domains: [...c.domains] })) };
  }

  function getCategoryForHostname(hostname, categories) {
    if (!Array.isArray(categories)) return null;
    return categories.find((cat) =>
      Array.isArray(cat.domains) &&
      cat.domains.some((d) => hostnameMatchesDomain(hostname, d))
    ) || null;
  }

  return {
    DEFAULT_SETTINGS,
    DEFAULT_CATEGORIES,
    LEGACY_DEFAULTS,
    clampNumber,
    hostnameMatchesDomain,
    isCustomDomain,
    normalizeDomainEntry,
    normalizeDomainList,
    normalizeCategory,
    normalizeCategories,
    normalizeSettings,
    getCategoryForHostname,
  };
});
