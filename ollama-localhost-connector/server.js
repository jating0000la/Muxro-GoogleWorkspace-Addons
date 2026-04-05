/**
 * Muxro AI - Local LLM Connector
 * 
 * A local proxy server that bridges Google Workspace addons (Sheets, Docs, Slides)
 * with a local LLM backend: Ollama (localhost:11434) or LM Studio (localhost:1234).
 * 
 * Architecture:
 *   Google Workspace Addon (Apps Script Dialog)
 *       ↓ HTTP POST (AJAX from browser)
 *   This Proxy Server (localhost:9100)
 *       ↓ HTTP POST
 *   Ollama API (localhost:11434)  OR  LM Studio API (localhost:1234)
 * 
 * Browsers block direct localhost access from web pages for security.
 * This proxy handles CORS and forwards requests to the selected LLM backend.
 */

const express = require('express');
const cors = require('cors');
const http = require('http');

// ─── Configuration ───────────────────────────────────────────────────────────
// BACKEND: 'ollama' or 'lmstudio'
const CONFIG = {
  proxyPort: parseInt(process.env.PROXY_PORT) || 9100,
  backend: (process.env.LLM_BACKEND || 'ollama').toLowerCase(),
  // Ollama settings
  ollamaHost: process.env.OLLAMA_HOST || 'localhost',
  ollamaPort: parseInt(process.env.OLLAMA_PORT) || 11434,
  // LM Studio settings (OpenAI-compatible API)
  lmstudioHost: process.env.LMSTUDIO_HOST || 'localhost',
  lmstudioPort: parseInt(process.env.LMSTUDIO_PORT) || 1234,
  defaultModel: process.env.OLLAMA_MODEL || process.env.LLM_MODEL || 'gemma3:1b',
  verbose: process.argv.includes('--verbose'),
  maxTokens: parseInt(process.env.MAX_TOKENS) || 4096,
};

// Allow runtime backend switching via /api/backend
let activeBackend = CONFIG.backend;

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
// Allow all origins (Google Apps Script dialogs run from various Google domains)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  if (CONFIG.verbose) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  }
  next();
});

// ─── Utility: Strip <think>...</think> blocks from thinking models ────────────
function stripThinking(text) {
  if (typeof text !== 'string') return text;
  // Remove one or more <think>...</think> blocks (deepseek-r1, qwen3, etc.)
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// ─── Utility: Forward request to Ollama ──────────────────────────────────────
function forwardToOllama(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);

    const options = {
      hostname: CONFIG.ollamaHost,
      port: CONFIG.ollamaPort,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // Strip thinking tags from generate responses (deepseek-r1, qwen3)
          if (parsed.response) parsed.response = stripThinking(parsed.response);
          // Strip thinking tags from chat responses
          if (parsed.message && parsed.message.content) {
            parsed.message.content = stripThinking(parsed.message.content);
          }
          resolve(parsed);
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Cannot connect to Ollama at ${CONFIG.ollamaHost}:${CONFIG.ollamaPort} - ${e.message}`));
    });

    req.setTimeout(300000); // 5 min timeout for long generations
    req.write(postData);
    req.end();
  });
}

// ─── Utility: Forward request to LM Studio (OpenAI-compatible API) ───────────
function forwardToLMStudio(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);

    const options = {
      hostname: CONFIG.lmstudioHost,
      port: CONFIG.lmstudioPort,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Cannot connect to LM Studio at ${CONFIG.lmstudioHost}:${CONFIG.lmstudioPort} - ${e.message}`));
    });

    req.setTimeout(300000);
    req.write(postData);
    req.end();
  });
}

