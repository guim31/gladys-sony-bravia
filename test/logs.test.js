// -----------------------------------------------------------------------------
// What the integration writes in its logs, and the timer that reads the TVs.
// At the info level only the life cycle shows: a normal evening (reads,
// states, screens that change, a TV going to sleep and waking up) writes
// nothing, and a problem that lasts writes one line, then one when it is gone.
// The core never polls these devices (should_poll: false, and GladysAssistant/
// Gladys#3198): the container's own timer must read the TVs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, deviceOf } from './helpers/world.js';

const TF1 = 'tv:dvbt?trip=8442.1.257&srvName=TF1';

/** Every line the SDK logger writes (console.log for debug/info, console.error above). */
function captureLogs(t) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  const lines = [];
  const keep = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', keep);
  t.mock.method(console, 'error', keep);
  t.mock.method(console, 'warn', keep);
  t.mock.method(console, 'info', keep);
  return lines;
}

const state = (world, key) => world.fake.lastState(`${deviceOf(world).external_id}:${key}`);

test('a normal evening writes nothing at the info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const lines = captureLogs(t);
  for (let round = 0; round < 3; round += 1) {
    world.tv.volume = { ...world.tv.volume, volume: 20 + round };
    await world.hub.pollAll();
    world.tv.show(TF1);
    await world.hub.pollAll();
    world.tv.openApp(world.tv.apps[0].uri);
    await world.hub.pollAll();
    world.tv.show('extInput:hdmi?port=2');
    await world.hub.pollAll();
    // The night: standby, then its network asleep, read again and again.
    world.tv.power = 'standby';
    await world.hub.pollAll();
    world.tv.online = false;
    for (let read = 0; read < 5; read += 1) {
      await world.hub.pollAll();
    }
    // The morning.
    world.tv.online = true;
    world.tv.power = 'active';
    await world.hub.pollAll();
  }
  assert.ok(world.fake.states.length > 10, 'states were published');
  assert.ok(world.fake.sceneEvents.length > 3, 'events were fired');
  assert.deepEqual(lines, []);
});

test('a problem that lasts: one line, then one when it is gone', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const lines = captureLogs(t);

  // The key is refused at every read.
  const psk = world.tv.psk;
  world.tv.psk = 'changed-on-the-tv';
  for (let read = 0; read < 4; read += 1) {
    await world.hub.pollAll();
  }
  // Asleep meanwhile: still the same problem, no new line.
  world.tv.online = false;
  await world.hub.pollAll();
  world.tv.online = true;
  await world.hub.pollAll();
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /\[WARN\].*TV 1/);
  assert.ok(!lines[0].includes(psk) && !lines[0].includes('changed-on-the-tv'), 'no key');
  world.tv.psk = psk;
  await world.hub.pollAll();
  await world.hub.pollAll();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[1], /\[INFO\].*TV 1 .*: answers normally again/);

  // Gladys refuses the states (restarting): one warning, then one line back.
  lines.length = 0;
  const publishStates = world.gladys.publishStates.bind(world.gladys);
  world.gladys.publishStates = async () => {
    throw new Error('HTTP 503');
  };
  for (let read = 0; read < 4; read += 1) {
    world.tv.volume = { ...world.tv.volume, volume: 40 + read };
    await world.hub.pollAll();
  }
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /\[WARN\].*States of TV 1 .* refused: HTTP 503/);
  world.gladys.publishStates = publishStates;
  await world.hub.pollAll();
  await world.hub.pollAll();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[1], /\[INFO\].*States: working again/);
  assert.equal(state(world, 'volume'), 43);
});

test('a TV never reached: one warning, one line when it answers', async (t) => {
  const world = await createWorld({ connect: false });
  t.after(() => world.app.stop());
  world.tv.online = false;
  const lines = captureLogs(t);
  await world.gladys.connect();
  await world.app.ready;
  for (let read = 0; read < 4; read += 1) {
    await world.hub.pollAll();
  }
  assert.equal(lines.filter((line) => /TV 1/.test(line)).length, 1, lines.join('\n'));
  assert.match(
    lines.find((line) => /TV 1/.test(line)),
    /\[WARN\].*no answer/,
  );
  world.tv.online = true;
  await world.hub.pollAll();
  await world.hub.pollAll();
  const tv = lines.filter((line) => /TV 1/.test(line));
  assert.equal(tv.length, 2, lines.join('\n'));
  assert.match(tv[1], /\[INFO\].*answers normally again/);
});

test('the container reads the TVs on its own timer, without any poll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true });
  t.after(() => world.app.stop());
  const device = deviceOf(world);
  assert.equal(device.should_poll, false);
  // Nothing here calls `fake.poll` (the onPoll of Gladys): only the timer reads.
  assert.equal(state(world, 'volume'), 25);
  world.tv.volume = { ...world.tv.volume, volume: 33 };
  t.mock.timers.tick(world.hub.config.pollIntervalMs);
  for (let turn = 0; turn < 200 && state(world, 'volume') !== 33; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(state(world, 'volume'), 33);
  // And again at the next interval: the timer is set again after each read.
  world.tv.volume = { ...world.tv.volume, volume: 34 };
  t.mock.timers.tick(world.hub.config.pollIntervalMs);
  for (let turn = 0; turn < 200 && state(world, 'volume') !== 34; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(state(world, 'volume'), 34);
});
