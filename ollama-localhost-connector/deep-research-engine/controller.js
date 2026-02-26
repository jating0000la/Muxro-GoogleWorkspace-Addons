/**
 * Deep Research Engine - Pipeline Controller
 * 
 * Orchestrates the full research pipeline:
 *   Search → Extract Links → Scrape → Clean → 
 *   Pass 1 (Facts) → Pass 2 (Summary) → Pass 3 (Compare) → Pass 4 (Synthesize)
 * 
 * Processes sources sequentially to minimize memory and token usage.
 * Designed for small models (0.6B parameters).
 */

const { fetchSearchPage } = require('./search');
const { extractLinks } = require('./extractLinks');
const { scrapePage } = require('./scrapePage');
const { cleanArticle } = require('./cleanArticle');
const { extractFacts } = require('./factExtractor');
const { summarize } = require('./summarizer');
const { compare } = require('./comparator');
const { synthesize } = require('./synthesizer');
const config = require('./config');

/**
 * Run the full deep research pipeline
 * @param {string} query - User's research question
 * @param {function} onProgress - Optional progress callback: (stage, detail) => void
 * @returns {Promise<{report: string, sources: Array, metadata: object}>}
 */
async function runResearch(query, onProgress) {
  const log = onProgress || ((stage, detail) => console.log(`[Research] ${stage}: ${detail}`));
  const startTime = Date.now();
  const metadata = {
    query,
    startedAt: new Date().toISOString(),
    stages: {},
    errors: [],
  };

  // ─── Stage 1: Google Search ──────────────────────────────────────
  log('search', `Searching Google for: "${query}"`);
  let searchHtml;
  try {
    searchHtml = await fetchSearchPage(query);
    if (!searchHtml) {
      throw new Error('Empty search response (possible redirect/CAPTCHA)');
    }
    metadata.stages.search = { status: 'ok', htmlLength: searchHtml.length };
  } catch (err) {
    metadata.stages.search = { status: 'error', error: err.message };
    metadata.errors.push(`Search failed: ${err.message}`);
    return {
      report: `Research failed: Could not fetch search results.\nError: ${err.message}\n\nTip: If you see CAPTCHA errors, wait a few minutes and try again.`,
      sources: [],
      metadata,
    };
  }

  // ─── Stage 2: Extract Links ──────────────────────────────────────
  log('extract', 'Extracting organic result links...');
  const links = extractLinks(searchHtml);
  metadata.stages.extract = { status: 'ok', linksFound: links.length };

  if (links.length === 0) {
    metadata.errors.push('No organic links extracted');
    return {
      report: 'Research failed: No organic search results found. The query may be too specific or Google returned a CAPTCHA.',
      sources: [],
      metadata,
    };
  }

  log('extract', `Found ${links.length} links`);

  // ─── Stage 3-6: Scrape, Clean, Fact Extract, Summarize (per source) ──
  const allFacts = [];
  const allSummaries = [];
  const successfulSources = [];

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const sourceLabel = `S${successfulSources.length + 1}`;
    log('scrape', `[${sourceLabel}] Scraping: ${link.url}`);

    // Step 3: Scrape
    let rawHtml;
    try {
      const result = await scrapePage(link.url);
      rawHtml = result.html;
      log('scrape', `[${sourceLabel}] Got ${rawHtml.length} chars`);
    } catch (err) {
      log('scrape', `[${sourceLabel}] Failed: ${err.message}`);
      metadata.errors.push(`Scrape failed for ${link.url}: ${err.message}`);
      continue;
    }

    // Step 4: Clean
    log('clean', `[${sourceLabel}] Cleaning article...`);
    const article = cleanArticle(rawHtml, link.url);
    if (article.wordCount < 50) {
      log('clean', `[${sourceLabel}] Too short (${article.wordCount} words), skipping`);
      continue;
    }
    log('clean', `[${sourceLabel}] "${article.title}" - ${article.wordCount} words`);

    // Update link title from article
    link.title = article.title || link.title;

    // Step 5: Pass 1 - Fact extraction
    log('facts', `[${sourceLabel}] Extracting facts...`);
    const facts = await extractFacts(article.text, sourceLabel);
    allFacts.push(facts);
    log('facts', `[${sourceLabel}] Extracted ${facts.facts.length} facts, ${facts.numbers.length} numbers`);

    // Step 6: Pass 2 - Micro summary
    log('summary', `[${sourceLabel}] Generating summary...`);
    const summary = await summarize(facts);
    allSummaries.push(summary);
    log('summary', `[${sourceLabel}] Summary done`);

    // Track successful source
    successfulSources.push({
      source: sourceLabel,
      url: link.url,
      title: link.title,
      wordCount: article.wordCount,
      factsCount: facts.facts.length,
    });
  }

  metadata.stages.processing = {
    status: 'ok',
    sourcesAttempted: links.length,
    sourcesSuccessful: successfulSources.length,
  };

  if (successfulSources.length === 0) {
    return {
      report: 'Research failed: Could not extract content from any of the search results. Sites may be blocking scrapers.',
      sources: [],
      metadata,
    };
  }

  // ─── Stage 7: Pass 3 - Cross-Source Comparison ────────────────────
  log('compare', `Comparing ${successfulSources.length} sources...`);
  const comparisonResult = await compare(allFacts, allSummaries);
  metadata.stages.comparison = { status: 'ok' };
  log('compare', 'Comparison complete');

  // ─── Stage 8: Pass 4 - Final Synthesis ────────────────────────────
  log('synthesize', 'Generating final research report...');
  const report = await synthesize(query, comparisonResult, successfulSources);
  metadata.stages.synthesis = { status: 'ok' };
  log('synthesize', 'Report complete');

  // ─── Finalize ─────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  metadata.completedAt = new Date().toISOString();
  metadata.elapsedSeconds = parseFloat(elapsed);
  metadata.sourcesUsed = successfulSources.length;

  log('done', `Research completed in ${elapsed}s using ${successfulSources.length} sources`);

  return {
    report,
    sources: successfulSources,
    summaries: allSummaries,
    facts: allFacts,
    comparison: comparisonResult,
    metadata,
  };
}

module.exports = { runResearch };
