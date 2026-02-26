/**
 * Deep Research Engine - PASS 3: Cross-Source Comparator
 * 
 * Merges and compares structured findings from all sources.
 * Identifies agreements, contradictions, unique findings, and gaps.
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

  const prompt = `You are a research comparator.

Using structured findings from multiple sources:

1. List agreements
2. List contradictions
3. List unique findings
4. List missing but important areas

Return structured bullet output.
Be concise.
No long explanations.

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
