// -----------------------------------------------------------------------------
// Client of the Sony Bravia "IP control" API of one TV: JSON-RPC over HTTP
// (`POST /sony/<service>`) for the states and most commands, and the IRCC
// SOAP endpoint (`POST /sony/ircc`) for the remote control keys.
//
// Authentication, as set on the TV (Settings → Network → IP control):
//   - Pre-Shared Key: the `X-Auth-PSK` header on every request;
//   - PIN: `accessControl.actRegister` with the 4-digit code shown on the TV,
//     which answers an `auth` cookie (valid about two weeks); the client
//     registers again with the same PIN when the TV refuses the cookie.
// The status reads (`getPowerStatus`, `getVolumeInformation`…) need no
// authentication; the content reads and every command do.
//
// Every failure is a BraviaError with a `kind` (ERROR_KINDS): the hub decides
// what each one means for the user. No secret ever goes into a message.
// (Protocol details from the Sony documentation and from pybravia, MIT,
// github.com/Drafteed/pybravia.)
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  // No answer: the TV is off with its network asleep, or not at this address.
  UNREACHABLE: 'unreachable',
  // The key or the PIN was refused.
  AUTH: 'auth',
  // The TV wants a key and none is configured.
  NO_KEY: 'no_key',
  // Something answers, but not the Bravia API (or it is disabled).
  NOT_BRAVIA: 'not_bravia',
  // The TV answers but its screen is off (error 40005).
  TURNED_OFF: 'turned_off',
  // The TV cannot handle the request now (error 7, a request in progress…).
  BUSY: 'busy',
  // Any other error of the API, its code in `code`.
  API: 'api',
});

export class BraviaError extends Error {
  /**
   * @param {string} kind ERROR_KINDS
   * @param {string} message
   * @param {number|null} [code] error code of the API, or HTTP status
   */
  constructor(kind, message, code = null) {
    super(message);
    this.name = 'BraviaError';
    this.kind = kind;
    this.code = code;
  }
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
]);

// Some TVs ignore the first IRCC key after a long idle time without any
// error (dcnielsen90/python-bravia-tv#15): an empty request wakes them first.
const IRCC_IDLE_MS = 10 * 60_000;
const PAIRING_PIN = '0000';

const IRCC_BODY = (code) =>
  '<?xml version="1.0"?>' +
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"' +
  ' s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
  '<s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">' +
  `<IRCCCode>${code}</IRCCCode>` +
  '</u:X_SendIRCC></s:Body></s:Envelope>';

/** The `auth=…` pair of the Set-Cookie headers of a registration. */
export function authCookieOf(headers = {}) {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  for (const cookie of cookies) {
    const match = /(?:^|;\s*)auth=([^;]+)/.exec(cookie);
    if (match) {
      return `auth=${match[1]}`;
    }
  }
  return null;
}

/** An API error code and message out of `{ error: [code, message] }`. */
function apiError(method, error) {
  const [code, text] = Array.isArray(error) ? error : [null, String(error)];
  const message = `${method}: error ${code ?? '?'} (${typeof text === 'string' ? text : '?'})`;
  if (code === 401 || code === 403) {
    return new BraviaError(ERROR_KINDS.AUTH, message, code);
  }
  if (code === 40005 || /not power-on|turned off/i.test(String(text))) {
    return new BraviaError(ERROR_KINDS.TURNED_OFF, message, code);
  }
  if (code === 7 || code === 40003 || code === 41400) {
    return new BraviaError(ERROR_KINDS.BUSY, message, code);
  }
  return new BraviaError(ERROR_KINDS.API, message, code);
}

