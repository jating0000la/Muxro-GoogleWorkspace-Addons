/**
 * Deep Research Engine - PASS 4: Final Synthesizer
 * 
 * Generates the final research report in clear, simple language.
 * Uses comparison results from Pass 3.
 * Sources are listed separately by the UI, not inline in the text.
 */

const { callOllama } = require('./ollamaClient');

/**
 * Synthesize the final research report
 * @param {string} query - Original user query
 * @param {string} comparisonResult - Output from Pass 3
 * @param {Array<{source: string, url: string, title: string}>} sourceList - Source metadata
 * @returns {Promise<string>} Final structured research report
 */
async function synthesize(query, comparisonResult, sourceList) {
  // Build source reference legend
  const sourceLegend = sourceList
    .map((s, i) => `[S${i + 1}] ${s.title || s.url}`)
    .join('\n');

  // Truncate comparison if needed
  const truncatedComparison = comparisonResult.length > 2500
    ? comparisonResult.substring(0, 2500) + '...'
    : comparisonResult;

  const prompt = `You are a helpful researcher who explains things clearly and simply.

Question: "${query}"

Using only the research findings below, write a clear and easy-to-understand answer.

Rules:
- Write in simple, plain English like you are explaining to a friend
- Use short paragraphs and short sentences
- Include specific facts, numbers, and details found in the research
- Do NOT use source references like [S1], [S2] in your text
- Do NOT use bullet lists of agreements/contradictions — just explain naturally
- If information conflicts between sources, mention it in a natural way
- If there is not enough information, honestly say what is missing
- Do NOT make up any information
- Keep it concise but thorough

Research findings:
${truncatedComparison}`;

  try {
    const response = await callOllama(prompt, { maxPredict: 1200 });
    return response;
  } catch (err) {
    console.error(`[Synthesizer] Error: ${err.message}`);
    return `Report generation failed: ${err.message}`;
  }
}

module.exports = { synthesize };
