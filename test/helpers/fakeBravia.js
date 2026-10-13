// -----------------------------------------------------------------------------
// An in-memory Sony Bravia TV behind the `request` seam of the client
// (src/bravia/http.js), built from the answers of the Sony documentation
// (test/fixtures/bravia/), with the behaviors that matter: Pre-Shared Key or
// PIN pairing (cookie), authentication levels of the methods, standby (most
// reads answer 40005), an application in front (error 7), a TV whose network
// sleeps (no answer at all), a sound bar that refuses the volume (40800),
// the IRCC endpoint and its case.
//
// The same class serves the Docker checks over real HTTP (braviaServer.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/bravia/${name}.json`, import.meta.url), 'utf8'));

const json = (status, body, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

// Authentication level of each method (Sony documentation).
const LEVELS = {
  getPowerStatus: 'none',
  getVolumeInformation: 'none',
  getRemoteControllerInfo: 'none',
  getCurrentExternalInputsStatus: 'none',
  getInterfaceInformation: 'none',
  getSystemInformation: 'private',
  getPlayingContentInfo: 'private',
  getApplicationList: 'private',
  getSourceList: 'private',
  getContentCount: 'private',
  getContentList: 'private',
};

const header = (headers, name) => {
  const key = Object.keys(headers ?? {}).find((item) => item.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : headers[key];
};

let cookieCounter = 0;

export class FakeBravia {
  /**
   * @param {object} [options]
   * @param {'psk'|'pin'} [options.auth]
   * @param {string} [options.psk]
   * @param {string} [options.pin] the PIN the TV shows
   * @param {'active'|'standby'} [options.power]
   * @param {string} [options.system] fixture name of getSystemInformation
   * @param {string} [options.inputs] fixture name of the inputs
   * @param {boolean} [options.remoteStart] setPowerStatus(true) accepted in standby
   * @param {boolean} [options.upperIrcc] the IRCC endpoint is /sony/IRCC
   */
  constructor({
    auth = 'psk',
    psk = '0000-secret',
    pin = '4821',
    power = 'active',
    system = 'system-information',
    inputs = 'inputs',
    remoteStart = true,
    upperIrcc = false,
  } = {}) {
    this.auth = auth;
    this.psk = psk;
    this.pin = pin;
    this.power = power;
    this.system = fixture(system).result[0];
    this.inputs = fixture(inputs).result[0];
    this.apps = fixture('apps').result[0];
    this.codes = fixture('remote-controller-info').result[1];
    this.channels = fixture('content-list').result[0];
    this.volume = { volume: 25, mute: false, max: 100 };
    // What is on screen: an input or a channel URI, or null for an application.
    this.content = 'extInput:hdmi?port=2';
    this.foregroundApp = null;
    this.remoteStart = remoteStart;
    this.upperIrcc = upperIrcc;
    // false: the network sleeps (no answer); 'timeout' fails like a timeout.
    this.online = true;
    // A sound bar over HDMI: setAudioVolume refused (40800).
    this.soundBar = false;
    this.cookies = new Set();
    this.pinShown = 0;
    this.registered = [];
    this.requests = [];
    this.keys = [];
    this.failNext = null; // { method, error: [code, text] } or { method, status }
  }

  /** Something else changed the screen (the remote, a console over HDMI-CEC). */
  show(uri) {
    this.content = uri;
    this.foregroundApp = null;
  }

  openApp(uri) {
    this.content = null;
    this.foregroundApp = uri;
  }

  playing() {
    if (this.content === null) {
      return null;
    }
    const input = this.inputs.find((item) => item.uri === this.content);
    if (input) {
      return { source: this.content.split('?')[0], title: input.title, uri: input.uri };
    }
    const channel = this.channels.find((item) => item.uri === this.content);
    if (channel) {
      return {
        ...fixture('playing-tv').result[0],
        title: channel.title,
        dispNum: channel.dispNum,
        uri: channel.uri,
      };
    }
    return null;
  }

  authorized(headers) {
    if (this.auth === 'psk') {
      return header(headers, 'X-Auth-PSK') === this.psk;
    }
    const cookie = header(headers, 'Cookie') ?? '';
    return [...this.cookies].some((value) => cookie.includes(value));
  }

  refuse() {
    return this.auth === 'psk'
      ? json(403, { error: [403, 'Forbidden'] })
      : json(401, { error: [401, 'Unauthorized'] });
  }

  /**
   * One HTTP exchange.
   * @param {{ url: string, method: string, headers: object, body: string }} request
   */
  handle({ url, method, headers, body }) {
    const path = new URL(url).pathname;
    if (method !== 'POST') {
      return json(404, { error: [404, 'Not Found'] });
    }
    if (path === '/sony/ircc' || path === '/sony/IRCC') {
      return this.ircc(path, headers, body);
    }
    const service = path.replace(/^\/sony\//, '');
    let request;
    try {
      request = JSON.parse(body);
    } catch {
      return json(200, { error: [5, 'Illegal Request'] });
    }
    const { method: name, params = [], id } = request;
    this.requests.push({ service, method: name, params });
    if (this.failNext && this.failNext.method === name) {
      const failure = this.failNext;
      this.failNext = null;
      return failure.status
        ? { status: failure.status, headers: {}, body: '' }
        : json(200, { error: failure.error, id });
    }
    if (service === 'accessControl' && name === 'actRegister') {
      return this.register(headers, params, id);
    }
    const level = LEVELS[name] ?? 'generic';
    if (level !== 'none' && !this.authorized(headers)) {
      return this.refuse();
    }
    const answer = this.answer(service, name, params[0] ?? {});
    if (answer && answer.error) {
      return json(200, { error: answer.error, id });
    }
    if (answer === undefined) {
      return json(200, { error: [12, 'No Such Method'], id });
    }
    return json(200, { result: answer, id });
  }

  register(headers, params, id) {
    if (this.auth !== 'pin') {
      return json(200, { result: [], id });
    }
    const authorization = header(headers, 'Authorization') ?? '';
    const typed = Buffer.from(authorization.replace(/^Basic /, ''), 'base64').toString('utf8');
    if (typed !== `:${this.pin}`) {
      this.pinShown += 1;
      return json(401, { error: [401, 'Unauthorized'] });
    }
    cookieCounter += 1;
    const value = `auth=${'f'.repeat(8)}${cookieCounter}`;
    this.cookies.add(value);
    this.registered.push(params[0]?.clientid);
    return json(
      200,
      { result: [], id },
      {
        'set-cookie': [
          `${value}; Path=/sony/; Max-Age=1209600; Expires=Tue, 27 Oct 2026 10:00:00 GMT+00:00`,
        ],
      },
    );
  }

  /** Every cookie forgotten: the TV restarted. */
  forgetCookies() {
    this.cookies.clear();
  }

  ircc(path, headers, body) {
    const wanted = this.upperIrcc ? '/sony/IRCC' : '/sony/ircc';
    if (path !== wanted) {
      return { status: 404, headers: {}, body: '' };
    }
    if (!this.authorized(headers)) {
      return this.refuse();
    }
    const code = /<IRCCCode>([^<]*)<\/IRCCCode>/.exec(body ?? '')?.[1] ?? '';
    const key = this.codes.find((item) => item.value === code);
    if (!key || (this.power !== 'active' && key.name !== 'Power')) {
      return { status: 500, headers: { 'content-type': 'text/xml' }, body: '<s:Fault/>' };
    }
    this.keys.push(key.name);
    if (key.name === 'Home') {
      this.openApp(null);
    }
    return { status: 200, headers: { 'content-type': 'text/xml' }, body: '' };
  }

  answer(service, name, params) {
    const on = this.power === 'active';
    const offError = { error: [40005, 'Display Is Turned off'] };
    switch (`${service}.${name}`) {
      case 'system.getPowerStatus':
        return [{ status: this.power }];
      case 'system.getSystemInformation':
        return [this.system];
      case 'system.getRemoteControllerInfo':
        return [{ bundled: true, type: 'IR_REMOTE_BUNDLE_TYPE_AEP' }, this.codes];
      case 'system.setPowerStatus':
        if (params.status === true && !on && !this.remoteStart) {
          return { error: [7, 'Illegal State'] };
        }
        this.power = params.status ? 'active' : 'standby';
        return [];
      case 'audio.getVolumeInformation':
        if (!on) {
          return offError;
        }
        return [
          [
            {
              target: 'speaker',
              volume: this.volume.volume,
              mute: this.volume.mute,
              maxVolume: 100,
              minVolume: 0,
            },
            { target: 'headphone', volume: 10, mute: false, maxVolume: 100, minVolume: 0 },
          ],
        ];
      case 'audio.setAudioVolume': {
        if (!on) {
          return offError;
        }
        if (this.soundBar || !['speaker', ''].includes(params.target)) {
          return { error: [40800, 'Target Not Supported'] };
        }
        const raw = String(params.volume);
        const value = /^[+-]/.test(raw) ? this.volume.volume + Number(raw) : Number(raw);
        if (!Number.isFinite(value) || value < 0 || value > 100) {
          return { error: [40801, 'Volume Out of Range'] };
        }
        this.volume = { ...this.volume, volume: value, mute: false };
        return [0];
      }
      case 'audio.setAudioMute':
        if (!on) {
          return offError;
        }
        this.volume = { ...this.volume, mute: params.status === true };
        return [0];
      case 'avContent.getPlayingContentInfo': {
        if (!on) {
          return offError;
        }
        const playing = this.playing();
        return playing ? [playing] : { error: [7, 'Illegal State'] };
      }
      case 'avContent.getCurrentExternalInputsStatus':
        return [this.inputs];
      case 'avContent.setPlayContent':
        if (!on) {
          return offError;
        }
        if (
          !this.inputs.some((item) => item.uri === params.uri) &&
          !this.channels.some((item) => item.uri === params.uri)
        ) {
          return { error: [41001, 'Content does Not Exist'] };
        }
        this.show(params.uri);
        return [];
      case 'avContent.getSourceList':
        return params.scheme === 'tv' ? [[{ source: 'tv:dvbt' }]] : [[]];
      case 'avContent.getContentCount':
        return [{ count: params.source === 'tv:dvbt' ? this.channels.length : 0 }];
      case 'avContent.getContentList':
        return [
          params.source === 'tv:dvbt'
            ? this.channels.slice(params.stIdx ?? 0, (params.stIdx ?? 0) + (params.cnt ?? 50))
            : [],
        ];
      case 'appControl.getApplicationList':
        return [this.apps];
      case 'appControl.setActiveApp':
        if (!this.apps.some((item) => item.uri === params.uri)) {
          return { error: [41401, 'Failed to Launch'] };
        }
        // Launching an application turns a TV in standby on, as on a real TV.
        this.power = 'active';
        this.openApp(params.uri);
        return [];
      default:
        return undefined;
    }
  }
}

/**
 * A fake network: the `request` seam of the client, routing by origin to the
 * fake TVs. A TV whose `online` is false never answers.
 * @param {Record<string, FakeBravia>} tvs by base URL
 */
export function createNetwork(tvs) {
  const network = {
    tvs,
    async request(url, { method = 'POST', headers = {}, body } = {}) {
      const tv = network.tvs[new URL(url).origin];
      if (!tv || tv.online === false) {
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      if (tv.online === 'timeout') {
        const error = new Error('Timed out after 10000 ms');
        error.code = 'ETIMEDOUT';
        throw error;
      }
      return tv.handle({ url, method, headers, body });
    },
  };
  return network;
}
