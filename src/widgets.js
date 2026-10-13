// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+). The core allows four
// buttons per widget, so the remote is split in three widgets a user places
// side by side, each bound to one TV (the first one when none is chosen):
//
//   - `remote`: what the TV does (state, what is on screen, volume) and
//     Power, Volume −, Volume +, Mute;
//   - `keys`: four remote keys chosen in the widget settings (arrows by
//     default; a second instance for OK, Back, Home, Input…);
//   - `shortcuts`: four favorite inputs or applications, typed by name in the
//     settings ("HDMI 2", "Netflix"); the connected inputs by default.
//
// The current choice is shown by the check-circle icon, never by the style
// (`primary` is invisible in dark mode, GladysAssistant/Gladys#3153).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { KEYS, KEY_ICONS, KEY_LABELS } from './bravia/keys.js';
import { CONTENT_KINDS, findApp, findInput, inputName } from './bravia/model.js';
import { playingText, tvName } from './devices.js';
import { WIDGET_KEYS } from './hub.js';
import { failure, labelled, pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique within a
// content, the core drops a button whose key is taken).
export const ACTIONS = Object.freeze({
  POWER: 'power',
  VOLUME_DOWN: 'volume_down',
  VOLUME_UP: 'volume_up',
  MUTE: 'mute',
});
export const SLOT_COUNT = 4;
export const KEY_ACTION = (index) => `key_${index}`;
export const SHORTCUT_ACTION = (index) => `shortcut_${index}`;

// Defaults of the `keys` widget settings (mirror the manifest defaults).
export const DEFAULT_KEYS = ['up', 'down', 'left', 'right'];

const ACTIVE_ICON = 'check-circle';

export const TEXT = {
  pick: {
    en: 'Enter the address of your TV in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre téléviseur dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Fernsehers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su televisor en la configuración de la integración.',
  },
  unknown: {
    en: 'This TV is no longer in the configuration: choose another one in the widget settings.',
    fr: "Ce téléviseur n'est plus dans la configuration : choisissez-en un autre dans les réglages du widget.",
    de: 'Dieser Fernseher ist nicht mehr in der Konfiguration: Wähle einen anderen in den Widget-Einstellungen.',
    es: 'Este televisor ya no está en la configuración: elija otro en la configuración del widget.',
  },
  noShortcut: {
    en: 'Type the names of inputs or apps in the widget settings.',
    fr: "Saisissez des noms d'entrées ou d'applications dans les réglages du widget.",
    de: 'Gib Namen von Eingängen oder Apps in den Widget-Einstellungen ein.',
    es: 'Escriba nombres de entradas o aplicaciones en la configuración del widget.',
  },
  notFound: { en: 'Not found', fr: 'Introuvable', de: 'Nicht gefunden', es: 'No encontrado' },
  on: { en: 'On', fr: 'Allumée', de: 'Ein', es: 'Encendida' },
  standby: { en: 'Standby', fr: 'En veille', de: 'Standby', es: 'En espera' },
  unreachable: {
    en: 'Not answering',
    fr: 'Ne répond pas',
    de: 'Antwortet nicht',
    es: 'No responde',
  },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  screen: { en: 'On screen', fr: "À l'écran", de: 'Auf dem Bildschirm', es: 'En pantalla' },
  volume: { en: 'Volume', fr: 'Volume', de: 'Lautstärke', es: 'Volumen' },
  muted: { en: 'Muted', fr: 'Coupé', de: 'Stumm', es: 'Silenciado' },
  turnOn: { en: 'Turn on', fr: 'Allumer', de: 'Einschalten', es: 'Encender' },
  turnOff: { en: 'Turn off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  volumeDown: { en: 'Volume −', fr: 'Volume −', de: 'Leiser', es: 'Volumen −' },
  volumeUp: { en: 'Volume +', fr: 'Volume +', de: 'Lauter', es: 'Volumen +' },
  mute: { en: 'Mute', fr: 'Muet', de: 'Stumm', es: 'Silenciar' },
};

// Toasts after a tap (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    turningOn: (name) => `Turning ${name} on…`,
    turnedOff: (name) => `${name} turned off.`,
    opened: (name) => `${name} on screen.`,
  },
  fr: {
    turningOn: (name) => `Allumage de ${name}…`,
    turnedOff: (name) => `${name} éteint.`,
    opened: (name) => `${name} à l'écran.`,
  },
  de: {
    turningOn: (name) => `${name} wird eingeschaltet…`,
    turnedOff: (name) => `${name} ausgeschaltet.`,
    opened: (name) => `${name} auf dem Bildschirm.`,
  },
  es: {
    turningOn: (name) => `Encendiendo ${name}…`,
    turnedOff: (name) => `${name} apagado.`,
    opened: (name) => `${name} en pantalla.`,
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const done = (render) =>
  Object.fromEntries(Object.entries(DONE_TEXT).map(([lang, text]) => [lang, render(text)]));

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** The record a widget shows, or the content to show instead. */
function recordFor(hub, settings, language) {
  if (hub.records.size === 0) {
    return { content: message(TEXT.pick, language) };
  }
  const record = hub.view(settings?.device);
  return record ? { record } : { content: message(TEXT.unknown, language) };
}

/** The record a widget button acts on. */
function actionRecord(hub, settings) {
  const record = hub.view(settings?.device);
  if (!record) {
    throw failure(hub.language, hub.records.size === 0 ? 'noTv' : 'unknownTv');
  }
  return record;
}

const isOn = (record) => record.snapshot.power === 'active';

/** The first status row: the TV and its state. */
function tvRow(record, language) {
  const label = fit(tvName(record), 40);
  if (record.error) {
    return {
      label,
      icon: 'alert-triangle',
      value: t(TEXT.error, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (record.snapshot.reachable === false) {
    return {
      label,
      icon: 'tv',
      value: t(record.identity ? TEXT.standby : TEXT.unreachable, language),
      color: record.identity ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.WARNING,
    };
  }
  if (record.snapshot.power === 'active') {
    return { label, icon: 'tv', value: t(TEXT.on, language), color: WIDGET_COLORS.SUCCESS };
  }
  if (record.snapshot.power === 'standby') {
    return { label, icon: 'tv', value: t(TEXT.standby, language), color: WIDGET_COLORS.NEUTRAL };
  }
  return { label, icon: 'clock', value: t(TEXT.waiting, language), color: WIDGET_COLORS.NEUTRAL };
}

// --- remote ------------------------------------------------------------------

function remoteContent(record, language) {
  const items = [tvRow(record, language)];
  const volume = record.snapshot.volume;
  if (isOn(record)) {
    items.push({
      label: t(TEXT.screen, language),
      icon: 'airplay',
      value: fit(playingText(record, language), 40),
      color: WIDGET_COLORS.INFO,
    });
    if (volume) {
      items.push({
        label: t(TEXT.volume, language),
        icon: volume.mute ? 'volume-x' : 'volume-2',
        value: volume.mute ? t(TEXT.muted, language) : volume.volume,
        color: volume.mute ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
      });
    }
  }
  const on = isOn(record);
  return {
    ttl_seconds: on ? 30 : 120,
    components: [
      { type: 'status', items },
      {
        type: 'button',
        label: t(on ? TEXT.turnOff : TEXT.turnOn, language),
        icon: 'power',
        style: 'secondary',
        action: { key: ACTIONS.POWER, params: { on: !on } },
      },
      {
        type: 'button',
        label: t(TEXT.volumeDown, language),
        icon: 'volume-1',
        style: 'secondary',
        action: { key: ACTIONS.VOLUME_DOWN },
      },
      {
        type: 'button',
        label: t(TEXT.volumeUp, language),
        icon: 'volume-2',
        style: 'secondary',
        action: { key: ACTIONS.VOLUME_UP },
      },
      {
        type: 'button',
        label: t(TEXT.mute, language),
        icon: volume?.mute ? ACTIVE_ICON : 'volume-x',
        style: 'secondary',
        action: { key: ACTIONS.MUTE },
      },
    ],
  };
}

const remote = {
  async get(hub, { settings, language = 'en' }) {
    const { record, content } = recordFor(hub, settings, language);
    return content ?? remoteContent(record, language);
  },

  async action(hub, { actionKey, params = {}, settings }) {
    const record = actionRecord(hub, settings);
    const name = tvName(record);
    switch (actionKey) {
      case ACTIONS.POWER: {
        const on = params.on === true;
        await hub.setPower(record, on);
        return { message: done((text) => (on ? text.turningOn(name) : text.turnedOff(name))) };
      }
      case ACTIONS.VOLUME_DOWN:
        await hub.stepVolume(record, -hub.config.volumeStep);
        return undefined;
      case ACTIONS.VOLUME_UP:
        await hub.stepVolume(record, hub.config.volumeStep);
        return undefined;
      case ACTIONS.MUTE:
        await hub.toggleMute(record);
        return undefined;
      default:
        throw new Error(`Unknown action ${actionKey}`);
    }
  },
};

// --- keys ----------------------------------------------------------------------

/** The four keys of a `keys` widget, from its settings. */
export function chosenKeys(settings = {}) {
  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const value = settings?.[`key_${index + 1}`];
    return KEYS[value] ? value : DEFAULT_KEYS[index];
  });
}

const keys = {
  async get(hub, { settings, language = 'en' }) {
    const { record, content } = recordFor(hub, settings, language);
    if (content) {
      return content;
    }
    return {
      ttl_seconds: isOn(record) ? 60 : 300,
      components: [
        { type: 'status', items: [tvRow(record, language)] },
        ...chosenKeys(settings).map((key, index) => ({
          type: 'button',
          label: t(KEY_LABELS[key], language),
          icon: KEY_ICONS[key] ?? 'circle',
          style: 'secondary',
          action: { key: KEY_ACTION(index + 1), params: { key } },
        })),
      ],
    };
  },

  async action(hub, { params = {}, settings }) {
    const record = actionRecord(hub, settings);
    await hub.sendKey(record, String(params.key ?? ''));
    return undefined;
  },
};

// --- shortcuts -------------------------------------------------------------------

/**
 * The shortcuts of a widget: the names typed in its settings, resolved to an
 * input (first) or an application of the TV; the connected inputs when none
 * is typed.
 * @returns {{ shortcuts: Array<{ kind: string, uri: string, name: string }>, missing: string[] }}
 */
export function resolveShortcuts(record, settings = {}) {
  const typed = Array.from({ length: SLOT_COUNT }, (_, index) =>
    typeof settings?.[`shortcut_${index + 1}`] === 'string'
      ? settings[`shortcut_${index + 1}`].trim()
      : '',
  ).filter(Boolean);
  if (typed.length === 0) {
    const connected = record.inputs.filter((input) => input.connected);
    const inputs = (connected.length ? connected : record.inputs).slice(0, SLOT_COUNT);
    return {
      shortcuts: inputs.map((input) => ({
        kind: CONTENT_KINDS.INPUT,
        uri: input.uri,
        name: inputName(input),
      })),
      missing: [],
    };
  }
  const shortcuts = [];
  const missing = [];
  for (const query of typed) {
    const input = findInput(record.inputs, query);
    const app = input ? null : findApp(record.apps, query);
    if (input) {
      shortcuts.push({ kind: CONTENT_KINDS.INPUT, uri: input.uri, name: inputName(input) });
    } else if (app) {
      shortcuts.push({ kind: CONTENT_KINDS.APP, uri: app.uri, name: app.title });
    } else {
      missing.push(query);
    }
  }
  return { shortcuts, missing };
}

function isCurrent(record, shortcut) {
  const playing = record.snapshot.playing;
  if (!isOn(record) || !playing) {
    return false;
  }
  return shortcut.kind === CONTENT_KINDS.INPUT
    ? playing.kind === CONTENT_KINDS.INPUT && playing.uri === shortcut.uri
    : playing.kind === CONTENT_KINDS.APP && record.launchedApp === shortcut.uri;
}

const shortcutsWidget = {
  async get(hub, { settings, language = 'en' }) {
    const { record, content } = recordFor(hub, settings, language);
    if (content) {
      return content;
    }
    const { shortcuts, missing } = resolveShortcuts(record, settings);
    const components = [{ type: 'status', items: [tvRow(record, language)] }];
    if (shortcuts.length === 0 && missing.length === 0) {
      components.push({ type: 'text', variant: 'caption', text: t(TEXT.noShortcut, language) });
    }
    if (missing.length > 0) {
      components.push({
        type: 'text',
        variant: 'caption',
        text: fit(labelled(t(TEXT.notFound, language), missing.join(', '), language), 80),
      });
    }
    shortcuts.forEach((shortcut, index) => {
      components.push({
        type: 'button',
        label: fit(shortcut.name, 24),
        icon: isCurrent(record, shortcut)
          ? ACTIVE_ICON
          : shortcut.kind === CONTENT_KINDS.INPUT
            ? 'log-in'
            : 'grid',
        style: 'secondary',
        action: {
          key: SHORTCUT_ACTION(index + 1),
          params: { kind: shortcut.kind, uri: shortcut.uri },
        },
      });
    });
    return { ttl_seconds: isOn(record) ? 30 : 300, components };
  },

  async action(hub, { params = {}, settings }) {
    const record = actionRecord(hub, settings);
    const uri = String(params.uri ?? '');
    if (params.kind === CONTENT_KINDS.APP) {
      const app = await hub.openApp(record, uri);
      return app ? { message: done((text) => text.opened(app.title)) } : undefined;
    }
    const input = await hub.selectInput(record, uri);
    return input ? { message: done((text) => text.opened(inputName(input))) } : undefined;
  },
};

export const WIDGETS = {
  [WIDGET_KEYS.REMOTE]: remote,
  [WIDGET_KEYS.KEYS]: keys,
  [WIDGET_KEYS.SHORTCUTS]: shortcutsWidget,
};
