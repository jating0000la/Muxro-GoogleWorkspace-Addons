/**
 * Muxro AI - Ollama Localhost Connector
 * 
 * A local proxy server that bridges Google Workspace addons (Sheets, Docs, Slides)
 * with the Ollama LLM running on localhost:11434.
 * 
 * Architecture:
 *   Google Workspace Addon (Apps Script Dialog)
 *       ↓ HTTP POST (AJAX from browser)
 *   This Proxy Server (localhost:9100)
 *       ↓ HTTP POST
 *   Ollama API (localhost:11434)
 * 
 * Browsers block direct localhost access from web pages for security.
 * This proxy handles CORS and forwards requests to Ollama.
 */

const express = require('express');
const cors = require('cors');
const http = require('http');

// ─── Configuration ───────────────────────────────────────────────────────────
const CONFIG = {
  proxyPort: parseInt(process.env.PROXY_PORT) || 9100,
  ollamaHost: process.env.OLLAMA_HOST || 'localhost',
  ollamaPort: parseInt(process.env.OLLAMA_PORT) || 11434,
  defaultModel: process.env.OLLAMA_MODEL || 'gemma3:1b',
  verbose: process.argv.includes('--verbose'),
  maxTokens: parseInt(process.env.MAX_TOKENS) || 4096,
};

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

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'Muxro AI Connector',
    version: '1.0.0',
    ollama: `${CONFIG.ollamaHost}:${CONFIG.ollamaPort}`,
    model: CONFIG.defaultModel,
    timestamp: new Date().toISOString(),
  });
});

// ─── Check Ollama Status ─────────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      http.get(`http://${CONFIG.ollamaHost}:${CONFIG.ollamaPort}/api/tags`, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { resolve(data); }
        });
      }).on('error', reject);
    });
    res.json({ status: 'connected', models: result.models || [] });
  } catch (err) {
    res.status(503).json({ status: 'disconnected', error: err.message });
  }
});

// ─── List Available Models ───────────────────────────────────────────────────
app.get('/api/models', async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      http.get(`http://${CONFIG.ollamaHost}:${CONFIG.ollamaPort}/api/tags`, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Invalid response from Ollama')); }
        });
      }).on('error', reject);
    });
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: 'Ollama not running', details: err.message });
  }
});

// ─── Generate (Chat Completion) ──────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, model, system, context, options } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing required field: prompt' });
    }

    const ollamaBody = {
      model: model || CONFIG.defaultModel,
      prompt: prompt,
      stream: false,
      options: {
        num_predict: CONFIG.maxTokens,
        ...options,
      },
    };

    if (system) ollamaBody.system = system;
    if (context) ollamaBody.context = context;

    if (CONFIG.verbose) {
      console.log(`[Generate] Model: ${ollamaBody.model}, Prompt length: ${prompt.length}`);
    }

    const result = await forwardToOllama('/api/generate', ollamaBody);
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

    const ollamaBody = {
      model: model || CONFIG.defaultModel,
      messages: messages,
      stream: false,
      options: {
        num_predict: CONFIG.maxTokens,
        ...options,
      },
    };

    if (CONFIG.verbose) {
      console.log(`[Chat] Model: ${ollamaBody.model}, Messages: ${messages.length}`);
    }

    const result = await forwardToOllama('/api/chat', ollamaBody);
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

    const result = await forwardToOllama('/api/generate', {
      model: model || CONFIG.defaultModel,
      prompt,
      stream: false,
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

    const result = await forwardToOllama('/api/generate', {
      model: model || CONFIG.defaultModel,
      prompt,
      stream: false,
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

    const result = await forwardToOllama('/api/generate', {
      model: model || CONFIG.defaultModel,
      prompt,
      stream: false,
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

    const result = await forwardToOllama('/api/generate', {
      model: model || CONFIG.defaultModel,
      prompt,
      stream: false,
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

    const result = await forwardToOllama('/api/generate', {
      model: model || CONFIG.defaultModel,
      prompt,
      stream: false,
      system: 'You are a presentation design expert. Generate structured slide content. Always respond in valid JSON format.',
      options: { num_predict: CONFIG.maxTokens },
    });

    res.json(result);
  } catch (err) {
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

    const result = await forwardToOllama('/api/generate', {
      model: model || CONFIG.defaultModel,
      prompt,
      stream: false,
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

Example (for headers: Invoice#, Date, Vendor, Item, Qty, UnitPrice, Total):
[["INV-001","2024-01-15","Acme Corp","Widget A","2","10.00","20.00"],["INV-001","2024-01-15","Acme Corp","Widget B","1","25.00","25.00"]]

Now extract all data from the invoice${textContent ? ':\n\n' + textContent : ' image(s) provided'}.`;

    const ollamaBody = {
      model: model || 'gemma3:1b',
      prompt: prompt,
      stream: false,
      system: 'You are a precise data extraction engine. Output ONLY valid JSON arrays. Never include markdown fences, explanations, or extra text.',
      options: { num_predict: CONFIG.maxTokens },
    };

    // Attach images for multimodal processing (gemma3 supports vision)
    if (images && images.length > 0) {
      ollamaBody.images = images; // array of base64 strings (no data URI prefix)
    }

    if (CONFIG.verbose) {
      console.log(`[Invoice] Headers: ${headers.length}, Images: ${(images || []).length}, TextLen: ${(textContent || '').length}`);
    }

    const result = await forwardToOllama('/api/generate', ollamaBody);

    // Try to parse the extracted data as JSON
    let rows = null;
    if (result && result.response) {
      let raw = result.response.trim();
      // Strip markdown code fences if model included them
      const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (fenceMatch) raw = fenceMatch[1].trim();
      // Find the JSON array
      const arrMatch = raw.match(/\[\s*\[[\s\S]*\]\s*\]/);
      if (arrMatch) {
        try {
          rows = JSON.parse(arrMatch[0]);
        } catch (parseErr) {
          if (CONFIG.verbose) console.log('[Invoice] JSON parse failed, returning raw');
        }
      }
    }

    res.json({
      success: !!rows,
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

    const result = await forwardToOllama('/api/generate', {
      model: model || CONFIG.defaultModel,
      prompt,
      stream: false,
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
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       Muxro AI Connector v1.0.0                    ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Proxy    : http://localhost:${CONFIG.proxyPort}                  ║`);
  console.log(`║  Ollama   : http://${CONFIG.ollamaHost}:${CONFIG.ollamaPort}               ║`);
  console.log(`║  Model    : ${CONFIG.defaultModel.padEnd(40)}║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                         ║');
  console.log('║   GET  /              - Health check                 ║');
  console.log('║   GET  /api/status    - Ollama connection status     ║');
  console.log('║   GET  /api/models    - List available models        ║');
  console.log('║   POST /api/generate  - Generate text                ║');
  console.log('║   POST /api/chat      - Multi-turn chat              ║');
  console.log('║   POST /api/ask       - Simple Q&A                   ║');

  console.log('║   POST /api/sheets/*  - Google Sheets helpers        ║');
  console.log('║   POST /api/sheets/invoice - Invoice data extraction  ║');
  console.log('║   POST /api/docs/*    - Google Docs helpers          ║');
  console.log('║   POST /api/slides/*  - Google Slides helpers        ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Keep this running while using Google Workspace addons.');
  console.log('Press Ctrl+C to stop.');
});
