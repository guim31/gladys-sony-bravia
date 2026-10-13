// -----------------------------------------------------------------------------
// The Bravia hub: one record per configured TV, read on a timer of the
// container (the interval chosen in the configuration), its states published
// to Gladys when they change, the "content changed" scene event fired on
// transitions, and every command (features, widgets, scene actions).
//
// Gladys never polls these devices (should_poll: false): the scene event must
// fire even for a TV whose device was not added, and a TV in standby is read
// cheaply (its power state only, which needs no authentication).
// -----------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { BraviaClient, ERROR_KINDS } from './bravia/client.js';
import { KEYS, codeOf } from './bravia/keys.js';
import {
  CONTENT_KINDS,
  findApp,
  findInput,
  inputName,
  parseApps,
  parseChannels,
  parseCodes,
  parseInputs,
  parsePlaying,
  parseSystemInfo,
  parseVolume,
  sameContent,
} from './bravia/model.js';
import {
  DEVICE_TEXT,
  FEATURE_KEYS,
  HOME_APP,
  OTHER_INPUT,
  buildDevice,
  deviceIds,
  featureValues,
  platformIdOf,
  tvName,
} from './devices.js';
import {
  CONNECTION_TEXT,
  ERROR_TEXT,
  PIN_TEXT,
  REPORT_TEXT,
  failure,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'bravia-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  REMOTE: 'remote',
  KEYS: 'keys',
  SHORTCUTS: 'shortcuts',
});

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  CONTENT_CHANGED: 'content_changed',
});

// Who changed what is on screen (`origin` filter and variable of the trigger).
export const ORIGINS = Object.freeze({
  GLADYS: 'gladys', // a feature, a widget button or a scene action
  TV: 'tv', // anything else: the remote, a console over HDMI-CEC, the TV itself
});

export const HUB_TIMINGS = {
  // The identity is read again daily (and at each start): a TV swapped
  // behind the same address becomes a new device.
  identityMs: 24 * 60 * 60_000,
  // Lists read again while the TV is on.
  inputsMs: 30 * 60_000,
  appsMs: 6 * 60 * 60_000,
  channelsMs: 24 * 60 * 60_000,
  // A change seen this long after a Gladys command is Gladys' own.
  ownChangeMs: 20_000,
  // Read again this long after a command, to show its effect.
  afterCommandMs: [1_500, 5_000],
  // After a power on: read at these delays (a TV takes a few seconds).
  afterPowerOnMs: [2_000, 5_000, 10_000, 20_000],
  // A command that needs the screen on waits this long for it.
  powerOnWaitMs: 20_000,
  powerOnCheckMs: 1_000,
  // Between two presses of a repeated key.
  keyRepeatMs: 300,
  // A feature command still running after this is acknowledged to Gladys.
  featureAckMs: 4_000,
};

const MAX_STATES_PER_REQUEST = 100;
const MAX_KEY_REPEAT = 10;
// Failures of a read that do not mean "this TV is misconfigured".
const TRANSIENT = new Set([ERROR_KINDS.UNREACHABLE, ERROR_KINDS.BUSY, ERROR_KINDS.TURNED_OFF]);

const signature = (tv) => JSON.stringify([tv.url, tv.psk, tv.pin]);
const emptySnapshot = () => ({ reachable: null, power: null, volume: null, playing: null });

