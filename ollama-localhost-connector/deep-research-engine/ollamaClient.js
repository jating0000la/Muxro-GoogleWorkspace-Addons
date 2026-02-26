/**
 * Deep Research Engine - Ollama Client
 * 
 * Lightweight HTTP client for Ollama API.
 * Handles JSON parsing, error handling, and thinking tag removal.
 */

const http = require('http');
const config = require('./config');

/**
 * Strip <think>...</think> blocks from model output
 */
function stripThinking(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Call Ollama generate endpoint
 * @param {string} prompt - The prompt to send
 * @param {object} opts - Override options
 * @returns {Promise<string>} The model's response text
 */
function callOllama(prompt, opts = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: opts.model || config.ollama.model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: opts.temperature || config.ollama.temperature,
        num_predict: opts.maxPredict || config.ollama.maxPredict,
      },
    });

    const options = {
      hostname: config.ollama.host,
      port: config.ollama.port,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          let response = parsed.response || '';
          response = stripThinking(response);
          resolve(response);
        } catch (e) {
          reject(new Error(`Ollama returned invalid JSON: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Cannot connect to Ollama: ${e.message}`));
    });

    req.setTimeout(180000, () => { // 3 min timeout for small model
      req.destroy();
      reject(new Error('Ollama request timed out (180s)'));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Extract JSON from model response text
 * Models often wrap JSON in markdown code blocks
 * @param {string} text - Raw model response
 * @returns {object|null} Parsed JSON or null
 */
function extractJSON(text) {
  if (!text) return null;

  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // Continue to extraction methods
  }

  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {
      // Continue
    }
  }

  // Try finding JSON object boundaries
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      return JSON.parse(text.substring(jsonStart, jsonEnd + 1));
    } catch (e) {
      // Continue
    }
  }

  // Try finding JSON array boundaries
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(text.substring(arrStart, arrEnd + 1));
    } catch (e) {
      // Continue
    }
  }

  return null;
}

module.exports = { callOllama, extractJSON, stripThinking };
