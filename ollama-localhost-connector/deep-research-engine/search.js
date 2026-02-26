/**
 * Deep Research Engine - Google Search Fetcher
 * 
 * Fetches raw HTML from Google Search results page.
 * Uses standard HTTPS with browser-like headers to avoid blocks.
 */

const https = require('https');
const config = require('./config');

/**
 * Fetch Google Search HTML for a given query
 * @param {string} query - Search query string
 * @returns {Promise<string>} Raw HTML of Google search results page
 */
function fetchSearchPage(query) {
  return new Promise((resolve, reject) => {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://www.google.com/search?q=${encodedQuery}&num=10&hl=en`;

    const options = {
      hostname: 'www.google.com',
      path: `/search?q=${encodedQuery}&num=10&hl=en`,
      method: 'GET',
      headers: {
        'User-Agent': config.search.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
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
          let data2 = '';
          res2.on('data', (chunk) => { data2 += chunk; });
          res2.on('end', () => {
            if (res2.statusCode === 200) resolve(data2);
            else reject(new Error(`Redirect target returned status ${res2.statusCode}`));
          });
        }).on('error', (e) => reject(new Error(`Redirect fetch failed: ${e.message}`)));
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else if (res.statusCode === 429) {
          reject(new Error('CAPTCHA or rate limit detected. Try again later.'));
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

module.exports = { fetchSearchPage };
