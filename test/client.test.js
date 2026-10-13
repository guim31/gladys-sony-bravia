// -----------------------------------------------------------------------------
// The Bravia client against the fake TV (test/helpers/fakeBravia.js):
// authentication (Pre-Shared Key, PIN pairing and its cookie), the errors of
// the API, the IRCC keys, and that no secret ever lands in an error message.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BraviaClient, ERROR_KINDS, authCookieOf } from '../src/bravia/client.js';
import { FakeBravia, createNetwork } from './helpers/fakeBravia.js';

const BASE = 'http://192.0.2.20';

function setup(tvOptions = {}, clientOptions = {}) {
  const tv = new FakeBravia(tvOptions);
  const network = createNetwork({ [BASE]: tv });
  let time = 0;
  const client = new BraviaClient({
    baseUrl: BASE,
    psk: '0000-secret',
    request: network.request,
    now: () => time,
    ...clientOptions,
  });
  return { tv, client, network, advance: (ms) => (time += ms) };
}

const kindIs = (kind) => (err) => {
  assert.equal(err.kind, kind, err.message);
  return true;
};

test('with the pre-shared key, every read works', async () => {
  const { client } = setup();
  assert.equal(await client.getPowerStatus(), 'active');
  assert.equal((await client.getSystemInformation()).serial, '1000001');
  assert.equal((await client.getVolumeInformation())[0].volume, 25);
  assert.equal((await client.getPlayingContentInfo()).uri, 'extInput:hdmi?port=2');
  assert.equal((await client.getExternalInputs()).length, 5);
  assert.equal((await client.getApplicationList()).length, 8);
  assert.equal((await client.getRemoteControllerInfo()).length, 46);
  assert.equal((await client.getChannels()).length, 5);
});

test('a wrong key is refused; without a key, the TV asks for one', async () => {
  const { client } = setup({}, { psk: 'wrong-key' });
  // The status reads need no authentication.
  assert.equal(await client.getPowerStatus(), 'active');
  await assert.rejects(client.getSystemInformation(), (err) => {
    assert.equal(err.kind, ERROR_KINDS.AUTH);
    assert.ok(!err.message.includes('wrong-key'), 'no secret in the message');
    return true;
  });
  const { client: bare } = setup({}, { psk: null });
  await assert.rejects(bare.getApplicationList(), kindIs(ERROR_KINDS.NO_KEY));
});

test('with a PIN, the client registers, keeps the cookie, and registers again when refused', async () => {
  const { tv, client } = setup(
    { auth: 'pin', pin: '4821' },
    { psk: null, pin: '4821', clientId: 'Gladys:abc' },
  );
  assert.equal((await client.getSystemInformation()).model, 'FW-55BZ35F');
  assert.deepEqual(tv.registered, ['Gladys:abc']);
  await client.getApplicationList();
  await client.getPlayingContentInfo();
  assert.equal(tv.registered.length, 1, 'the cookie is reused');
  assert.match(client.cookie, /^auth=/);
  // The TV restarted: its cookies are gone.
  tv.forgetCookies();
  await client.getApplicationList();
  assert.equal(tv.registered.length, 2);
  // Concurrent requests share one registration.
  tv.forgetCookies();
  await Promise.all([client.getApplicationList(), client.getSystemInformation()]);
  assert.equal(tv.registered.length, 3);
});

test('a wrong PIN is refused without retrying forever', async () => {
  const { tv, client } = setup({ auth: 'pin', pin: '4821' }, { psk: null, pin: '1111' });
  await assert.rejects(client.getSystemInformation(), (err) => {
    assert.equal(err.kind, ERROR_KINDS.AUTH);
    assert.ok(!err.message.includes('1111'));
    return true;
  });
  // One request, one registration attempt.
  assert.equal(tv.pinShown, 1);
});

test('asking for a PIN shows it on the TV; a TV that needs none says so', async () => {
  const { tv, client } = setup({ auth: 'pin' }, { psk: null });
  assert.equal(await client.requestPin(), 'shown');
  assert.equal(tv.pinShown, 1);
  const { client: open } = setup({ auth: 'psk' }, { psk: null });
  assert.equal(await open.requestPin(), 'accepted');
});

