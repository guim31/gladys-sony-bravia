// -----------------------------------------------------------------------------
// The scene actions: open an app, choose an input, send a key — by the names
// a scene author types, on the chosen TV or the only one.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeBravia, PSK, URL_1, URL_2, createWorld, deviceOf } from './helpers/world.js';

test('open an app by name, the TV turned on first', async (t) => {
  const tv = new FakeBravia({ power: 'standby' });
  const world = await createWorld({ tvs: { [URL_1]: tv } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('open_app', { app: 'prime video' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { app: 'Prime Video' });
  assert.equal(tv.power, 'active');
  assert.match(tv.foregroundApp, /amazonvideo/);
  const missing = await world.fake.sceneAction('open_app', { app: 'Canal+' });
  assert.equal(missing.success, false);
  assert.equal(missing.error, 'No app "Canal+" on this TV.');
});

test('choose an input by name or by the label set on the TV', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = deviceOf(world).external_id;
  let ack = await world.fake.sceneAction('select_input', { device, input: 'Freebox' });
  assert.deepEqual(ack.data.outputs, { input: 'Freebox' });
  assert.equal(world.tv.content, 'extInput:hdmi?port=1');
  ack = await world.fake.sceneAction('select_input', { device, input: 'hdmi 2' });
  assert.deepEqual(ack.data.outputs, { input: 'PS5' });
  ack = await world.fake.sceneAction('select_input', { device, input: 'HDMI 7' });
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'No input "HDMI 7" on this TV.');
});

test('send a key, several times', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('send_key', { key: 'down', repeat: 3 });
  assert.deepEqual(ack.data.outputs, { presses: 3 });
  assert.deepEqual(world.tv.keys, ['Down', 'Down', 'Down']);
  ack = await world.fake.sceneAction('send_key', { key: 'confirm', repeat: 50 });
  assert.deepEqual(ack.data.outputs, { presses: 10 }, 'bounded');
  ack = await world.fake.sceneAction('send_key', { key: 'num_7' });
  assert.deepEqual(ack.data.outputs, { presses: 1 });
  assert.equal(world.tv.keys.at(-1), 'Num7');
  ack = await world.fake.sceneAction('send_key', { key: 'eject' });
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'Unknown key "eject".');
});

test('with several TVs, the scene must say which one', async (t) => {
  const world = await createWorld({
    config: { tv_1_host: '192.0.2.20', tv_1_psk: PSK, tv_2_host: '192.0.2.21', tv_2_psk: PSK },
    tvs: {
      [URL_1]: new FakeBravia(),
      [URL_2]: new FakeBravia({ system: 'system-information-consumer' }),
    },
  });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('send_key', { key: 'home' });
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'Plusieurs téléviseurs sont configurés : choisissez-en un.');
  const second = world.fake.discoveredDevices.find(
    (device) => device.name === 'BRAVIA KD-55XF8596',
  );
  const ok = await world.fake.sceneAction('send_key', { device: second.external_id, key: 'home' });
  assert.equal(ok.success, true);
  assert.deepEqual(world.network.tvs[URL_2].keys, ['Home']);
  assert.deepEqual(world.network.tvs[URL_1].keys, []);
});
