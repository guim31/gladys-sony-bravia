// -----------------------------------------------------------------------------
// The hub, end to end against the SDK's fake Gladys and fake TVs: devices and
// states, standby and sleeping network, persistence, the "content changed"
// scene event, every command of the features, Wake-on-LAN, the connection
// status and the configuration actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HOME_APP, OTHER_INPUT } from '../src/devices.js';
import { ORIGINS, TRIGGERS } from '../src/hub.js';
import {
  FakeBravia,
  PSK,
  URL_1,
  URL_2,
  createAll,
  createWorld,
  deviceOf,
  featureOf,
} from './helpers/world.js';

const HDMI_1 = 'extInput:hdmi?port=1';
const HDMI_2 = 'extInput:hdmi?port=2';
const TF1 = 'tv:dvbt?trip=8442.1.257&srvName=TF1';
const NETFLIX = 'com.sony.dtv.com.netflix.ninja.com.netflix.ninja.MainActivity';

const state = (world, key) => world.fake.lastState(`${deviceOf(world).external_id}:${key}`);
const statesOf = (world, key) =>
  world.fake.states.filter(
    (item) => item.device_feature_external_id === `${deviceOf(world).external_id}:${key}`,
  );
const events = (world) =>
  world.fake.sceneEvents.filter((event) => event.key === TRIGGERS.CONTENT_CHANGED);
const setValue = (world, key, value) => {
  const device = deviceOf(world);
  return world.fake.setValue(device, featureOf(device, key), value);
};

test('a TV that answers is published with its states, local, connected', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = deviceOf(world);
  assert.equal(device.name, 'BRAVIA FW-55BZ35F');
  assert.equal(device.external_id, world.gladys.externalIds('tv', 'sn-1000001').device);
  assert.deepEqual(
    featureOf(device, 'input').supported_options.map((option) => option.label),
    ['Freebox', 'PS5', 'HDMI 3/ARC', 'HDMI 4', 'AV/Component', 'Other (TV, apps)'],
  );
  assert.equal(featureOf(device, 'app').supported_options[0].value, HOME_APP);
  assert.equal(state(world, 'power'), 1);
  assert.equal(state(world, 'volume'), 25);
  assert.equal(state(world, 'input'), HDMI_2);
  assert.equal(state(world, 'app'), HOME_APP);
  assert.equal(state(world, 'playing'), 'PS5');
  assert.equal(state(world, 'channel'), undefined);
  assert.deepEqual(world.fake.transports.at(-1), {
    device_external_id: device.external_id,
    transport: 'local',
  });
  assert.equal(world.fake.connectionStatus.connected, true);
  // No event at startup: nothing changed, the integration just started.
  assert.deepEqual(events(world), []);
  // The identity and the lists are kept under /data.
  await world.hub.store.flush();
  const saved = JSON.parse(await readFile(join(world.dataDir, 'bravia-state.json'), 'utf8'));
  assert.equal(saved.tvs['1'].identity.platformId, 'sn-1000001');
  assert.equal(saved.tvs['1'].identity.mac, '04:5d:4b:12:34:56');
  assert.equal(saved.tvs['1'].apps.length, 8);
  assert.match(saved.clientId, /^Gladys:[0-9a-f-]{36}$/);
  assert.ok(!JSON.stringify(saved).includes(PSK), 'no key on disk');
});

test('only the changes are published', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const count = world.fake.states.length;
  await world.hub.pollAll();
  assert.equal(world.fake.states.length, count, 'nothing changed, nothing sent');
  world.tv.volume = { ...world.tv.volume, volume: 31 };
  await world.hub.pollAll();
  assert.equal(world.fake.states.length, count + 1);
  assert.equal(state(world, 'volume'), 31);
  // The device list is not published again when nothing changed in it.
  const publications = world.fake.requests.filter((r) => r.path === '/discovered_device').length;
  await world.hub.pollAll();
  assert.equal(
    world.fake.requests.filter((r) => r.path === '/discovered_device').length,
    publications,
  );
});

