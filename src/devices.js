// -----------------------------------------------------------------------------
// One Gladys device per TV.
//
// Identity: the serial number the TV gives (`getSystemInformation`), its MAC
// address when it gives no serial — never the address typed in the
// configuration, which DHCP can change. A TV is published once it answered
// at least once; what it said is kept under /data for the next starts.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - power: television/binary, writable (Wake-on-LAN when the TV sleeps deep);
//   - volume: television/volume, writable, the slider of the dashboard;
//   - volume up / down, mute, channel up / down: television push buttons
//     (write-only: the core shows them as buttons);
//   - channel: television/channel, writable, the number of the channel on
//     screen (published only while a channel is on screen);
//   - input: text/select, writable, options = the TV's inputs, labels as set
//     on the TV, plus "Other" while an application or the tuner is on screen;
//   - app: text/select, writable, options = the TV's applications, plus
//     "Home screen" (the API never tells which application is in front: the
//     select shows the one Gladys opened, until the screen changes);
//   - now playing: text/text, read-only (input, channel and program, or
//     "application or home screen").
//
// The devices are published with should_poll: false: the integration reads
// the TVs on its own timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { CONTENT_KINDS, inputName } from './bravia/model.js';

export const DEVICE_TYPE = 'tv';
export const URL_PARAM = 'BRAVIA_URL';
export const MODEL_PARAM = 'BRAVIA_MODEL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  POWER: 'power',
  VOLUME: 'volume',
  VOLUME_UP: 'volume_up',
  VOLUME_DOWN: 'volume_down',
  MUTE: 'mute',
  CHANNEL: 'channel',
  CHANNEL_UP: 'channel_up',
  CHANNEL_DOWN: 'channel_down',
  INPUT: 'input',
  APP: 'app',
  PLAYING: 'playing',
});

// Option values of the selects that are not an input or an application.
export const OTHER_INPUT = 'other';
export const HOME_APP = 'home';

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.POWER]: 'Power',
    [FEATURE_KEYS.VOLUME]: 'Volume',
    [FEATURE_KEYS.VOLUME_UP]: 'Volume up',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Volume down',
    [FEATURE_KEYS.MUTE]: 'Mute',
    [FEATURE_KEYS.CHANNEL]: 'Channel',
    [FEATURE_KEYS.CHANNEL_UP]: 'Channel up',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Channel down',
    [FEATURE_KEYS.INPUT]: 'Input',
    [FEATURE_KEYS.APP]: 'App',
    [FEATURE_KEYS.PLAYING]: 'Now playing',
  },
  fr: {
    [FEATURE_KEYS.POWER]: 'Marche / arrêt',
    [FEATURE_KEYS.VOLUME]: 'Volume',
    [FEATURE_KEYS.VOLUME_UP]: 'Augmenter le volume',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Diminuer le volume',
    [FEATURE_KEYS.MUTE]: 'Muet',
    [FEATURE_KEYS.CHANNEL]: 'Chaîne',
    [FEATURE_KEYS.CHANNEL_UP]: 'Chaîne suivante',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Chaîne précédente',
    [FEATURE_KEYS.INPUT]: 'Entrée',
    [FEATURE_KEYS.APP]: 'Application',
    [FEATURE_KEYS.PLAYING]: 'En cours',
  },
  de: {
    [FEATURE_KEYS.POWER]: 'Ein / Aus',
    [FEATURE_KEYS.VOLUME]: 'Lautstärke',
    [FEATURE_KEYS.VOLUME_UP]: 'Lautstärke höher',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Lautstärke niedriger',
    [FEATURE_KEYS.MUTE]: 'Stumm',
    [FEATURE_KEYS.CHANNEL]: 'Kanal',
    [FEATURE_KEYS.CHANNEL_UP]: 'Nächster Kanal',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Voriger Kanal',
    [FEATURE_KEYS.INPUT]: 'Eingang',
    [FEATURE_KEYS.APP]: 'App',
    [FEATURE_KEYS.PLAYING]: 'Aktuelle Wiedergabe',
  },
  es: {
    [FEATURE_KEYS.POWER]: 'Encendido',
    [FEATURE_KEYS.VOLUME]: 'Volumen',
    [FEATURE_KEYS.VOLUME_UP]: 'Subir volumen',
    [FEATURE_KEYS.VOLUME_DOWN]: 'Bajar volumen',
    [FEATURE_KEYS.MUTE]: 'Silenciar',
    [FEATURE_KEYS.CHANNEL]: 'Canal',
    [FEATURE_KEYS.CHANNEL_UP]: 'Canal siguiente',
    [FEATURE_KEYS.CHANNEL_DOWN]: 'Canal anterior',
    [FEATURE_KEYS.INPUT]: 'Entrada',
    [FEATURE_KEYS.APP]: 'Aplicación',
    [FEATURE_KEYS.PLAYING]: 'En reproducción',
  },
};

