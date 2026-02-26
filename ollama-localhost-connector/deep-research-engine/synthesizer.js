/**
 * Deep Research Engine - PASS 4: Final Synthesizer
 * 
 * Generates the final structured research report.
 * Uses comparison results from Pass 3.
 * Produces citation-based output with [S1], [S2] references.
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

  const prompt = `You are a research writer.

Research question: "${query}"

Using the comparison results below:

Generate structured report with:

1. Executive Summary (short)
2. Key Verified Findings
3. Conflicting Points
4. Important Statistics
5. Gaps in Evidence
6. Balanced Conclusion
7. Confidence Level (Low/Medium/High)

Rules:
- Do not invent data
- If uncertain, say 'Insufficient evidence'
- Reference sources as [S1], [S2], etc.
- Keep output concise and structured.

Sources:
${sourceLegend}

Comparison findings:
${truncatedComparison}`;

  try {
    const response = await callOllama(prompt, { maxPredict: 600 });

    // Append source reference list
    const report = response + '\n\n---\nSOURCES:\n' + sourceLegend;
    return report;
  } catch (err) {
    console.error(`[Synthesizer] Error: ${err.message}`);
    return `Report generation failed: ${err.message}`;
  }
}

module.exports = { synthesize };
