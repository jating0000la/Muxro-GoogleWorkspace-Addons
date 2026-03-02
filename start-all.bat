@echo off
setlocal enabledelayedexpansion
title Muxro AI - Auto Setup
color 0A
echo ============================================================
echo   Muxro AI - Automatic Setup
echo ============================================================
echo.

:: ─── Save the script directory ───────────────────────────────────
set "BASE_DIR=%~dp0"
set "CONNECTOR_DIR=%BASE_DIR%ollama-localhost-connector"

:: ─── 1. Check Node.js ────────────────────────────────────────────
echo [1/6] Checking Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0C
    echo    ERROR: Node.js is not installed or not in PATH.
    echo    Download from https://nodejs.org/ and install, then re-run.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo    Found Node.js %%v
echo.

:: ─── 2. Check Ollama ────────────────────────────────────────────
echo [2/6] Checking Ollama...
where ollama >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    Ollama not found. Installing Ollama...
    echo    Downloading installer...
    powershell -Command "& { irm https://ollama.com/install.ps1 | iex }"
    if %ERRORLEVEL% neq 0 (
        color 0C
        echo    ERROR: Ollama installation failed.
        pause
        exit /b 1
    )
    echo    Ollama installed successfully.
) else (
    for /f "tokens=*" %%v in ('ollama --version 2^>nul') do echo    Found %%v
)
echo.

:: ─── 3. Remove any port proxy conflicts on 11434 ────────────────
echo [3/6] Checking for port proxy conflicts on port 11434...
powershell -Command "& { $proxy = netsh interface portproxy show v4tov4 2>$null; if ($proxy -match '11434') { Write-Host '   Removing conflicting port proxy on 11434...'; netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=11434 2>$null; Write-Host '   Port proxy removed.' } else { Write-Host '   No port proxy conflict found.' } }"
echo.

:: ─── 4. Start Ollama serve ───────────────────────────────────────
echo [4/6] Starting Ollama server...

:: Check if Ollama is already serving
powershell -Command "& { try { $r = Invoke-WebRequest -Uri http://localhost:11434/api/tags -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop; Write-Host 'RUNNING' } catch { Write-Host 'STOPPED' } }" > "%TEMP%\ollama_status.txt" 2>&1
set /p OLLAMA_STATUS=<"%TEMP%\ollama_status.txt"
del "%TEMP%\ollama_status.txt" 2>nul

if "%OLLAMA_STATUS%"=="RUNNING" (
    echo    Ollama is already running on port 11434.
) else (
    echo    Starting Ollama in background...
    :: Kill any zombie processes first
    taskkill /f /im ollama.exe >nul 2>&1
    taskkill /f /im ollama_runners.exe >nul 2>&1
    timeout /t 2 /nobreak >nul

    start "" /min cmd /c "ollama serve"
    echo    Waiting for Ollama to be ready...

    :: Wait up to 30 seconds for Ollama to start
    set RETRIES=0
    :wait_ollama
    if !RETRIES! geq 15 (
        color 0C
        echo    ERROR: Ollama failed to start within 30 seconds.
        echo    Try running "ollama serve" manually in another terminal.
        pause
        exit /b 1
    )
    timeout /t 2 /nobreak >nul
    powershell -Command "& { try { Invoke-WebRequest -Uri http://localhost:11434/api/tags -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop | Out-Null; Write-Host 'OK' } catch { Write-Host 'WAIT' } }" > "%TEMP%\ollama_check.txt" 2>&1
    set /p OLLAMA_CHECK=<"%TEMP%\ollama_check.txt"
    del "%TEMP%\ollama_check.txt" 2>nul
    if not "!OLLAMA_CHECK!"=="OK" (
        set /a RETRIES+=1
        echo    Retry !RETRIES!/15...
        goto wait_ollama
    )
    echo    Ollama is ready!
)
echo.

:: ─── 5. Pull required models ────────────────────────────────────
echo [5/6] Pulling AI models (skip if already downloaded)...
echo.

echo    Pulling gemma3:1b (default AI model)...
ollama pull gemma3:1b
echo.



echo    Installed models:
ollama list
echo.

:: ─── 6. Install npm deps & start proxy server ───────────────────
echo [6/6] Starting the proxy connector server...

:: Kill any existing process on port 9100 first
powershell -Command "& { $p = netstat -ano 2>$null | Select-String ':9100\s.*LISTENING'; if ($p) { $pid = ($p -split '\s+')[-1]; taskkill /f /pid $pid 2>$null; Write-Host '   Freed port 9100.' } }" 2>nul

if not exist "%CONNECTOR_DIR%\node_modules" (
    echo    Installing npm dependencies...
    cd /d "%CONNECTOR_DIR%"
    call npm install
    if %ERRORLEVEL% neq 0 (
        color 0C
        echo    ERROR: npm install failed. Check Node.js installation.
        pause
        exit /b 1
    )
    echo.
)

cd /d "%CONNECTOR_DIR%"
echo.
echo ============================================================
echo   ALL SYSTEMS GO!
echo ============================================================
echo.
echo   Ollama       : http://localhost:11434
echo   Proxy Server : http://localhost:9100
echo   Models       : gemma3:1b (general)
echo.
echo   Next steps:
echo     1. Copy the Google Apps Script files into your
echo        Sheets / Docs / Slides script editor
echo     2. Open the addon sidebar from the menu
echo     3. Select your preferred LLM model in the sidebar
echo     4. Use AI features - they connect through the proxy

echo   Press Ctrl+C to stop the proxy server.
echo ============================================================
echo.

node server.js
set NODE_EXIT=%ERRORLEVEL%
echo.
echo ============================================================
if %NODE_EXIT% neq 0 (
    color 0C
    echo   ERROR: Proxy server stopped unexpectedly! Exit code: %NODE_EXIT%
    echo   Check that Node.js is working and port 9100 is free.
) else (
    echo   Proxy server stopped.
)
echo ============================================================
pause
