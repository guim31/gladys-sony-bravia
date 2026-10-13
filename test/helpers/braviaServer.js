// -----------------------------------------------------------------------------
// The fake TV of the tests (fakeBravia.js) over real HTTP: used by
// test/http.test.js on the loopback interface, and by the Docker checks,
// where it plays the TV next to the integration container:
//
//   node test/helpers/braviaServer.js            # port 80, or $PORT
//   BRAVIA_AUTH=pin BRAVIA_SYSTEM=system-information-consumer node test/helpers/braviaServer.js
// -----------------------------------------------------------------------------

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { FakeBravia } from './fakeBravia.js';

/**
 * @param {FakeBravia} tv
 * @returns {http.Server}
 */
export function createBraviaServer(tv) {
  return http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const answer = tv.handle({
        url: `http://${req.headers.host ?? 'localhost'}${req.url}`,
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(answer.status, answer.headers);
      res.end(answer.body);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url) && !process.env.NODE_TEST_CONTEXT) {
  const tv = new FakeBravia({
    auth: process.env.BRAVIA_AUTH === 'pin' ? 'pin' : 'psk',
    psk: process.env.BRAVIA_PSK || '0000-secret',
    pin: process.env.BRAVIA_PIN || '4821',
    power: process.env.BRAVIA_POWER === 'standby' ? 'standby' : 'active',
    system: process.env.BRAVIA_SYSTEM || 'system-information',
  });
  const port = Number(process.env.PORT || 80);
  createBraviaServer(tv).listen(port, () => {
    console.log(`Fake Bravia TV listening on port ${port} (${tv.auth})`);
  });
  // Every 20 s, someone takes the remote: the scene event has something to say.
  const screens = ['extInput:hdmi?port=1', 'tv:dvbt?trip=8442.1.257&srvName=TF1', null];
  let turn = 0;
  setInterval(() => {
    const uri = screens[turn % screens.length];
    turn += 1;
    if (uri) {
      tv.show(uri);
    } else {
      tv.openApp(tv.apps[0].uri);
    }
    console.log(`Remote: now ${uri ?? 'an app'}; keys so far: ${tv.keys.join(', ') || 'none'}`);
  }, 20_000).unref();
}
