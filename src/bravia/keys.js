// -----------------------------------------------------------------------------
// The remote control keys offered by the "Send a remote control key" scene
// action and the "Bravia keys" widget. Each key has a stable key of ours
// (stored in the scenes and widget settings: permanent once published) and
// the name Sony gives it in `getRemoteControllerInfo`; the code itself is
// read from the TV, with the codes of the Sony documentation as a fallback
// (pro-bravia.sony.net, IRCC-IP, "getRemoteControllerInfo").
// -----------------------------------------------------------------------------

export const KEYS = Object.freeze({
  home: { sony: 'Home', code: 'AAAAAQAAAAEAAABgAw==' },
  back: { sony: 'Back', code: 'AAAAAgAAAJcAAAAjAw==' },
  up: { sony: 'Up', code: 'AAAAAQAAAAEAAAB0Aw==' },
  down: { sony: 'Down', code: 'AAAAAQAAAAEAAAB1Aw==' },
  left: { sony: 'Left', code: 'AAAAAQAAAAEAAAA0Aw==' },
  right: { sony: 'Right', code: 'AAAAAQAAAAEAAAAzAw==' },
  confirm: { sony: 'Confirm', code: 'AAAAAQAAAAEAAABlAw==' },
  options: { sony: 'Options', code: 'AAAAAgAAAJcAAAA2Aw==' },
  input: { sony: 'Input', code: 'AAAAAQAAAAEAAAAlAw==' },
  info: { sony: 'Display', code: 'AAAAAQAAAAEAAAA6Aw==' },
  volume_up: { sony: 'VolumeUp', code: 'AAAAAQAAAAEAAAASAw==' },
  volume_down: { sony: 'VolumeDown', code: 'AAAAAQAAAAEAAAATAw==' },
  mute: { sony: 'Mute', code: 'AAAAAQAAAAEAAAAUAw==' },
  channel_up: { sony: 'ChannelUp', code: 'AAAAAQAAAAEAAAAQAw==' },
  channel_down: { sony: 'ChannelDown', code: 'AAAAAQAAAAEAAAARAw==' },
  play: { sony: 'Play', code: 'AAAAAgAAAJcAAAAaAw==' },
  pause: { sony: 'Pause', code: 'AAAAAgAAAJcAAAAZAw==' },
  stop: { sony: 'Stop', code: 'AAAAAgAAAJcAAAAYAw==' },
  previous: { sony: 'Prev', code: 'AAAAAgAAAJcAAAA8Aw==' },
  next: { sony: 'Next', code: 'AAAAAgAAAJcAAAA9Aw==' },
  red: { sony: 'Red', code: 'AAAAAgAAAJcAAAAlAw==' },
  green: { sony: 'Green', code: 'AAAAAgAAAJcAAAAmAw==' },
  yellow: { sony: 'Yellow', code: 'AAAAAgAAAJcAAAAnAw==' },
  blue: { sony: 'Blue', code: 'AAAAAgAAAJcAAAAkAw==' },
  num_0: { sony: 'Num0', code: 'AAAAAQAAAAEAAAAJAw==' },
  num_1: { sony: 'Num1', code: 'AAAAAQAAAAEAAAAAAw==' },
  num_2: { sony: 'Num2', code: 'AAAAAQAAAAEAAAABAw==' },
  num_3: { sony: 'Num3', code: 'AAAAAQAAAAEAAAACAw==' },
  num_4: { sony: 'Num4', code: 'AAAAAQAAAAEAAAADAw==' },
  num_5: { sony: 'Num5', code: 'AAAAAQAAAAEAAAAEAw==' },
  num_6: { sony: 'Num6', code: 'AAAAAQAAAAEAAAAFAw==' },
  num_7: { sony: 'Num7', code: 'AAAAAQAAAAEAAAAGAw==' },
  num_8: { sony: 'Num8', code: 'AAAAAQAAAAEAAAAHAw==' },
  num_9: { sony: 'Num9', code: 'AAAAAQAAAAEAAAAIAw==' },
});

export const KEY_NAMES = Object.keys(KEYS);

// Labels of the keys (scene action list, widget settings and buttons: 24
// characters at most). Numbers and colors aside, the words of the Gladys
// interface.
const SAME = (text) => ({ en: text, fr: text, de: text, es: text });
export const KEY_LABELS = {
  home: { en: 'Home', fr: 'Accueil', de: 'Home', es: 'Inicio' },
  back: { en: 'Back', fr: 'Retour', de: 'Zurück', es: 'Volver' },
  up: { en: 'Up', fr: 'Haut', de: 'Hoch', es: 'Arriba' },
  down: { en: 'Down', fr: 'Bas', de: 'Runter', es: 'Abajo' },
  left: { en: 'Left', fr: 'Gauche', de: 'Links', es: 'Izquierda' },
  right: { en: 'Right', fr: 'Droite', de: 'Rechts', es: 'Derecha' },
  confirm: SAME('OK'),
  options: { en: 'Options', fr: 'Options', de: 'Optionen', es: 'Opciones' },
  input: { en: 'Input', fr: 'Entrée', de: 'Eingang', es: 'Entrada' },
  info: SAME('Info'),
  volume_up: { en: 'Volume +', fr: 'Volume +', de: 'Lauter', es: 'Volumen +' },
  volume_down: { en: 'Volume −', fr: 'Volume −', de: 'Leiser', es: 'Volumen −' },
  mute: { en: 'Mute', fr: 'Muet', de: 'Stumm', es: 'Silenciar' },
  channel_up: { en: 'Channel +', fr: 'Chaîne +', de: 'Kanal +', es: 'Canal +' },
  channel_down: { en: 'Channel −', fr: 'Chaîne −', de: 'Kanal −', es: 'Canal −' },
  play: { en: 'Play', fr: 'Lecture', de: 'Abspielen', es: 'Reproducir' },
  pause: SAME('Pause'),
  stop: { en: 'Stop', fr: 'Stop', de: 'Stopp', es: 'Detener' },
  previous: { en: 'Previous', fr: 'Précédent', de: 'Vorheriger', es: 'Anterior' },
  next: { en: 'Next', fr: 'Suivant', de: 'Weiter', es: 'Siguiente' },
  red: { en: 'Red', fr: 'Rouge', de: 'Rot', es: 'Rojo' },
  green: { en: 'Green', fr: 'Vert', de: 'Grün', es: 'Verde' },
  yellow: { en: 'Yellow', fr: 'Jaune', de: 'Gelb', es: 'Amarillo' },
  blue: { en: 'Blue', fr: 'Bleu', de: 'Blau', es: 'Azul' },
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, digit) => [`num_${digit}`, SAME(String(digit))]),
  ),
};

// Feather icons of the widget buttons.
export const KEY_ICONS = {
  home: 'home',
  back: 'corner-up-left',
  up: 'chevron-up',
  down: 'chevron-down',
  left: 'chevron-left',
  right: 'chevron-right',
  confirm: 'circle',
  options: 'more-horizontal',
  input: 'log-in',
  info: 'info',
  volume_up: 'volume-2',
  volume_down: 'volume-1',
  mute: 'volume-x',
  channel_up: 'chevrons-up',
  channel_down: 'chevrons-down',
  play: 'play',
  pause: 'pause',
  stop: 'square',
  previous: 'skip-back',
  next: 'skip-forward',
};

/** The IRCC code of a key on a TV: its own list first, the documented code otherwise. */
export function codeOf(key, codes = {}) {
  const entry = KEYS[key];
  if (!entry) {
    return null;
  }
  return codes[entry.sony] ?? entry.code;
}