test('a channel on screen: its number and its program', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.tv.show(TF1);
  await world.hub.pollAll();
  assert.equal(state(world, 'channel'), 1);
  assert.equal(state(world, 'input'), OTHER_INPUT);
  assert.equal(state(world, 'playing'), '1 · TF1 — La Maison France 5');
});

test('"content changed": an input, a channel, an app, by the TV or by Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = deviceOf(world).external_id;
  world.tv.show(TF1);
  await world.hub.pollAll();
  world.tv.openApp(world.tv.apps[0].uri);
  await world.hub.pollAll();
  // Same screen: no event.
  await world.hub.pollAll();
  assert.deepEqual(
    events(world).map((event) => event.data),
    [
      {
        device,
        tv: 'BRAVIA FW-55BZ35F',
        kind: 'channel',
        name: 'TF1',
        channel_number: 1,
        program: 'La Maison France 5',
        origin: ORIGINS.TV,
      },
      {
        device,
        tv: 'BRAVIA FW-55BZ35F',
        kind: 'app',
        name: 'App or home screen',
        channel_number: null,
        program: null,
        origin: ORIGINS.TV,
      },
    ],
  );
  // Gladys opens Netflix: the event names it and says who did it.
  await setValue(world, 'app', NETFLIX);
  await world.hub.pollAll();
  assert.equal(events(world).length, 2, 'app to app: the API cannot tell, no event');
  await setValue(world, 'input', HDMI_1);
  await world.hub.pollAll();
  assert.deepEqual(
    [
      events(world).at(-1).data.kind,
      events(world).at(-1).data.name,
      events(world).at(-1).data.origin,
    ],
    ['input', 'Freebox', ORIGINS.GLADYS],
  );
  // Long after the command, a change is the TV's again.
  world.clock.advance(60_000);
  world.tv.show(HDMI_2);
  await world.hub.pollAll();
  assert.equal(events(world).at(-1).data.origin, ORIGINS.TV);
  assert.equal(events(world).at(-1).data.name, 'PS5');
});

test('turning on fires "content changed" with the first screen; standby fires nothing', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.tv.power = 'standby';
  await world.hub.pollAll();
  assert.equal(state(world, 'power'), 0);
  assert.equal(state(world, 'playing'), 'Off');
  assert.deepEqual(events(world), []);
  // A console turns the TV on over HDMI-CEC.
  world.tv.power = 'active';
  world.tv.show(HDMI_2);
  await world.hub.pollAll();
  assert.equal(state(world, 'power'), 1);
  assert.deepEqual(
    events(world).map((event) => [event.data.kind, event.data.name]),
    [['input', 'PS5']],
  );
});

test('a TV whose network sleeps: off and unreachable, still connected; known after a restart', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.tv.online = false;
  await world.hub.pollAll();
  assert.equal(state(world, 'power'), 0);
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(world.fake.connectionStatus.connected, true);
  await world.app.stop();

  // Next start, the TV still asleep: the device and its lists come from /data.
  const tv = new FakeBravia();
  tv.online = false;
  const again = await createWorld({ tvs: { [URL_1]: tv }, dataDir: world.dataDir });
  t.after(() => again.app.stop());
  const device = deviceOf(again);
  assert.equal(device.external_id, deviceOf(world).external_id);
  assert.equal(featureOf(device, 'app').supported_options.length, 9);
  assert.equal(again.fake.connectionStatus.connected, true);
});

