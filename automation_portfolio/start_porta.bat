@echo off
title Porta Dev Server and Internet Tunnel Startup
echo Starting local web and proxy development servers...
cd "C:\Users\Huzefa\Desktop\automate\Analytics_automation\automation_portfolio\porta"

:: Clear Vite cache to ensure fresh allowedHosts settings are loaded
if exist packages\web\node_modules\.vite (
    rd /s /q packages\web\node_modules\.vite
)

:: Start the main development server in a separate window
start "Porta Dev Server" cmd.exe /c "pnpm dev"

:: Give it 5 seconds to boot up and listen
timeout /t 5 /nobreak > nul

echo Starting secure public internet tunnel...
echo Open the generated link below on your mobile device!
ssh -o StrictHostKeyChecking=no -R 80:127.0.0.1:5173 localhost.run
pause
