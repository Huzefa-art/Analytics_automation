# Antigravity Analytics Platform

Full-stack market research and leads analytics platform.

- **Frontend**: React + Vite → deployed on **Vercel** (free)
- **Backend**: FastAPI + Python → deployed on **Render** (free)
- **Local dev**: Docker + ngrok (full feature set including Google Maps scraping)

---

## Architecture

```
Browser
  │
  ├─ Vercel (React SPA)
  │    └─ /api/* → rewrites to Render backend
  │
  └─ Render (FastAPI)
       └─ /market/* endpoints (market research AI)
       └─ /results, /settings/* (leads DB)
       └─ Persistent disk: leads.db
```

> **Note**: Google Maps scraping (Playwright) is disabled in cloud deployment — Render free tier has 512MB RAM. Run locally with Docker for full scraping. All market research features work fully in cloud.

---

## Cloud Deployment (one-time setup)

### Prerequisites

```bash
npm install -g vercel
pip install render-cli   # optional — Render dashboard is easier
git init                 # if not already a git repo
```

### Step 1 — Push to GitHub

```bash
cd "C:\Users\Huzefa\Desktop\automate\Analytics_automation\leads_automatition_analytics_tech_used"

git init
git add .
git commit -m "initial commit"

# Create a new repo on github.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/antigravity-analytics.git
git branch -M main
git push -u origin main
```

### Step 2 — Deploy Backend to Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo
3. Render auto-detects `render.yaml` — click **Apply**
4. Set these env vars in **Render dashboard → Environment**:

| Variable | Value | Where to get it |
|---|---|---|
| `nvidia_api_key` | `nvapi-...` | [build.nvidia.com](https://build.nvidia.com) |
| `serp_api` | `328f149c...` | [serpapi.com/dashboard](https://serpapi.com/dashboard) |
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/...` | Your Slack app |
| `SLACK_BOT_TOKEN` | `xoxb-...` | Your Slack app |
| `SLACK_CHANNEL` | `ai-analytics` | Your channel name |

5. Click **Save Changes** → Render auto-deploys
6. Copy your backend URL: `https://antigravity-analytics-api.onrender.com`

### Step 3 — Update vercel.json with your Render URL

Edit `dashboard-app/vercel.json` — replace the destination URL:

```json
"destination": "https://YOUR-ACTUAL-APP-NAME.onrender.com/:path*"
```

Then commit and push:

```bash
git add dashboard-app/vercel.json
git commit -m "set render backend url"
git push
```

### Step 4 — Deploy Frontend to Vercel

```bash
cd dashboard-app
vercel

# Answer the prompts:
# Set up and deploy? → Y
# Which scope? → your account
# Link to existing project? → N
# Project name → antigravity-analytics
# In which directory is your code? → .  (current dir)
# Want to override settings? → N

vercel --prod
```

That's it. Vercel gives you a URL like `https://antigravity-analytics.vercel.app`.

**Auto-deploy**: every `git push` to `main` triggers both Render and Vercel rebuilds automatically.

---

## Local Development (full features)

Requires Docker Desktop installed.

```bash
cd "C:\Users\Huzefa\Desktop\automate\Analytics_automation\leads_automatition_analytics_tech_used"

# Copy env template
copy .env.example .env
# Fill in your API keys in .env

# Start everything (backend + nginx + ngrok)
start_platform.bat
```

Or run without Docker:

```bash
# Terminal 1 — Backend
venv\Scripts\python api.py

# Terminal 2 — Frontend
cd dashboard-app
npm run dev

# Frontend: http://127.0.0.1:5173
# Backend:  http://localhost:8000
```

---

## Environment Variables Reference

### Backend (set in Render dashboard or local `.env`)

| Variable | Required | Description |
|---|---|---|
| `nvidia_api_key` | ✅ Yes | NVIDIA AI for all analysis and scoring |
| `serp_api` | ✅ Yes | SerpAPI for Google search scraping |
| `SLACK_WEBHOOK_URL` | Optional | Slack webhook for sending leads |
| `SLACK_BOT_TOKEN` | Optional | Slack bot token (alternative to webhook) |
| `SLACK_CHANNEL` | Optional | Default Slack channel name |
| `DB_PATH` | Auto-set | SQLite path — Render sets `/app/data/leads.db` |
| `NGROK_AUTHTOKEN` | Local only | ngrok tunnel (not needed on Render) |

### Frontend (set in Vercel dashboard or local `dashboard-app/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Local only | Not needed — Vercel rewrites handle routing |

---

## Project Structure

```
/
├── api.py                  # Full local FastAPI (with Playwright scraping)
├── api_cloud.py            # Cloud FastAPI (Playwright disabled)
├── market_research.py      # All market research endpoints
├── db_manager.py           # SQLite database layer
├── maps_leads_scraper.py   # Google Maps scraping (local only)
├── tech_detector.py        # Tech stack detection (local only)
├── requirements.txt        # Full local deps (includes Playwright)
├── requirements-deploy.txt # Cloud deps (no Playwright)
├── render.yaml             # Render deployment config
├── docker-compose.yml      # Local Docker stack
├── .env.example            # Backend env template
│
└── dashboard-app/
    ├── src/
    │   ├── App.jsx             # Main app with sidebar
    │   ├── MarketResearch.jsx  # Market research platform
    │   ├── MarketResearchTabs.jsx  # Deep Reddit, Competitor, Pricing, Deep Analysis tabs
    │   └── MarketComparison.jsx    # Side-by-side market comparison
    ├── vercel.json         # Vercel deployment config
    ├── .env.example        # Frontend env template
    └── package.json
```

---

## After Deploying — First-Time Setup

1. Open your Vercel URL
2. Click **Market Research** in sidebar
3. Type an industry (e.g. `restaurants`) → **Analyze Market**
4. Work through the tabs in order for richest data:
   - Pain Points → Deep Reddit → Competitor Reviews → Pricing Signals
   - Then run **Validation Score** → **Generate Investment Insights**
5. For comparison: run 2+ industries, then use **Compare Markets** tab

---

## Updating After Code Changes

```bash
# Make your changes, then:
git add .
git commit -m "describe your change"
git push origin main

# Render and Vercel auto-deploy within ~2 minutes
```

To rebuild Docker locally after changes:

```bash
docker compose up -d --build
```