test('a TV never reached: no device yet, and the status says why', async (t) => {
  const tv = new FakeBravia();
  tv.online = false;
  const world = await createWorld({ tvs: { [URL_1]: tv } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /not reached yet/);
  assert.match(world.fake.connectionStatus.message.fr, /pas encore joint/);
  tv.online = true;
  await world.hub.pollAll();
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('a wrong key: the status says so, the device waits', async (t) => {
  const world = await createWorld({ config: { tv_1_host: '192.0.2.20', tv_1_psk: 'nope' } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(
    world.fake.connectionStatus.message.fr,
    'BRAVIA 192.0.2.20 : clé ou code PIN refusé',
  );
  // No key at all.
  await world.fake.configUpdated({ tv_1_host: '192.0.2.20', language: 'en' });
  assert.match(world.fake.connectionStatus.message.en, /asks for a pre-shared key or a PIN/);
  // The right key.
  await world.fake.configUpdated({ tv_1_host: '192.0.2.20', tv_1_psk: PSK });
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.discoveredDevices.length, 1);
});

test('no TV configured, or an address not understood', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /Enter the address of your TV/);
  await world.fake.configUpdated({ tv_1_host: 'ftp://x' });
  assert.match(world.fake.connectionStatus.message.en, /Address not understood/);
});

test('another TV at the same address becomes another device', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const first = deviceOf(world).external_id;
  world.network.tvs[URL_1] = new FakeBravia({ system: 'system-information-consumer' });
  await world.hub.rediscover();
  assert.notEqual(deviceOf(world).external_id, first);
  assert.equal(deviceOf(world).name, 'BRAVIA KD-55XF8596');
});

test('power: off, on with "Remote start", on with Wake-on-LAN', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal((await setValue(world, 'power', 0)).success, true);
  assert.equal(world.tv.power, 'standby');
  assert.equal(state(world, 'power'), 0);
  assert.equal((await setValue(world, 'power', 1)).success, true);
  assert.equal(world.tv.power, 'active');
  assert.equal(state(world, 'power'), 1);
  // Its network asleep: the core sends the magic packet to the TV's MAC.
  world.tv.online = false;
  await world.hub.pollAll();
  assert.equal((await setValue(world, 'power', 1)).success, true);
  const wakes = world.fake.requests.filter((r) => r.path === '/network/wake');
  assert.deepEqual(wakes.at(-1).body, { mac: '04:5d:4b:12:34:56' });
});

test('power on refused: Wake-on-LAN as a fallback, or a clear message', async (t) => {
  const tv = new FakeBravia({ power: 'standby', remoteStart: false });
  const world = await createWorld({ tvs: { [URL_1]: tv } });
  t.after(() => world.app.stop());
  assert.equal((await setValue(world, 'power', 1)).success, true);
  assert.equal(world.fake.requests.filter((r) => r.path === '/network/wake').length, 1);
  await world.fake.configUpdated({
    tv_1_host: '192.0.2.20',
    tv_1_psk: PSK,
    wake_on_lan: false,
    language: 'en',
  });
  const ack = await setValue(world, 'power', 1);
  assert.equal(ack.success, false);
  assert.match(ack.error, /enable "Remote start"/);
  tv.online = false;
  await world.hub.pollAll();
  const asleep = await setValue(world, 'power', 1);
  assert.match(asleep.error, /MAC address is unknown for Wake-on-LAN/);
});

test('volume: the slider, the buttons, mute; a sound bar gets the remote keys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await setValue(world, 'volume', 40);
  assert.equal(world.tv.volume.volume, 40);
  assert.equal(state(world, 'volume'), 40);
  await setValue(world, 'volume', 250);
  assert.equal(world.tv.volume.volume, 100, 'bounded');
  await setValue(world, 'volume', 40);
  await setValue(world, 'volume_up', 1);
  assert.equal(world.tv.volume.volume, 42, 'the configured step');
  await setValue(world, 'volume_down', 1);
  assert.equal(world.tv.volume.volume, 40);
  await setValue(world, 'mute', 1);
  assert.equal(world.tv.volume.mute, true);
  await setValue(world, 'mute', 1);
  assert.equal(world.tv.volume.mute, false);
  world.tv.soundBar = true;
  assert.equal((await setValue(world, 'volume_up', 1)).success, true);
  assert.deepEqual(world.tv.keys, ['VolumeUp', 'VolumeUp']);
});

test('channel: by number, up and down', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal((await setValue(world, 'channel', 5)).success, true);
  assert.equal(world.tv.content, 'tv:dvbt?trip=8442.6.1025&srvName=France%205');
  const missing = await setValue(world, 'channel', 42);
  assert.equal(missing.success, false);
  assert.equal(missing.error, 'No channel 42 on this TV.');
  await setValue(world, 'channel_up', 1);
  await setValue(world, 'channel_down', 1);
  assert.deepEqual(world.tv.keys, ['ChannelUp', 'ChannelDown']);
  // The channel list is read once.
  assert.equal(world.tv.requests.filter((r) => r.method === 'getSourceList').length, 1);
});

