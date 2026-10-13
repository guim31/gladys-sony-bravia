// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widgets (src/widgets.js):
// connection status, errors, the reports of the configuration actions, the
// errors of the commands and scene actions. Four languages, the four of the
// Gladys interface; German says "du", Spanish "usted". test/i18n.test.js
// checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './bravia/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noTv: {
    en: 'Enter the address of your TV in the configuration.',
    fr: "Saisissez l'adresse de votre téléviseur dans la configuration.",
    de: 'Gib die Adresse deines Fernsehers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su televisor en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. 192.168.1.20',
    fr: 'Adresse incomprise, ex. 192.168.1.20',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.20',
    es: 'Dirección no válida, p. ej. 192.168.1.20',
  },
};

// One short explanation per error kind (src/bravia/client.js), plus the TV
// never reached since the integration started.
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'does not answer (off, or remote start disabled)',
    fr: 'ne répond pas (éteint, ou démarrage à distance désactivé)',
    de: 'antwortet nicht (aus, oder Fernstart deaktiviert)',
    es: 'no responde (apagado, o encendido remoto desactivado)',
  },
  notReached: {
    en: 'not reached yet: turn the TV on once',
    fr: 'pas encore joint : allumez le téléviseur une fois',
    de: 'noch nicht erreicht: Schalte den Fernseher einmal ein',
    es: 'aún no se ha conectado: encienda el televisor una vez',
  },
  duplicate: {
    en: 'the same TV as another slot: empty this one',
    fr: "le même téléviseur qu'un autre emplacement : videz celui-ci",
    de: 'derselbe Fernseher wie in einem anderen Platz: Leere diesen',
    es: 'el mismo televisor que otra posición: vacíe esta',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'key or PIN refused',
    fr: 'clé ou code PIN refusé',
    de: 'Schlüssel oder PIN abgelehnt',
    es: 'clave o PIN rechazado',
  },
  [ERROR_KINDS.NO_KEY]: {
    en: 'the TV asks for a pre-shared key or a PIN',
    fr: 'le téléviseur demande une clé pré-partagée ou un code PIN',
    de: 'der Fernseher verlangt einen Pre-Shared Key oder eine PIN',
    es: 'el televisor pide una clave precompartida o un PIN',
  },
  [ERROR_KINDS.NOT_BRAVIA]: {
    en: 'no Bravia IP control at this address',
    fr: 'pas de contrôle IP Bravia à cette adresse',
    de: 'keine Bravia-IP-Steuerung unter dieser Adresse',
    es: 'no hay control IP de Bravia en esta dirección',
  },
  [ERROR_KINDS.TURNED_OFF]: {
    en: 'the screen is off',
    fr: "l'écran est éteint",
    de: 'der Bildschirm ist aus',
    es: 'la pantalla está apagada',
  },
  [ERROR_KINDS.BUSY]: {
    en: 'the TV is busy, try again',
    fr: 'le téléviseur est occupé, réessayez',
    de: 'der Fernseher ist beschäftigt, versuche es erneut',
    es: 'el televisor está ocupado, vuelva a intentarlo',
  },
  [ERROR_KINDS.API]: {
    en: 'the TV refused the request, see the logs',
    fr: 'le téléviseur a refusé la demande, voir les logs',
    de: 'der Fernseher hat die Anfrage abgelehnt, sieh in den Protokollen nach',
    es: 'el televisor ha rechazado la solicitud, consulte los registros',
  },
};

// The "Test the connection" report, one line per TV.
export const REPORT_TEXT = {
  en: {
    on: (model) => `OK, ${model}, on`,
    standby: (model) => `OK, ${model}, in standby`,
    apps: (count) => `${count} app(s)`,
  },
  fr: {
    on: (model) => `OK, ${model}, allumé`,
    standby: (model) => `OK, ${model}, en veille`,
    apps: (count) => `${count} application(s)`,
  },
  de: {
    on: (model) => `OK, ${model}, eingeschaltet`,
    standby: (model) => `OK, ${model}, im Standby`,
    apps: (count) => `${count} App(s)`,
  },
  es: {
    on: (model) => `OK, ${model}, encendido`,
    standby: (model) => `OK, ${model}, en espera`,
    apps: (count) => `${count} aplicación(es)`,
  },
};

