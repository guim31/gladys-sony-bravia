// -----------------------------------------------------------------------------
// Normalization of the configuration: addresses, keys, PINs, options.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parsePin, parseTvUrl } from '../src/config.js';

test('the address of a TV: a bare IP, a name, or a URL', () => {
  assert.equal(parseTvUrl('192.0.2.20'), 'http://192.0.2.20');
  assert.equal(parseTvUrl(' http://192.0.2.20/sony/ '), 'http://192.0.2.20');
  assert.equal(parseTvUrl('https://bravia.local:8443'), 'https://bravia.local:8443');
  assert.equal(parseTvUrl('bravia.local'), 'http://bravia.local');
  assert.equal(parseTvUrl('ftp://192.0.2.20'), null);
  assert.equal(parseTvUrl('http://user:pass@192.0.2.20'), null, 'no credentials in the URL');
  assert.equal(parseTvUrl('not a host'), null);
  assert.equal(parseTvUrl(''), null);
  assert.equal(parseTvUrl(42), null);
});

test('the PIN is four digits', () => {
  assert.equal(parsePin('4821'), '4821');
  assert.equal(parsePin(' 48 21 '), '4821');
  assert.equal(parsePin(4821), '4821');
  assert.equal(parsePin('482'), null);
  assert.equal(parsePin('abcd'), null);
  assert.equal(parsePin(undefined), null);
});

test('defaults', () => {
  assert.deepEqual(normalizeConfig(DEFAULT_CONFIG), {
    tvs: [],
    invalidSlots: [],
    wakeOnLan: true,
    pollIntervalMs: 10_000,
    volumeStep: 2,
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(undefined).tvs, []);
  assert.deepEqual(normalizeConfig(null).language, 'fr');
});

test('three TVs, an invalid address, options as strings', () => {
  const config = normalizeConfig({
    tv_1_host: '192.0.2.20',
    tv_1_psk: ' key ',
    tv_1_name: '  Salon  ',
    tv_2_host: 'ftp://nope',
    tv_3_host: '192.0.2.22',
    tv_3_pin: '1234',
    wake_on_lan: 'false',
    poll_interval: 30,
    volume_step: '5',
    language: 'de',
  });
  assert.deepEqual(config.tvs, [
    { slot: 1, url: 'http://192.0.2.20', psk: 'key', pin: null, name: 'Salon' },
    { slot: 3, url: 'http://192.0.2.22', psk: null, pin: '1234', name: null },
  ]);
  assert.deepEqual(config.invalidSlots, [2]);
  assert.equal(config.wakeOnLan, false);
  assert.equal(config.pollIntervalMs, 30_000);
  assert.equal(config.volumeStep, 5);
  assert.equal(config.language, 'de');
});

test('values out of the lists fall back to the defaults', () => {
  const config = normalizeConfig({ poll_interval: '7', volume_step: 9, language: 'it' });
  assert.equal(config.pollIntervalMs, 10_000);
  assert.equal(config.volumeStep, 2);
  assert.equal(config.language, 'fr');
  assert.equal(
    normalizeConfig({ tv_1_host: 'a', tv_1_name: 'x'.repeat(60) }).tvs[0].name.length,
    40,
  );
});