test('input and app lists: choose, "Other" and "Home screen" press Home', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  // Each command is followed by a read (on a timer, off in the tests).
  await setValue(world, 'input', HDMI_1);
  assert.equal(world.tv.content, HDMI_1);
  await world.hub.pollAll();
  assert.equal(state(world, 'input'), HDMI_1);
  await setValue(world, 'app', NETFLIX);
  assert.equal(world.tv.foregroundApp, NETFLIX);
  await world.hub.pollAll();
  assert.equal(state(world, 'app'), NETFLIX);
  await world.hub.pollAll();
  assert.equal(state(world, 'app'), NETFLIX, 'still the app Gladys opened');
  assert.equal(state(world, 'input'), OTHER_INPUT);
  // A read before the TV switched does not forget the app being launched.
  await setValue(world, 'input', HDMI_1);
  await world.hub.pollAll();
  await setValue(world, 'app', NETFLIX);
  world.tv.show(HDMI_1); // the app takes a moment to show
  await world.hub.pollAll();
  world.tv.openApp(NETFLIX);
  await world.hub.pollAll();
  assert.equal(state(world, 'app'), NETFLIX);
  await setValue(world, 'app', HOME_APP);
  assert.deepEqual(world.tv.keys, ['Home']);
  await world.hub.pollAll();
  assert.equal(state(world, 'app'), HOME_APP);
  await setValue(world, 'input', OTHER_INPUT);
  assert.deepEqual(world.tv.keys, ['Home', 'Home']);
  const unknown = await setValue(world, 'input', 'extInput:hdmi?port=9');
  assert.equal(unknown.success, false);
});

test('a command that needs the screen turns the TV on first, and waits for it', async (t) => {
  const tv = new FakeBravia({ power: 'standby' });
  const world = await createWorld({ tvs: { [URL_1]: tv } });
  t.after(() => world.app.stop());
  assert.equal((await setValue(world, 'input', HDMI_1)).success, true);
  assert.equal(tv.power, 'active');
  assert.equal(tv.content, HDMI_1);
  // A TV that never turns on: an error after the wait, not a hang.
  tv.power = 'standby';
  tv.remoteStart = false;
  await world.hub.pollAll();
  await world.fake.configUpdated({
    tv_1_host: '192.0.2.20',
    tv_1_psk: PSK,
    wake_on_lan: false,
    language: 'en',
  });
  const ack = await setValue(world, 'input', HDMI_2);
  assert.equal(ack.success, false);
  assert.match(ack.error, /did not turn on/);
});

test('a new app is found by name after reading the list again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const record = world.hub.target(null);
  world.tv.apps.push({ title: 'Molotov', uri: 'com.sony.dtv.tv.molotov.android.MainActivity' });
  world.clock.advance(120_000);
  const app = await world.hub.openApp(record, 'molotov');
  assert.equal(app.title, 'Molotov');
  assert.equal(featureOf(deviceOf(world), 'app').supported_options.length, 10);
  await assert.rejects(world.hub.openApp(record, 'Canal+'), /No app "Canal\+" on this TV/);
});

test('a created device gets its states again, the widgets a refresh', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = statesOf(world, 'power').length;
  const refreshes = world.fake.widgetRefreshes.length;
  await createAll(world);
  assert.equal(statesOf(world, 'power').length, before + 1);
  assert.ok(world.fake.widgetRefreshes.length >= refreshes + 3);
});

test('feature names and option labels follow the configured language', async (t) => {
  const world = await createWorld({ config: { tv_1_host: '192.0.2.20', tv_1_psk: PSK } });
  t.after(() => world.app.stop());
  const device = deviceOf(world);
  assert.equal(featureOf(device, 'power').name, 'Marche / arrêt');
  assert.equal(featureOf(device, 'app').supported_options[0].label, "Écran d'accueil");
  await world.fake.configUpdated({ tv_1_host: '192.0.2.20', tv_1_psk: PSK, language: 'es' });
  assert.equal(featureOf(deviceOf(world), 'app').supported_options[0].label, 'Pantalla de inicio');
});

