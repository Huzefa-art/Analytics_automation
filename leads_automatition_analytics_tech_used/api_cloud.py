"""
Cloud entry point for Render deployment.
Playwright-based Google Maps scraping is disabled (not supported on free tier).
All market research, outreach, leads DB read, and Slack features work normally.
"""
import os
import re
import json
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
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

# ── AI Outreach Campaign Endpoints ───────────────────────────────────────────

class TargetRequest(BaseModel):
    industry: Optional[str] = "all"
    require_email: Optional[bool] = False
    require_phone: Optional[bool] = False
    no_ads: Optional[bool] = False
    no_crm: Optional[bool] = False
    no_live_chat: Optional[bool] = False
    no_payments: Optional[bool] = False

class OutreachGenerateRequest(BaseModel):
    business_name: str
    website: str
    industry: str
    tech_stack: dict
    pain_point_theme: str
    pain_point_description: str
    user_offer: str

class EmailSendRequest(BaseModel):
    to_email: str
    subject: str
    body: str
    business_name: str

class SignalPlanRequest(BaseModel):
    industry: str
    pain_points: list
    force_refresh: bool = False

def _signal_plan_cache_key(industry: str) -> str:
    return f"signal_plan:{industry.lower().strip()}"

def make_pitch_prompt(business_name, website, tech_stack, pain_theme, pain_desc, user_offer):
    tech_str = ", ".join(f"{k}: {v}" for k, v in tech_stack.items() if v and v not in ("N/A", "[]"))
    if not tech_str:
        tech_str = "No specific CRM, Live Chat, or advertising tools detected."
    return f"""You are an expert cold outreach strategist. Write a personalized B2B cold email.

Prospect: {business_name} | Website: {website}
Tech Stack: {tech_str}
Pain Point: {pain_theme} — {pain_desc}
Our Offer: {user_offer}

Write a concise (under 150 words) cold email. Subject line + body. End with a low-friction CTA for a 5-minute call.
Respond ONLY with valid JSON: {{"subject": "...", "body": "..."}}"""

def make_signal_plan_prompt(industry, pain_points):
    pains_block = ""
    for i, pp in enumerate(pain_points, 1):
        pains_block += f"\n{i}. PAIN POINT: {pp.get('theme','Unknown')}\n   Description: {pp.get('description','')}\n"

    return f"""You are a senior B2B market intelligence analyst for the {industry} industry.

Pain points:
{pains_block}

For EACH pain point produce a two-sided Signal Detection Plan with:
- pain_point: theme name
- brief: 2-3 sentences — what this problem means for a {industry} business, why it happens, what they are LOSING (revenue/customers/reputation). Be specific and vivid.
- signals: list of signals

SIDE 1 (solution_gap): proof business has NO fix in place.
SIDE 2 (problem_evidence): proof the pain EXISTS for this business.

RULES: Only publicly visible signals. NO: commission rates, GMB internal fields, Indeed turnover rates, internal data.
Valid sources: website, Google Maps public card, Google Reviews, Facebook/Instagram, LinkedIn Jobs public search, Uber Eats/DoorDash public pages.
Each signal: weight integer % (all signals per pain point sum to 100).

Respond ONLY with valid JSON array, no markdown fences:
[{{"pain_point":"...","brief":"...","signals":[{{"signal":"...","side":"solution_gap","weight":25,"sources":[{{"name":"...","difficulty":"easy","how_to_find":"..."}}],"confirmed_if":"..."}}]}}]"""

