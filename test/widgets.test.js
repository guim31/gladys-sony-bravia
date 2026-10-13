// -----------------------------------------------------------------------------
// The three dashboard widgets: contents valid for the core (the SDK's
// validateWidgetContent, budget included), bound to the features they name,
// localized, and their buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import { ACTIONS, DEFAULT_KEYS } from '../src/widgets.js';
import { FakeBravia, PSK, URL_1, URL_2, createWorld, deviceOf } from './helpers/world.js';

const NETFLIX = 'com.sony.dtv.com.netflix.ninja.com.netflix.ninja.MainActivity';

async function content(world, key, settings = {}, language = 'en') {
  const ack = await world.fake.widgetGet(key, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const { content: body } = ack.data;
  assert.deepEqual(validateWidgetContent(body), [], `${key}: valid content`);
  return body;
}

const buttons = (body) => body.components.filter((component) => component.type === 'button');
const status = (body) => body.components.find((component) => component.type === 'status').items;

test('every widget, in every language and every state, fits the core', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const states = [
    () => {},
    () => world.tv.show('tv:dvbt?trip=8442.1.257&srvName=TF1'),
    () => world.tv.openApp(NETFLIX),
    () => {
      world.tv.power = 'standby';
    },
    () => {
      world.tv.online = false;
    },
  ];
  for (const change of states) {
    change();
    await world.hub.pollAll();
    for (const key of Object.values(WIDGET_KEYS)) {
      for (const language of ['en', 'fr', 'de', 'es']) {
        await content(world, key, {}, language);
        await content(world, key, { device: deviceOf(world).external_id }, language);
      }
    }
  }
});

test('remote: state, screen, volume, and four buttons that act', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let body = await content(world, WIDGET_KEYS.REMOTE, {}, 'fr');
  assert.deepEqual(
    status(body).map((item) => [item.label, item.value]),
    [
      ['BRAVIA FW-55BZ35F', 'Allumée'],
      ["À l'écran", 'PS5'],
      ['Volume', 25],
    ],
  );
  assert.deepEqual(
    buttons(body).map((button) => [button.label, button.action.key]),
    [
      ['Éteindre', ACTIONS.POWER],
      ['Volume −', ACTIONS.VOLUME_DOWN],
      ['Volume +', ACTIONS.VOLUME_UP],
      ['Muet', ACTIONS.MUTE],
    ],
  );
  const tap = (actionKey, params = {}) =>
    world.fake.widgetAction(WIDGET_KEYS.REMOTE, actionKey, params, { settings: {} });
  assert.equal((await tap(ACTIONS.VOLUME_UP)).success, true);
  assert.equal(world.tv.volume.volume, 27);
  await tap(ACTIONS.VOLUME_DOWN);
  assert.equal(world.tv.volume.volume, 25);
  await tap(ACTIONS.MUTE);
  assert.equal(world.tv.volume.mute, true);
  body = await content(world, WIDGET_KEYS.REMOTE);
  assert.equal(status(body)[2].value, 'Muted');
  assert.equal(buttons(body)[3].icon, 'check-circle', 'muted: the check mark, never the style');
  const off = await tap(ACTIONS.POWER, { on: false });
  assert.equal(off.data.message.en, 'BRAVIA FW-55BZ35F turned off.');
  assert.equal(world.tv.power, 'standby');
  body = await content(world, WIDGET_KEYS.REMOTE);
  assert.deepEqual(
    status(body).map((item) => item.value),
    ['Standby'],
  );
  assert.equal(buttons(body)[0].label, 'Turn on');
  assert.deepEqual(buttons(body)[0].action.params, { on: true });
  const on = await tap(ACTIONS.POWER, { on: true });
  assert.equal(on.data.message.fr, 'Allumage de BRAVIA FW-55BZ35F…');
  assert.equal(world.tv.power, 'active');
});

test('keys: the arrows by default, the keys chosen in the settings', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let body = await content(world, WIDGET_KEYS.KEYS, {}, 'fr');
  assert.deepEqual(
    buttons(body).map((button) => button.label),
    ['Haut', 'Bas', 'Gauche', 'Droite'],
  );
  assert.deepEqual(
    buttons(body).map((button) => button.action.params.key),
    DEFAULT_KEYS,
  );
  const settings = { key_1: 'confirm', key_2: 'back', key_3: 'home', key_4: 'nope' };
  body = await content(world, WIDGET_KEYS.KEYS, settings);
  assert.deepEqual(
    buttons(body).map((button) => [button.label, button.action.key]),
    [
      ['OK', 'key_1'],
      ['Back', 'key_2'],
      ['Home', 'key_3'],
      ['Right', 'key_4'],
    ],
  );
  for (const button of buttons(body)) {
    await world.fake.widgetAction(WIDGET_KEYS.KEYS, button.action.key, button.action.params, {
      settings,
    });
  }
  assert.deepEqual(world.tv.keys, ['Confirm', 'Back', 'Home', 'Right']);
});