// The "Show a PIN on the TV" action.
export const PIN_TEXT = {
  en: {
    shown: (slot) =>
      `A PIN is shown on the TV: type it in the "PIN" field of TV ${slot}, then save.`,
    notNeeded: 'This TV accepted Gladys without a PIN.',
    usePsk: 'A pre-shared key is set for this TV: no PIN is needed.',
    noAddress: (slot) => `Enter the address of TV ${slot} first, then save.`,
  },
  fr: {
    shown: (slot) =>
      `Un code PIN s'affiche sur le téléviseur : saisissez-le dans le champ « Code PIN » du téléviseur ${slot}, puis enregistrez.`,
    notNeeded: 'Ce téléviseur a accepté Gladys sans code PIN.',
    usePsk: 'Une clé pré-partagée est saisie pour ce téléviseur : pas besoin de code PIN.',
    noAddress: (slot) => `Saisissez d'abord l'adresse du téléviseur ${slot}, puis enregistrez.`,
  },
  de: {
    shown: (slot) =>
      `Der Fernseher zeigt eine PIN: Gib sie im Feld „PIN“ von Fernseher ${slot} ein und speichere.`,
    notNeeded: 'Dieser Fernseher hat Gladys ohne PIN akzeptiert.',
    usePsk: 'Für diesen Fernseher ist ein Pre-Shared Key gesetzt: Keine PIN nötig.',
    noAddress: (slot) => `Gib zuerst die Adresse von Fernseher ${slot} ein und speichere.`,
  },
  es: {
    shown: (slot) =>
      `El televisor muestra un PIN: introdúzcalo en el campo «PIN» del televisor ${slot} y guarde.`,
    notNeeded: 'Este televisor ha aceptado Gladys sin PIN.',
    usePsk: 'Hay una clave precompartida para este televisor: no hace falta ningún PIN.',
    noAddress: (slot) => `Introduzca primero la dirección del televisor ${slot} y guarde.`,
  },
};

// Errors of the commands, scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  en: {
    noTv: 'No TV is configured.',
    unknownTv: 'This TV is no longer in the configuration.',
    chooseTv: 'Several TVs are configured: choose one.',
    notReached: 'This TV has not answered yet.',
    unknownApp: (name) => `No app "${name}" on this TV.`,
    unknownInput: (name) => `No input "${name}" on this TV.`,
    unknownChannel: (number) => `No channel ${number} on this TV.`,
    unknownKey: (key) => `Unknown key "${key}".`,
    notOn: 'The TV did not turn on: enable "Remote start" on the TV.',
    noWake: 'The TV does not answer, and its MAC address is unknown for Wake-on-LAN.',
  },
  fr: {
    noTv: "Aucun téléviseur n'est configuré.",
    unknownTv: "Ce téléviseur n'est plus dans la configuration.",
    chooseTv: 'Plusieurs téléviseurs sont configurés : choisissez-en un.',
    notReached: "Ce téléviseur n'a pas encore répondu.",
    unknownApp: (name) => `Aucune application « ${name} » sur ce téléviseur.`,
    unknownInput: (name) => `Aucune entrée « ${name} » sur ce téléviseur.`,
    unknownChannel: (number) => `Aucune chaîne ${number} sur ce téléviseur.`,
    unknownKey: (key) => `Touche inconnue « ${key} ».`,
    notOn:
      "Le téléviseur ne s'est pas allumé : activez « Démarrage à distance » sur le téléviseur.",
    noWake: 'Le téléviseur ne répond pas, et son adresse MAC est inconnue pour le Wake-on-LAN.',
  },
  de: {
    noTv: 'Kein Fernseher ist konfiguriert.',
    unknownTv: 'Dieser Fernseher ist nicht mehr in der Konfiguration.',
    chooseTv: 'Mehrere Fernseher sind konfiguriert: Wähle einen aus.',
    notReached: 'Dieser Fernseher hat noch nicht geantwortet.',
    unknownApp: (name) => `Keine App „${name}“ auf diesem Fernseher.`,
    unknownInput: (name) => `Kein Eingang „${name}“ auf diesem Fernseher.`,
    unknownChannel: (number) => `Kein Kanal ${number} auf diesem Fernseher.`,
    unknownKey: (key) => `Unbekannte Taste „${key}“.`,
    notOn: 'Der Fernseher hat sich nicht eingeschaltet: Aktiviere „Fernstart“ am Fernseher.',
    noWake: 'Der Fernseher antwortet nicht, und seine MAC-Adresse ist für Wake-on-LAN unbekannt.',
  },
  es: {
    noTv: 'No hay ningún televisor configurado.',
    unknownTv: 'Este televisor ya no está en la configuración.',
    chooseTv: 'Hay varios televisores configurados: elija uno.',
    notReached: 'Este televisor aún no ha respondido.',
    unknownApp: (name) => `No hay ninguna aplicación «${name}» en este televisor.`,
    unknownInput: (name) => `No hay ninguna entrada «${name}» en este televisor.`,
    unknownChannel: (number) => `No hay ningún canal ${number} en este televisor.`,
    unknownKey: (key) => `Tecla desconocida «${key}».`,
    notOn: 'El televisor no se ha encendido: active «Encendido remoto» en el televisor.',
    noWake: 'El televisor no responde y su dirección MAC es desconocida para Wake-on-LAN.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** An Error whose message is in the configured language (Gladys shows it). */
export function failure(language, key, ...args) {
  const table = pick(ACTION_TEXT, language);
  const entry = table[key];
  const error = new Error(typeof entry === 'function' ? entry(...args) : entry);
  error.userFacing = true;
  return error;
}
