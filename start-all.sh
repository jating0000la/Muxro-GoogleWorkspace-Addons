#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#   Muxro AI - Automatic Setup (macOS / Linux)
#   One-click setup: installs Ollama, pulls models, starts proxy
# ═══════════════════════════════════════════════════════════════

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
CONNECTOR_DIR="$BASE_DIR/ollama-localhost-connector"

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   Muxro AI - Automatic Setup${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

# ─── 1. Check Node.js ────────────────────────────────────────────
echo -e "${BOLD}[1/5] Checking Node.js...${NC}"
if command -v node &> /dev/null; then
    NODE_VER=$(node -v)
    echo -e "   ${GREEN}✔${NC} Found Node.js ${NODE_VER}"
else
    echo -e "   ${YELLOW}Node.js not found. Attempting to install...${NC}"

    # Try Homebrew first (macOS)
    if command -v brew &> /dev/null; then
        echo "   Installing via Homebrew..."
        brew install node
    # Try apt (Debian/Ubuntu)
    elif command -v apt-get &> /dev/null; then
        echo "   Installing via apt..."
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    # Try dnf (Fedora)
    elif command -v dnf &> /dev/null; then
        echo "   Installing via dnf..."
        sudo dnf install -y nodejs
    else
        echo -e "   ${RED}✘ Cannot auto-install Node.js.${NC}"
        echo "   Please install Node.js from https://nodejs.org/ and re-run."
        exit 1
    fi

    if command -v node &> /dev/null; then
        echo -e "   ${GREEN}✔${NC} Node.js $(node -v) installed successfully"
    else
        echo -e "   ${RED}✘ Node.js installation failed. Install manually from https://nodejs.org/${NC}"
        exit 1
    fi
fi
echo ""

# ─── 2. Check & Install Ollama ───────────────────────────────────
echo -e "${BOLD}[2/5] Checking Ollama...${NC}"
if command -v ollama &> /dev/null; then
    OLLAMA_VER=$(ollama --version 2>/dev/null || echo "unknown version")
    echo -e "   ${GREEN}✔${NC} Found ${OLLAMA_VER}"
else
    echo -e "   ${YELLOW}Ollama not found. Installing...${NC}"
    curl -fsSL https://ollama.com/install.sh | sh
    if command -v ollama &> /dev/null; then
        echo -e "   ${GREEN}✔${NC} Ollama installed successfully"
    else
        echo -e "   ${RED}✘ Ollama installation failed.${NC}"
        echo "   Install manually from https://ollama.com/ and re-run."
        exit 1
    fi
fi
echo ""

# ─── 3. Start Ollama serve ───────────────────────────────────────
echo -e "${BOLD}[3/5] Starting Ollama server...${NC}"

# Check if Ollama is already responding
OLLAMA_RUNNING=false
if curl -sf http://localhost:11434/api/tags -o /dev/null --connect-timeout 3 2>/dev/null; then
    OLLAMA_RUNNING=true
    echo -e "   ${GREEN}✔${NC} Ollama is already running on port 11434"
fi

if [ "$OLLAMA_RUNNING" = false ]; then
    echo "   Starting Ollama in background..."

    # Kill any zombie ollama processes
    pkill -f "ollama serve" 2>/dev/null || true
    sleep 1

    # Start ollama serve in background
    ollama serve &>/dev/null &
    OLLAMA_PID=$!
    echo "   Waiting for Ollama to be ready..."

    RETRIES=0
    MAX_RETRIES=15
    while [ $RETRIES -lt $MAX_RETRIES ]; do
        sleep 2
        if curl -sf http://localhost:11434/api/tags -o /dev/null --connect-timeout 2 2>/dev/null; then
            echo -e "   ${GREEN}✔${NC} Ollama is ready! (PID: $OLLAMA_PID)"
            break
        fi
        RETRIES=$((RETRIES + 1))
        echo "   Retry $RETRIES/$MAX_RETRIES..."
    done

    if [ $RETRIES -ge $MAX_RETRIES ]; then
        echo -e "   ${RED}✘ Ollama failed to start within 30 seconds.${NC}"
        echo "   Try running 'ollama serve' manually in another terminal."
        exit 1
    fi
fi
echo ""

# ─── 4. Pull required models ────────────────────────────────────
echo -e "${BOLD}[4/5] Pulling AI models (skips if already downloaded)...${NC}"
echo ""

echo "   Pulling gemma3:1b (default model)..."
ollama pull gemma3:1b
echo ""

echo -e "   ${GREEN}✔${NC} Installed models:"
ollama list
echo ""

# ─── 5. Install npm deps & start proxy server ───────────────────
echo -e "${BOLD}[5/5] Starting the proxy connector server...${NC}"

# Kill any existing process on port 9100
PORT_PID=$(lsof -ti :9100 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
    echo "   Freeing port 9100 (killing PID $PORT_PID)..."
    kill -9 $PORT_PID 2>/dev/null || true
    sleep 1
fi

cd "$CONNECTOR_DIR"

# Install npm dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "   Installing npm dependencies..."
    npm install
    echo ""
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   ALL SYSTEMS GO!${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "   Ollama       : http://localhost:11434"
echo "   Proxy Server : http://localhost:9100"
echo "   Model        : gemma3:1b (+ any models you have installed)"
echo ""
echo "   Next steps:"
echo "     1. Copy the Google Apps Script files into your"
echo "        Sheets / Docs / Slides script editor"
echo "     2. Open the addon sidebar from the menu"
echo "     3. Select your preferred LLM model in the sidebar"
echo "     4. Use AI features - they connect through the proxy"
echo ""
echo "   Press Ctrl+C to stop the proxy server."
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

# Trap Ctrl+C to clean up
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    # Kill background ollama if we started it
    if [ "$OLLAMA_RUNNING" = false ] && [ -n "$OLLAMA_PID" ]; then
        kill $OLLAMA_PID 2>/dev/null || true
        echo "   Stopped Ollama server"
    fi
    echo "   Proxy server stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

node server.js
