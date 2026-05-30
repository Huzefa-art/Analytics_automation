@echo off
title Leads Automation and Tech Detector Platform
echo Starting Python Backend API server...
:: Start the FastAPI backend in a separate window
start "FastAPI Backend" cmd.exe /c "venv\Scripts\python api.py"

:: Delay for 3 seconds safely
ping 127.0.0.1 -n 4 > nul

echo Starting React Frontend Dev Server...
:: Start the React frontend Vite development server in a separate window
cd dashboard-app
start "React Frontend" cmd.exe /c "npm run dev"

:: Delay for 3 seconds safely
ping 127.0.0.1 -n 4 > nul

echo Exposing React Frontend to the Internet via localhost.run...
echo Copy the secure public HTTPS link generated below and open it!
ssh -o StrictHostKeyChecking=no -R 80:127.0.0.1:5173 localhost.run
pause