export class BraviaClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl `http(s)://host[:port]`
   * @param {string} [options.psk] Pre-Shared Key
   * @param {string} [options.pin] PIN shown by the TV at pairing
   * @param {string} [options.clientId] stable id of this Gladys, for the PIN registration
   * @param {string} [options.nickname] name shown by the TV in its list of registered devices
   * @param {Function} [options.request] HTTP seam (src/bravia/http.js)
   * @param {() => number} [options.now]
   */
  constructor({ baseUrl, psk, pin, clientId, nickname, request, now }) {
    this.baseUrl = baseUrl;
    this.psk = psk || null;
    this.pin = pin || null;
    this.clientId = clientId || 'Gladys:gladys-sony-bravia';
    this.nickname = nickname || 'Gladys Assistant';
    this.request = request ?? httpRequest;
    this.now = now ?? (() => Date.now());
    this.cookie = null;
    this.registering = null;
    this.irccPath = 'ircc';
    this.irccAt = 0;
    this.sequence = 0;
  }

  get hasCredentials() {
    return Boolean(this.psk || this.pin);
  }

  authHeaders() {
    if (this.psk) {
      return { 'X-Auth-PSK': this.psk };
    }
    if (this.cookie) {
      return { Cookie: this.cookie };
    }
    return {};
  }

  /** One HTTP exchange; network failures become UNREACHABLE. */
  async send(path, { headers, body, timeoutMs }) {
    try {
      return await this.request(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Cache-Control': 'no-cache', ...headers },
        body,
        timeoutMs,
      });
    } catch (err) {
      if (NETWORK_CODES.has(err.code) || err.name === 'AbortError') {
        throw new BraviaError(ERROR_KINDS.UNREACHABLE, `${path}: ${err.code ?? err.message}`);
      }
      throw new BraviaError(ERROR_KINDS.UNREACHABLE, `${path}: ${err.message}`);
    }
  }

  /** The error of a refused authentication, worded for what is configured. */
  authError(what, code) {
    return this.hasCredentials
      ? new BraviaError(ERROR_KINDS.AUTH, `${what}: authentication refused`, code)
      : new BraviaError(ERROR_KINDS.NO_KEY, `${what}: the TV asks for a key`, code);
  }

  /**
   * A JSON-RPC call. Resolves with the `result` array.
   * @param {string} service system, audio, avContent, appControl…
   * @param {string} method
   * @param {Array} [params]
   * @param {object} [options]
   */
  async call(service, method, params = [], { version = '1.0', timeoutMs = 10_000 } = {}) {
    const attempt = async () => {
      this.sequence = (this.sequence % 1_000_000) + 1;
      const response = await this.send(`/sony/${service}`, {
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          ...this.authHeaders(),
        },
        body: JSON.stringify({ method, id: this.sequence, params, version }),
        timeoutMs,
      });
      if (response.status === 401 || response.status === 403) {
        throw this.authError(method, response.status);
      }
      if (response.status === 404) {
        throw new BraviaError(ERROR_KINDS.NOT_BRAVIA, `${method}: HTTP 404`, 404);
      }
      let json;
      try {
        json = JSON.parse(response.body);
      } catch {
        throw new BraviaError(
          ERROR_KINDS.NOT_BRAVIA,
          `${method}: HTTP ${response.status}, not a JSON answer`,
          response.status,
        );
      }
      if (json && json.error) {
        const err = apiError(method, json.error);
        throw err.kind === ERROR_KINDS.AUTH ? this.authError(method, err.code) : err;
      }
      if (response.status !== 200 || !json || !Array.isArray(json.result)) {
        throw new BraviaError(
          ERROR_KINDS.API,
          `${method}: HTTP ${response.status}`,
          response.status,
        );
      }
      return json.result;
    };
    return this.withRegistration(attempt);
  }

  /**
   * With a PIN, a refused request first registers again (the cookie expired
   * or the TV restarted), then is sent once more.
   */
  async withRegistration(attempt) {
    try {
      return await attempt();
    } catch (err) {
      if (err.kind !== ERROR_KINDS.AUTH || this.psk || !this.pin) {
        throw err;
      }
      await this.register();
      return attempt();
    }
  }

  /** PIN registration: one at a time, shared by concurrent requests. */
  register(pin = this.pin) {
    this.registering ??= this.registerOnce(pin)
      .then((cookie) => {
        if (!cookie) {
          throw new BraviaError(ERROR_KINDS.AUTH, 'actRegister: no authentication cookie');
        }
        this.cookie = cookie;
      })
      .finally(() => {
        this.registering = null;
      });
    return this.registering;
  }

  /** One `actRegister`; resolves with the `auth=…` cookie the TV set, if any. */

  async registerOnce(pin) {
    const response = await this.send('/sony/accessControl', {
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: `Basic ${Buffer.from(`:${pin}`).toString('base64')}`,
      },
      body: JSON.stringify({
        method: 'actRegister',
        id: 8,
        params: [
          { clientid: this.clientId, nickname: this.nickname, level: 'private' },
          [{ value: 'yes', function: 'WOL' }],
        ],
        version: '1.0',
      }),
      timeoutMs: 10_000,
    });
    if (response.status === 401 || response.status === 403) {
      throw new BraviaError(ERROR_KINDS.AUTH, 'actRegister: PIN refused', response.status);
    }
    if (response.status === 404) {
      throw new BraviaError(ERROR_KINDS.NOT_BRAVIA, 'actRegister: HTTP 404', 404);
    }
    if (response.status !== 200) {
      throw new BraviaError(
        ERROR_KINDS.API,
        `actRegister: HTTP ${response.status}`,
        response.status,
      );
    }
    return authCookieOf(response.headers);
  }

  /**
   * Ask the TV to show a PIN on screen (a registration with a wrong PIN
   * starts the pairing).
   * @returns {Promise<'shown'|'accepted'>} `accepted`: the TV needs no PIN for this Gladys
   */
  async requestPin() {
    try {
      await this.registerOnce(PAIRING_PIN);
      return 'accepted';
    } catch (err) {
      if (err.kind === ERROR_KINDS.AUTH && err.code === 401) {
        return 'shown';
      }
      throw err;
    }
  }

  /** One remote control key, by its IRCC code (base64). */
  async sendIrcc(code) {
    if (this.now() - this.irccAt > IRCC_IDLE_MS) {
      // Wakes a TV that would drop the first key, and finds the endpoint case
      // (`/sony/IRCC` on some models, home-assistant/core#86132).
      try {
        await this.irccOnce('');
      } catch (err) {
        if (err.code === 404) {
          this.irccPath = this.irccPath === 'ircc' ? 'IRCC' : 'ircc';
        } else if (err.kind === ERROR_KINDS.UNREACHABLE) {
          throw err;
        }
      }
    }
    this.irccAt = this.now();
    return this.withRegistration(() => this.irccOnce(code));
  }

  async irccOnce(code) {
    const response = await this.send(`/sony/${this.irccPath}`, {
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
        ...this.authHeaders(),
      },
      body: IRCC_BODY(code),
      timeoutMs: 10_000,
    });
    if (response.status === 200) {
      return true;
    }
    if (response.status === 401 || response.status === 403) {
      throw this.authError('X_SendIRCC', response.status);
    }
    if (response.status === 404) {
      throw new BraviaError(ERROR_KINDS.NOT_BRAVIA, 'X_SendIRCC: HTTP 404', 404);
    }
    // A SOAP fault (HTTP 500): an unknown code, or a key the TV refuses now.
    throw new BraviaError(ERROR_KINDS.API, `X_SendIRCC: HTTP ${response.status}`, response.status);
  }

  // --- Reads --------------------------------------------------------------------

  /** 'active' or 'standby'. */
  async getPowerStatus() {
    const [result] = await this.call('system', 'getPowerStatus', [], { timeoutMs: 5_000 });
    return result?.status === 'active' ? 'active' : 'standby';
  }

  async getSystemInformation() {
    const [result] = await this.call('system', 'getSystemInformation');
    return result ?? {};
  }

  async getVolumeInformation() {
    const [result] = await this.call('audio', 'getVolumeInformation');
    return Array.isArray(result) ? result : [];
  }

  /** The content on screen, null when the TV does not tell (an app, the home screen). */
  async getPlayingContentInfo() {
    try {
      const [result] = await this.call('avContent', 'getPlayingContentInfo');
      return result && typeof result === 'object' ? result : null;
    } catch (err) {
      // 7 "Illegal State": an application is in front.
      if (err.kind === ERROR_KINDS.BUSY || err.kind === ERROR_KINDS.TURNED_OFF) {
        return null;
      }
      throw err;
    }
  }

  async getExternalInputs() {
    const [result] = await this.call('avContent', 'getCurrentExternalInputsStatus');
    return Array.isArray(result) ? result : [];
  }

  async getApplicationList() {
    const [result] = await this.call('appControl', 'getApplicationList');
    return Array.isArray(result) ? result : [];
  }

  /** The IRCC codes of the TV's remote: `[{ name, value }]`. */
  async getRemoteControllerInfo() {
    const result = await this.call('system', 'getRemoteControllerInfo');
    return Array.isArray(result[1]) ? result[1] : [];
  }

  /** Every broadcast channel of the TV (tuner sources `tv:dvbt`, `tv:dvbs`…). */
  async getChannels() {
    const [sources] = await this.call('avContent', 'getSourceList', [{ scheme: 'tv' }]);
    const channels = [];
    for (const { source } of Array.isArray(sources) ? sources : []) {
      if (typeof source !== 'string') {
        continue;
      }
      const [count] = await this.call('avContent', 'getContentCount', [{ source }], {
        timeoutMs: 20_000,
      });
      const total = Math.min(Number(count?.count) || 0, 2000);
      for (let index = 0; index < total; index += 50) {
        const [page] = await this.call(
          'avContent',
          'getContentList',
          [{ source, stIdx: index, cnt: Math.min(50, total - index) }],
          { timeoutMs: 20_000 },
        );
        if (!Array.isArray(page) || page.length === 0) {
          break;
        }
        channels.push(...page);
      }
    }
    return channels;
  }

  // --- Commands ---------------------------------------------------------------------

  async setPowerStatus(on) {
    await this.call('system', 'setPowerStatus', [{ status: Boolean(on) }]);
  }

  /**
   * @param {string} volume "25", "+2" or "-2"
   * @param {string} [target] "speaker", "headphone", or "" for every output
   */
  async setAudioVolume(volume, target = 'speaker') {
    await this.call('audio', 'setAudioVolume', [{ target, volume: String(volume) }]);
  }

  async setAudioMute(mute) {
    await this.call('audio', 'setAudioMute', [{ status: Boolean(mute) }]);
  }

  /** An input (`extInput:hdmi?port=2`) or a channel (`tv:dvbt?trip=…`). */
  async setPlayContent(uri) {
    await this.call('avContent', 'setPlayContent', [{ uri }]);
  }

  async setActiveApp(uri) {
    try {
      await this.call('appControl', 'setActiveApp', [{ uri }], { timeoutMs: 15_000 });
    } catch (err) {
      // 41402: accepted, the end of the launch cannot be told.
      if (err.code !== 41402) {
        throw err;
      }
    }
  }
}
