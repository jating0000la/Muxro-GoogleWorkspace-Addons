/**
 * Deep Research Engine - PASS 3: Cross-Source Comparator
 * 
 * Merges findings from all sources into a consolidated summary.
 * Identifies what sources agree on, contradictions, and gaps.
 * Output is in plain language without source references.
 */

const { callOllama } = require('./ollamaClient');

/**
 * Compare findings across all sources
 * @param {Array<object>} allFacts - Array of fact extractions from Pass 1
 * @param {Array<string>} allSummaries - Array of summaries from Pass 2
 * @returns {Promise<string>} Structured comparison output
 */
async function compare(allFacts, allSummaries) {
  // Build a compact merged view for the model
  // Only send summaries (not raw facts) to keep token count low
  const mergedInput = [];

  for (let i = 0; i < allSummaries.length; i++) {
    mergedInput.push(allSummaries[i]);

    // Add key numbers and entities for richer comparison
    const facts = allFacts[i];
    if (facts) {
      if (facts.numbers && facts.numbers.length > 0) {
        mergedInput.push(`[${facts.source}] Key numbers: ${facts.numbers.slice(0, 4).join(', ')}`);
      }
      if (facts.entities && facts.entities.length > 0) {
        mergedInput.push(`[${facts.source}] Key entities: ${facts.entities.slice(0, 4).join(', ')}`);
      }
    }
  }

  const mergedText = mergedInput.join('\n\n');

  // Truncate if too long
  const truncated = mergedText.length > 3000
    ? mergedText.substring(0, 3000) + '...'
    : mergedText;

  const prompt = `You are a research analyst. Combine the findings from multiple sources into one clear summary.

Cover:
- What the sources agree on
- Key facts, numbers, and statistics
- Anything uncertain or contradictory between sources
- What important information is missing

Write in plain, simple language.
Do NOT use source references like [S1] or [S2].
Be concise and clear.

FINDINGS:
${truncated}`;

  try {
    const response = await callOllama(prompt, { maxPredict: 500 });
    return response;
  } catch (err) {
    console.error(`[Comparator] Error: ${err.message}`);
    return `Comparison failed: ${err.message}`;
  }
}

module.exports = { compare };