test('"Test the connection" reports every TV', async (t) => {
  const second = new FakeBravia({ power: 'standby', system: 'system-information-consumer' });
  const world = await createWorld({
    config: {
      tv_1_host: '192.0.2.20',
      tv_1_psk: PSK,
      tv_1_name: 'Salon',
      tv_2_host: '192.0.2.21',
      tv_2_psk: 'wrong',
    },
    tvs: { [URL_1]: new FakeBravia(), [URL_2]: second },
  });
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.fr,
    'Salon : OK, FW-55BZ35F, allumé, 8 application(s)\nBRAVIA 192.0.2.21 : clé ou code PIN refusé',
  );
  assert.equal(world.fake.connectionStatus.connected, true, 'one TV of two answers');
});

test('"Show a PIN on the TV": pairing by PIN, then the PIN typed in the configuration', async (t) => {
  const tv = new FakeBravia({ auth: 'pin', pin: '4821' });
  const world = await createWorld({ tvs: { [URL_1]: tv }, config: { tv_1_host: '192.0.2.20' } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  const ack = await world.fake.action('request_pin', {});
  assert.match(ack.data.message.en, /A PIN is shown on the TV: type it in the "PIN" field of TV 1/);
  assert.equal(tv.pinShown, 1);
  await world.fake.configUpdated({ tv_1_host: '192.0.2.20', tv_1_pin: '48 21' });
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.equal(tv.registered.length, 1);
  // With a key, no PIN is needed; an empty slot says what to do.
  await world.fake.configUpdated({ tv_1_host: '192.0.2.20', tv_1_psk: PSK, language: 'en' });
  assert.match(
    (await world.fake.action('request_pin', { tv: '1' })).data.message.en,
    /no PIN is needed/,
  );
  const empty = await world.fake.action('request_pin', { tv: '3' });
  assert.equal(empty.success, false);
  assert.match(empty.error, /Enter the address of TV 3 first/);
});

test('commands need a TV: none, several, unknown', async (t) => {
  const world = await createWorld({
    config: {
      tv_1_host: '192.0.2.20',
      tv_1_psk: PSK,
      tv_2_host: '192.0.2.21',
      tv_2_psk: PSK,
      language: 'en',
    },
    tvs: {
      [URL_1]: new FakeBravia(),
      [URL_2]: new FakeBravia({ system: 'system-information-consumer' }),
    },
  });
  t.after(() => world.app.stop());
  assert.throws(() => world.hub.target(null), /Several TVs are configured/);
  assert.throws(
    () => world.hub.target('ext:test-integration:tv:sn-0'),
    /no longer in the configuration/,
  );
  await world.fake.configUpdated({});
  assert.throws(() => world.hub.target(null), /Aucun téléviseur n'est configuré/);
});

test('a reconnection to Gladys sends everything again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const count = world.fake.states.length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.ok(world.fake.states.length > count);
  assert.equal(world.fake.discoveredDevices.length, 1);
});

test('the same TV in two slots: one device, the second slot reported', async (t) => {
  const tv = new FakeBravia();
  const world = await createWorld({
    config: {
      tv_1_host: '192.0.2.20',
      tv_1_psk: PSK,
      tv_2_host: '192.0.2.21',
      tv_2_psk: PSK,
      language: 'en',
    },
    tvs: { [URL_1]: tv, [URL_2]: tv },
  });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(
    world.fake.connectionStatus.message.en,
    'BRAVIA FW-55BZ35F: the same TV as another slot: empty this one',
  );
  tv.show(TF1);
  await world.hub.pollAll();
  assert.equal(events(world).length, 1, 'one event, not two');
  assert.equal(new Set(world.fake.transports.map((entry) => entry.device_external_id)).size, 1);
});
