/**
 * Deep Research Engine - Web Page Scraper
 * 
 * Fetches raw HTML content from a given URL.
 * Handles redirects, timeouts, and common errors.
 */

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const config = require('./config');

/**
 * Scrape HTML content from a URL
 * @param {string} url - The URL to scrape
 * @returns {Promise<{html: string, finalUrl: string, status: number}>}
 */
function scrapePage(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;

    const options = {
      method: 'GET',
      headers: {
        'User-Agent': config.search.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
      },
    };

    const req = client.get(url, options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); // Drain response body to free socket
        let redirectUrl = res.headers.location;
        // Handle relative redirects
        if (redirectUrl.startsWith('/')) {
          const urlObj = new URL(url);
          redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
        }
        resolve(scrapePage(redirectUrl, redirectCount + 1));
        return;
      }

      // Reject non-200 responses
      if (res.statusCode !== 200) {
        res.resume(); // Drain response body to free socket
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      // Check content type - only accept HTML
      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        res.resume(); // Drain response body to free socket
        reject(new Error(`Non-HTML content type: ${contentType}`));
        return;
      }

      const maxSize = 2 * 1024 * 1024; // 2MB max
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      const chunks = [];
      let totalLen = 0;
      let resolved = false;

      res.on('data', (chunk) => {
        chunks.push(chunk);
        totalLen += chunk.length;
        if (totalLen > maxSize && !resolved) {
          resolved = true;
          req.destroy();
          finishScrape(chunks, encoding, url, maxSize, resolve, reject);
        }
      });

      res.on('end', () => {
        if (!resolved) finishScrape(chunks, encoding, url, maxSize, resolve, reject);
      });
    });

    req.on('error', (e) => reject(new Error(`Failed to scrape ${url}: ${e.message}`)));
    req.setTimeout(config.search.timeout, () => {
      req.destroy();
      reject(new Error(`Timeout scraping ${url}`));
    });
  });
}

function finishScrape(chunks, encoding, url, maxSize, resolve, reject) {
  const buf = Buffer.concat(chunks);
  const done = (err, result) => {
    if (err) { reject(new Error(`Decompress error scraping ${url}: ${err.message}`)); return; }
    let html = result ? result.toString('utf8') : buf.toString('utf8');
    if (html.length > maxSize) html = html.substring(0, maxSize);
    resolve({ html, finalUrl: url, status: 200 });
  };
  if (encoding === 'gzip') { zlib.gunzip(buf, done); }
  else if (encoding === 'deflate') {
    zlib.inflate(buf, (e, r) => { if (e) zlib.inflateRaw(buf, done); else done(null, r); });
  }
  else if (encoding === 'br') { zlib.brotliDecompress(buf, done); }
  else { done(null, null); }
}

module.exports = { scrapePage };