// Labels of the extra options and texts of the "Now playing" feature.
export const DEVICE_TEXT = {
  otherInput: {
    en: 'Other (TV, apps)',
    fr: 'Autre (TV, applis)',
    de: 'Andere (TV, Apps)',
    es: 'Otra (TV, aplicaciones)',
  },
  homeApp: {
    en: 'Home screen',
    fr: "Écran d'accueil",
    de: 'Startbildschirm',
    es: 'Pantalla de inicio',
  },
  appOrHome: {
    en: 'App or home screen',
    fr: "Application ou écran d'accueil",
    de: 'App oder Startbildschirm',
    es: 'Aplicación o pantalla de inicio',
  },
  off: { en: 'Off', fr: 'Éteinte', de: 'Aus', es: 'Apagada' },
};

const text = (table, language) => table[language] ?? table.en;

// Display bounds (the core never applies them on write).
const CHANNEL_MAX = 9999;

const push = (key, type) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
    type,
    read_only: false,
    has_feedback: false,
    keep_history: false,
    min: 0,
    max: 1,
  },
});

// Order = display order in Gladys.
const FEATURES = [
  {
    key: FEATURE_KEYS.POWER,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
      type: DEVICE_FEATURE_TYPES.TELEVISION.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    },
  },
  {
    key: FEATURE_KEYS.VOLUME,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
      type: DEVICE_FEATURE_TYPES.TELEVISION.VOLUME,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 100,
    },
  },
  push(FEATURE_KEYS.VOLUME_DOWN, DEVICE_FEATURE_TYPES.TELEVISION.VOLUME_DOWN),
  push(FEATURE_KEYS.VOLUME_UP, DEVICE_FEATURE_TYPES.TELEVISION.VOLUME_UP),
  push(FEATURE_KEYS.MUTE, DEVICE_FEATURE_TYPES.TELEVISION.VOLUME_MUTE),
  {
    key: FEATURE_KEYS.INPUT,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 0,
    },
  },
  {
    key: FEATURE_KEYS.APP,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.SELECT,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: 0,
    },
  },
  {
    key: FEATURE_KEYS.CHANNEL,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TELEVISION,
      type: DEVICE_FEATURE_TYPES.TELEVISION.CHANNEL,
      read_only: false,
      has_feedback: true,
      keep_history: false,
      min: 0,
      max: CHANNEL_MAX,
    },
  },
  push(FEATURE_KEYS.CHANNEL_DOWN, DEVICE_FEATURE_TYPES.TELEVISION.CHANNEL_DOWN),
  push(FEATURE_KEYS.CHANNEL_UP, DEVICE_FEATURE_TYPES.TELEVISION.CHANNEL_UP),
  {
    key: FEATURE_KEYS.PLAYING,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: 0,
    },
  },
];

/** Keys of the write-only buttons: no state to publish. */
export const PUSH_KEYS = new Set(
  FEATURES.filter(({ definition }) => definition.category === DEVICE_FEATURE_CATEGORIES.TELEVISION)
    .filter(({ definition }) => !definition.has_feedback)
    .map(({ key }) => key),
);

/** External ids of a TV's device and features. */
export const deviceIds = (gladys, platformId) => gladys.externalIds(DEVICE_TYPE, platformId);

/** The platform id of a device external id of ours, null otherwise. */
export function platformIdOf(gladys, externalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const rest = externalId.slice(prefix.length);
  return rest && !rest.includes(':') ? rest : null;
}

/** The name shown for a TV: the one typed in the configuration, else its model. */
export function tvName(record) {
  if (record.tv.name) {
    return record.tv.name;
  }
  if (record.identity?.model) {
    return `BRAVIA ${record.identity.model}`;
  }
  return `BRAVIA ${hostOf(record.tv.url)}`;
}

