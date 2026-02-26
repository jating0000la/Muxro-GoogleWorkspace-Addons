/**
 * Deep Research Engine - Article Cleaner
 * 
 * Cleans raw HTML into readable text:
 * - Removes scripts, styles, ads, navigation, cookie banners
 * - Extracts main article content using heuristics
 * - Truncates to max word limit
 * - Sanitizes against prompt injection
 */

const config = require('./config');

/**
 * Clean raw HTML into readable article text
 * @param {string} html - Raw HTML content
 * @param {string} url - Source URL (for context)
 * @returns {{title: string, text: string, wordCount: number}}
 */
function cleanArticle(html, url) {
  if (!html) return { title: '', text: '', wordCount: 0 };

  // Step 1: Extract title
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    title = decodeEntities(titleMatch[1]).trim();
  }

  // Step 2: Remove unwanted elements entirely
  let cleaned = html;

  // Remove scripts
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Remove styles
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Remove HTML comments (potential prompt injection hiding)
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Remove SVG elements
  cleaned = cleaned.replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Remove noscript
  cleaned = cleaned.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Remove iframes
  cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');

  // Remove nav elements (navigation)
  cleaned = cleaned.replace(/<nav[\s\S]*?<\/nav>/gi, '');

  // Remove header elements (site headers, not article headers)
  cleaned = cleaned.replace(/<header[\s\S]*?<\/header>/gi, '');

  // Remove footer elements
  cleaned = cleaned.replace(/<footer[\s\S]*?<\/footer>/gi, '');

  // Remove aside elements (sidebars, ads)
  cleaned = cleaned.replace(/<aside[\s\S]*?<\/aside>/gi, '');

  // Remove form elements
  cleaned = cleaned.replace(/<form[\s\S]*?<\/form>/gi, '');

  // Remove common ad/cookie/banner container divs by class/id
  cleaned = cleaned.replace(/<div[^>]*class="[^"]*(?:cookie|consent|banner|popup|modal|overlay|newsletter|subscribe|promo|advert|sponsor|social-share)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  cleaned = cleaned.replace(/<div[^>]*id="[^"]*(?:cookie|consent|banner|popup|modal|overlay|newsletter|subscribe|promo|advert|sponsor)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

  // Step 3: Try to extract article/main content
  let articleText = '';

  // Try <article> tag first
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    articleText = articleMatch[1];
  }

  // Try <main> tag
  if (!articleText) {
    const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      articleText = mainMatch[1];
    }
  }

  // Try content divs with common content class names
  if (!articleText) {
    const contentPatterns = [
      /class="[^"]*(?:article-body|post-content|entry-content|content-body|story-body|article-content|main-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /id="[^"]*(?:article-body|post-content|entry-content|content|main-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];
    for (const pattern of contentPatterns) {
      const m = cleaned.match(pattern);
      if (m) {
        articleText = m[1];
        break;
      }
    }
  }

  // Fallback: use body
  if (!articleText) {
    const bodyMatch = cleaned.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
    articleText = bodyMatch ? bodyMatch[1] : cleaned;
  }

  // Step 4: Convert to text
  let text = articleText;

  // Replace block elements with newlines
  text = text.replace(/<\/(?:p|div|h[1-6]|li|br|tr|blockquote|section)>/gi, '\n');
  text = text.replace(/<(?:p|div|h[1-6]|li|br|tr|blockquote|section)[^>]*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Replace list items
  text = text.replace(/<li[^>]*>/gi, '\n- ');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = decodeEntities(text);

  // Clean whitespace
  text = text.replace(/[ \t]+/g, ' ');        // Multiple spaces to one
  text = text.replace(/\n\s*\n/g, '\n\n');     // Multiple newlines to double
  text = text.replace(/^\s+|\s+$/gm, '');      // Trim each line
  text = text.trim();

  // Step 5: Truncate to max words
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length > config.article.maxWords) {
    text = words.slice(0, config.article.maxWords).join(' ') + '...';
  }

  // Step 6: Security sanitization
  text = sanitizeText(text);

  return {
    title: title,
    text: text,
    wordCount: Math.min(words.length, config.article.maxWords),
  };
}

/**
 * Decode common HTML entities
 */
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Sanitize text to prevent prompt injection
 * Removes lines containing banned phrases
 */
function sanitizeText(text) {
  const lines = text.split('\n');
  const safe = lines.filter(line => {
    const lower = line.toLowerCase();
    for (const phrase of config.security.bannedPhrases) {
      if (lower.includes(phrase.toLowerCase())) return false;
    }
    return true;
  });
  return safe.join('\n');
}

module.exports = { cleanArticle, sanitizeText };
