// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Up to three TVs, each in its own slot: address, Pre-Shared Key or PIN, name.
// The device identity is the TV's serial number, read from the TV: the slot
// only says where to reach it.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const SLOTS = [1, 2, 3];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['5', '10', '30', '60'];

// Steps of the volume buttons (feature, widget), in volume units.
export const VOLUME_STEPS = ['1', '2', '5'];

export const DEFAULT_CONFIG = {
  tv_1_host: '',
  tv_1_psk: '',
  tv_1_pin: '',
  tv_1_name: '',
  tv_2_host: '',
  tv_2_psk: '',
  tv_2_pin: '',
  tv_2_name: '',
  tv_3_host: '',
  tv_3_psk: '',
  tv_3_pin: '',
  tv_3_name: '',
  wake_on_lan: true,
  poll_interval: '10',
  volume_step: '2',
  language: 'fr',
};

const MAX_NAME_LENGTH = 40;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.20`, `bravia.local`), or a URL (`http://192.0.2.20/`). HTTP by
 * default, the path dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port]`, null when unusable
 */
export function parseTvUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  return url.origin;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/** The PIN as the TV shows it: four digits, spaces ignored. */
export function parsePin(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return null;
  }
  const digits = String(raw).replace(/\s+/g, '');
  return /^\d{4}$/.test(digits) ? digits : null;
}

const isTrue = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pick = (key, list) => {
    const value = source[key] === undefined || source[key] === null ? '' : String(source[key]);
    return list.includes(value) ? value : DEFAULT_CONFIG[key];
  };

  const tvs = [];
  const invalid = [];
  for (const slot of SLOTS) {
    const typed = text(`tv_${slot}_host`);
    if (!typed) {
      continue;
    }
    const url = parseTvUrl(typed);
    if (!url) {
      invalid.push(slot);
      continue;
    }
    tvs.push({
      slot,
      url,
      // The key is kept as typed (inner spaces may be part of it), ends trimmed.
      psk: text(`tv_${slot}_psk`) || null,
      pin: parsePin(source[`tv_${slot}_pin`]),
      name: text(`tv_${slot}_name`).slice(0, MAX_NAME_LENGTH) || null,
    });
  }

  return {
    tvs,
    invalidSlots: invalid,
    wakeOnLan: source.wake_on_lan === undefined ? true : isTrue(source.wake_on_lan),
    pollIntervalMs: Number(pick('poll_interval', POLL_INTERVALS)) * 1000,
    volumeStep: Number(pick('volume_step', VOLUME_STEPS)),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
