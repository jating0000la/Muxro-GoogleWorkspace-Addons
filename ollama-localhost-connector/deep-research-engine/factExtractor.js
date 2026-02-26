/**
 * Deep Research Engine - PASS 1: Fact Extractor
 * 
 * Extracts structured facts from a single cleaned article.
 * Uses plain-text line format (FACT:/NUM:/NAME:) optimized for small models.
 * Parses results into a structured object.
 */

const { callOllama } = require('./ollamaClient');
const config = require('./config');

/**
 * Extract structured facts from article text
 * @param {string} text - Cleaned article text (max 1500 words)
 * @param {string} sourceLabel - Source label e.g. "S1"
 * @returns {Promise<object>} Structured fact extraction
 */
async function extractFacts(text, sourceLabel) {
  const maxChars = config.article.maxCharsForModel;
  const truncated = text.length > maxChars
    ? text.substring(0, maxChars) + '...'
    : text;

  const prompt = `Extract key information from this article.

For each fact, write: FACT: <statement>
For each number or statistic, write: NUM: <number and context>
For each person, company, or place, write: NAME: <entity>

Extract 5-10 facts, any important numbers, and key names.

ARTICLE:
${truncated}`;

  try {
    const response = await callOllama(prompt, { maxPredict: 1000 });

    // Parse line-based output
    const facts = [];
    const numbers = [];
    const entities = [];

    const lines = response.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Match labeled lines: FACT: / NUM: / NAME: (case-insensitive)
      const factMatch = trimmed.match(/^FACT:\s*(.+)/i);
      const numMatch = trimmed.match(/^NUM:\s*(.+)/i);
      const nameMatch = trimmed.match(/^NAME:\s*(.+)/i);

      if (factMatch) {
        const val = factMatch[1].trim();
        if (val.length > 3) facts.push(val);
      }
      if (numMatch) {
        const val = numMatch[1].trim();
        if (val) numbers.push(val);
      }
      if (nameMatch) {
        const val = nameMatch[1].trim();
        if (val) entities.push(val);
      }

      // Also scan for secondary labels after comma on the same line
      // e.g. "FACT: something, NUM: 10, CONTEXT: ..."
      if (factMatch || numMatch || nameMatch) {
        const extraNums = trimmed.match(/,\s*NUM:\s*([^,]+)/gi);
        if (extraNums) {
          for (const m of extraNums) {
            const val = m.replace(/^,\s*NUM:\s*/i, '').trim();
            if (val && !numbers.includes(val)) numbers.push(val);
          }
        }
        const extraNames = trimmed.match(/,\s*NAME:\s*([^,]+)/gi);
        if (extraNames) {
          for (const m of extraNames) {
            const val = m.replace(/^,\s*NAME:\s*/i, '').trim();
            if (val && !entities.includes(val)) entities.push(val);
          }
        }
        continue;
      }

      // Accept bullet points as facts
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const val = trimmed.substring(2).trim();
        if (val.length > 10) facts.push(val);
      }
    }

    // If no labeled lines were found, treat entire response as facts
    if (facts.length === 0 && numbers.length === 0 && entities.length === 0) {
      const fallbackLines = lines
        .map(l => l.trim())
        .filter(l => l.length > 15 && !l.startsWith('#'));
      if (fallbackLines.length > 0) {
        console.warn(`[FactExtractor] No FACT:/NUM:/NAME: labels for ${sourceLabel}, using raw lines`);
        facts.push(...fallbackLines.slice(0, 10));
      }
    }

    return {
      source: sourceLabel,
      facts,
      numbers,
      entities,
      dates: [],
      strong_claims: [],
      uncertain_claims: [],
    };
  } catch (err) {
    console.error(`[FactExtractor] Error for ${sourceLabel}: ${err.message}`);
    return {
      source: sourceLabel,
      facts: [],
      numbers: [],
      entities: [],
      dates: [],
      strong_claims: [],
      uncertain_claims: [],
      error: err.message,
    };
  }
}

module.exports = { extractFacts };