test('shortcuts: the connected inputs by default, names typed in the settings', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let body = await content(world, WIDGET_KEYS.SHORTCUTS);
  assert.deepEqual(
    buttons(body).map((button) => [button.label, button.icon]),
    [
      ['Freebox', 'log-in'],
      ['PS5', 'check-circle'],
      ['HDMI 3/ARC', 'log-in'],
    ],
  );
  const settings = {
    shortcut_1: 'netflix',
    shortcut_2: 'HDMI 1',
    shortcut_3: 'Canal+',
    shortcut_4: '',
  };
  body = await content(world, WIDGET_KEYS.SHORTCUTS, settings, 'fr');
  assert.deepEqual(
    buttons(body).map((button) => [button.label, button.action.key, button.action.params.kind]),
    [
      ['Netflix', 'shortcut_1', 'app'],
      ['Freebox', 'shortcut_2', 'input'],
    ],
  );
  const caption = body.components.find((component) => component.type === 'text');
  assert.equal(caption.text, 'Introuvable : Canal+');
  const [netflix, freebox] = buttons(body);
  const opened = await world.fake.widgetAction(
    WIDGET_KEYS.SHORTCUTS,
    netflix.action.key,
    netflix.action.params,
    { settings },
  );
  assert.equal(opened.data.message.fr, "Netflix à l'écran.");
  assert.equal(world.tv.foregroundApp, NETFLIX);
  await world.hub.pollAll();
  body = await content(world, WIDGET_KEYS.SHORTCUTS, settings);
  assert.equal(buttons(body)[0].icon, 'check-circle');
  await world.fake.widgetAction(WIDGET_KEYS.SHORTCUTS, freebox.action.key, freebox.action.params, {
    settings,
  });
  assert.equal(world.tv.content, 'extInput:hdmi?port=1');
});

test('a shortcut on a TV in standby turns it on first', async (t) => {
  const tv = new FakeBravia({ power: 'standby' });
  const world = await createWorld({ tvs: { [URL_1]: tv } });
  t.after(() => world.app.stop());
  const [first] = buttons(await content(world, WIDGET_KEYS.SHORTCUTS));
  const ack = await world.fake.widgetAction(
    WIDGET_KEYS.SHORTCUTS,
    first.action.key,
    first.action.params,
    {
      settings: {},
    },
  );
  assert.equal(ack.success, true, ack.error);
  assert.equal(tv.power, 'active');
  assert.equal(tv.content, 'extInput:hdmi?port=1');
});

test('the widgets follow the chosen TV, or explain what is missing', async (t) => {
  const world = await createWorld({
    config: {
      tv_1_host: '192.0.2.20',
      tv_1_psk: PSK,
      tv_2_host: '192.0.2.21',
      tv_2_psk: PSK,
      tv_2_name: 'Chambre',
      language: 'en',
    },
    tvs: {
      [URL_1]: new FakeBravia(),
      [URL_2]: new FakeBravia({ system: 'system-information-consumer' }),
    },
  });
  t.after(() => world.app.stop());
  const bedroom = world.fake.discoveredDevices.find((device) => device.name === 'Chambre');
  const body = await content(world, WIDGET_KEYS.REMOTE, { device: bedroom.external_id });
  assert.equal(status(body)[0].label, 'Chambre');
  const gone = await content(world, WIDGET_KEYS.REMOTE, { device: 'ext:test-integration:tv:sn-0' });
  assert.match(gone.components[0].text, /no longer in the configuration/);
  const ack = await world.fake.widgetAction(
    WIDGET_KEYS.KEYS,
    'key_1',
    { key: 'up' },
    {
      settings: { device: 'ext:test-integration:tv:sn-0' },
    },
  );
  assert.equal(ack.success, false);
  await world.fake.configUpdated({});
  const empty = await content(world, WIDGET_KEYS.KEYS, {}, 'de');
  assert.match(empty.components[0].text, /Gib die Adresse deines Fernsehers/);
});

test('a key on a TV that refuses it gives a readable error', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.tv.power = 'standby';
  await world.hub.pollAll();
  const ack = await world.fake.widgetAction(
    WIDGET_KEYS.KEYS,
    'key_1',
    { key: 'up' },
    { settings: {} },
  );
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'BRAVIA FW-55BZ35F: the screen is off');
});
