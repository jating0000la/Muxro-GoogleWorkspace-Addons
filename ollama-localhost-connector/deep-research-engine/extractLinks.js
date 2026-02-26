/**
 * Deep Research Engine - Link Extractor
 *
 * Extracts organic search result URLs from Google Search HTML.
 * Covers multiple Google HTML patterns (classic, modern 2024-2026):
 *   1. /url?q=  - classic redirect wrapper
 *   2. jsname="UWckNb" - modern organic result anchor
 *   3. ping="/url?...url=" - ping attribute (URL-encoded target)
 *   4. data-ved on direct href - organic result with tracking param
 *   5. data-href attributes
 *   6. Broad fallback - any external https link in the HTML
 */

const config = require('./config');

// Domains to skip (not useful for research)
const BLOCKED_DOMAINS = [
  'google.com', 'google.co', 'googleapis.com', 'gstatic.com',
  'youtube.com', 'youtu.be',
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
  'tiktok.com', 'pinterest.com', 'reddit.com',
  'amazon.com', 'ebay.com',
  'accounts.google', 'maps.google', 'play.google',
  'webcache.googleusercontent.com',
  'translate.google', 'news.google',
];

// File extensions to skip
const BLOCKED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.zip', '.rar', '.mp4', '.mp3', '.jpg', '.png', '.gif', '.webp', '.svg',
];

/**
 * Extract organic result links from Google Search HTML
 * @param {string} html - Raw Google Search page HTML
 * @returns {Array<{url: string, title: string}>} Array of extracted links
 */
function extractLinks(html) {
  if (!html) return [];

  const links = [];
  const seen = new Set();
  let match;

  // ── Pattern 1: Classic /url?q= redirect wrapper ──────────────────────
  // e.g. href="/url?q=https://example.com/page&sa=U"
  const p1 = /href="\/url\?q=(https?:\/\/[^&"]+)/gi;
  while ((match = p1.exec(html)) !== null) {
    addLink(decodeURIComponent(match[1]), links, seen);
  }

  // ── Pattern 2: Modern jsname="UWckNb" organic result anchor ──────────
  // e.g. <a jsname="UWckNb" href="https://example.com">
  const p2a = /jsname="UWckNb"[^>]*href="(https?:\/\/[^"]+)"/gi;
  while ((match = p2a.exec(html)) !== null) {
    addLink(decodeURIComponent(match[1]), links, seen);
  }
  // href may appear before jsname
  const p2b = /href="(https?:\/\/[^"]+)"[^>]*jsname="UWckNb"/gi;
  while ((match = p2b.exec(html)) !== null) {
    addLink(decodeURIComponent(match[1]), links, seen);
  }

  // ── Pattern 3: ping attribute contains actual URL (URL-encoded) ───────
  // e.g. ping="/url?sa=t&source=web&url=https%3A%2F%2Fexample.com"
  const p3 = /ping="\/url\?[^"]*url=(https?[^"&]+)"/gi;
  while ((match = p3.exec(html)) !== null) {
    try {
      addLink(decodeURIComponent(match[1]), links, seen);
    } catch (e) {
      addLink(match[1], links, seen);
    }
  }

  // ── Pattern 4: <a href="https://..." data-ved="..."> ──────────────────
  // data-ved is Google's tracking param present on all organic result links
  const p4a = /href="(https?:\/\/[^"]{10,})"[^>]*data-ved/gi;
  while ((match = p4a.exec(html)) !== null) {
    addLink(decodeURIComponent(match[1]), links, seen);
  }
  const p4b = /data-ved="[^"]+"[^>]*href="(https?:\/\/[^"]{10,})"/gi;
  while ((match = p4b.exec(html)) !== null) {
    addLink(decodeURIComponent(match[1]), links, seen);
  }

  // ── Pattern 5: data-href attributes ──────────────────────────────────
  const p5 = /data-href="(https?:\/\/[^"]+)"/gi;
  while ((match = p5.exec(html)) !== null) {
    addLink(decodeURIComponent(match[1]), links, seen);
  }

  // ── Pattern 6: Broad fallback — any <a href="https://..."> ───────────
  // Only runs if we still need more links
  if (links.length < config.search.maxLinks) {
    // Skip google.*, javascript:, #anchors, relative paths
    const p6 = /<a\s[^>]*href="(https:\/\/(?!(?:www\.)?(?:google\.|gstatic\.|googleapis\.|youtube\.|youtu\.be|facebook\.|twitter\.|x\.com|instagram\.|tiktok\.|pinterest\.|webcache\.))[^"]{15,})"/gi;
    while ((match = p6.exec(html)) !== null) {
      addLink(decodeURIComponent(match[1]), links, seen);
      if (links.length >= config.search.maxLinks * 4) break; // cap scan
    }
  }

  // Limit to max links
  return links.slice(0, config.search.maxLinks);
}

/**
 * Add a link if it passes all filters
 */
function addLink(url, links, seen) {
  // Clean URL
  url = url.split('#')[0].split('?utm_')[0];

  // Dedup
  if (seen.has(url)) return;

  // Block known domains
  const domainMatch = url.match(/^https?:\/\/(?:www\.)?([^/]+)/);
  if (!domainMatch) return;
  const domain = domainMatch[1].toLowerCase();

  for (const blocked of BLOCKED_DOMAINS) {
    if (domain.includes(blocked)) return;
  }

  // Block file extensions
  const pathLower = url.toLowerCase();
  for (const ext of BLOCKED_EXTENSIONS) {
    if (pathLower.endsWith(ext)) return;
  }

  // Must be http/https
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  seen.add(url);
  links.push({
    url: url,
    title: domain, // Will be enriched later if possible
  });
}

module.exports = { extractLinks };
