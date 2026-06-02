"""
Cloud entry point for Render deployment.
Playwright-based Google Maps scraping is disabled (not supported on free tier).
All market research, leads DB read, and Slack features work normally.
"""
import os
from dotenv import load_dotenv
load_dotenv()

import asyncio
import pandas as pd
import urllib.parse
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import requests as _requests

import db_manager
from market_research import router as market_router

app = FastAPI(title="Antigravity Analytics API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market_router)

# ── Stub status (no background scraping in cloud) ────────────────────────────
@app.get("/status")
async def get_status():
    return {
        "scraping":  {"active": False, "progress": "Cloud mode — scraping disabled", "logs": []},
        "analyzing": {"active": False, "progress": "Cloud mode — scraping disabled", "logs": []},
    }

@app.get("/results")
async def get_results():
    try:
        return db_manager.get_all_leads()
    except Exception as e:
        return []

@app.post("/scrape")
async def trigger_scrape_disabled():
    raise HTTPException(
        status_code=503,
        detail="Google Maps scraping is disabled in cloud deployment. "
               "Run locally with Docker for full scraping functionality."
    )

@app.post("/analyze")
async def trigger_analyze_disabled():
    raise HTTPException(
        status_code=503,
        detail="Tech analysis requires Playwright and is disabled in cloud deployment."
    )

# ── Slack settings endpoints ──────────────────────────────────────────────────
class SlackSettings(BaseModel):
    webhook_url: Optional[str] = None
    bot_token:   Optional[str] = None
    channel:     Optional[str] = None

@app.get("/settings/slack")
async def get_slack_settings():
    saved = db_manager.get_all_settings()
    def mask(val):
        if not val: return ""
        return val[:6] + "••••" + val[-4:] if len(val) > 10 else "••••••••"
    return {
        "webhook_url_saved":    bool(saved.get("slack_webhook_url")),
        "webhook_url_preview":  mask(saved.get("slack_webhook_url", "")),
        "bot_token_saved":      bool(saved.get("slack_bot_token")),
        "bot_token_preview":    mask(saved.get("slack_bot_token", "")),
        "channel":              saved.get("slack_channel", ""),
    }

@app.post("/settings/slack")
async def save_slack_settings(settings: SlackSettings):
    saved_keys = []
    if settings.webhook_url and settings.webhook_url.strip():
        db_manager.set_setting("slack_webhook_url", settings.webhook_url.strip())
        saved_keys.append("webhook_url")
    if settings.bot_token and settings.bot_token.strip():
        db_manager.set_setting("slack_bot_token", settings.bot_token.strip())
        saved_keys.append("bot_token")
    if settings.channel and settings.channel.strip():
        db_manager.set_setting("slack_channel", settings.channel.strip())
        saved_keys.append("channel")
    if not saved_keys:
        raise HTTPException(status_code=400, detail="No valid settings provided")
    return {"status": "success", "message": f"Saved: {', '.join(saved_keys)}"}

@app.delete("/settings/slack")
async def clear_slack_settings():
    for key in ["slack_webhook_url", "slack_bot_token", "slack_channel"]:
        db_manager.set_setting(key, "")
    return {"status": "success", "message": "Cleared"}

@app.get("/health")
async def health():
    return {"status": "ok", "mode": "cloud"}

if __name__ == "__main__":
    import uvicorn
    db_manager.init_db()
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