// ─── Utility: Unified generate – routes to Ollama or LM Studio ──────────────
async function unifiedGenerate({ prompt, model, system, context, options, images }) {
  if (activeBackend === 'lmstudio') {
    // LM Studio uses OpenAI-compatible /v1/chat/completions
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const lmBody = {
      model: model || CONFIG.defaultModel,
      messages,
      max_tokens: (options && options.num_predict) || CONFIG.maxTokens,
      stream: false,
    };
    if (options && options.temperature !== undefined) lmBody.temperature = options.temperature;

    const result = await forwardToLMStudio('/v1/chat/completions', lmBody);

    // Normalize to Ollama-style response for compatibility
    const content = (result.choices && result.choices[0] && result.choices[0].message)
      ? result.choices[0].message.content
      : '';
    return { response: stripThinking(content), model: lmBody.model, _raw: result };
  } else {
    // Ollama native API
    const ollamaBody = {
      model: model || CONFIG.defaultModel,
      prompt,
      stream: false,
      options: {
        num_predict: CONFIG.maxTokens,
        ...options,
      },
    };
    if (system) ollamaBody.system = system;
    if (context) ollamaBody.context = context;
    if (images && images.length > 0) ollamaBody.images = images;

    return await forwardToOllama('/api/generate', ollamaBody);
  }
}

// ─── Utility: Unified chat – routes to Ollama or LM Studio ─────────────────
async function unifiedChat({ messages, model, options }) {
  if (activeBackend === 'lmstudio') {
    const lmBody = {
      model: model || CONFIG.defaultModel,
      messages,
      max_tokens: (options && options.num_predict) || CONFIG.maxTokens,
      stream: false,
    };
    if (options && options.temperature !== undefined) lmBody.temperature = options.temperature;

    const result = await forwardToLMStudio('/v1/chat/completions', lmBody);

    // Normalize to Ollama-style response
    const msg = (result.choices && result.choices[0] && result.choices[0].message) || {};
    return {
      message: { role: msg.role || 'assistant', content: stripThinking(msg.content || '') },
      model: lmBody.model,
      _raw: result,
    };
  } else {
    const ollamaBody = {
      model: model || CONFIG.defaultModel,
      messages,
      stream: false,
      options: {
        num_predict: CONFIG.maxTokens,
        ...options,
      },
    };
    return await forwardToOllama('/api/chat', ollamaBody);
  }
}

// ─── Utility: Unified model listing ─────────────────────────────────────────
async function unifiedListModels() {
  if (activeBackend === 'lmstudio') {
    return new Promise((resolve, reject) => {
      http.get(`http://${CONFIG.lmstudioHost}:${CONFIG.lmstudioPort}/v1/models`, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            // Normalize LM Studio response to Ollama-style { models: [...] }
            const models = (parsed.data || []).map(m => ({
              name: m.id,
              size: null,
              _source: 'lmstudio',
            }));
            resolve({ models });
          } catch (e) {
            reject(new Error('Invalid response from LM Studio'));
          }
        });
      }).on('error', reject);
    });
  } else {
    return new Promise((resolve, reject) => {
      http.get(`http://${CONFIG.ollamaHost}:${CONFIG.ollamaPort}/api/tags`, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Invalid response from Ollama')); }
        });
      }).on('error', reject);
    });
  }
}

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const backendInfo = activeBackend === 'lmstudio'
    ? `${CONFIG.lmstudioHost}:${CONFIG.lmstudioPort}`
    : `${CONFIG.ollamaHost}:${CONFIG.ollamaPort}`;
  res.json({
    status: 'running',
    service: 'Muxro AI Connector',
    version: '1.1.0',
    backend: activeBackend,
    backendUrl: backendInfo,
    model: CONFIG.defaultModel,
    timestamp: new Date().toISOString(),
  });
});

// ─── Get/Set Backend ─────────────────────────────────────────────────────────
app.get('/api/backend', (req, res) => {
  res.json({ backend: activeBackend });
});

app.post('/api/backend', (req, res) => {
  const { backend } = req.body;
  if (backend === 'ollama' || backend === 'lmstudio') {
    activeBackend = backend;
    console.log(`[Backend] Switched to ${activeBackend}`);
    res.json({ backend: activeBackend, message: `Switched to ${activeBackend}` });
  } else {
    res.status(400).json({ error: 'Invalid backend. Use "ollama" or "lmstudio".' });
  }
});

// ─── Check LLM Backend Status ────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  try {
    const result = await unifiedListModels();
    res.json({ status: 'connected', backend: activeBackend, models: result.models || [] });
  } catch (err) {
    res.status(503).json({ status: 'disconnected', backend: activeBackend, error: err.message });
  }
});

