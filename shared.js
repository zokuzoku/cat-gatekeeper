(function attachShared(root, factory) {
  const shared = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = shared;
  }

  root.CatGatekeeperShared = shared;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const DEFAULT_DOMAINS = Object.freeze([
    'x.com',
    'youtube.com',
    'facebook.com',
    'reddit.com',
    'threads.net',
    'bsky.app',
  ]);

  const DEFAULT_SETTINGS = Object.freeze({
    usageLimit: 60,
    breakTime: 5,
    customDomains: DEFAULT_DOMAINS,
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

  function normalizeSettings(settings) {
    const safeSettings = settings && typeof settings === 'object' ? settings : {};
    const customDomains = normalizeDomainList(safeSettings.customDomains);
    const hasCustomDomainsSetting = Object.prototype.hasOwnProperty.call(
      safeSettings,
      'customDomains'
    );

    return {
      usageLimit: clampNumber(
        safeSettings.usageLimit,
        1,
        480,
        DEFAULT_SETTINGS.usageLimit
      ),
      breakTime: clampNumber(
        safeSettings.breakTime,
        1,
        60,
        DEFAULT_SETTINGS.breakTime
      ),
      customDomains: hasCustomDomainsSetting
        ? customDomains
        : [...DEFAULT_SETTINGS.customDomains],
    };
  }

  return {
    DEFAULT_SETTINGS,
    DEFAULT_DOMAINS,
    clampNumber,
    hostnameMatchesDomain,
    isCustomDomain,
    normalizeDomainEntry,
    normalizeDomainList,
    normalizeSettings,
  };
});
