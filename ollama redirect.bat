@echo off
title Ollama Local Port Proxy Setup
color 0A

echo ================================
echo      Ollama Proxy Setup
echo ================================
echo.

REM Ask user for network IP
set /p TARGET_IP=Enter Target Network IP (example 172.16.2.12): 

REM Ask user for target port
set /p TARGET_PORT=Enter Target Port (example 11964): 

echo.
echo Removing old proxy if exists...
netsh interface portproxy delete v4tov4 listenport=11434 listenaddress=127.0.0.1 >nul 2>&1

echo Creating new port proxy...
netsh interface portproxy add v4tov4 ^
listenaddress=127.0.0.1 listenport=11434 ^
connectaddress=%TARGET_IP% connectport=%TARGET_PORT%

echo Adding firewall rule...
netsh advfirewall firewall delete rule name="Ollama Proxy 11434" >nul 2>&1
netsh advfirewall firewall add rule ^
name="Ollama Proxy 11434" ^
dir=in action=allow protocol=TCP localport=11434

echo.
echo =========================================
echo Proxy Created Successfully!
echo localhost:11434  -->  %TARGET_IP%:%TARGET_PORT%
echo =========================================
echo.
pause