@app.post("/outreach/targets")
async def get_outreach_targets(request: TargetRequest):
    try:
        return db_manager.get_leads_for_outreach(
            industry=request.industry,
            require_email=request.require_email,
            require_phone=request.require_phone,
            no_ads=request.no_ads,
            no_crm=request.no_crm,
            no_live_chat=request.no_live_chat,
            no_payments=request.no_payments
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/outreach/generate")
async def generate_outreach_pitch(request: OutreachGenerateRequest):
    from market_research import nvidia_chat
    prompt = make_pitch_prompt(
        request.business_name, request.website, request.tech_stack,
        request.pain_point_theme, request.pain_point_description, request.user_offer
    )
    response = nvidia_chat(prompt, max_tokens=1000)
    try:
        clean = re.sub(r'^```(?:json)?\s*|\s*```$', '', response.strip()).strip()
        try:
            parsed = json.loads(clean)
            if "subject" in parsed and "body" in parsed:
                return parsed
        except json.JSONDecodeError:
            pass
        m = re.search(r'\{[\s\S]*\}', clean)
        if m:
            parsed = json.loads(m.group())
            if "subject" in parsed and "body" in parsed:
                return parsed
    except Exception:
        pass
    return {"subject": f"Question about {request.business_name}", "body": response}

@app.post("/outreach/send")
async def send_outreach_email(request: EmailSendRequest):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_pass = os.getenv("SMTP_PASS", "").strip()
    from_email = os.getenv("FROM_EMAIL", smtp_user).strip()
    if not smtp_host or not smtp_user or not smtp_pass:
        return {"status": "mock", "message": f"SMTP not configured. Email simulated to {request.to_email}."}
    try:
        msg = MIMEMultipart()
        msg['From'] = from_email
        msg['To'] = request.to_email
        msg['Subject'] = request.subject
        msg.attach(MIMEText(request.body, 'plain'))
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(from_email, request.to_email, msg.as_string())
        server.quit()
        return {"status": "success", "message": f"Email sent to {request.to_email}!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/outreach/signal-plan")
async def generate_signal_plan(request: SignalPlanRequest):
    from market_research import nvidia_chat
    if not request.pain_points:
        raise HTTPException(status_code=400, detail="No pain points provided")

    cache_problem = _signal_plan_cache_key(request.industry)

    # Check Supabase cache first
    if not request.force_refresh:
        cached = db_manager.load_market_result("signal_plan", request.industry, cache_problem)
        if cached:
            return cached.get("plan", cached) if isinstance(cached, dict) else cached

    # Batch 3 pain points at a time to stay within token limits
    all_results = []
    for i in range(0, len(request.pain_points), 3):
        batch = request.pain_points[i:i+3]
        prompt = make_signal_plan_prompt(request.industry, batch)
        response = nvidia_chat(prompt, max_tokens=4000)
        batch_result = None
        try:
            clean = re.sub(r'^```(?:json)?\s*|\s*```$', '', response.strip()).strip()
            try:
                parsed = json.loads(clean)
                if isinstance(parsed, list):
                    batch_result = parsed
            except json.JSONDecodeError:
                pass
            if batch_result is None:
                m = re.search(r'\[[\s\S]*\]', clean)
                if m:
                    try:
                        parsed = json.loads(m.group())
                        if isinstance(parsed, list):
                            batch_result = parsed
                    except json.JSONDecodeError:
                        pass
        except Exception:
            pass
        if not batch_result:
            batch_result = [{"pain_point": pp.get('theme', 'Unknown'), "brief": pp.get('description', ''), "signals": []} for pp in batch]
        all_results.extend(batch_result)

    db_manager.save_market_result("signal_plan", request.industry, cache_problem, {"plan": all_results})
    return all_results

@app.get("/outreach/signal-plan/{industry}")
async def get_cached_signal_plan(industry: str):
    cache_problem = _signal_plan_cache_key(industry)
    cached = db_manager.load_market_result("signal_plan", industry, cache_problem)
    if not cached:
        raise HTTPException(status_code=404, detail="No saved signal plan for this industry")
    return cached.get("plan", [])

@app.get("/health")
async def health():
    return {"status": "ok", "mode": "cloud"}

if __name__ == "__main__":
    import uvicorn
    db_manager.init_db()
    port = int(os.getenv("PORT", 8000))
    print(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
