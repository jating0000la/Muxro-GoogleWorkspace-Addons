/**
 * Deep Research Engine - PASS 2: Micro Summarizer
 * 
 * Creates a concise 5-bullet summary from extracted facts.
 * Uses only the structured JSON from Pass 1, never raw article text.
 */

const { callOllama } = require('./ollamaClient');

/**
 * Generate a micro summary from extracted facts
 * @param {object} factData - Structured facts from Pass 1
 * @returns {Promise<string>} 5-bullet summary
 */
async function summarize(factData) {
  const sourceLabel = factData.source || 'Unknown';

  // Build a compact representation of the facts
  const factLines = [];

  if (factData.facts && factData.facts.length > 0) {
    factLines.push('Facts: ' + factData.facts.slice(0, 8).join('; '));
  }
  if (factData.numbers && factData.numbers.length > 0) {
    factLines.push('Numbers: ' + factData.numbers.slice(0, 5).join('; '));
  }
  if (factData.dates && factData.dates.length > 0) {
    factLines.push('Dates: ' + factData.dates.slice(0, 5).join('; '));
  }
  if (factData.entities && factData.entities.length > 0) {
    factLines.push('Entities: ' + factData.entities.slice(0, 5).join('; '));
  }
  if (factData.strong_claims && factData.strong_claims.length > 0) {
    factLines.push('Strong claims: ' + factData.strong_claims.slice(0, 3).join('; '));
  }
  if (factData.uncertain_claims && factData.uncertain_claims.length > 0) {
    factLines.push('Uncertain: ' + factData.uncertain_claims.slice(0, 3).join('; '));
  }

  const factsText = factLines.join('\n');

  if (!factsText.trim()) {
    return 'No extractable facts found.';
  }

  const prompt = `Summarize these facts in 5 short bullet points.
Use simple, plain language.
Do not add new information.
Do not reference source labels.

Facts:
${factsText}

Return ONLY 5 bullet points. No introduction. No conclusion.`;

  try {
    const response = await callOllama(prompt, { maxPredict: 600 });
    return response;
  } catch (err) {
    console.error(`[Summarizer] Error for ${sourceLabel}: ${err.message}`);
    return `Summary generation failed: ${err.message}`;
  }
}

module.exports = { summarize };
