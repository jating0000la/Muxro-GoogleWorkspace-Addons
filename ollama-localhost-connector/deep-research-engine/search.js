/**
 * Deep Research Engine - Search Fetcher
 *
 * Fetches search result HTML using:
 *   1. DuckDuckGo HTML (primary  — no CAPTCHA, scraping-friendly)
 *   2. Bing HTML        (fallback — if DDG returns < 500 chars)
 *
 * On Windows, uses PowerShell Invoke-WebRequest which goes through WinHTTP
 * and respects the system proxy — solving the "Node https timeout" issue.
 * On Linux/Mac, uses Node's native https module directly.
 *
 * Google is intentionally not used (CAPTCHA blocks headless clients).
 */

const https   = require('https');
const http    = require('http');
const zlib    = require('zlib');
const os      = require('os');
const { execFile } = require('child_process');
const config  = require('./config');

const IS_WINDOWS = os.platform() === 'win32';

/** Public entry point used by controller and server */
async function fetchSearchPage(query) {
  // --- Primary: DuckDuckGo ------------------------------------------------
  try {
    const html = await fetchDDG(query);
    if (html && html.length > 500) {
      console.log(`[Search] DDG OK — ${html.length} bytes`);
      return html;
    }
    console.log('[Search] DDG returned short response, trying Bing...');
  } catch (e) {
    console.log(`[Search] DDG failed (${e.message}), trying Bing...`);
  }

  // --- Fallback: Bing ------------------------------------------------------
  try {
    const html = await fetchBing(query);
    if (html && html.length > 500) {
      console.log(`[Search] Bing OK — ${html.length} bytes`);
      return html;
    }
    throw new Error('Bing returned empty response');
  } catch (e) {
    throw new Error(`All search engines failed. Last error: ${e.message}`);
  }
}

// ── DuckDuckGo HTML endpoint ──────────────────────────────────────────────
function fetchDDG(query) {
  const body = `q=${encodeURIComponent(query)}&b=&kl=us-en`;
  if (IS_WINDOWS) {
    return fetchWithPowerShell('https://html.duckduckgo.com/html/', 'POST', body,
      'application/x-www-form-urlencoded');
  }
  return fetchNodePost('html.duckduckgo.com', '/html/', body);
}

// ── Bing HTML endpoint ────────────────────────────────────────────────────
function fetchBing(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10&setlang=en-us`;
  if (IS_WINDOWS) {
    return fetchWithPowerShell(url, 'GET', null, null);
  }
  return fetchGet(url, { 'User-Agent': config.search.userAgent });
}

// ── Windows: PowerShell Invoke-WebRequest ────────────────────────────────
// Uses WinHTTP stack which honours system proxy / PAC scripts.
function fetchWithPowerShell(url, method, body, contentType) {
  return new Promise((resolve, reject) => {
    // Build PowerShell one-liner — pass URL and body via env vars
    // to avoid command-injection through crafted URLs
    const env = { ...process.env, __FETCH_URL: url };
    let ps;
    if (method === 'POST' && body) {
      env.__FETCH_BODY = body;
      ps = "$ProgressPreference='SilentlyContinue'; $r=Invoke-WebRequest -Uri $env:__FETCH_URL -Method POST -Body $env:__FETCH_BODY -ContentType '" + contentType + "' -TimeoutSec 20 -UseBasicParsing; $r.Content";
    } else {
      ps = "$ProgressPreference='SilentlyContinue'; $r=Invoke-WebRequest -Uri $env:__FETCH_URL -Method GET -TimeoutSec 20 -UseBasicParsing; $r.Content";
    }

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`PowerShell fetch timed out for ${url}`));
    }, 25000);

    const proc = execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { maxBuffer: 15 * 1024 * 1024, encoding: 'utf8', env },
      (err, stdout, stderr) => {
        clearTimeout(timer);
        if (err) return reject(new Error(`PowerShell error: ${stderr || err.message}`));
        resolve(stdout);
      }
    );
  });
}

// ── Node native POST (Linux/Mac) ──────────────────────────────────────────
function fetchNodePost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'User-Agent': config.search.userAgent,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchGet(res.headers.location, options.headers).then(resolve).catch(reject);
        return;
      }
      decompressResponse(res, (err, html) => {
        if (err) return reject(err);
        if (res.statusCode !== 200) return reject(new Error(`DDG HTTP ${res.statusCode}`));
        resolve(html);
      });
    });

    req.on('error', reject);
    req.setTimeout(config.search.timeout, () => { req.destroy(); reject(new Error('DDG timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Generic GET with gzip/deflate decompression (Linux/Mac) ───────────────
function fetchGet(url, headers = {}, _depth = 0) {
  return new Promise((resolve, reject) => {
    if (_depth > 5) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        let next = res.headers.location;
        if (next.startsWith('/')) {
          const u = new URL(url);
          next = `${u.protocol}//${u.hostname}${next}`;
        }
        fetchGet(next, headers, _depth + 1).then(resolve).catch(reject);
        return;
      }
      decompressResponse(res, (err, html) => {
        if (err) return reject(err);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        resolve(html);
      });
    });
    req.on('error', reject);
    req.setTimeout(config.search.timeout, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

// ── Gzip / deflate / brotli decompression ────────────────────────────────
function decompressResponse(res, cb) {
  const encoding = (res.headers['content-encoding'] || '').toLowerCase();
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('error', cb);
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    if (encoding === 'gzip') {
      zlib.gunzip(buf, (e, r) => cb(e, r ? r.toString('utf8') : null));
    } else if (encoding === 'deflate') {
      zlib.inflate(buf, (e, r) => {
        if (e) zlib.inflateRaw(buf, (e2, r2) => cb(e2, r2 ? r2.toString('utf8') : null));
        else cb(null, r.toString('utf8'));
      });
    } else if (encoding === 'br') {
      zlib.brotliDecompress(buf, (e, r) => cb(e, r ? r.toString('utf8') : null));
    } else {
      cb(null, buf.toString('utf8'));
    }
  });
}

module.exports = { fetchSearchPage };

