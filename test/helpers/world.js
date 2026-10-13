// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, fake Bravia TVs on a fake
// network, a temporary /data and a manual clock, with the integration wired
// on top through registerHandlers. No timer runs: the tests read the TVs
// with `world.hub.pollAll()`, and the waits of the commands are instant.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeBravia, createNetwork } from './fakeBravia.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.20';
export const URL_2 = 'http://192.0.2.21';
export const PSK = '0000-secret';

/** A manual clock; `sleep` moves it forward instead of waiting. */
export function createClock(start = Date.UTC(2026, 9, 12, 19, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
    sleep: async (ms) => {
      clock.time += ms;
    },
  };
  return clock;
}

export const defaultConfig = () => ({ tv_1_host: '192.0.2.20', tv_1_psk: PSK, language: 'en' });

/**
 * @param {object} [options]
 * @param {Record<string, FakeBravia>} [options.tvs] by base URL
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {boolean} [options.connect]
 */
export async function createWorld({
  clock = createClock(),
  tvs,
  config = defaultConfig(),
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-bravia-')),
  timings = {},
} = {}) {
  const network = createNetwork(tvs ?? { [URL_1]: new FakeBravia() });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers: false,
    timings,
    now: clock.now,
    sleep: clock.sleep,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return {
    gladys,
    fake: gladys.fake,
    network,
    tv: network.tvs[URL_1],
    app,
    hub: app.hub,
    clock,
    dataDir,
  };
}

/** The discovered device of a TV, by its model. */
export const deviceOf = (world, index = 0) => world.fake.discoveredDevices[index];

/** A feature of a discovered device, by key. */
export const featureOf = (device, key) =>
  device.features.find((feature) => feature.external_id === `${device.external_id}:${key}`);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { FakeBravia };
