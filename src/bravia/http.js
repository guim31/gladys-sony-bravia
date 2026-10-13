// -----------------------------------------------------------------------------
// The one function that talks to the network: an HTTP(S) POST to the TV, on
// node:http / node:https. Not on fetch: the TVs that serve HTTPS use a
// self-signed certificate, which node:https can accept per request, and the
// PIN pairing needs the raw `Set-Cookie` headers.
//
// The client takes this function as a parameter: the tests replace it with an
// in-memory TV (test/helpers/fakeBravia.js).
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';

// The largest answers are the application and channel lists: a few hundred KB.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * @param {string} url absolute URL
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {Record<string, string>} [options.headers]
 * @param {string} [options.body]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ status: number, headers: Record<string, string|string[]>, body: string }>}
 */
export function httpRequest(url, { method = 'POST', headers = {}, body, timeoutMs = 10_000 } = {}) {
  const target = new URL(url);
  const isHttps = target.protocol === 'https:';
  const payload = body === undefined ? undefined : Buffer.from(body);
  const requestHeaders = {
    ...headers,
    ...(payload ? { 'content-length': payload.length } : {}),
  };

  return new Promise((resolve, reject) => {
    const request = (isHttps ? https : http).request(
      target,
      {
        method,
        headers: requestHeaders,
        timeout: timeoutMs,
        // TVs only have self-signed certificates.
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            request.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        response.on('error', reject);
      },
    );
    request.on('timeout', () => {
      const error = new Error(`Timed out after ${timeoutMs} ms`);
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    });
    request.on('error', reject);
    request.end(payload);
  });
}
