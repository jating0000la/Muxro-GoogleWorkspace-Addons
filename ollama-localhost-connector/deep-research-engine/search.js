/**
 * Deep Research Engine - Google Search Fetcher
 *
 * Fetches raw HTML from Google Search results page.
 * Uses browser-like headers and handles gzip decompression.
 */

const https = require('https');
const zlib = require('zlib');
const config = require('./config');

/**
 * Fetch Google Search HTML for a given query
 * @param {string} query - Search query string
 * @returns {Promise<string>} Raw HTML of Google search results page
 */
function fetchSearchPage(query) {
  return new Promise((resolve, reject) => {
    const encodedQuery = encodeURIComponent(query);

    const options = {
      hostname: 'www.google.com',
      path: `/search?q=${encodedQuery}&num=10&hl=en&gl=us`,
      method: 'GET',
      headers: {
        'User-Agent': config.search.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0',
      },
    };

    const req = https.request(options, (res) => {
      // Handle redirects by following them
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); // Drain response to free socket
        console.log(`[Search] Redirect to: ${res.headers.location}`);
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) {
          redirectUrl = `https://www.google.com${redirectUrl}`;
        }
        // Re-fetch from redirect URL using https.get
        https.get(redirectUrl, { headers: options.headers }, (res2) => {
          decompressResponse(res2, (err, data2) => {
            if (err) { reject(new Error(`Redirect decompress error: ${err.message}`)); return; }
            if (res2.statusCode === 200) resolve(data2);
            else reject(new Error(`Redirect target returned status ${res2.statusCode}`));
          });
        }).on('error', (e) => reject(new Error(`Redirect fetch failed: ${e.message}`)));
        return;
      }

      decompressResponse(res, (err, data) => {
        if (err) { reject(new Error(`Decompress error: ${err.message}`)); return; }
        if (res.statusCode === 200) {
          resolve(data);
        } else if (res.statusCode === 429 || res.statusCode === 503) {
          reject(new Error('CAPTCHA or rate limit detected (HTTP ' + res.statusCode + '). Wait a few minutes and retry.'));
        } else {
          reject(new Error(`Google returned status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Search request failed: ${e.message}`)));
    req.setTimeout(config.search.timeout, () => {
      req.destroy();
      reject(new Error('Search request timed out'));
    });
    req.end();
  });
}

/**
 * Decompress an HTTP response that may be gzip/deflate/br/plain
 * @param {http.IncomingMessage} res
 * @param {function} cb - (err, string)
 */
function decompressResponse(res, cb) {
  const encoding = (res.headers['content-encoding'] || '').toLowerCase();
  const chunks = [];

  res.on('data', (chunk) => chunks.push(chunk));
  res.on('error', (e) => cb(e));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    if (encoding === 'gzip') {
      zlib.gunzip(buf, (e, result) => cb(e, result ? result.toString('utf8') : null));
    } else if (encoding === 'deflate') {
      zlib.inflate(buf, (e, result) => {
        if (e) {
          zlib.inflateRaw(buf, (e2, r2) => cb(e2, r2 ? r2.toString('utf8') : null));
        } else {
          cb(null, result.toString('utf8'));
        }
      });
    } else if (encoding === 'br') {
      zlib.brotliDecompress(buf, (e, result) => cb(e, result ? result.toString('utf8') : null));
    } else {
      cb(null, buf.toString('utf8'));
    }
  });
}

module.exports = { fetchSearchPage };
