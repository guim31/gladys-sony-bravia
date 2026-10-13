// -----------------------------------------------------------------------------
// The answers of the Bravia API turned into the few values the integration
// uses, and the name matching of the scene actions and widget shortcuts.
// Pure functions, tested against the examples of the Sony documentation
// (test/fixtures/bravia/).
// -----------------------------------------------------------------------------

export const CONTENT_KINDS = Object.freeze({
  INPUT: 'input',
  CHANNEL: 'channel',
  // An application, the home screen, a USB or DLNA media: the API does not
  // tell which application is in front.
  APP: 'app',
});

const clean = (value, max = 120) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** `aa:bb:cc:dd:ee:ff`, or null for a missing or placeholder address. */
export function normalizeMac(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const hex = raw.replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (hex.length !== 12 || /^0+$/.test(hex) || /^f+$/.test(hex)) {
    return null;
  }
  return hex.match(/../g).join(':');
}

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

/**
 * What `getSystemInformation` tells about the TV.
 * The platform id (device identity in Gladys) is the serial number, the MAC
 * address when the TV gives no serial: the MAC changes when the TV moves from
 * Wi-Fi to Ethernet, the serial never does.
 */
export function parseSystemInfo(info = {}) {
  const serial = clean(info.serial, 64);
  const mac = normalizeMac(info.macAddr);
  const cid = clean(info.cid, 64);
  let platformId = null;
  if (serial && slug(serial)) {
    platformId = `sn-${slug(serial)}`;
  } else if (mac) {
    platformId = `mac-${mac.replace(/:/g, '')}`;
  } else if (cid && slug(cid)) {
    platformId = `cid-${slug(cid)}`;
  }
  return {
    platformId,
    model: clean(info.model, 40) || null,
    name: clean(info.name, 40) || null,
    mac,
    generation: clean(info.generation, 16) || null,
  };
}

/** The speaker entry of `getVolumeInformation` (the first one otherwise). */
export function parseVolume(list) {
  const entries = Array.isArray(list)
    ? list.filter((entry) => entry && typeof entry === 'object')
    : [];
  const entry = entries.find((item) => item.target === 'speaker') ?? entries[0];
  if (!entry || typeof entry.volume !== 'number') {
    return null;
  }
  const max = Number.isFinite(entry.maxVolume) && entry.maxVolume > 0 ? entry.maxVolume : 100;
  return {
    volume: Math.max(0, Math.min(max, Math.round(entry.volume))),
    mute: entry.mute === true,
    max,
    target: typeof entry.target === 'string' ? entry.target : 'speaker',
  };
}

/** What is on screen, from `getPlayingContentInfo` (null: an application or the home screen). */
export function parsePlaying(info) {
  const uri = clean(info?.uri, 300);
  if (!info || !uri) {
    return { kind: CONTENT_KINDS.APP, uri: null, title: null };
  }
  if (uri.startsWith('extInput:')) {
    return { kind: CONTENT_KINDS.INPUT, uri, title: clean(info.title, 60) || null };
  }
  if (uri.startsWith('tv:')) {
    const number = Number.parseInt(info.dispNum, 10);
    return {
      kind: CONTENT_KINDS.CHANNEL,
      uri,
      title: clean(info.title, 60) || null,
      number: Number.isFinite(number) && number >= 0 ? number : null,
      program: clean(info.programTitle, 100) || null,
    };
  }
  return { kind: CONTENT_KINDS.APP, uri, title: clean(info.title, 60) || null };
}

/** Same content on screen (the program title of a channel aside). */
export const sameContent = (a, b) =>
  Boolean(a && b) && a.kind === b.kind && (a.uri ?? null) === (b.uri ?? null);

/** The inputs of `getCurrentExternalInputsStatus`, in the TV's order. */
export function parseInputs(list) {
  const seen = new Set();
  const inputs = [];
  for (const item of Array.isArray(list) ? list : []) {
    const uri = clean(item?.uri, 300);
    const title = clean(item?.title, 40);
    if (!uri || !title || seen.has(uri)) {
      continue;
    }
    seen.add(uri);
    inputs.push({
      uri,
      title,
      label: clean(item.label, 40) || null,
      connected: item.connection === true,
    });
  }
  return inputs;
}

/** The name the user knows an input by: the label set on the TV, else its title. */
export const inputName = (input) => input.label || input.title;

/** The applications of `getApplicationList`, sorted by title. */
export function parseApps(list) {
  const seen = new Set();
  const apps = [];
  for (const item of Array.isArray(list) ? list : []) {
    const uri = clean(item?.uri, 300);
    const title = clean(item?.title, 60);
    if (!uri || !title || seen.has(uri)) {
      continue;
    }
    seen.add(uri);
    apps.push({ uri, title });
  }
  return apps.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
}

/** The IRCC codes of `getRemoteControllerInfo`, by key name. */
export function parseCodes(list) {
  const codes = {};
  for (const item of Array.isArray(list) ? list : []) {
    if (typeof item?.name === 'string' && typeof item.value === 'string' && item.value) {
      codes[item.name] = item.value;
    }
  }
  return codes;
}

/** The channels of `getContentList`: `[{ uri, number, title }]`. */
export function parseChannels(list) {
  const channels = [];
  for (const item of Array.isArray(list) ? list : []) {
    const uri = clean(item?.uri, 300);
    const number = Number.parseInt(item?.dispNum, 10);
    if (!uri || !Number.isFinite(number)) {
      continue;
    }
    channels.push({ uri, number, title: clean(item.title, 60) || null });
  }
  return channels;
}

const comparable = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Spaces and punctuation aside: "francetv" finds "France.tv".
    .replace(/[^a-z0-9]+/g, '');

/**
 * Find an entry by what a user typed: its URI, its exact name (accents,
 * case and punctuation aside), else the first name that contains it.
 * @template T
 * @param {T[]} entries
 * @param {string} query
 * @param {(entry: T) => string[]} namesOf
 * @returns {T|null}
 */
export function findByName(entries, query, namesOf) {
  const raw = String(query ?? '').trim();
  const wanted = comparable(raw);
  if (!wanted) {
    return null;
  }
  const byUri = entries.find((entry) => entry.uri === raw);
  if (byUri) {
    return byUri;
  }
  const exact = entries.find((entry) => namesOf(entry).some((name) => comparable(name) === wanted));
  if (exact) {
    return exact;
  }
  return (
    entries.find((entry) => namesOf(entry).some((name) => comparable(name).includes(wanted))) ??
    null
  );
}

export const findInput = (inputs, query) =>
  findByName(inputs, query, (input) => [input.label, input.title].filter(Boolean));

export const findApp = (apps, query) => findByName(apps, query, (app) => [app.title]);
