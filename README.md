# Ollama Google Workspace Connector

Connect your **locally running Ollama LLM** with Google Workspace tools (Google Sheets, Docs, Slides) through custom addons.

> Inspired by [tally-localhost-connector](https://github.com/dhananjay1405/tally-localhost-connector) architecture — uses a local proxy server to bridge browser-based Google Workspace addons with localhost services.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Workspace                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Google Sheets │  │ Google Docs  │  │Google Slides │      │
│  │    Addon      │  │    Addon     │  │    Addon     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │               │
│         │    AJAX (HTTP POST from Dialog)     │               │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Muxro AI Connector                              │
│              (Node.js proxy on port 9100)                     │
│              Handles CORS + routes requests                   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             │ HTTP POST (JSON)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Ollama LLM Server                                │
│              (localhost:11434)                                 │
│              Runs models like llama3.2, mistral, etc.         │
└─────────────────────────────────────────────────────────────┘
```

### Why a proxy?

Modern browsers block web pages from making requests to `localhost` for security reasons. Google Workspace addon dialogs run inside Google's domain, so they can't directly reach your local Ollama. The proxy server solves this by:

1. Running on your machine with proper **CORS headers**
2. Accepting requests from Google's domain
3. Forwarding them to Ollama's API
4. Returning responses back to the addon

---

## Prerequisites

- **Node.js** (v16 or higher) — [Download](https://nodejs.org/)
- **Ollama** installed and running — [Download](https://ollama.com/)
- At least one model pulled (e.g., `ollama pull llama3.2`)
- A Google account with access to Google Sheets, Docs, or Slides

---

## Project Structure

```
googleworkspace connector/
├── start-all.bat                   # 1-click setup & run (Windows)
├── start-all.sh                    # 1-click setup & run (macOS / Linux)
├── ollama-localhost-connector/     # Local proxy server (Node.js)
│   ├── package.json
│   └── server.js
├── google-sheets-addon/            # Google Sheets Apps Script files
│   ├── Code.gs
│   ├── Sidebar.html
│   ├── FormulaDialog.html
│   └── Config.html
├── google-docs-addon/              # Google Docs Apps Script files
│   ├── Code.gs
│   ├── Sidebar.html
│   └── Config.html
├── google-slides-addon/            # Google Slides Apps Script files
│   ├── Code.gs
│   ├── Sidebar.html
│   └── Config.html
└── README.md
```

---

## Quick Start (1-Click Setup)

The easiest way to get everything running — installs Ollama (if needed), pulls the default model, installs dependencies, and starts the proxy server.

### Windows

Double-click **`start-all.bat`** or run in a terminal:

```cmd
start-all.bat
```

### macOS / Linux

```bash
chmod +x start-all.sh
./start-all.sh
```

This will:
1. Check/install **Node.js**
2. Check/install **Ollama** (`curl -fsSL https://ollama.com/install.sh | sh`)
3. Start the Ollama server
4. Pull the default model (`gemma3:1b`)
5. Install npm dependencies and start the proxy on port **9100**

> **Tip:** You can install additional models anytime with `ollama pull <model-name>` — all installed models will appear in the addon's model dropdown.

---

## Manual Setup Guide

### Step 1: Install & Start Ollama

```bash
# Install Ollama from https://ollama.com/

# Pull a model
ollama pull llama3.2

# Verify it's running
ollama list
```

### Step 2: Start the Localhost Connector Proxy

```bash
cd ollama-localhost-connector

# Install dependencies
npm install

# Start the proxy server
npm start

# Or with verbose logging
npm run dev
```

You should see:
```
╔══════════════════════════════════════════════════════════════╗
║       Muxro AI Connector v1.0.0                            ║
╠══════════════════════════════════════════════════════════════╣
║  Proxy    : http://localhost:9100                            ║
║  Ollama   : http://localhost:11434                           ║
║  Model    : llama3.2                                         ║
╚══════════════════════════════════════════════════════════════╝
```

**Keep this terminal running** while using the Google Workspace addons.

### Step 3: Install Google Workspace Addon

#### For Google Sheets:

1. Open a Google Sheet
2. Go to **Extensions → Apps Script**
3. Delete any existing code in `Code.gs`
4. Copy & paste the contents of `google-sheets-addon/Code.gs`
5. Click **+** next to Files, select **HTML**, name it `Sidebar`
6. Paste contents of `google-sheets-addon/Sidebar.html`
7. Repeat for `Config.html` and `FormulaDialog.html`
8. Click **Save** (💾)
9. **Reload** the Google Sheet
10. You'll see a new **🤖 Muxro AI** menu

#### For Google Docs:

1. Open a Google Doc
2. Go to **Extensions → Apps Script**
3. Create files: `Code.gs`, `Sidebar.html`, `Config.html`
4. Paste corresponding code from `google-docs-addon/`
5. Save and reload the document

#### For Google Slides:

1. Open a Google Slides presentation
2. Go to **Extensions → Apps Script**
3. Create files: `Code.gs`, `Sidebar.html`, `Config.html`
4. Paste corresponding code from `google-slides-addon/`
5. Save and reload the presentation

> **First Run:** Google will ask for permissions. Click "Advanced" → "Go to (script name)" → "Allow". This is required for the addon to interact with your document.

---

## Features

### Google Sheets Addon

| Feature | Description |
|---------|-------------|
| **AI Sidebar** | Chat with AI about your spreadsheet data |
| **Data Analysis** | Summarize, find trends, detect outliers, get chart suggestions |
| **Formula Generator** | Describe what you need → get the formula |
| **Fill with AI** | Generate data (names, emails, test data) directly into cells |
| **Translate** | Translate selected cell data to any language |
| **Quick Actions** | One-click summarize, translate, or AI-fill selections |

### Google Docs Addon

| Feature | Description |
|---------|-------------|
| **Text Transform** | Summarize, expand, rewrite, proofread selected text |
| **Tone Adjustment** | Make text formal or casual |
| **Translation** | Translate selected text to any language |
| **Content Generation** | Generate articles, emails, reports, blog posts, proposals |
| **Document Summary** | Summarize the entire document |
| **Custom Instructions** | Apply any custom AI instruction to selected text |

### Google Slides Addon

| Feature | Description |
|---------|-------------|
| **Generate Presentation** | Create full presentations from a topic |
| **Slide Content** | Generate or improve individual slide content |
| **Speaker Notes** | Auto-generate speaker notes for any/all slides |
| **Improve Slides** | Enhance, simplify, formalize, or add detail |
| **Batch Operations** | Add speaker notes to all slides at once |
| **Presentation Summary** | Get an AI summary of the entire presentation |

---

## API Endpoints (Proxy Server)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check / status |
| `/api/status` | GET | Check Ollama connection + list models |
| `/api/models` | GET | List available Ollama models |
| `/api/generate` | POST | Text generation (single prompt) |
| `/api/chat` | POST | Multi-turn conversation |
| `/api/ask` | POST | Simple Q&A |
| `/api/sheets/analyze` | POST | Spreadsheet data analysis |
| `/api/sheets/formula` | POST | Formula generation |
| `/api/docs/process` | POST | Text operations (summarize, rewrite, etc.) |
| `/api/docs/generate` | POST | Content generation |
| `/api/slides/generate` | POST | Slide content generation |
| `/api/slides/improve` | POST | Slide improvement |

---

## Configuration

### Environment Variables (Proxy Server)

| Variable | Default | Description |
|----------|---------|-------------|
| `PROXY_PORT` | `9100` | Port for the proxy server |
| `OLLAMA_HOST` | `localhost` | Ollama server hostname |
| `OLLAMA_PORT` | `11434` | Ollama server port |
| `OLLAMA_MODEL` | `llama3.2` | Default model to use |
| `MAX_TOKENS` | `4096` | Maximum tokens per response |

Example:
```bash
OLLAMA_MODEL=mistral PROXY_PORT=8080 npm start
```

### Addon Settings

Each addon has a Settings dialog (accessible from the Muxro AI menu) where you can configure:
- **Connector URL** — proxy server address (default: `http://localhost:9100`)
- **Default Model** — which Ollama model to use

---

## Troubleshooting

### "Cannot connect to Muxro AI Connector"
- Make sure the proxy server is running (`npm start` in `ollama-localhost-connector/`)
- Check that port 9100 is not blocked by firewall

### "Ollama not running"
- Start Ollama: `ollama serve`
- Verify: open `http://localhost:11434` in your browser

### "No models found"
- Pull a model: `ollama pull llama3.2`
- List models: `ollama list`

### Addon menu doesn't appear
- Reload the Google Sheet/Doc/Slides page
- Check Apps Script for errors (Extensions → Apps Script → Executions)

### Slow responses
- Larger models are slower. Try a smaller model like `llama3.2:1b`
- Check your system resources (RAM, CPU usage)

### Permission errors
- When running the addon for the first time, approve all permission prompts
- Go to Extensions → Apps Script → click ▶ on `onOpen` to trigger permissions

---

## Supported Models

Any model available in Ollama works. Popular choices:

| Model | Size | Best For |
|-------|------|----------|
| `llama3.2` | 2B | General use, fast |
| `llama3.2:1b` | 1B | Fastest, lightweight |
| `llama3.1:8b` | 8B | Better quality |
| `mistral` | 7B | Good all-around |
| `codellama` | 7B | Code/formula generation |
| `phi3` | 3.8B | Compact, fast |
| `gemma2` | 9B | Google's model |

---

## License

MIT License — Free to use, modify, and distribute.

---

## Credits

- Architecture inspired by [Tally Localhost Connector](https://github.com/dhananjay1405/tally-localhost-connector) by Dhananjay
- [ExcelKida Google Sheet-Tally Connectivity](https://excelkida.com/article/googlesheet-tally-connectivity) tutorial for the proxy pattern
- [Ollama](https://ollama.com/) for local LLM serving
