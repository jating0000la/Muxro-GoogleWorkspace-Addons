/**
 * Deep Research Engine - Link Extractor
 *
 * Extracts organic search result URLs from search engine HTML.
 *
 * Engine detection order (matches search.js priority):
 *   1. DuckDuckGo  — uddg= parameter in redirect links (primary engine)
 *   2. Bing        — <h2><a href="..."> inside b_algo result items
 *   3. Google      — fallback patterns for jsname/ping/data-ved (rarely reached)
 */

const config = require('./config');

// Domains to exclude from results
const BLOCKED_DOMAINS = [
  'google.com', 'google.co', 'googleapis.com', 'gstatic.com',
  'duckduckgo.com', 'bing.com', 'yahoo.com', 'search.yahoo.com',
  'youtube.com', 'youtu.be',
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
  'tiktok.com', 'pinterest.com', 'reddit.com',
  'amazon.com', 'ebay.com',
  'webcache.googleusercontent.com',
  'translate.google', 'news.google',
];

const BLOCKED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.zip', '.rar', '.mp4', '.mp3', '.jpg', '.png', '.gif', '.webp', '.svg',
];

/**
 * Extract organic result links from search engine HTML.
 * Auto-detects the engine from HTML content.
 * @param {string} html
 * @returns {Array<{url: string, title: string}>}
 */
function extractLinks(html) {
  if (!html) return [];

  const links = [];
  const seen = new Set();
  let match;

  // ── 1. DuckDuckGo: class="result__a" direct href ────────────────────
  // DDG HTML: <a rel="nofollow" class="result__a" href="https://actualsite.com">
  // No redirect wrapper — href is the real URL directly.
  const pDDG_a = /class="result__a"[^>]*href="(https?:\/\/[^"]+)"/gi;
  while ((match = pDDG_a.exec(html)) !== null) {
    addLink(match[1], links, seen);
  }
  // href may appear before class
  const pDDG_b = /href="(https?:\/\/[^"]+)"[^>]*class="result__a"/gi;
  while ((match = pDDG_b.exec(html)) !== null) {
    addLink(match[1], links, seen);
  }

  if (links.length >= config.search.maxLinks) return links.slice(0, config.search.maxLinks);

  // ── 2. Bing: <h2><a href="https://..."> inside b_algo items ──────────
  // Bing wraps each organic result in <li class="b_algo">...</li>
  // The real URL is in the <h2><a href="..."> element (not a redirect).
  const pBing = /<h2>\s*<a[^>]*href="(https?:\/\/(?!www\.bing\.com)[^"]{10,})"/gi;
  while ((match = pBing.exec(html)) !== null) {
    addLink(match[1], links, seen);
  }

  // Also catch Bing's tracked URLs via href containing actual destination
  const pBingTrack = /href="(https?:\/\/(?!(?:www\.)?bing\.com)[^"]{15,})"[^>]*class="[^"]*tilk/gi;
  while ((match = pBingTrack.exec(html)) !== null) {
    addLink(match[1], links, seen);
  }

  if (links.length >= config.search.maxLinks) return links.slice(0, config.search.maxLinks);

  // ── 3. Google classic: /url?q= redirect ──────────────────────────────
  const pG1 = /href="\/url\?q=(https?:\/\/[^&"]+)/gi;
  while ((match = pG1.exec(html)) !== null) {
    try { addLink(decodeURIComponent(match[1]), links, seen); } catch (e) { /* skip */ }
  }

  // ── 4. Google modern: jsname="UWckNb" organic anchor ─────────────────
  const pG2a = /jsname="UWckNb"[^>]*href="(https?:\/\/[^"]+)"/gi;
  while ((match = pG2a.exec(html)) !== null) { addLink(match[1], links, seen); }
  const pG2b = /href="(https?:\/\/[^"]+)"[^>]*jsname="UWckNb"/gi;
  while ((match = pG2b.exec(html)) !== null) { addLink(match[1], links, seen); }

  // ── 5. Google ping attribute ──────────────────────────────────────────
  const pG3 = /ping="\/url\?[^"]*url=(https?[^"&]+)"/gi;
  while ((match = pG3.exec(html)) !== null) {
    try { addLink(decodeURIComponent(match[1]), links, seen); } catch (e) { /* skip */ }
  }

  // ── 6. Broad fallback: any direct <a href="https://..."> ─────────────
  // addLink() handles domain filtering — we just grab all external https links.
  if (links.length < config.search.maxLinks) {
    const pFallback = /href="(https:\/\/[^"]{15,})"/gi;
    while ((match = pFallback.exec(html)) !== null) {
      addLink(match[1], links, seen);
      if (links.length >= config.search.maxLinks * 4) break;
    }
  }

  return links.slice(0, config.search.maxLinks);
}

function addLink(url, links, seen) {
  if (!url) return;
  url = url.split('#')[0].replace(/&amp;/g, '&').split('?utm_')[0].trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  if (seen.has(url)) return;

  const domainMatch = url.match(/^https?:\/\/(?:www\.)?([^/]+)/);
  if (!domainMatch) return;
  const domain = domainMatch[1].toLowerCase();

  for (const blocked of BLOCKED_DOMAINS) {
    if (domain.includes(blocked)) return;
  }
  const pathLower = url.toLowerCase();
  for (const ext of BLOCKED_EXTENSIONS) {
    if (pathLower.endsWith(ext)) return;
  }

  seen.add(url);
  links.push({ url, title: domain });
}

module.exports = { extractLinks };

