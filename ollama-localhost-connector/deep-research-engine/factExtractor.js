/**
 * Deep Research Engine - PASS 1: Fact Extractor
 * 
 * Extracts structured facts from a single cleaned article.
 * Sends minimal context to the small model.
 * Returns structured JSON with facts, numbers, dates, entities, claims.
 */

const { callOllama, extractJSON } = require('./ollamaClient');
const config = require('./config');

/**
 * Extract structured facts from article text
 * @param {string} text - Cleaned article text (max 1500 words)
 * @param {string} sourceLabel - Source label e.g. "S1"
 * @returns {Promise<object>} Structured fact extraction
 */
async function extractFacts(text, sourceLabel) {
  // Truncate to fit model context - keep well under 1200 token input limit
  // ~4 chars per token estimate, leave room for prompt
  const maxChars = config.article.maxCharsForModel;
  const truncated = text.length > maxChars
    ? text.substring(0, maxChars) + '...'
    : text;

  const prompt = `You are a research extractor.

From the article below, extract:

- 5-10 key factual statements
- Important numbers
- Dates
- Named entities
- Strong claims
- Uncertain claims

Return ONLY valid JSON:

{
  "facts": [],
  "numbers": [],
  "dates": [],
  "entities": [],
  "strong_claims": [],
  "uncertain_claims": []
}

Do not explain.
Do not summarize.
Do not add anything outside JSON.

ARTICLE:
${truncated}`;

  try {
    const response = await callOllama(prompt, { maxPredict: 500 });
    const json = extractJSON(response);

    if (json) {
      // Ensure all expected fields exist
      return {
        source: sourceLabel,
        facts: Array.isArray(json.facts) ? json.facts : [],
        numbers: Array.isArray(json.numbers) ? json.numbers : [],
        dates: Array.isArray(json.dates) ? json.dates : [],
        entities: Array.isArray(json.entities) ? json.entities : [],
        strong_claims: Array.isArray(json.strong_claims) ? json.strong_claims : [],
        uncertain_claims: Array.isArray(json.uncertain_claims) ? json.uncertain_claims : [],
      };
    }

    // If JSON extraction failed, return minimal structure with raw response
    console.warn(`[FactExtractor] JSON parse failed for ${sourceLabel}, using fallback`);
    return {
      source: sourceLabel,
      facts: [response.substring(0, 500)],
      numbers: [],
      dates: [],
      entities: [],
      strong_claims: [],
      uncertain_claims: [],
      _raw: true,
    };
  } catch (err) {
    console.error(`[FactExtractor] Error for ${sourceLabel}: ${err.message}`);
    return {
      source: sourceLabel,
      facts: [],
      numbers: [],
      dates: [],
      entities: [],
      strong_claims: [],
      uncertain_claims: [],
      error: err.message,
    };
  }
}

module.exports = { extractFacts };