// ─── List Available Models ───────────────────────────────────────────────────
app.get('/api/models', async (req, res) => {
  try {
    const result = await unifiedListModels();
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: `${activeBackend} not running`, details: err.message });
  }
});

// ─── Generate (Chat Completion) ──────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, model, system, context, options } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing required field: prompt' });
    }

    if (CONFIG.verbose) {
      console.log(`[Generate] Backend: ${activeBackend}, Model: ${model || CONFIG.defaultModel}, Prompt length: ${prompt.length}`);
    }

    const result = await unifiedGenerate({ prompt, model, system, context, options });
    res.json(result);
  } catch (err) {
    console.error('[Generate Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Chat (Multi-turn Conversation) ─────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model, options } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Missing required field: messages (array)' });
    }

    if (CONFIG.verbose) {
      console.log(`[Chat] Backend: ${activeBackend}, Model: ${model || CONFIG.defaultModel}, Messages: ${messages.length}`);
    }

    const result = await unifiedChat({ messages, model, options });
    res.json(result);
  } catch (err) {
    console.error('[Chat Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Sheets Specific: Process spreadsheet data ────────────────────────
app.post('/api/sheets/analyze', async (req, res) => {
  try {
    const { data, instruction, model } = req.body;

    if (!data || !instruction) {
      return res.status(400).json({ error: 'Missing required fields: data, instruction' });
    }

    const prompt = `You are a spreadsheet data analyst assistant. Analyze the following spreadsheet data and ${instruction}.

DATA:
${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}

Respond with clear, structured output. If generating data for cells, format as CSV rows.`;

    const result = await unifiedGenerate({
      prompt,
      model: model || CONFIG.defaultModel,
      system: 'You are a helpful data analyst. When generating tabular data, output clean CSV format. Be precise and concise.',
      options: { num_predict: CONFIG.maxTokens },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Sheets: Generate formula ─────────────────────────────────────────
app.post('/api/sheets/formula', async (req, res) => {
  try {
    const { description, context, model } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Missing required field: description' });
    }

    let prompt = `Generate a Google Sheets formula for the following requirement:\n${description}`;
    if (context) prompt += `\n\nSpreadsheet column layout:\n${context}`;
    prompt += '\n\nIMPORTANT: Respond with ONLY the formula starting with =. No explanation, no markdown, no code blocks, just the raw formula.';

    const result = await unifiedGenerate({
      prompt,
      model: model || CONFIG.defaultModel,
      system: 'You are a Google Sheets formula expert. Output ONLY the raw formula starting with =. Never use markdown, code blocks, or explanations. Just the formula.',
      options: { num_predict: 500 },
    });

    // Clean formula from response — strip markdown code blocks, explanations etc.
    if (result && result.response) {
      let formula = result.response.trim();
      // Remove markdown code blocks
      const codeBlockMatch = formula.match(/```[\w]*\n?([\s\S]*?)```/);
      if (codeBlockMatch) formula = codeBlockMatch[1].trim();
      // Remove inline code backticks
      formula = formula.replace(/^`+|`+$/g, '').trim();
      // If there are multiple lines, find the one starting with =
      if (formula.includes('\n')) {
        const formulaLine = formula.split('\n').find(l => l.trim().startsWith('='));
        if (formulaLine) formula = formulaLine.trim();
      }
      // Ensure it starts with =
      if (!formula.startsWith('=') && formula.includes('=')) {
        formula = formula.substring(formula.indexOf('='));
      }
      result.response = formula;
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Docs Specific: Text operations ──────────────────────────────────
app.post('/api/docs/process', async (req, res) => {
  try {
    const { text, operation, model, customInstruction } = req.body;

    if (!text || !operation) {
      return res.status(400).json({ error: 'Missing required fields: text, operation' });
    }

    const operations = {
      summarize: `Summarize the following text concisely:\n\n${text}`,
      expand: `Expand and elaborate on the following text, adding more detail and depth:\n\n${text}`,
      rewrite: `Rewrite the following text to improve clarity and readability:\n\n${text}`,
      proofread: `Proofread the following text and provide a corrected version. Fix grammar, spelling, and punctuation:\n\n${text}`,
      translate: `Translate the following text to ${customInstruction || 'English'}:\n\n${text}`,
      tone_formal: `Rewrite the following text in a formal, professional tone:\n\n${text}`,
      tone_casual: `Rewrite the following text in a casual, friendly tone:\n\n${text}`,
      bullet_points: `Convert the following text into well-organized bullet points:\n\n${text}`,
      outline: `Create a detailed outline from the following text:\n\n${text}`,
      custom: `${customInstruction || 'Process this text'}:\n\n${text}`,
    };

    const prompt = operations[operation] || operations.custom;

    const result = await unifiedGenerate({
      prompt,
      model: model || CONFIG.defaultModel,
      system: 'You are a professional writing assistant. Provide clean, well-formatted output.',
      options: { num_predict: CONFIG.maxTokens },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Docs: Generate content ──────────────────────────────────────────
app.post('/api/docs/generate', async (req, res) => {
  try {
    const { topic, type, length, model } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Missing required field: topic' });
    }

    const types = {
      article: 'a well-structured article',
      email: 'a professional email',
      letter: 'a formal letter',
      report: 'a detailed report',
      essay: 'an essay',
      blog: 'a blog post',
      proposal: 'a business proposal',
    };

    const prompt = `Write ${types[type] || 'content'} about: ${topic}${length ? `. Target length: ${length}` : ''}`;

    const result = await unifiedGenerate({
      prompt,
      model: model || CONFIG.defaultModel,
      system: 'You are a professional content writer. Write well-structured, engaging content.',
      options: { num_predict: CONFIG.maxTokens },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Slides Specific: Generate presentation content ──────────────────
app.post('/api/slides/generate', async (req, res) => {
  try {
    const { topic, slideCount, style, model } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Missing required field: topic' });
    }

    const prompt = `Create a presentation outline about "${topic}" with ${slideCount || 8} slides.
${style ? `Style: ${style}` : ''}

For each slide, provide:
- Slide title
- 3-5 bullet points of content
- Speaker notes (1-2 sentences)

Format your response as JSON array:
[
  {
    "title": "Slide Title",
    "bullets": ["Point 1", "Point 2", "Point 3"],
    "notes": "Speaker notes here"
  }
]

Respond ONLY with the JSON array, no additional text.`;

    const result = await unifiedGenerate({
      prompt,
      model: model || CONFIG.defaultModel,
      system: 'You are a presentation design expert. Generate structured slide content. Always respond in valid JSON format.',
      options: { num_predict: CONFIG.maxTokens },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Slides: Generate visual HTML slide content ──────────────────────
app.post('/api/slides/generate-visual', async (req, res) => {
  try {
    const { topic, style, slideSize, model } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Missing required field: topic' });
    }

    const width = (slideSize && slideSize.width) || 960;
    const height = (slideSize && slideSize.height) || 540;
    const innerW = width - 80;  // usable content width after padding
    const innerH = height - 60; // usable content height after padding

    const prompt = `Design a single presentation slide as HTML+CSS for: "${topic}"
${style ? `Visual style: ${style}` : ''}

You MUST use this EXACT template structure. Fill in the content and colors only:

<div style="width:${width}px;height:${height}px;box-sizing:border-box;overflow:hidden;padding:30px 40px;position:relative;font-family:Arial,Helvetica,sans-serif;background:LINEAR_GRADIENT_OR_COLOR;">

  <h1 style="font-size:30px;font-weight:700;margin:0 0 6px 0;color:COLOR;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${innerW}px;">TITLE HERE (max 6 words)</h1>

  <p style="font-size:14px;color:COLOR;margin:0 0 16px 0;max-width:${innerW}px;overflow:hidden;max-height:40px;">SUBTITLE (max 12 words, 1 line)</p>

  <div style="display:flex;flex-direction:row;gap:16px;width:${innerW}px;height:${innerH - 120}px;overflow:hidden;">

    <!-- Card 1 -->
    <div style="flex:1;min-width:0;background:CARD_BG;border-radius:12px;padding:16px;overflow:hidden;">
      <div style="font-size:24px;margin-bottom:6px;">EMOJI</div>
      <div style="font-size:15px;font-weight:600;color:COLOR;margin-bottom:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">Card Title</div>
      <div style="font-size:12px;color:COLOR;line-height:1.3;overflow:hidden;max-height:80px;">Short description (max 15 words)</div>
    </div>

    <!-- Card 2 -->
    <div style="flex:1;min-width:0;background:CARD_BG;border-radius:12px;padding:16px;overflow:hidden;">
      <div style="font-size:24px;margin-bottom:6px;">EMOJI</div>
      <div style="font-size:15px;font-weight:600;color:COLOR;margin-bottom:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">Card Title</div>
      <div style="font-size:12px;color:COLOR;line-height:1.3;overflow:hidden;max-height:80px;">Short description (max 15 words)</div>
    </div>

    <!-- Card 3 -->
    <div style="flex:1;min-width:0;background:CARD_BG;border-radius:12px;padding:16px;overflow:hidden;">
      <div style="font-size:24px;margin-bottom:6px;">EMOJI</div>
      <div style="font-size:15px;font-weight:600;color:COLOR;margin-bottom:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">Card Title</div>
      <div style="font-size:12px;color:COLOR;line-height:1.3;overflow:hidden;max-height:80px;">Short description (max 15 words)</div>
    </div>

  </div>
</div>

RULES:
1. Use the EXACT template above. Replace ONLY the placeholder text (TITLE, SUBTITLE, Card Title, descriptions, EMOJI, colors, gradients).
2. You may use 2 or 3 cards — NEVER more than 3.
3. You may add a small footer line below the cards row if space allows.
4. Every single element MUST have overflow:hidden in its inline style.
5. NEVER add any element with width larger than ${innerW}px.
6. NEVER use position:absolute for content elements.
7. Keep total text under 40 words.
8. Use beautiful gradients, accent colors, and emoji icons.
9. NO <html>, <head>, <body>, NO JavaScript, NO external images.

Output ONLY the HTML. No markdown fences, no explanation.`;

    const result = await unifiedGenerate({
      prompt,
      model: model || CONFIG.defaultModel,
      system: `You are a slide designer. Output ONLY a single HTML div (${width}x${height}px) using the provided template. Replace placeholders with real content and beautiful colors. Every element must have overflow:hidden. Keep text minimal. No markdown fences.`,
      options: { num_predict: Math.max(CONFIG.maxTokens, 8192) },
    });

    // Clean the response — strip thinking tags, code fences, then wrap with safety CSS
    if (result && result.response) {
      let html = result.response.trim();
      html = html.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      // Strip markdown code fences
      const fenceMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)```/);
      if (fenceMatch) html = fenceMatch[1].trim();
      // Remove any leading/trailing backticks
      html = html.replace(/^`+|`+$/g, '').trim();

      // Post-process: force-inject overflow:hidden into ALL div/section style attributes
      html = html.replace(/(<(?:div|section|article|aside|header|footer|nav|main|ul|ol)\s+[^>]*style\s*=\s*")/gi, (match) => {
        if (match.includes('overflow')) return match;
        return match + 'overflow:hidden;';
      });

      // Wrap in a hard-clipping safety container
      html = `<div style="width:${width}px;height:${height}px;overflow:hidden;position:relative;box-sizing:border-box;">
<style>
  * { box-sizing:border-box; margin:0; padding:0; max-width:${width}px !important; }
  div, section, article, aside, header, footer, nav, main, ul, ol { overflow:hidden !important; }
  h1,h2,h3,h4,h5,h6 { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; max-width:${innerW}px; }
  p,li,span,td,th { overflow:hidden; overflow-wrap:break-word; word-wrap:break-word; max-width:${innerW}px; }
  img { max-width:100%; height:auto; }
</style>
${html}
</div>`;
      result.response = html;
    }

    res.json(result);
  } catch (err) {
    console.error('[Slides Visual Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Slides: Improve existing slide content ──────────────────────────
app.post('/api/slides/improve', async (req, res) => {
  try {
    const { slides, instruction, model } = req.body;

    if (!slides) {
      return res.status(400).json({ error: 'Missing required field: slides' });
    }

    const prompt = `Here are presentation slides:\n${JSON.stringify(slides, null, 2)}\n\n${instruction || 'Improve the content of these slides to be more engaging and professional.'}\n\nRespond with the improved slides in the same JSON format.`;

    const result = await unifiedGenerate({
      prompt,
      model: model || CONFIG.defaultModel,
      system: 'You are a presentation improvement expert. Output valid JSON only.',
      options: { num_predict: CONFIG.maxTokens },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Invoice Data Extraction (multimodal: images + text) ─────────────────────
app.post('/api/sheets/invoice', async (req, res) => {
  try {
    const { headers, images, textContent, model } = req.body;

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return res.status(400).json({ error: 'Missing required field: headers (array of column names)' });
    }
    if ((!images || images.length === 0) && !textContent) {
      return res.status(400).json({ error: 'Provide at least one image or textContent' });
    }

    const headersStr = headers.map((h, i) => `  Column ${i + 1}: "${h}"`).join('\n');

    const prompt = `You are an invoice data extraction assistant. Extract ALL data from the provided invoice and return it as a JSON 2D array.

The target spreadsheet has these column headers (in order):
${headersStr}

RULES:
1. Each invoice line item MUST be a separate row.
2. Invoice-level fields (invoice number, date, vendor name, address, etc.) should be repeated on EVERY row.
3. If a header field is not found in the invoice, use an empty string "".
4. Dates should be formatted as YYYY-MM-DD.
5. Numbers should be plain numbers without currency symbols.
6. Return ONLY a valid JSON 2D array — no markdown, no explanation, no code fences.
7. Do NOT include the header row — only data rows.

Example (for headers: Invoice#, Date, Vendor, Item, Qty, UnitPrice, Total):
[["INV-001","2024-01-15","Acme Corp","Widget A","2","10.00","20.00"],["INV-001","2024-01-15","Acme Corp","Widget B","1","25.00","25.00"]]

Now extract all data from the invoice${textContent ? ':\n\n' + textContent : ' image(s) provided'}.`;

    const ollamaBody = {
      model: model || 'gemma3:1b',
      prompt: prompt,
      stream: false,
      system: 'You are a precise data extraction engine. Output ONLY valid JSON arrays. Never include markdown fences, explanations, or extra text. Do not repeat the column headers in your output.',
      options: { num_predict: Math.max(CONFIG.maxTokens, 8192) },
    };

    // Attach images for multimodal processing (gemma3 supports vision)
    if (images && images.length > 0) {
      ollamaBody.images = images; // array of base64 strings (no data URI prefix)
    }

    if (CONFIG.verbose) {
      console.log(`[Invoice] Backend: ${activeBackend}, Headers: ${headers.length}, Images: ${(images || []).length}, TextLen: ${(textContent || '').length}`);
    }

    // Invoice extraction uses unifiedGenerate for text, but falls back to
    // direct Ollama call when images are present (multimodal not standardised across backends)
    let result;
    if (images && images.length > 0 && activeBackend === 'ollama') {
      // Ollama multimodal path – pass images directly
      result = await forwardToOllama('/api/generate', ollamaBody);
    } else if (images && images.length > 0 && activeBackend === 'lmstudio') {
      // LM Studio multimodal via OpenAI vision format
      const userContent = [{ type: 'text', text: prompt }];
      images.forEach(img => {
        userContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } });
      });
      const lmBody = {
        model: model || CONFIG.defaultModel,
        messages: [
          { role: 'system', content: ollamaBody.system },
          { role: 'user', content: userContent },
        ],
        max_tokens: Math.max(CONFIG.maxTokens, 8192),
        stream: false,
      };
      const lmResult = await forwardToLMStudio('/v1/chat/completions', lmBody);
      const content = (lmResult.choices && lmResult.choices[0] && lmResult.choices[0].message)
        ? lmResult.choices[0].message.content : '';
      result = { response: stripThinking(content) };
    } else {
      // Text-only invoice – use unified path
      result = await unifiedGenerate({
        prompt,
        model: model || 'gemma3:1b',
        system: ollamaBody.system,
        options: { num_predict: Math.max(CONFIG.maxTokens, 8192) },
      });
    }

    // Try to parse the extracted data as JSON
    let rows = null;
    if (result && result.response) {
      let raw = result.response.trim();
      // Strip <think> blocks (qwen3 models)
      raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      // Strip markdown code fences if model included them
      const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (fenceMatch) raw = fenceMatch[1].trim();
      // Find the JSON array
      const arrMatch = raw.match(/\[\s*\[[\s\S]*\]\s*\]/);
      if (arrMatch) {
        try {
          rows = JSON.parse(arrMatch[0]);
        } catch (parseErr) {
          if (CONFIG.verbose) console.log('[Invoice] JSON parse failed, trying truncated recovery');
        }
      }
      // Truncated JSON recovery: model ran out of tokens mid-array
      if (!rows) {
        // Find start of 2D array and try to salvage complete inner arrays
        const startIdx = raw.indexOf('[[');
        if (startIdx !== -1) {
          const innerMatches = raw.substring(startIdx).match(/\[(?:["\[][^\]]*|[^\[\]])*\]/g);
          if (innerMatches && innerMatches.length > 0) {
            const salvaged = [];
            for (const m of innerMatches) {
              try {
                const parsed = JSON.parse(m);
                if (Array.isArray(parsed)) salvaged.push(parsed);
              } catch (_) { /* skip broken rows */ }
            }
            if (salvaged.length > 0) rows = salvaged;
          }
        }
      }
      // Filter out header row if model duplicated it
      if (rows && rows.length > 1) {
        const headerLower = headers.map(h => String(h).toLowerCase().trim());
        rows = rows.filter(row => {
          if (!Array.isArray(row)) return false;
          const rowLower = row.map(c => String(c).toLowerCase().trim());
          const matchCount = headerLower.filter((h, i) => rowLower[i] === h).length;
          return matchCount < headerLower.length * 0.6;
        });
      }
    }

    res.json({
      success: !!(rows && rows.length > 0),
      rows: rows,
      raw: result.response || '',
      headers: headers,
    });
  } catch (err) {
    console.error('[Invoice Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Generic AI endpoint (for custom Apps Script usage) ─────────────────────
app.post('/api/ask', async (req, res) => {
  try {
    const { question, context, model, system } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Missing required field: question' });
    }

    let prompt = question;
    if (context) prompt = `Context:\n${context}\n\nQuestion: ${question}`;

    const result = await unifiedGenerate({
      prompt,
      model: model || CONFIG.defaultModel,
      system: system || 'You are a helpful AI assistant.',
      options: { num_predict: CONFIG.maxTokens },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Error handling ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ─── Start Server ────────────────────────────────────────────────────────────
app.listen(CONFIG.proxyPort, () => {
  const backendLabel = activeBackend === 'lmstudio' ? 'LM Studio' : 'Ollama';
  const backendUrl = activeBackend === 'lmstudio'
    ? `http://${CONFIG.lmstudioHost}:${CONFIG.lmstudioPort}`
    : `http://${CONFIG.ollamaHost}:${CONFIG.ollamaPort}`;
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       Muxro AI Connector v1.1.0                    ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Proxy    : http://localhost:${CONFIG.proxyPort}                  ║`);
  console.log(`║  Backend  : ${(backendLabel + ' (' + backendUrl + ')').padEnd(40)}║`);
  console.log(`║  Model    : ${CONFIG.defaultModel.padEnd(40)}║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                         ║');
  console.log('║   GET  /              - Health check                 ║');
  console.log('║   GET  /api/status    - Backend connection status    ║');
  console.log('║   GET  /api/models    - List available models        ║');
  console.log('║   GET  /api/backend   - Current backend              ║');
  console.log('║   POST /api/backend   - Switch backend (runtime)     ║');
  console.log('║   POST /api/generate  - Generate text                ║');
  console.log('║   POST /api/chat      - Multi-turn chat              ║');
  console.log('║   POST /api/ask       - Simple Q&A                   ║');
  console.log('║   POST /api/sheets/*  - Google Sheets helpers        ║');
  console.log('║   POST /api/sheets/invoice - Invoice data extraction  ║');
  console.log('║   POST /api/docs/*    - Google Docs helpers          ║');
  console.log('║   POST /api/slides/*  - Google Slides helpers        ║');
  console.log('║   POST /api/slides/generate-visual - HTML→Image slide ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Backend: ${backendLabel}  |  Switch at runtime: POST /api/backend {"backend":"lmstudio"}`);
  console.log('Keep this running while using Google Workspace addons.');
  console.log('Press Ctrl+C to stop.');
});
