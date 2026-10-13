// -----------------------------------------------------------------------------
// The parsers of the Bravia answers, on the examples of the Sony
// documentation and of pybravia (test/fixtures/bravia/), and the name
// matching of the scene actions and widget shortcuts.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_KINDS,
  findApp,
  findInput,
  inputName,
  normalizeMac,
  parseApps,
  parseChannels,
  parseCodes,
  parseInputs,
  parsePlaying,
  parseSystemInfo,
  parseVolume,
  sameContent,
} from '../src/bravia/model.js';
import { fixture } from './helpers/fakeBravia.js';

const first = (name) => fixture(name).result[0];

test('the identity is the serial number, else the MAC address, else the cid', () => {
  assert.deepEqual(parseSystemInfo(first('system-information')), {
    platformId: 'sn-1000001',
    model: 'FW-55BZ35F',
    name: 'BRAVIA',
    mac: '04:5d:4b:12:34:56',
    generation: '5.0.1',
  });
  assert.equal(parseSystemInfo(first('system-information-consumer')).platformId, 'sn-7654321');
  assert.equal(
    parseSystemInfo(first('system-information-no-serial')).platformId,
    'mac-045d4b001122',
  );
  assert.equal(parseSystemInfo({ cid: 'ABC 123' }).platformId, 'cid-abc-123');
  assert.equal(parseSystemInfo({}).platformId, null);
  // A serial with odd characters still makes a clean id.
  assert.equal(parseSystemInfo({ serial: ' 12/AB:34 ' }).platformId, 'sn-12-ab-34');
});

test('MAC addresses are normalized, placeholders refused', () => {
  assert.equal(normalizeMac('04-5D-4B-12-34-56'), '04:5d:4b:12:34:56');
  assert.equal(normalizeMac('045d4b123456'), '04:5d:4b:12:34:56');
  assert.equal(normalizeMac('00:00:00:00:00:00'), null);
  assert.equal(normalizeMac('ff:ff:ff:ff:ff:ff'), null);
  assert.equal(normalizeMac(''), null);
  assert.equal(normalizeMac(undefined), null);
});

test('the volume is the speaker entry', () => {
  assert.deepEqual(parseVolume(first('volume')), {
    volume: 25,
    mute: false,
    max: 100,
    target: 'speaker',
  });
  assert.deepEqual(parseVolume([{ target: 'headphone', volume: 12, mute: true, maxVolume: 50 }]), {
    volume: 12,
    mute: true,
    max: 50,
    target: 'headphone',
  });
  assert.equal(parseVolume([]), null);
  assert.equal(parseVolume(undefined), null);
});

test('what is on screen: an input, a channel, or an application', () => {
  assert.deepEqual(parsePlaying(first('playing-hdmi')), {
    kind: CONTENT_KINDS.INPUT,
    uri: 'extInput:hdmi?port=2',
    title: 'HDMI 2',
  });
  assert.deepEqual(parsePlaying(first('playing-tv')), {
    kind: CONTENT_KINDS.CHANNEL,
    uri: 'tv:dvbt?trip=8442.6.1025&srvName=France%205',
    title: 'France 5',
    number: 5,
    program: 'La Maison France 5',
  });
  assert.deepEqual(parsePlaying(null), { kind: CONTENT_KINDS.APP, uri: null, title: null });
  assert.equal(parsePlaying({ uri: 'dlna:...', title: 'Movie' }).kind, CONTENT_KINDS.APP);
  assert.ok(sameContent(parsePlaying(first('playing-hdmi')), parsePlaying(first('playing-hdmi'))));
  assert.ok(!sameContent(parsePlaying(first('playing-hdmi')), parsePlaying(first('playing-tv'))));
  assert.ok(!sameContent(null, parsePlaying(null)));
});

test('the inputs keep the order and the labels set on the TV', () => {
  const inputs = parseInputs(first('inputs-sony-doc'));
  assert.deepEqual(
    inputs.map((input) => [input.title, inputName(input), input.connected]),
    [
      ['Component1', 'GAME', false],
      ['Component2', 'Component2', true],
      ['HDMI1', 'HDMI1', true],
      ['Player1', 'BDPlayer', true],
    ],
  );
  assert.deepEqual(parseInputs([{ uri: 'a' }, null, { title: 'b' }]), []);
});

test('the applications are sorted by title, without duplicates', () => {
  const apps = parseApps([...first('apps'), first('apps')[0]]);
  assert.equal(apps.length, first('apps').length);
  assert.deepEqual(
    apps.slice(0, 3).map((app) => app.title),
    ['Disney+', 'France.tv', 'Netflix'],
  );
  assert.equal(apps[0].icon, undefined, 'the icon URL is not kept');
});

test('the remote codes and the channels', () => {
  const codes = parseCodes(fixture('remote-controller-info').result[1]);
  assert.equal(codes.Home, 'AAAAAQAAAAEAAABgAw==');
  assert.equal(Object.keys(codes).length, 46);
  const channels = parseChannels(first('content-list'));
  assert.deepEqual(channels[3], {
    uri: 'tv:dvbt?trip=8442.6.1025&srvName=France%205',
    number: 5,
    title: 'France 5',
  });
});

test('names typed by a user find the input or the application', () => {
  const inputs = parseInputs(first('inputs'));
  const apps = parseApps(first('apps'));
  assert.equal(findInput(inputs, 'HDMI 2').uri, 'extInput:hdmi?port=2');
  assert.equal(findInput(inputs, 'ps5').uri, 'extInput:hdmi?port=2', 'the label set on the TV');
  assert.equal(findInput(inputs, 'hdmi-3').uri, 'extInput:hdmi?port=3', 'punctuation aside');
  assert.equal(findInput(inputs, 'extInput:hdmi?port=4').title, 'HDMI 4', 'by URI');
  assert.equal(findInput(inputs, 'HDMI 9'), null);
  assert.equal(findInput(inputs, '  '), null);
  assert.equal(findApp(apps, 'netflix').title, 'Netflix');
  assert.equal(
    findApp(apps, 'Disney'),
    apps.find((app) => app.title === 'Disney+'),
  );
  assert.equal(findApp(apps, 'francetv').title, 'France.tv');
  assert.equal(findApp(apps, 'prime').title, 'Prime Video', 'a part of the name');
  assert.equal(findApp(apps, 'Molotov'), null);
  // An exact name wins over a longer one containing it.
  assert.equal(
    findApp(
      [
        { title: 'TV Guide', uri: 'a' },
        { title: 'TV', uri: 'b' },
      ],
      'tv',
    ).uri,
    'b',
  );
  // Accents aside.
  assert.equal(findApp([{ title: 'Télé Loisirs', uri: 'c' }], 'tele loisirs').uri, 'c');
});
