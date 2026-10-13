// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (the examples of the Sony documentation and of pybravia): one to
// three TVs, Pre-Shared Key or PIN, on an input, a channel, an application or
// in standby, with and without serial number, in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys". The
// option lists follow the core's normalizeSupportedOptions (unique values,
// non-empty labels, strings on text/select only).
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled and guim31/gladys-pihole.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PUSH_KEYS } from '../src/devices.js';
import { FakeBravia, URL_1, URL_2, createWorld, PSK } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const URL_3 = 'http://192.0.2.22';
const threeTvs = {
  tv_1_host: '192.0.2.20',
  tv_1_psk: PSK,
  tv_1_name: 'Salon',
  tv_2_host: 'http://192.0.2.21/',
  tv_2_pin: '4821',
  tv_3_host: '192.0.2.22',
  tv_3_psk: PSK,
};

const scenarios = [
  { label: 'one TV on HDMI', config: undefined, tvs: () => ({ [URL_1]: new FakeBravia() }) },
  {
    label: 'one TV on a channel',
    config: undefined,
    tvs: () => {
      const tv = new FakeBravia({ system: 'system-information-consumer' });
      tv.show('tv:dvbt?trip=8442.6.1025&srvName=France%205');
      return { [URL_1]: tv };
    },
  },
  {
    label: 'one TV in an app',
    config: undefined,
    tvs: () => {
      const tv = new FakeBravia();
      tv.openApp(tv.apps[0].uri);
      return { [URL_1]: tv };
    },
  },
  {
    label: 'one TV in standby, without serial',
    config: undefined,
    tvs: () => ({
      [URL_1]: new FakeBravia({ power: 'standby', system: 'system-information-no-serial' }),
    }),
  },
  ...['en', 'fr', 'de', 'es'].map((language) => ({
    label: `three TVs, names in ${language}`,
    config: { ...threeTvs, language },
    tvs: () => {
      const second = new FakeBravia({ auth: 'pin', system: 'system-information-consumer' });
      second.show('tv:dvbt?trip=8442.1.257&srvName=TF1');
      return {
        [URL_1]: new FakeBravia({ inputs: 'inputs-sony-doc' }),
        [URL_2]: second,
        [URL_3]: new FakeBravia({ power: 'standby', system: 'system-information-no-serial' }),
      };
    },
  })),
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const { gladys, app } = await createWorld({
      config: scenario.config,
      tvs: scenario.tvs(),
    });
    try {
      const devices = gladys.fake.discoveredDevices;
      assert.equal(devices.length, scenario.config ? 3 : 1);
      assert.equal(new Set(devices.map((device) => device.external_id)).size, devices.length);

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }
        for (const param of device.params ?? []) {
          assert.ok(!/^GLADYS_/i.test(param.name), `${where}: reserved param ${param.name}`);
          assert.equal(typeof param.value, 'string');
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);

          // The option lists, as the core's normalizeSupportedOptions wants them.
          const isSelect = feature.category === 'text' && feature.type === 'select';
          if (feature.supported_options !== undefined) {
            assert.ok(isSelect, `${at}: string options belong to text/select features only`);
            assert.ok(feature.supported_options.length > 0, `${at}: no option`);
            const values = feature.supported_options.map((option) => `${option.value}`);
            assert.equal(new Set(values).size, values.length, `${at}: duplicate option values`);
            for (const option of feature.supported_options) {
              assert.ok(
                typeof option.value === 'string' && option.value.trim().length > 0,
                `${at}: option value`,
              );
              assert.ok(
                typeof option.label === 'string' && option.label.trim().length > 0,
                `${at}: option label`,
              );
              assert.ok(Number.isInteger(option.sort_order), `${at}: option sort_order`);
            }
          } else {
            assert.ok(!isSelect, `${at}: a select without options`);
          }

          // The value published from the fixtures fits the feature.
          const key = feature.external_id.slice(device.external_id.length + 1);
          const value = gladys.fake.lastState(feature.external_id);
          if (PUSH_KEYS.has(key)) {
            assert.equal(value, undefined, `${at}: a push button has no state`);
            assert.equal(feature.read_only, false, `${at}: a push button is writable`);
            continue;
          }
          if (value === undefined) {
            // Volume, channel and the selects say nothing while off or elsewhere.
            assert.ok(
              ['volume', 'channel', 'input', 'app'].includes(key),
              `${at}: no state published`,
            );
            continue;
          }
          if (feature.category === 'text') {
            assert.equal(typeof value, 'string', `${at}: ${value} is not a text`);
            assert.ok(value.trim().length > 0, `${at}: empty text`);
            if (isSelect) {
              assert.ok(
                feature.supported_options.some((option) => option.value === value),
                `${at}: ${value} is not one of the options`,
              );
            }
          } else {
            assert.equal(typeof value, 'number', `${at}: ${value} is not a number`);
            assert.ok(
              value >= feature.min && value <= feature.max,
              `${at}: ${value} out of bounds`,
            );
            assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
          }
        }
      }
    } finally {
      await app.stop();
    }
  });
}
