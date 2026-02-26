/**
 * Deep Research Engine - Web Page Scraper
 * 
 * Fetches raw HTML content from a given URL.
 * Handles redirects, timeouts, and common errors.
 */

const http = require('http');
const https = require('https');
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

      let data = '';
      const maxSize = 2 * 1024 * 1024; // 2MB max

      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > maxSize) {
          req.destroy();
          resolve({ html: data.substring(0, maxSize), finalUrl: url, status: 200 });
        }
      });

      res.on('end', () => {
        resolve({ html: data, finalUrl: url, status: 200 });
      });
    });

    req.on('error', (e) => reject(new Error(`Failed to scrape ${url}: ${e.message}`)));
    req.setTimeout(config.search.timeout, () => {
      req.destroy();
      reject(new Error(`Timeout scraping ${url}`));
    });
  });
}

module.exports = { scrapePage };