test('the errors of the API have a kind', async () => {
  const { tv, client, network } = setup();
  tv.power = 'standby';
  assert.equal(await client.getPowerStatus(), 'standby');
  await assert.rejects(client.getVolumeInformation(), kindIs(ERROR_KINDS.TURNED_OFF));
  // An application in front: no content, no error.
  tv.power = 'active';
  tv.openApp(tv.apps[0].uri);
  assert.equal(await client.getPlayingContentInfo(), null);
  tv.failNext = { method: 'getPowerStatus', error: [40003, 'Request Duplicated'] };
  await assert.rejects(client.getPowerStatus(), kindIs(ERROR_KINDS.BUSY));
  tv.failNext = { method: 'setPlayContent', error: [41001, 'Content does Not Exist'] };
  await assert.rejects(client.setPlayContent('extInput:hdmi?port=9'), (err) => {
    assert.equal(err.kind, ERROR_KINDS.API);
    assert.equal(err.code, 41001);
    return true;
  });
  tv.failNext = { method: 'getPowerStatus', status: 404 };
  await assert.rejects(client.getPowerStatus(), kindIs(ERROR_KINDS.NOT_BRAVIA));
  tv.failNext = { method: 'getPowerStatus', status: 200 };
  await assert.rejects(client.getPowerStatus(), kindIs(ERROR_KINDS.NOT_BRAVIA));
  // pybravia's "not power-on" wording.
  tv.failNext = { method: 'getVolumeInformation', error: [40000, 'not power-on'] };
  await assert.rejects(client.getVolumeInformation(), kindIs(ERROR_KINDS.TURNED_OFF));
  tv.online = false;
  await assert.rejects(client.getPowerStatus(), kindIs(ERROR_KINDS.UNREACHABLE));
  tv.online = 'timeout';
  await assert.rejects(client.getPowerStatus(), kindIs(ERROR_KINDS.UNREACHABLE));
  delete network.tvs[BASE];
  await assert.rejects(client.getPowerStatus(), kindIs(ERROR_KINDS.UNREACHABLE));
});

test('an application launch accepted without an end (41402) is a success', async () => {
  const { tv, client } = setup();
  tv.failNext = { method: 'setActiveApp', error: [41402, 'Request In Progress'] };
  await client.setActiveApp(tv.apps[0].uri);
  await assert.rejects(client.setActiveApp('com.unknown'), (err) => err.code === 41401);
});

test('the commands reach the TV', async () => {
  const { tv, client } = setup();
  await client.setAudioVolume('30');
  assert.equal(tv.volume.volume, 30);
  await client.setAudioVolume('+2');
  assert.equal(tv.volume.volume, 32);
  await client.setAudioMute(true);
  assert.equal(tv.volume.mute, true);
  await assert.rejects(client.setAudioVolume('10', 'headphone'), (err) => err.code === 40800);
  await client.setPlayContent('extInput:hdmi?port=1');
  assert.equal(tv.content, 'extInput:hdmi?port=1');
  await client.setActiveApp(tv.apps[2].uri);
  assert.equal(tv.foregroundApp, tv.apps[2].uri);
  await client.setPowerStatus(false);
  assert.equal(tv.power, 'standby');
});

test('IRCC keys: an empty request first after a long idle time, the endpoint case found', async () => {
  const { tv, client, advance } = setup({ upperIrcc: true });
  advance(60 * 60_000);
  await client.sendIrcc('AAAAAQAAAAEAAAB0Aw==');
  assert.deepEqual(tv.keys, ['Up']);
  assert.equal(client.irccPath, 'IRCC');
  await client.sendIrcc('AAAAAQAAAAEAAAB1Aw==');
  assert.deepEqual(tv.keys, ['Up', 'Down']);
  // An unknown code is a SOAP fault.
  await assert.rejects(
    client.sendIrcc('AAAA'),
    (err) => err.kind === ERROR_KINDS.API && err.code === 500,
  );
  // Keys need the authentication too.
  const { client: wrong } = setup({}, { psk: 'nope' });
  await assert.rejects(wrong.sendIrcc('AAAAAQAAAAEAAAB0Aw=='), kindIs(ERROR_KINDS.AUTH));
});

test('the auth cookie is read from the Set-Cookie headers', () => {
  assert.equal(
    authCookieOf({ 'set-cookie': ['auth=abc123; Path=/sony/; Max-Age=1209600'] }),
    'auth=abc123',
  );
  assert.equal(authCookieOf({ 'set-cookie': 'other=1; auth=xyz' }), 'auth=xyz');
  assert.equal(authCookieOf({ 'set-cookie': ['session=1'] }), null);
  assert.equal(authCookieOf({}), null);
});
