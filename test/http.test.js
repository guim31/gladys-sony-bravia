// -----------------------------------------------------------------------------
// The real transport (node:http), against servers on the loopback interface:
// body and headers, cookies, timeout, refused port; then the client against
// the fake TV served over HTTP. Nothing leaves the machine.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { httpRequest } from '../src/bravia/http.js';
import { BraviaClient, ERROR_KINDS } from '../src/bravia/client.js';
import { FakeBravia } from './helpers/fakeBravia.js';
import { createBraviaServer } from './helpers/braviaServer.js';

async function withServer(server, run) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('sends the body with its headers and reads the answer and its cookies', async () => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': ['auth=abc; Path=/sony/; Max-Age=1209600'],
      });
      res.end(
        JSON.stringify({ method: req.method, url: req.url, psk: req.headers['x-auth-psk'], body }),
      );
    });
  });
  await withServer(server, async (base) => {
    const response = await httpRequest(`${base}/sony/system`, {
      headers: { 'X-Auth-PSK': 'key' },
      body: '{"method":"getPowerStatus"}',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.headers['set-cookie'], ['auth=abc; Path=/sony/; Max-Age=1209600']);
    assert.deepEqual(JSON.parse(response.body), {
      method: 'POST',
      url: '/sony/system',
      psk: 'key',
      body: '{"method":"getPowerStatus"}',
    });
  });
});

test('a server that does not answer in time is a timeout', async () => {
  const server = http.createServer(() => {
    // Never answers.
  });
  await withServer(server, async (base) => {
    await assert.rejects(httpRequest(`${base}/sony/system`, { timeoutMs: 100 }), (err) => {
      assert.equal(err.code, 'ETIMEDOUT');
      return true;
    });
  });
});

test('a closed port is refused, and the client calls it unreachable', async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(httpRequest(`http://127.0.0.1:${port}/sony/system`), (err) => {
    assert.equal(err.code, 'ECONNREFUSED');
    return true;
  });
  const client = new BraviaClient({ baseUrl: `http://127.0.0.1:${port}`, psk: 'key' });
  await assert.rejects(client.getPowerStatus(), (err) => err.kind === ERROR_KINDS.UNREACHABLE);
});

test('the client against the fake TV over HTTP: PSK, PIN pairing, IRCC', async () => {
  const tv = new FakeBravia();
  await withServer(createBraviaServer(tv), async (base) => {
    const client = new BraviaClient({ baseUrl: base, psk: '0000-secret' });
    assert.equal(await client.getPowerStatus(), 'active');
    assert.equal((await client.getSystemInformation()).model, 'FW-55BZ35F');
    await client.sendIrcc('AAAAAQAAAAEAAABgAw==');
    assert.deepEqual(tv.keys, ['Home']);
    const wrong = new BraviaClient({ baseUrl: base, psk: 'wrong' });
    await assert.rejects(wrong.getSystemInformation(), (err) => err.kind === ERROR_KINDS.AUTH);
  });
  const pinTv = new FakeBravia({ auth: 'pin', pin: '1234' });
  await withServer(createBraviaServer(pinTv), async (base) => {
    const client = new BraviaClient({ baseUrl: base });
    assert.equal(await client.requestPin(), 'shown');
    const paired = new BraviaClient({ baseUrl: base, pin: '1234', clientId: 'Gladys:test' });
    assert.equal((await paired.getSystemInformation()).serial, '1000001');
    assert.deepEqual(pinTv.registered, ['Gladys:test']);
  });
});

test('a key an HTTP header cannot carry is a refused key, not a sleeping TV', async () => {
  const tv = new FakeBravia();
  await withServer(createBraviaServer(tv), async (base) => {
    const client = new BraviaClient({ baseUrl: base, psk: 'clé€' });
    await assert.rejects(client.getSystemInformation(), (err) => {
      assert.equal(err.kind, ERROR_KINDS.AUTH);
      assert.ok(!err.message.includes('€'));
      return true;
    });
  });
});