export class BraviaHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/bravia/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   */
  constructor({ gladys, store, request, timers = true, timings, now, sleep }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.config = null;
    /** @type {Map<number, object>} TV records, by configuration slot */
    this.records = new Map();
    /** Last value published per feature external id. */
    this.published = new Map();
    this.transports = new Map();
    this.connection = null;
    this.devicesKey = null;
    this.saved = { clientId: null, tvs: {} };
    this.pollTimer = null;
    this.stopped = false;
  }

  get language() {
    return this.config?.language ?? 'fr';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      clientId:
        typeof saved.clientId === 'string' && saved.clientId
          ? saved.clientId
          : `Gladys:${randomUUID()}`,
      tvs: saved.tvs && typeof saved.tvs === 'object' ? saved.tvs : {},
    };
    if (saved.clientId !== this.saved.clientId) {
      this.store.save(this.saved);
    }
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transports.clear();
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const wanted = new Map(config.tvs.map((tv) => [tv.slot, tv]));
    for (const [slot, record] of this.records) {
      const tv = wanted.get(slot);
      if (!tv || record.signature !== signature(tv)) {
        this.dropRecord(record);
        this.records.delete(slot);
      }
    }
    for (const tv of config.tvs) {
      const record = this.records.get(tv.slot);
      if (record) {
        record.tv = tv; // a new name: same client
      } else {
        this.records.set(tv.slot, this.newRecord(tv));
      }
    }
    // The language of the option labels may have changed.
    this.devicesKey = null;
    await this.publishDevices();
    await this.pollAll({ full: true });
    this.schedulePoll();
  }

  newRecord(tv) {
    const saved = this.saved.tvs[tv.slot] ?? {};
    const identity =
      saved.identity && typeof saved.identity.platformId === 'string' ? saved.identity : null;
    return {
      tv,
      signature: signature(tv),
      client: new BraviaClient({
        baseUrl: tv.url,
        psk: tv.psk,
        pin: tv.pin,
        clientId: this.saved.clientId,
        request: this.request,
        now: this.now,
      }),
      identity,
      inputs: Array.isArray(saved.inputs) ? saved.inputs : [],
      apps: Array.isArray(saved.apps) ? saved.apps : [],
      codes: {},
      codesRead: false,
      channels: null,
      channelsAt: 0,
      identityAt: 0,
      inputsAt: 0,
      appsAt: 0,
      snapshot: emptySnapshot(),
      error: null,
      launchedApp: null,
      launchedAt: 0,
      ownChangeUntil: 0,
      polling: null,
      timers: new Set(),
      dropped: false,
    };
  }

  dropRecord(record) {
    record.dropped = true;
    for (const timer of record.timers) {
      clearTimeout(timer);
    }
    record.timers.clear();
    if (record.identity) {
      for (const { externalId } of featureValues(this.gladys, record, this.language)) {
        this.published.delete(externalId);
      }
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    for (const record of this.records.values()) {
      for (const timer of record.timers) {
        clearTimeout(timer);
      }
      record.timers.clear();
    }
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || this.records.size === 0) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
      } catch (err) {
        logger.error('Poll failed', err);
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  /** Read one TV again after these delays (a command's effect, a power on). */
  readLater(record, delays) {
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    for (const delay of delays) {
      const timer = setTimeout(() => {
        record.timers.delete(timer);
        this.poll(record)
          .then((changed) => this.afterChanges(changed))
          .catch((err) => logger.error('Read failed', err));
      }, delay);
      timer.unref?.();
      record.timers.add(timer);
    }
  }

  // --- Devices -----------------------------------------------------------------

  /**
   * The same TV configured twice (its IP in one slot, its name in another):
   * only the first slot speaks for it, the other one is reported.
   */
  isDuplicate(record) {
    if (!record.identity) {
      return false;
    }
    for (const other of this.records.values()) {
      if (other === record) {
        return false;
      }
      if (other.identity?.platformId === record.identity.platformId) {
        return true;
      }
    }
    return false;
  }

  /** A record whose device exists for Gladys: identified, not a duplicate. */
  isPublished(record) {
    return Boolean(record.identity) && !this.isDuplicate(record);
  }

  /** Publish the TVs that answered once; only when something changed. */
  async publishDevices() {
    const devices = [...this.records.values()]
      .filter((record) => this.isPublished(record))
      .map((record) => buildDevice(this.gladys, record, this.language));
    const key = JSON.stringify(devices);
    if (key === this.devicesKey) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale TV.
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
    } catch (err) {
      logger.warn(`Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read the TVs and their lists again, publish. */
  async rediscover() {
    this.devicesKey = null;
    await this.pollAll({ full: true });
    await this.publishDevices();
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const record = this.recordOfDevice(device.external_id);
    if (!record) {
      return;
    }
    await this.publishStates(record, { force: true });
    this.refreshWidgets();
  }

  refreshWidgets() {
    for (const key of Object.values(WIDGET_KEYS)) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  recordOfDevice(externalId) {
    const platformId = platformIdOf(this.gladys, externalId);
    if (!platformId) {
      return null;
    }
    return (
      [...this.records.values()].find((record) => record.identity?.platformId === platformId) ??
      null
    );
  }

  saveRecord(record) {
    this.saved.tvs[record.tv.slot] = {
      url: record.tv.url,
      identity: record.identity,
      inputs: record.inputs,
      apps: record.apps,
    };
    this.store.save(this.saved);
  }

  // --- Reading the TVs -----------------------------------------------------------

  async pollAll({ full = false } = {}) {
    const records = [...this.records.values()];
    const changes = await Promise.all(records.map((record) => this.poll(record, { full })));
    await this.publishDevices();
    await this.afterChanges(changes.some(Boolean));
  }

  /**
   * Read one TV and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widgets show something new
   */
  poll(record, { full = false } = {}) {
    record.polling ??= this.read(record, { full }).finally(() => {
      record.polling = null;
    });
    return record.polling;
  }

  label(record) {
    return `TV ${record.tv.slot} (${tvName(record)})`;
  }

  async read(record, { full }) {
    let power;
    try {
      power = await record.client.getPowerStatus();
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      return this.applyFailure(record, err);
    }
    const now = this.now();
    let error = null;
    // Keep the first configuration problem of this read, ignore the passing ones.
    const attempt = async (what, fn) => {
      try {
        return await fn();
      } catch (err) {
        if (!err.kind) {
          throw err;
        }
        if (!TRANSIENT.has(err.kind)) {
          error ??= err;
        }
        logger.debug(`${this.label(record)}: ${what} failed: ${err.message}`);
        return undefined;
      }
    };

    if (!record.identity || full || now - record.identityAt >= this.timings.identityMs) {
      const info = await attempt('system information', () => record.client.getSystemInformation());
      if (info) {
        this.setIdentity(record, parseSystemInfo(info));
      }
    }

    const active = power === 'active';
    let volume = null;
    let playing = null;
    if (active) {
      volume = parseVolume(await attempt('volume', () => record.client.getVolumeInformation()));
      const info = await attempt('playing content', () => record.client.getPlayingContentInfo());
      playing = info === undefined ? record.snapshot.playing : parsePlaying(info);
    }
    await this.readLists(record, { full, active, attempt });

    if (!error && this.isDuplicate(record)) {
      error = { kind: 'duplicate', message: 'the same TV as another slot' };
    }
    if (error) {
      const known = record.error?.kind;
      record.error = { kind: error.kind, message: error.message };
      if (known !== error.kind) {
        logger.warn(`${this.label(record)}: ${error.message}`);
      }
    } else {
      record.error = null;
    }
    return this.applySuccess(record, { power, volume, playing });
  }

  /** The inputs, applications and remote codes, when stale. */
  async readLists(record, { full, active, attempt }) {
    const now = this.now();
    let changed = false;
    // A TV in standby may answer the lists or not; it is asked once.
    const due = (at, ms) => (active ? full || now - at >= ms : at === 0);
    if (due(record.inputsAt, this.timings.inputsMs)) {
      const list = await attempt('inputs', () => record.client.getExternalInputs());
      if (list !== undefined) {
        record.inputsAt = now;
        const inputs = parseInputs(list);
        if (inputs.length > 0 && JSON.stringify(inputs) !== JSON.stringify(record.inputs)) {
          record.inputs = inputs;
          changed = true;
        }
      }
    }
    if (due(record.appsAt, this.timings.appsMs)) {
      const list = await attempt('applications', () => record.client.getApplicationList());
      if (list !== undefined) {
        record.appsAt = now;
        const apps = parseApps(list);
        if (apps.length > 0 && JSON.stringify(apps) !== JSON.stringify(record.apps)) {
          record.apps = apps;
          changed = true;
        }
      }
    }
    if (!record.codesRead) {
      const list = await attempt('remote codes', () => record.client.getRemoteControllerInfo());
      if (list !== undefined) {
        record.codesRead = true;
        record.codes = parseCodes(list);
      }
    }
    if (changed && record.identity) {
      this.saveRecord(record);
    }
  }

  setIdentity(record, identity) {
    record.identityAt = this.now();
    if (!identity.platformId) {
      return;
    }
    const previous = record.identity;
    if (previous && previous.platformId !== identity.platformId) {
      logger.warn(
        `${this.label(record)}: another TV answers at this address (${identity.model ?? '?'}): new device`,
      );
      for (const { externalId } of featureValues(this.gladys, record, this.language)) {
        this.published.delete(externalId);
      }
      record.launchedApp = null;
    }
    if (JSON.stringify(previous) !== JSON.stringify(identity)) {
      record.identity = identity;
      this.saveRecord(record);
    }
  }

  async applySuccess(record, next) {
    if (record.dropped) {
      return false;
    }
    const previous = record.snapshot;
    const widgetChanged =
      previous.reachable !== true ||
      previous.power !== next.power ||
      JSON.stringify(previous.volume) !== JSON.stringify(next.volume) ||
      JSON.stringify(previous.playing) !== JSON.stringify(next.playing);
    await this.contentTransition(record, previous, next);
    record.snapshot = { reachable: true, ...next };
    await this.publishStates(record);
    return widgetChanged;
  }

  async applyFailure(record, err) {
    if (record.dropped) {
      return false;
    }
    const wasError = record.error?.kind;
    const previous = record.snapshot;
    if (err.kind === ERROR_KINDS.UNREACHABLE) {
      // A TV whose network sleeps with it does not answer at all when off.
      record.error = record.identity ? null : { kind: 'notReached', message: err.message };
      record.snapshot = {
        reachable: false,
        power: record.identity ? 'standby' : null,
        volume: null,
        playing: null,
      };
      record.launchedApp = null;
      if (previous.reachable !== false) {
        logger.info(`${this.label(record)}: no answer (${err.message})`);
      }
    } else {
      // Something answered, but not as expected: keep the last known states.
      record.error = { kind: err.kind, message: err.message };
      if (wasError !== err.kind) {
        logger.warn(`${this.label(record)}: ${err.message}`);
      }
    }
    await this.publishStates(record);
    return previous.reachable !== record.snapshot.reachable || wasError !== record.error?.kind;
  }

  /** "Content changed": a new input, channel or app on screen (power on included). */
  async contentTransition(record, previous, next) {
    if (next.power !== 'active') {
      record.launchedApp = null;
      return;
    }
    if (!next.playing) {
      return;
    }
    // A read right after a launch may still see the previous screen: the app
    // Gladys opened is forgotten once another screen shows after that.
    if (
      next.playing.kind !== CONTENT_KINDS.APP &&
      this.now() - record.launchedAt > this.timings.ownChangeMs
    ) {
      record.launchedApp = null;
    }
    // The first read since the start says nothing about a change.
    if (previous.power === null) {
      return;
    }
    if (previous.power === 'active' && sameContent(previous.playing, next.playing)) {
      return;
    }
    if (previous.power === 'active' && !previous.playing) {
      return;
    }
    const playing = next.playing;
    const app =
      playing.kind === CONTENT_KINDS.APP && record.launchedApp
        ? record.apps.find((item) => item.uri === record.launchedApp)
        : null;
    let name;
    if (playing.kind === CONTENT_KINDS.INPUT) {
      const input = record.inputs.find((item) => item.uri === playing.uri);
      name = input ? inputName(input) : (playing.title ?? playing.uri);
    } else if (playing.kind === CONTENT_KINDS.CHANNEL) {
      name = playing.title ?? String(playing.number ?? '');
    } else {
      name = app ? app.title : pick(DEVICE_TEXT.appOrHome, this.language);
    }
    const own = this.now() < record.ownChangeUntil;
    await this.fire(TRIGGERS.CONTENT_CHANGED, record, {
      kind: playing.kind,
      name,
      channel_number: playing.kind === CONTENT_KINDS.CHANNEL ? playing.number : null,
      program: playing.kind === CONTENT_KINDS.CHANNEL ? playing.program : null,
      origin: own ? ORIGINS.GLADYS : ORIGINS.TV,
    });
  }

  async fire(key, record, data) {
    if (!this.isPublished(record)) {
      return;
    }
    try {
      await this.gladys.publishSceneEvent(key, {
        device: deviceIds(this.gladys, record.identity.platformId).device,
        tv: tvName(record),
        ...data,
      });
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishStates(record, { force = false } = {}) {
    if (!this.isPublished(record)) {
      return;
    }
    const states = [];
    for (const { externalId, value } of featureValues(this.gladys, record, this.language)) {
      if (value === null || (!force && this.published.get(externalId) === value)) {
        continue;
      }
      states.push(
        typeof value === 'string'
          ? { device_feature_external_id: externalId, text: value }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    for (let at = 0; at < states.length; at += MAX_STATES_PER_REQUEST) {
      const batch = states.slice(at, at + MAX_STATES_PER_REQUEST);
      try {
        await this.gladys.publishStates(batch);
        for (const state of batch) {
          this.published.set(state.device_feature_external_id, state.text ?? state.state);
        }
      } catch (err) {
        logger.warn(`States of ${this.label(record)} refused: ${err.message}`);
      }
    }
  }

  async afterChanges(widgetChanged) {
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.refreshWidgets();
    }
  }

  async publishTransports() {
    const entries = [];
    for (const record of this.records.values()) {
      if (!this.isPublished(record) || record.snapshot.reachable === null) {
        continue;
      }
      const externalId = deviceIds(this.gladys, record.identity.platformId).device;
      const transport = record.snapshot.reachable
        ? DEVICE_TRANSPORTS.LOCAL
        : DEVICE_TRANSPORTS.UNREACHABLE;
      if (this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
    } catch (err) {
      logger.warn(`Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name: connected when every TV is set up right. */
  connectionStatus() {
    const { tvs, invalidSlots } = this.config;
    if (tvs.length === 0) {
      return {
        connected: false,
        message: invalidSlots.length ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noTv,
      };
    }
    // A TV that answered once and sleeps now is not a problem.
    const failing = [...this.records.values()].filter((record) => record.error);
    if (failing.length === 0 && invalidSlots.length === 0) {
      return { connected: true };
    }
    const message = {};
    for (const language of Object.keys(CONNECTION_TEXT.noTv)) {
      const parts = failing.map((record) =>
        labelled(tvName(record), pick(ERROR_TEXT[record.error.kind], language), language),
      );
      if (invalidSlots.length) {
        parts.push(pick(CONNECTION_TEXT.invalidUrl, language));
      }
      message[language] = parts.join(' · ').slice(0, 200);
    }
    return { connected: failing.length < this.records.size, message };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
    } catch (err) {
      logger.warn(`Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  /**
   * The TV a command targets: a device, or the only TV when none is chosen.
   * @param {string|null|undefined} deviceExternalId
   */
  target(deviceExternalId) {
    if (this.records.size === 0) {
      throw failure(this.language, 'noTv');
    }
    if (!deviceExternalId) {
      if (this.records.size > 1) {
        throw failure(this.language, 'chooseTv');
      }
      return [...this.records.values()][0];
    }
    const record = this.recordOfDevice(deviceExternalId);
    if (!record) {
      throw failure(this.language, 'unknownTv');
    }
    return record;
  }

  /** Run a command on a TV; the API errors become a sentence for the user. */
  async command(record, fn) {
    try {
      return await fn(record.client);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      logger.warn(`${this.label(record)}: command failed: ${err.message}`);
      let kind = err.kind;
      if (kind === ERROR_KINDS.UNREACHABLE && !record.identity) {
        kind = 'notReached';
      } else if (kind === ERROR_KINDS.API && record.snapshot.power === 'standby') {
        // A key or a command refused by a sleeping TV (an IRCC fault, mostly).
        kind = ERROR_KINDS.TURNED_OFF;
      }
      const error = new Error(
        labelled(tvName(record), pick(ERROR_TEXT[kind], this.language), this.language),
      );
      error.userFacing = true;
      throw error;
    }
  }

  /** The commands ran: publish the optimistic states, read the TV soon. */
  async afterCommand(record, { content = false } = {}) {
    if (content) {
      record.ownChangeUntil = this.now() + this.timings.ownChangeMs;
    }
    await this.publishStates(record);
    this.refreshWidgets();
    this.readLater(record, this.timings.afterCommandMs);
  }

  canWake(record) {
    return Boolean(this.config.wakeOnLan && record.identity?.mac);
  }

  async wake(record) {
    try {
      await this.gladys.wakeOnLan(record.identity.mac);
      logger.info(`${this.label(record)}: Wake-on-LAN sent`);
    } catch (err) {
      // 429: a wake was sent less than 2 s ago, which is just as good.
      logger.warn(`${this.label(record)}: Wake-on-LAN refused: ${err.message}`);
    }
  }

  /** The power feature, the widget button, and the first step of the commands below. */
  async setPower(record, on) {
    if (!on) {
      await this.command(record, (client) => client.setPowerStatus(false));
      record.snapshot = { ...record.snapshot, power: 'standby' };
      record.launchedApp = null;
      await this.afterCommand(record);
      return;
    }
    // Not answering at all: its network sleeps, only a magic packet wakes it.
    if (record.snapshot.reachable === false && this.canWake(record)) {
      await this.wake(record);
      this.readLater(record, this.timings.afterPowerOnMs);
      return;
    }
    try {
      await record.client.setPowerStatus(true);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      logger.warn(`${this.label(record)}: power on refused: ${err.message}`);
      const misconfigured = [ERROR_KINDS.AUTH, ERROR_KINDS.NO_KEY, ERROR_KINDS.NOT_BRAVIA];
      if (!this.canWake(record) || misconfigured.includes(err.kind)) {
        if (err.kind === ERROR_KINDS.UNREACHABLE && record.identity) {
          throw failure(this.language, 'noWake');
        }
        if (err.kind === ERROR_KINDS.API || err.kind === ERROR_KINDS.BUSY) {
          // The REST power on needs "Remote start"; say so.
          throw failure(this.language, 'notOn');
        }
        await this.command(record, () => {
          throw err;
        });
      }
      await this.wake(record);
      this.readLater(record, this.timings.afterPowerOnMs);
      return;
    }
    record.snapshot = { ...record.snapshot, reachable: true, power: 'active' };
    await this.afterCommand(record);
    this.readLater(record, this.timings.afterPowerOnMs);
  }

  /** Commands that need the screen on turn the TV on first, and wait for it. */
  async ensureOn(record) {
    if (record.snapshot.power === 'active') {
      return;
    }
    await this.setPower(record, true);
    const deadline = this.now() + this.timings.powerOnWaitMs;
    for (;;) {
      try {
        if ((await record.client.getPowerStatus()) === 'active') {
          record.snapshot = { ...record.snapshot, reachable: true, power: 'active' };
          return;
        }
      } catch {
        // still waking up
      }
      if (this.now() >= deadline) {
        throw failure(this.language, 'notOn');
      }
      await this.sleep(this.timings.powerOnCheckMs);
    }
  }

  async setVolume(record, raw) {
    const known = record.snapshot.volume;
    const max = known?.max ?? 100;
    const volume = Math.max(0, Math.min(max, Math.round(Number(raw) || 0)));
    await this.command(record, (client) =>
      this.audio(client, known, (target) => client.setAudioVolume(String(volume), target)),
    );
    if (known) {
      record.snapshot = { ...record.snapshot, volume: { ...known, volume, mute: false } };
    }
    await this.afterCommand(record);
    return volume;
  }

  /** An audio command on the output the TV reported, on every output if refused (40800). */
  async audio(client, known, fn) {
    try {
      await fn(known?.target ?? 'speaker');
    } catch (err) {
      if (err.code !== 40800) {
        throw err;
      }
      await fn('');
    }
  }

  /** Volume up or down by `steps` (the buttons): the IRCC keys if the TV refuses. */
  async stepVolume(record, steps) {
    const known = record.snapshot.volume;
    const delta = Math.trunc(steps);
    if (delta === 0) {
      return;
    }
    await this.command(record, async (client) => {
      try {
        await this.audio(client, known, (target) =>
          client.setAudioVolume(delta > 0 ? `+${delta}` : String(delta), target),
        );
      } catch (err) {
        // A sound bar over HDMI-CEC only follows the remote keys.
        if (err.kind !== ERROR_KINDS.API) {
          throw err;
        }
        for (let press = 0; press < Math.min(Math.abs(delta), MAX_KEY_REPEAT); press += 1) {
          await client.sendIrcc(codeOf(delta > 0 ? 'volume_up' : 'volume_down', record.codes));
        }
      }
    });
    if (known) {
      const volume = Math.max(0, Math.min(known.max, known.volume + delta));
      record.snapshot = { ...record.snapshot, volume: { ...known, volume } };
    }
    await this.afterCommand(record);
  }

  async toggleMute(record) {
    const known = record.snapshot.volume;
    await this.command(record, (client) =>
      known ? client.setAudioMute(!known.mute) : client.sendIrcc(codeOf('mute', record.codes)),
    );
    if (known) {
      record.snapshot = { ...record.snapshot, volume: { ...known, mute: !known.mute } };
    }
    await this.afterCommand(record);
  }

  async loadChannels(record) {
    if (record.channels && this.now() - record.channelsAt < this.timings.channelsMs) {
      return record.channels;
    }
    const channels = parseChannels(await this.command(record, (client) => client.getChannels()));
    record.channels = channels;
    record.channelsAt = this.now();
    return channels;
  }

  async setChannel(record, raw) {
    const number = Math.round(Number(raw));
    await this.ensureOn(record);
    const channel = (await this.loadChannels(record)).find((item) => item.number === number);
    if (!channel) {
      throw failure(this.language, 'unknownChannel', number);
    }
    await this.command(record, (client) => client.setPlayContent(channel.uri));
    await this.afterCommand(record, { content: true });
    return channel;
  }

  /** Lists read again when a name is not found in them (a new app installed…). */
  async refreshList(record, list) {
    const at = list === 'apps' ? record.appsAt : record.inputsAt;
    if (this.now() - at < 60_000) {
      return;
    }
    const items = await this.command(record, (client) =>
      list === 'apps' ? client.getApplicationList() : client.getExternalInputs(),
    );
    const parsed = list === 'apps' ? parseApps(items) : parseInputs(items);
    if (list === 'apps') {
      record.appsAt = this.now();
    } else {
      record.inputsAt = this.now();
    }
    if (parsed.length > 0) {
      record[list] = parsed;
      if (record.identity) {
        this.saveRecord(record);
        await this.publishDevices();
      }
    }
  }

  /**
   * Switch to an input, by URI or by name ("HDMI 2", the label set on the TV).
   * @returns {Promise<object|null>} the input, null for "Other" (the Home key)
   */
  async selectInput(record, query) {
    if (query === OTHER_INPUT) {
      await this.sendKey(record, 'home');
      return null;
    }
    let input = findInput(record.inputs, query);
    if (!input) {
      await this.refreshList(record, 'inputs');
      input = findInput(record.inputs, query);
    }
    if (!input) {
      throw failure(this.language, 'unknownInput', String(query).slice(0, 60));
    }
    await this.ensureOn(record);
    await this.command(record, (client) => client.setPlayContent(input.uri));
    record.launchedApp = null;
    // No optimistic screen: the next read sees the change and fires its event.
    await this.afterCommand(record, { content: true });
    return input;
  }

  /**
   * Open an application, by URI or by name ("Netflix").
   * @returns {Promise<object|null>} the app, null for "Home screen" (the Home key)
   */
  async openApp(record, query) {
    if (query === HOME_APP) {
      await this.sendKey(record, 'home');
      record.launchedApp = null;
      return null;
    }
    let app = findApp(record.apps, query);
    if (!app) {
      await this.refreshList(record, 'apps');
      app = findApp(record.apps, query);
    }
    if (!app) {
      throw failure(this.language, 'unknownApp', String(query).slice(0, 60));
    }
    await this.ensureOn(record);
    await this.command(record, (client) => client.setActiveApp(app.uri));
    record.launchedApp = app.uri;
    record.launchedAt = this.now();
    await this.afterCommand(record, { content: true });
    return app;
  }

  /** A remote control key, `repeat` times. */
  async sendKey(record, key, repeat = 1) {
    if (!KEYS[key]) {
      throw failure(this.language, 'unknownKey', String(key).slice(0, 30));
    }
    const times = Math.max(1, Math.min(MAX_KEY_REPEAT, Math.round(Number(repeat) || 1)));
    await this.command(record, async (client) => {
      for (let press = 0; press < times; press += 1) {
        if (press > 0) {
          await this.sleep(this.timings.keyRepeatMs);
        }
        await client.sendIrcc(codeOf(key, record.codes));
      }
    });
    const content = ['home', 'back', 'confirm', 'input', 'channel_up', 'channel_down'].includes(
      key,
    );
    await this.afterCommand(record, { content });
    return times;
  }

  /**
   * A feature of a device. Gladys waits 5 s for the answer of a device
   * command (COMMAND_TIMEOUT_MS of the core), while turning a TV on and
   * switching it to an input can take 30: past `featureAckMs`, the command
   * is acknowledged and goes on, its failure logged.
   */
  async setValue(device, feature, value) {
    const work = this.featureCommand(device, feature, value);
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(() => resolve('late'), this.timings.featureAckMs);
      timer.unref?.();
    });
    try {
      const outcome = await Promise.race([work.then(() => 'done'), late]);
      if (outcome === 'late') {
        logger.info(`${feature.external_id}: still running, acknowledged`);
        work.catch((err) => logger.warn(`${feature.external_id}: ${err.message}`));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Power, volume, buttons, channel, input, app. */
  async featureCommand(device, feature, value) {
    const record = this.recordOfDevice(device.external_id);
    if (!record) {
      throw failure(this.language, 'unknownTv');
    }
    const ids = deviceIds(this.gladys, record.identity.platformId);
    const key = Object.values(FEATURE_KEYS).find(
      (item) => ids.feature(item) === feature.external_id,
    );
    switch (key) {
      case FEATURE_KEYS.POWER:
        return this.setPower(record, Number(value) === 1);
      case FEATURE_KEYS.VOLUME:
        return this.setVolume(record, value);
      case FEATURE_KEYS.VOLUME_UP:
        return this.stepVolume(record, this.config.volumeStep);
      case FEATURE_KEYS.VOLUME_DOWN:
        return this.stepVolume(record, -this.config.volumeStep);
      case FEATURE_KEYS.MUTE:
        return this.toggleMute(record);
      case FEATURE_KEYS.CHANNEL:
        return this.setChannel(record, value);
      case FEATURE_KEYS.CHANNEL_UP:
        return this.sendKey(record, 'channel_up');
      case FEATURE_KEYS.CHANNEL_DOWN:
        return this.sendKey(record, 'channel_down');
      case FEATURE_KEYS.INPUT:
        return this.selectInput(record, String(value));
      case FEATURE_KEYS.APP:
        return this.openApp(record, String(value));
      default:
        throw new Error(`Feature ${feature.external_id} cannot be controlled`);
    }
  }

  // --- Configuration actions -----------------------------------------------------------

  /** "Test the connection": read every TV now, one line each. */
  async testConnection() {
    await this.pollAll({ full: true });
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (this.records.size === 0) {
        message[language] = pick(this.connectionStatus().message, language);
        continue;
      }
      const lines = [...this.records.values()].map((record) => {
        const name = tvName(record);
        if (record.error) {
          return labelled(name, pick(ERROR_TEXT[record.error.kind], language), language);
        }
        if (record.snapshot.reachable === false) {
          return labelled(name, pick(ERROR_TEXT[ERROR_KINDS.UNREACHABLE], language), language);
        }
        const model = record.identity?.model ?? 'BRAVIA';
        const parts = [record.snapshot.power === 'active' ? text.on(model) : text.standby(model)];
        if (record.apps.length) {
          parts.push(text.apps(record.apps.length));
        }
        return labelled(name, parts.join(', '), language);
      });
      if (this.config.invalidSlots.length) {
        lines.push(pick(CONNECTION_TEXT.invalidUrl, language));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }

  /** "Show a PIN on the TV": starts the pairing of the TV of a slot. */
  async requestPin(slot) {
    const number = Number(slot);
    const record = this.records.get(number);
    const texts = (render) =>
      Object.fromEntries(Object.entries(PIN_TEXT).map(([lang, text]) => [lang, render(text)]));
    if (!record) {
      throw new Error(pick(PIN_TEXT, this.language).noAddress(number || 1));
    }
    if (record.tv.psk) {
      return texts((text) => text.usePsk);
    }
    const outcome = await this.command(record, (client) => client.requestPin());
    return texts((text) => (outcome === 'accepted' ? text.notNeeded : text.shown(number)));
  }

  /** What the widgets show: one TV, or the first one. */
  view(deviceExternalId) {
    if (deviceExternalId) {
      return this.recordOfDevice(deviceExternalId);
    }
    return [...this.records.values()][0] ?? null;
  }
}