const fit = (value, max) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/** The options of the input select. */
export function inputOptions(record, language) {
  return [
    ...record.inputs.map((input, index) => ({
      value: input.uri,
      label: fit(inputName(input), 60),
      sort_order: index,
    })),
    {
      value: OTHER_INPUT,
      label: text(DEVICE_TEXT.otherInput, language),
      sort_order: record.inputs.length,
    },
  ];
}

/** The options of the application select. */
export function appOptions(record, language) {
  return [
    { value: HOME_APP, label: text(DEVICE_TEXT.homeApp, language), sort_order: 0 },
    ...record.apps.map((app, index) => ({
      value: app.uri,
      label: fit(app.title, 60),
      sort_order: index + 1,
    })),
  ];
}

/**
 * The discovery payload of a TV that answered once.
 * @param {object} gladys SDK client
 * @param {object} record hub record: tv (config), identity, inputs, apps
 * @param {string} language feature names language
 */
export function buildDevice(gladys, record, language = 'en') {
  const ids = deviceIds(gladys, record.identity.platformId);
  const names = NAMES[language] ?? NAMES.en;
  const params = [{ name: URL_PARAM, value: record.tv.url }];
  if (record.identity.model) {
    params.push({ name: MODEL_PARAM, value: record.identity.model });
  }
  return {
    name: tvName(record),
    external_id: ids.device,
    should_poll: false,
    params,
    features: FEATURES.map(({ key, definition }) => {
      const feature = { ...definition, name: names[key], external_id: ids.feature(key) };
      if (key === FEATURE_KEYS.INPUT) {
        feature.supported_options = inputOptions(record, language);
      } else if (key === FEATURE_KEYS.APP) {
        feature.supported_options = appOptions(record, language);
      }
      return feature;
    }),
  };
}

/** The "Now playing" text of a snapshot. */
export function playingText(record, language) {
  const { power, playing } = record.snapshot;
  if (power !== 'active') {
    return text(DEVICE_TEXT.off, language);
  }
  if (!playing || playing.kind === CONTENT_KINDS.APP) {
    return text(DEVICE_TEXT.appOrHome, language);
  }
  if (playing.kind === CONTENT_KINDS.INPUT) {
    const input = record.inputs.find((item) => item.uri === playing.uri);
    return fit(input ? inputName(input) : (playing.title ?? playing.uri), 100);
  }
  const channel = [playing.number, playing.title].filter((part) => part !== null).join(' · ');
  return fit(playing.program ? `${channel} — ${playing.program}` : channel || playing.uri, 100);
}

/**
 * The state of every feature of a TV (null: nothing to publish). Text values
 * are strings, published as `{ text }`.
 * @returns {Array<{ key: string, externalId: string, value: number|string|null }>}
 */
export function featureValues(gladys, record, language) {
  const ids = deviceIds(gladys, record.identity.platformId);
  const { power, volume, playing } = record.snapshot;
  const on = power === 'active';
  const values = {
    [FEATURE_KEYS.POWER]: power === 'active' ? 1 : power === 'standby' ? 0 : null,
    [FEATURE_KEYS.VOLUME]: on && volume ? volume.volume : null,
    [FEATURE_KEYS.CHANNEL]:
      on && playing?.kind === CONTENT_KINDS.CHANNEL && playing.number !== null
        ? Math.min(CHANNEL_MAX, playing.number)
        : null,
    [FEATURE_KEYS.INPUT]: !on
      ? null
      : playing?.kind === CONTENT_KINDS.INPUT &&
          record.inputs.some((input) => input.uri === playing.uri)
        ? playing.uri
        : OTHER_INPUT,
    [FEATURE_KEYS.APP]: !on
      ? null
      : playing?.kind === CONTENT_KINDS.APP &&
          record.launchedApp &&
          record.apps.some((app) => app.uri === record.launchedApp)
        ? record.launchedApp
        : HOME_APP,
    [FEATURE_KEYS.PLAYING]: power ? playingText(record, language) : null,
  };
  return FEATURES.filter(({ key }) => !PUSH_KEYS.has(key)).map(({ key }) => ({
    key,
    externalId: ids.feature(key),
    value: values[key] ?? null,
  }));
}
