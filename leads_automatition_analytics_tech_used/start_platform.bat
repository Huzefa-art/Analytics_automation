@echo off
title Antigravity Analytics Platform
color 0A

echo.
echo  ============================================================
echo   ANTIGRAVITY ANALYTICS PLATFORM — AUTO START
echo  ============================================================
echo.

:: ── Set working directory to script location ────────────────────────────────
cd /d "%~dp0"

:: ── Step 1: Start Docker Desktop if not already running ─────────────────────
echo [1/4] Checking Docker Desktop...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo       Docker not running — starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo       Waiting for Docker engine to be ready (up to 60s)...
    :wait_docker
    ping 127.0.0.1 -n 6 > nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 goto wait_docker
    echo       Docker is ready.
) else (
    echo       Docker already running.
)

:: ── Step 2: Build latest frontend static files ───────────────────────────────
echo [2/4] Building frontend static files...
cd dashboard-app
call npm run build >nul 2>&1
cd ..
echo       Done.

:: ── Step 3: Start Docker Compose stack ───────────────────────────────────────
echo [3/4] Starting services (backend + nginx + ngrok)...
docker compose up -d --build
echo       Done.

:: ── Step 4: Wait for ngrok and show public URL ───────────────────────────────
echo [4/4] Waiting for ngrok tunnel to establish...
ping 127.0.0.1 -n 10 > nul

echo.
echo  ============================================================
echo   YOUR PUBLIC NGROK URL:
echo  ============================================================
curl -s http://localhost:4040/api/tunnels | python -c "import sys,json; d=json.load(sys.stdin); t=d.get('tunnels',[]); print('  ' + t[0]['public_url']) if t else print('  Not ready yet — visit http://localhost:4040')"
echo  ============================================================
echo.
echo  Local access:
echo    App (nginx)  : http://localhost:80
echo    Backend API  : http://localhost:8000
echo    Ngrok UI     : http://localhost:4040
echo.
echo  Commands:
echo    Stop all     : docker compose down
echo    View logs    : docker compose logs -f
echo    Restart      : docker compose restart
echo.
pause
