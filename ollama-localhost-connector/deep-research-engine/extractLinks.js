/**
 * Deep Research Engine - Link Extractor
 * 
 * Extracts organic search result URLs from Google Search HTML.
 * Filters out ads, Google internal links, and non-article URLs.
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
];

// File extensions to skip
const BLOCKED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.zip', '.rar', '.mp4', '.mp3', '.jpg', '.png', '.gif',
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

  // Pattern 1: Extract from <a href="/url?q=..." > (Google's redirect wrapper)
  const redirectPattern = /href="\/url\?q=(https?:\/\/[^&"]+)/gi;
  let match;
  while ((match = redirectPattern.exec(html)) !== null) {
    const url = decodeURIComponent(match[1]);
    addLink(url, links, seen);
  }

  // Pattern 2: Direct <a href="https://..." in result divs
  const directPattern = /class="[^"]*"[^>]*href="(https?:\/\/[^"]+)"/gi;
  while ((match = directPattern.exec(html)) !== null) {
    const url = decodeURIComponent(match[1]);
    addLink(url, links, seen);
  }

  // Pattern 3: data-href attributes
  const dataHrefPattern = /data-href="(https?:\/\/[^"]+)"/gi;
  while ((match = dataHrefPattern.exec(html)) !== null) {
    const url = decodeURIComponent(match[1]);
    addLink(url, links, seen);
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
