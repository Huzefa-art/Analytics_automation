import os
from dotenv import load_dotenv
load_dotenv()
import asyncio
import pandas as pd
import urllib.parse
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import subprocess
import json
import requests

# Import db manager
import db_manager
from maps_leads_scraper import scrape_google_maps
from market_research import router as market_router

app = FastAPI()

# Enable CORS for frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market_router)

# Global status tracker
status = {
    "scraping": {"active": False, "progress": "", "last_run": None, "logs": []},
    "analyzing": {"active": False, "progress": "", "last_run": None, "logs": []},
}

class ScrapeRequest(BaseModel):
    url: str  # Can be a direct Google Maps URL or search keywords
    max_results: Optional[int] = 50

class AnalysisRequest(BaseModel):
    file_path: Optional[str] = "urls.txt"
    include_tech: Optional[bool] = True
    include_ads: Optional[bool] = True
    max_leads: Optional[int] = 10

@app.get("/status")
async def get_status():
    return status

@app.get("/results")
async def get_results():
    try:
        return db_manager.get_all_leads()
    except Exception as e:
        print(f"Error in /results endpoint: {e}")
        return []

async def run_scraping(target_input: str, max_results: int):
    status["scraping"]["active"] = True
    status["scraping"]["progress"] = "Starting scraper..."
    status["scraping"]["logs"] = ["Starting scraper..."]
    
    def log_callback(msg):
        status["scraping"]["logs"].append(msg)
        status["scraping"]["progress"] = msg
        
    try:
        # Determine if target_input is keywords or a URL
        is_url = target_input.startswith("http://") or target_input.startswith("https://") or "google.com/maps" in target_input
        
        if is_url:
            scrape_url = target_input
            log_callback(f"Starting scrape from direct Google Maps URL: {scrape_url}")
        else:
            # Construct Google Maps search URL from search keywords
            quoted_keywords = urllib.parse.quote_plus(target_input)
            scrape_url = f"https://www.google.com/maps/search/{quoted_keywords}"
            log_callback(f"Detected keyword search: '{target_input}'. Translated to Maps URL: {scrape_url}")
            
        results = await scrape_google_maps(scrape_url, max_results, log_callback=log_callback)
        
        # Save each scraped result to SQLite database
        log_callback(f"Saving {len(results)} scraped leads to SQLite database...")
        saved_count = 0
        for r in results:
            if db_manager.insert_lead(r):
                saved_count += 1
                
        status["scraping"]["progress"] = f"Finished. Scraped {len(results)} leads, saved {saved_count} to database."
        status["scraping"]["logs"].append(f"Finished. Scraped {len(results)} leads, saved {saved_count} to database.")
    except Exception as e:
        status["scraping"]["progress"] = f"Error: {str(e)}"
        status["scraping"]["logs"].append(f"Error: {str(e)}")
    finally:
        status["scraping"]["active"] = False
        status["scraping"]["last_run"] = pd.Timestamp.now().isoformat()

@app.post("/scrape")
async def trigger_scrape(request: ScrapeRequest, background_tasks: BackgroundTasks):
    if status["scraping"]["active"]:
        raise HTTPException(status_code=400, detail="Scraping already in progress")
    
    background_tasks.add_task(run_scraping, request.url, request.max_results)
    return {"message": "Scraping started in background"}

@app.post("/analyze")
async def trigger_analysis(request: AnalysisRequest, background_tasks: BackgroundTasks):
    if status["analyzing"]["active"]:
        raise HTTPException(status_code=400, detail="Analysis already in progress")
        
    try:
        # Retrieve pending leads to analyze from SQLite
        urls_to_analyze = db_manager.get_pending_leads(request.max_leads)
        
        if not urls_to_analyze:
            raise HTTPException(status_code=400, detail="No pending leads found to analyze!")
            
        with open("urls_to_analyze.txt", "w") as f:
            for url in urls_to_analyze:
                f.write(f"{url}\n")
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error preparing analysis target: {e}")
    
    background_tasks.add_task(run_analysis, "urls_to_analyze.txt", request.include_tech, request.include_ads)
    return {"message": f"Analysis of {len(urls_to_analyze)} pending leads started in background"}

async def run_analysis(urls_file: str, include_tech: bool, include_ads: bool):
    status["analyzing"]["active"] = True
    status["analyzing"]["progress"] = "Starting tech analysis..."
    status["analyzing"]["logs"] = ["Starting tech analysis..."]
    try:
        import sys
        cmd = [sys.executable, "tech_detector.py", urls_file]
        if not include_tech:
            cmd.append("--no-tech")
        if not include_ads:
            cmd.append("--no-ads")
            
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            output = line.decode('utf-8', errors='replace').strip()
            if output:
                status["analyzing"]["progress"] = output
                status["analyzing"]["logs"].append(output)
        
        await process.wait()
        status["analyzing"]["progress"] = "Analysis finished."
        status["analyzing"]["logs"].append("Analysis finished.")
    except Exception as e:
        status["analyzing"]["progress"] = f"Error: {str(e)}"
        status["analyzing"]["logs"].append(f"Error: {str(e)}")
    finally:
        status["analyzing"]["active"] = False
        status["analyzing"]["last_run"] = pd.Timestamp.now().isoformat()

class SlackRequest(BaseModel):
    webhook_url: Optional[str] = None
    bot_token: Optional[str] = None
    channel: Optional[str] = None
    leads: List[dict]

class SlackSettings(BaseModel):
    webhook_url: Optional[str] = None
    bot_token: Optional[str] = None
    channel: Optional[str] = None

@app.get("/settings/slack")
async def get_slack_settings():
    """Returns saved Slack credentials from the database (masked for security)."""
    saved = db_manager.get_all_settings()
    webhook = saved.get("slack_webhook_url", "")
    token = saved.get("slack_bot_token", "")
    channel = saved.get("slack_channel", "")
    
    # Mask sensitive values — only reveal if they exist
    def mask(val):
        if not val:
            return ""
        if len(val) <= 8:
            return "••••••••"
        return val[:6] + "••••••••" + val[-4:]
    
    return {
        "webhook_url_saved": bool(webhook),
        "webhook_url_preview": mask(webhook),
        "bot_token_saved": bool(token),
        "bot_token_preview": mask(token),
        "channel": channel  # channel name is not sensitive
    }

@app.post("/settings/slack")
async def save_slack_settings(settings: SlackSettings):
    """Saves Slack credentials to the database for persistent use."""
    saved_keys = []
    if settings.webhook_url is not None and settings.webhook_url.strip():
        db_manager.set_setting("slack_webhook_url", settings.webhook_url.strip())
        saved_keys.append("webhook_url")
    if settings.bot_token is not None and settings.bot_token.strip():
        db_manager.set_setting("slack_bot_token", settings.bot_token.strip())
        saved_keys.append("bot_token")
    if settings.channel is not None and settings.channel.strip():
        db_manager.set_setting("slack_channel", settings.channel.strip())
        saved_keys.append("channel")
    
    if not saved_keys:
        raise HTTPException(status_code=400, detail="No valid settings provided to save")
    
    return {"status": "success", "message": f"Saved: {', '.join(saved_keys)}", "saved_keys": saved_keys}

@app.delete("/settings/slack")
async def clear_slack_settings():
    """Clears all saved Slack credentials from the database."""
    for key in ["slack_webhook_url", "slack_bot_token", "slack_channel"]:
        db_manager.set_setting(key, "")
    return {"status": "success", "message": "Slack credentials cleared from database"}

def format_leads_csv_string(leads: List[dict]) -> str:
    headers = [
        "Business Name", "Industry", "Analysis Status", "Website", "City", "Country", "Address", "Phone", "Facebook Page", 
        "Email", "Ads Active", "Ad Count", "Oldest Ad Date", "CMS", "Analytics", "CRM / Marketing Automation", 
        "Live Chat / Support", "Payments"
    ]
    lines = [",".join(headers)]
    for lead in leads:
        row = []
        for h in headers:
            # Map headers back to dictionary keys if they mismatch
            key = db_manager.CSV_TO_DB_MAP.get(h, h.lower().replace(" ", "_"))
            val = lead.get(h, lead.get(key, ""))
            if val is None or val == "N/A":
                val = ""
            row.append('"' + str(val).replace('"', '""') + '"')
        lines.append(",".join(row))
    return "\n".join(lines)

@app.post("/slack/send")
async def send_leads_to_slack(request: SlackRequest):
    if not request.leads:
        raise HTTPException(status_code=400, detail="Leads list is empty")
    
    # Extract values with priority: UI input → DB saved → environment variables
    saved = db_manager.get_all_settings()
    webhook_url = (request.webhook_url or "").strip() or saved.get("slack_webhook_url", "") or os.getenv("SLACK_WEBHOOK_URL")
    bot_token = (request.bot_token or "").strip() or saved.get("slack_bot_token", "") or os.getenv("SLACK_BOT_TOKEN")
    channel = (request.channel or "").strip() or saved.get("slack_channel", "") or os.getenv("SLACK_CHANNEL") or "#general"

    # Filter out empty placeholder strings
    if webhook_url and ("YOUR/WEBHOOK" in webhook_url or webhook_url.strip() == ""):
        webhook_url = None
    if bot_token and ("your-bot-user" in bot_token or bot_token.strip() == ""):
        bot_token = None

    # 1. Use Webhook URL if provided
    if webhook_url:
        try:
            # Generate summary metrics
            total = len(request.leads)
            has_email = sum(1 for l in request.leads if l.get("Email") and l.get("Email") != "N/A" and l.get("Email") != "")
            has_phone = sum(1 for l in request.leads if l.get("Phone") and l.get("Phone") != "N/A" and l.get("Phone") != "")
            ads_active = sum(1 for l in request.leads if str(l.get("Ads Active")).lower() == "yes" or str(l.get("ads_active")).lower() == "yes")
            
            # Count technology stacks
            cms_count = {}
            for l in request.leads:
                cms = l.get("CMS") or l.get("cms")
                if cms and cms != "N/A":
                    cms_count[cms] = cms_count.get(cms, 0) + 1
            top_cms = ", ".join(f"{k} ({v})" for k, v in sorted(cms_count.items(), key=lambda item: item[1], reverse=True)[:3])
            
            blocks = [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": "📊 Leads Automation Summary Report",
                        "emoji": True
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Total Leads:* {total}"},
                        {"type": "mrkdwn", "text": f"*With Email:* {has_email}"},
                        {"type": "mrkdwn", "text": f"*With Phone:* {has_phone}"},
                        {"type": "mrkdwn", "text": f"*With Active Ads:* {ads_active}"}
                    ]
                }
            ]
            
            if top_cms:
                blocks.append({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Top CMS Technologies:* {top_cms}"
                    }
                })

            # Add leads preview snippet
            preview_lines = ["*Preview of Leads (Top 10):*"]
            for i, l in enumerate(request.leads[:10]):
                name = l.get("Business Name") or l.get("business_name", "Unknown")
                email = l.get("Email") or l.get("email")
                phone = l.get("Phone") or l.get("phone")
                website = l.get("Website") or l.get("website", "No Website")
                
                details = []
                if email and email != "N/A": details.append(f"📧 {email}")
                if phone and phone != "N/A": details.append(f"📞 {phone}")
                details_str = f" | {', '.join(details)}" if details else ""
                
                preview_lines.append(f"{i+1}. *{name}* ({website}){details_str}")
            
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "\n".join(preview_lines)
                }
            })

            r = requests.post(webhook_url, json={"blocks": blocks})
            if r.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Slack webhook error: {r.text}")
            return {"status": "success", "message": "Summary report posted to Slack Webhook successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to post Webhook: {str(e)}")

    # 2. Use Bot Token if provided (file upload format)
    elif bot_token:
        # Validate token type — must be xoxb- (bot token)
        # xapp- is an app-level token (Socket Mode only) and will always fail file uploads
        if bot_token.startswith("xapp-"):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid token type: your token starts with 'xapp-' which is an App-Level Token. "
                    "File uploads require a Bot Token (starts with 'xoxb-'). "
                    "Go to api.slack.com/apps → your app → OAuth & Permissions → Bot User OAuth Token."
                )
            )

        # Resolve channel ID if a name like '#ai-analytics' or 'ai-analytics' was given.
        # Slack's new upload API requires a channel ID (e.g. C0123ABC), not a name.
        headers_auth = {"Authorization": f"Bearer {bot_token}"}

        # Strip leading '#' for the lookup
        channel_name = channel.lstrip("#")

        # If it already looks like a channel ID (starts with C and is uppercase alphanumeric), use it directly
        if channel_name.startswith("C") and channel_name.isupper() or (len(channel_name) > 6 and channel_name[0] == "C" and channel_name[1:].isalnum()):
            channel_id = channel_name
        else:
            # Look up channel ID by name via conversations.list
            channel_id = None
            cursor_val = None
            while True:
                params = {"limit": 200, "exclude_archived": "true", "types": "public_channel,private_channel"}
                if cursor_val:
                    params["cursor"] = cursor_val
                cl_resp = requests.get("https://slack.com/api/conversations.list", headers=headers_auth, params=params)
                cl_json = cl_resp.json()
                if not cl_json.get("ok"):
                    raise HTTPException(status_code=400, detail=f"Could not list Slack channels: {cl_json.get('error')}. Make sure the bot has channels:read scope.")
                for ch in cl_json.get("channels", []):
                    if ch.get("name") == channel_name:
                        channel_id = ch["id"]
                        break
                if channel_id:
                    break
                next_cursor = cl_json.get("response_metadata", {}).get("next_cursor", "")
                if not next_cursor:
                    break
                cursor_val = next_cursor

            if not channel_id:
                raise HTTPException(status_code=400, detail=f"Channel '#{channel_name}' not found. Make sure the bot is invited to the channel and has channels:read scope.")

        csv_data = format_leads_csv_string(request.leads)
        csv_bytes = csv_data.encode("utf-8")
        filename = "leads_report.csv"

        try:
            # Step 1: Get an upload URL from Slack
            url_resp = requests.post(
                "https://slack.com/api/files.getUploadURLExternal",
                headers=headers_auth,
                data={"filename": filename, "length": len(csv_bytes)}
            )
            url_json = url_resp.json()
            if not url_json.get("ok"):
                raise HTTPException(status_code=400, detail=f"Could not get Slack upload URL: {url_json.get('error')}")

            upload_url = url_json["upload_url"]
            file_id = url_json["file_id"]

            # Step 2: Upload the file content to the pre-signed URL
            upload_resp = requests.post(
                upload_url,
                data=csv_bytes,
                headers={"Content-Type": "text/csv"}
            )
            if upload_resp.status_code not in (200, 201):
                raise HTTPException(status_code=400, detail=f"File upload to Slack pre-signed URL failed: {upload_resp.status_code}")

            # Step 3: Complete the upload and share to the channel
            complete_resp = requests.post(
                "https://slack.com/api/files.completeUploadExternal",
                headers=headers_auth,
                json={
                    "files": [{"id": file_id, "title": f"Leads Report — {len(request.leads)} leads"}],
                    "channel_id": channel_id,
                    "initial_comment": f"🚀 Here is the leads database report containing {len(request.leads)} total leads!"
                }
            )
            complete_json = complete_resp.json()
            if not complete_json.get("ok"):
                raise HTTPException(status_code=400, detail=f"Slack completeUpload failed: {complete_json.get('error')}")

            return {"status": "success", "message": f"CSV file report uploaded to Slack channel #{channel_name} successfully"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload file to Slack: {str(e)}")

    else:
        raise HTTPException(status_code=400, detail="Please provide either a Slack Webhook URL or Bot Token")

# ─── AI Outreach Campaign Endpoints ────────────────────────────────────────────

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

def make_pitch_prompt(business_name, website, tech_stack, pain_theme, pain_desc, user_offer):
    tech_str = ", ".join(f"{k}: {v}" for k, v in tech_stack.items() if v and v != "N/A" and v != "[]")
    if not tech_str:
        tech_str = "No specific CRM, Live Chat, or advertising tools detected."
        
    prompt = f"""You are an expert cold outreach strategist. Your goal is to write a highly personalized, natural, and low-friction B2B cold email to a prospective client.

Prospect details:
- Business Name: {business_name}
- Website: {website}
- Industry: {business_name}'s category
- Detected Tech Stack: {tech_str}

Selected Industry Pain Point:
- Theme: {pain_theme}
- Description: {pain_desc}

Our Offer / What We Do:
{user_offer}

Instructions:
1. Write a compelling, conversational subject line that does not sound like spam.
2. The opening should refer directly to their website or specific tech gaps (e.g. if they don't use Meta Ads or have no CRM, or use WordPress but have no online booking system).
3. Connect their tech gap with the selected industry pain point (e.g., "We've noticed many business owners in your space are struggling with [pain point]...").
4. Keep the email concise (under 150 words), professional, and conversational (use a warm, casual tone, avoiding overly salesy jargon).
5. End with a low-friction Call to Action (CTA) asking for a quick 5-minute call.
6. Do NOT include any placeholder text (like [Your Name] or [Your Company]). Use generic sign-offs or standard endings.

Respond ONLY with a valid JSON object of this format (do not wrap it in ```json blocks):
{{
  "subject": "Email Subject Line",
  "body": "Email Body Text"
}}"""
    return prompt

@app.post("/outreach/targets")
async def get_outreach_targets(request: TargetRequest):
    try:
        leads = db_manager.get_leads_for_outreach(
            industry=request.industry,
            require_email=request.require_email,
            require_phone=request.require_phone,
            no_ads=request.no_ads,
            no_crm=request.no_crm,
            no_live_chat=request.no_live_chat,
            no_payments=request.no_payments
        )
        return leads
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/outreach/generate")
async def generate_outreach_pitch(request: OutreachGenerateRequest):
    from market_research import nvidia_chat
    prompt = make_pitch_prompt(
        business_name=request.business_name,
        website=request.website,
        tech_stack=request.tech_stack,
        pain_theme=request.pain_point_theme,
        pain_desc=request.pain_point_description,
        user_offer=request.user_offer
    )
    
    response = nvidia_chat(prompt, max_tokens=1000)
    
    import re
    # Robust JSON extraction: find the first { ... } block anywhere in the response
    try:
        # 1. Strip markdown code fences if present
        clean_resp = response.strip()
        clean_resp = re.sub(r'^```(?:json)?\s*', '', clean_resp)
        clean_resp = re.sub(r'\s*```$', '', clean_resp)
        clean_resp = clean_resp.strip()
        
        # 2. Try direct parse first
        try:
            parsed = json.loads(clean_resp)
            if "subject" in parsed and "body" in parsed:
                return parsed
        except json.JSONDecodeError:
            pass
        
        # 3. Extract JSON object from surrounding prose using regex
        match = re.search(r'\{[\s\S]*\}', clean_resp)
        if match:
            parsed = json.loads(match.group())
            if "subject" in parsed and "body" in parsed:
                return parsed
        
        # 4. Fallback: treat the whole response as the email body
        subject = f"Question about {request.business_name}'s web systems"
        return {"subject": subject, "body": clean_resp}
    except Exception:
        subject = f"Question about {request.business_name}'s web systems"
        return {"subject": subject, "body": response}

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
        return {
            "status": "mock",
            "message": f"SMTP not configured in .env. Email simulated successfully to {request.to_email}."
        }
        
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
        return {
            "status": "success",
            "message": f"Outreach email successfully sent to {request.to_email}!"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email via SMTP: {str(e)}")

# ─── Signal Detection Plan Endpoint ────────────────────────────────────────────

class SignalPlanRequest(BaseModel):
    industry: str
    pain_points: list
    force_refresh: bool = False
    campaign_key: str = ""   # pain tab cache_key — ties signal plan to specific campaign

def _signal_plan_cache_key(industry: str, pain_points: list = None, campaign_key: str = "") -> str:
    """One signal plan per campaign (campaign_key), not per industry globally."""
    if campaign_key:
        return f"signal_plan:{industry.lower().strip()}:{campaign_key}"
    return f"signal_plan:{industry.lower().strip()}"
    campaign_key: str = ""  # MD5 cache_key of the pain tab entry for precise keying

def _signal_plan_cache_key(industry: str, pain_points: list = None, campaign_key: str = "") -> str:
    """Cache key: industry + campaign_key (MD5 of pain campaign) so each campaign has its own signal plan."""
    # If we have a campaign_key (MD5 of the pain tab entry), use it for precise keying
    if campaign_key:
        return f"signal_plan:{industry.lower().strip()}:{campaign_key}"
    # Fallback: industry only (used when no campaign context)
    return f"signal_plan:{industry.lower().strip()}"

def make_signal_plan_prompt(industry, pain_points):
    pains_block = ""
    for i, pp in enumerate(pain_points, 1):
        pains_block += f"""
{i}. PAIN POINT: {pp.get('theme', 'Unknown')}
   Description: {pp.get('description', '')}
"""

    prompt = f"""You are a senior B2B market intelligence analyst specializing in the {industry} industry.

Below are pain points discovered from Reddit, review sites, and web research about businesses in the {industry} industry:
{pains_block}

For EACH pain point above, produce a two-sided Signal Detection Plan.

Each pain point block must include:
- pain_point: the theme name
- brief: A 2-3 sentence plain-English explanation written specifically for the {industry} industry. Explain: (1) what the problem is in real-world terms, (2) WHY they experience it, and (3) what they are LOSING (revenue, customers, reputation). Be specific and vivid.
- signals: the two-sided signal list

SIDE 1 — Solution Gap Signals: Externally observable proof the business has NO fix in place.
SIDE 2 — Problem Evidence Signals: Multiple observable proofs the pain actually EXISTS for this business.

═══ ALLOWED SOURCES (public, no login required) ═══
Use sources in this priority order (fastest → slowest to check):

1. Google Maps listing — public GMB card: phone, hours, review count, website link, photos, menu tab, Google Food Ordering panel. DO NOT reference any internal GMB fields.
2. Google Search snippet — search "[business name] [keyword]" and read the snippet only, without clicking through.
3. Business website (direct URL) — homepage, navigation, footer, hero section.
4. BuiltWith.com / Wappalyzer — free public tech lookup: shows CRM, live chat, ordering tech, analytics installed on website.
5. Yelp public listing — shows hours, phone, website, reviews, amenities, booking links. No login needed.
6. TripAdvisor public page — shows reviews, reservation links, rating trends.
7. OpenTable / Resy public listing — shows if online reservation system exists.
8. Zomato public business page — shows menu, ordering availability.
9. Indeed public job listings — search "[business name]" on indeed.com, no login needed.
10. LinkedIn public job search — linkedin.com/jobs public search, no login needed.
11. Trustpilot public page — shows review volume, rating trends, response rate.
12. Google Jobs panel — search "jobs at [business name]" in Google, shows hiring signals directly in SERP.
13. Google News — search "[business name]" in Google News, reveals funding rounds, closures, expansions, press mentions.
14. Yellow Pages / Foursquare / Bark.com — public business profile, shows contact info and service gaps.
15. Glassdoor public job listings — basic job search visible without login.
16. Similarweb public overview — shows traffic trends, channel breakdown.

FACEBOOK / INSTAGRAM RULE: These require login — DO NOT use them as direct sources.
Instead, use this approach for social signals:
- Source name: "Google Search (social preview)"
- how_to_find: 'Search Google for "[business name] facebook" or "[business name] instagram". Read ONLY the search snippet text that appears without clicking. If snippet shows last post date older than 30 days, no posts found, or account not found — signal is confirmed.'

═══ BANNED SOURCES ═══
NEVER use: commission rates from delivery platforms, GMB internal fields/systems, Indeed turnover rates, internal POS data, internal analytics, any source requiring login/authentication.

═══ SIGNAL RULES ═══
- Each signal has a weight (integer %) — all signals in one pain point sum to 100%.
- Side 1 (solution_gap) signals: 20–30% weight each (confirm the gap exists).
- Side 2 (problem_evidence) signals: 10–20% weight each (cumulative evidence).
- Use multiple sources per signal where possible (cross-validation).
- For each source give the EXACT step-by-step method — not "check their website" but specific instructions.

For each signal provide:
1. signal — what to check
2. side — "solution_gap" or "problem_evidence"
3. sources — list with name, difficulty (easy/medium/hard), how_to_find (exact steps)
4. confirmed_if — clear true/false boolean condition
5. weight — integer %

Respond ONLY with a valid JSON array. No markdown fences. Structure:
[
  {{
    "pain_point": "Theme name",
    "brief": "2-3 sentences: what this means for a {industry} business, why it happens, what they lose.",
    "signals": [
      {{
        "signal": "No online ordering button anywhere on website or Google Maps",
        "side": "solution_gap",
        "weight": 25,
        "sources": [
          {{
            "name": "Business website",
            "difficulty": "easy",
            "how_to_find": "Visit homepage and all navigation links. Search for 'Order Online', 'Order Now', 'Book a Table', 'Reserve', 'Buy Now' buttons or links in header, hero, footer, and menu pages."
          }},
          {{
            "name": "Google Maps listing",
            "difficulty": "easy",
            "how_to_find": "Search business on Google Maps. Check the business panel for an 'Order' or 'Reserve a table' button below the name. Also click Menu tab to see if a digital menu exists."
          }},
          {{
            "name": "BuiltWith.com",
            "difficulty": "easy",
            "how_to_find": "Go to builtwith.com, enter the business website URL. Look under 'eCommerce' and 'CMS' sections for any ordering platform like Square Online, Toast, Shopify, OpenTable widget."
          }}
        ],
        "confirmed_if": "No order/booking button found on website AND no Order/Reserve button on Google Maps panel AND BuiltWith shows no ordering platform installed"
      }},
      {{
        "signal": "Google Reviews and Yelp reviews mention slow service, long waits, or unresponsiveness",
        "side": "problem_evidence",
        "weight": 15,
        "sources": [
          {{
            "name": "Google Reviews",
            "difficulty": "easy",
            "how_to_find": "Search business on Google Maps. Open reviews panel. Sort by 'Lowest' rating. Ctrl+F or manually scan for keywords: wait, slow, delayed, nobody answered, took too long, hours wrong, closed early."
          }},
          {{
            "name": "Yelp public listing",
            "difficulty": "easy",
            "how_to_find": "Search business name on yelp.com. Open the listing. Sort reviews by 'Lowest Rated'. Scan review text for: wait time, slow, ignored, no response, understaffed."
          }},
          {{
            "name": "TripAdvisor",
            "difficulty": "easy",
            "how_to_find": "Search business name on tripadvisor.com. Sort reviews by 'Terrible'. Scan for keywords: slow service, long wait, unresponsive staff, poor management."
          }}
        ],
        "confirmed_if": "At least 3 reviews across Google/Yelp/TripAdvisor in last 12 months mention wait times, slow service, or staff unresponsiveness"
      }}
    ]
  }}
]"""
    return prompt

@app.post("/outreach/signal-plan")
async def generate_signal_plan(request: SignalPlanRequest):
    from market_research import nvidia_chat
    import re

    if not request.pain_points:
        raise HTTPException(status_code=400, detail="No pain points provided")

    cache_problem = _signal_plan_cache_key(request.industry, request.pain_points, request.campaign_key)

    # ── Check Supabase cache (skip if force_refresh) ──────────────────────────
    if not request.force_refresh:
        cached = db_manager.load_market_result("signal_plan", request.industry, cache_problem)
        if cached:
            plan = cached.get("plan", cached) if isinstance(cached, dict) else cached
            if isinstance(plan, list) and plan:
                # Validate quality — if any block has 0 signals, it's a bad cache → regenerate
                empty_count = sum(1 for b in plan if not b.get("signals"))
                if empty_count == 0:
                    return plan  # ✓ good cache
                # Bad cache detected — fall through to regenerate and overwrite

    # ── Generate with LLM — batch 3 pain points at a time to avoid token limits ──
    all_results = []
    batch_size = 3
    batches = [request.pain_points[i:i+batch_size] for i in range(0, len(request.pain_points), batch_size)]

    for batch in batches:
        prompt = make_signal_plan_prompt(request.industry, batch)
        response = nvidia_chat(prompt, max_tokens=4000)
        batch_result = None
        try:
            clean_resp = response.strip()
            clean_resp = re.sub(r'^```(?:json)?\s*', '', clean_resp)
            clean_resp = re.sub(r'\s*```$', '', clean_resp)
            clean_resp = clean_resp.strip()

            try:
                parsed = json.loads(clean_resp)
                if isinstance(parsed, list):
                    batch_result = parsed
            except json.JSONDecodeError:
                pass

            if batch_result is None:
                match = re.search(r'\[[\s\S]*\]', clean_resp)
                if match:
                    try:
                        parsed = json.loads(match.group())
                        if isinstance(parsed, list):
                            batch_result = parsed
                    except json.JSONDecodeError:
                        pass

            if not batch_result:
                # Fallback placeholder for each pain point in this batch
                batch_result = [{"pain_point": pp.get('theme', 'Unknown'), "brief": pp.get('description', ''), "signals": []} for pp in batch]

        except Exception as e:
            batch_result = [{"pain_point": pp.get('theme', 'Unknown'), "brief": pp.get('description', ''), "signals": []} for pp in batch]

        all_results.extend(batch_result)

    result = all_results

    # ── Save to Supabase ─────────────────────────────────────────────────────
    # Save as a dict wrapper so load_market_result can handle it (it expects a dict)
    db_manager.save_market_result("signal_plan", request.industry, cache_problem, {"plan": result})

    return result


@app.get("/outreach/signal-plan/{industry}")
async def get_cached_signal_plan(industry: str, campaign_key: str = ""):
    """Load saved signal plan — by campaign_key if provided, else by industry."""
    cache_problem = _signal_plan_cache_key(industry, campaign_key=campaign_key)
    cached = db_manager.load_market_result("signal_plan", industry, cache_problem)
    if not cached:
        raise HTTPException(status_code=404, detail="No saved signal plan for this campaign")
    plan = cached.get("plan", []) if isinstance(cached, dict) else cached
    # Validate quality before returning
    if isinstance(plan, list) and plan:
        empty_count = sum(1 for b in plan if not b.get("signals"))
        if empty_count > 0:
            raise HTTPException(status_code=404, detail="Cached plan has empty signals — needs regeneration")
    return plan

# ─── Prospect Intelligence Endpoint ───────────────────────────────────────────

class ProspectIntelRequest(BaseModel):
    technology: str       # e.g. "chatbots", "voice agents", "website development"
    industry: Optional[str] = ""  # optional, empty = all industries

def make_prospect_intel_prompt(technology: str, industry: str) -> str:
    industry_scope = f"the {industry} industry" if industry else "all industries"
    return f"""You are a senior B2B sales strategist and market intelligence analyst.

A company sells: {technology}
Target market: {industry_scope}

Generate a structured Prospect Intelligence Report with exactly THREE sections.

═══ SECTION 1 — PAIN POINTS ═══
Generate minimum 5 pain points that "{technology}" directly solves for {industry_scope}.
For each pain point:
- title: short compelling name (max 6 words)
- description: 2-3 sentences explaining the real-world business problem
- revenue_impact: specific stat or estimate e.g. "businesses report 23% reduction in missed bookings after implementing this" — be specific and realistic
- frequency: one of "very common" / "common" / "occasional"
- why_tech_solves: 1 sentence explaining exactly how {technology} fixes this pain

═══ SECTION 2 — SIGNAL DETECTION PLAN ═══
For EACH pain point above, generate signals to prove a specific business is facing that problem and does NOT already have {technology} in place.
Two sides per pain point:

SIDE 1 (solution_gap): proof business has NO {technology} already installed.
SIDE 2 (problem_evidence): external proof the pain EXISTS for that business.

ALLOWED SOURCES ONLY (no login required), in priority order:
1. Business website (direct URL)
2. Google Maps listing (public GMB card)
3. Google Search snippet (read snippet only without clicking)
4. BuiltWith.com / Wappalyzer (detects installed tech stack publicly)
5. Yelp / TripAdvisor / Trustpilot public pages
6. OpenTable / Resy / Zomato public listings
7. Indeed / LinkedIn public job search (no login)
8. Google Jobs panel in SERP
9. Google News search
10. Yellow Pages / Foursquare / Bark.com public profiles
11. Glassdoor public listings
12. Similarweb public overview

FACEBOOK/INSTAGRAM: search "[business name] facebook" on Google, read snippet only. Do NOT visit FB/IG directly.

RULES:
- Minimum 3 signals per pain point (at least 1 from BuiltWith/Wappalyzer)
- Signal weights per pain point sum to 100%
- Side 1 signals: 20-30% weight each
- Side 2 signals: 10-20% weight each
- how_to_find must be exact step-by-step, not vague

═══ SECTION 3 — AUDIENCE & LEAD SOURCES ═══
Generate a lead sourcing plan to find businesses facing these pain points.
Include 5-7 sources.
For each source:
- platform: name of platform
- search_keyword: exact search string to use on that platform
- why: 1 sentence explaining why this surfaces the right businesses
- estimated_volume: "high" / "medium" / "low"
- filter_tip: how to filter results to find best matches
- is_primary: true for Google Maps (always include as first/primary source)

Always include Google Maps as primary with exact keyword format: "[industry] [city/region]"

═══ OUTPUT FORMAT ═══
Respond ONLY with valid JSON. No markdown fences. Exact structure:
{{
  "technology": "{technology}",
  "industry": "{industry_scope}",
  "section1_pain_points": [
    {{
      "title": "...",
      "description": "...",
      "revenue_impact": "...",
      "frequency": "very common",
      "why_tech_solves": "..."
    }}
  ],
  "section2_signals": [
    {{
      "pain_point_title": "title matching section1",
      "signals": [
        {{
          "signal": "...",
          "side": "solution_gap",
          "weight": 25,
          "sources": [
            {{
              "name": "BuiltWith.com",
              "difficulty": "easy",
              "how_to_find": "Go to builtwith.com, enter business website URL. Look under CMS/Chat/eCommerce for any {technology}-related tool."
            }}
          ],
          "confirmed_if": "..."
        }}
      ]
    }}
  ],
  "section3_lead_sources": [
    {{
      "platform": "Google Maps",
      "search_keyword": "...",
      "why": "...",
      "estimated_volume": "high",
      "filter_tip": "...",
      "is_primary": true
    }}
  ]
}}"""

@app.post("/prospect-intel/generate")
async def generate_prospect_intel(request: ProspectIntelRequest):
    from market_research import nvidia_chat
    import re

    if not request.technology.strip():
        raise HTTPException(status_code=400, detail="Technology keyword is required")

    # Check cache
    cache_key_raw = f"prospect:{request.technology.lower().strip()}:{(request.industry or '').lower().strip()}"
    cached = db_manager.load_market_result("prospect_intel", request.technology, cache_key_raw)
    if cached:
        return cached

    prompt = make_prospect_intel_prompt(request.technology, request.industry or "")
    response = nvidia_chat(prompt, max_tokens=6000)

    result = None
    try:
        clean = response.strip()
        clean = re.sub(r'^```(?:json)?\s*', '', clean)
        clean = re.sub(r'\s*```$', '', clean)
        clean = clean.strip()
        try:
            result = json.loads(clean)
        except json.JSONDecodeError:
            m = re.search(r'\{[\s\S]*\}', clean)
            if m:
                result = json.loads(m.group())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response: {str(e)}")

    if not result:
        raise HTTPException(status_code=500, detail="LLM returned no parseable JSON")

    # Save to Supabase
    db_manager.save_market_result("prospect_intel", request.technology, cache_key_raw, result)
    return result

@app.post("/prospect-intel/refresh")
async def refresh_prospect_intel(request: ProspectIntelRequest):
    """Force regenerate — deletes cache first."""
    from market_research import nvidia_chat
    import re

    if not request.technology.strip():
        raise HTTPException(status_code=400, detail="Technology keyword is required")

    cache_key_raw = f"prospect:{request.technology.lower().strip()}:{(request.industry or '').lower().strip()}"
    # Delete existing cache
    db_manager.load_market_result("prospect_intel", request.technology, cache_key_raw)  # warm up
    # Just regenerate and overwrite
    prompt = make_prospect_intel_prompt(request.technology, request.industry or "")
    response = nvidia_chat(prompt, max_tokens=6000)

    result = None
    try:
        clean = response.strip()
        clean = re.sub(r'^```(?:json)?\s*', '', clean)
        clean = re.sub(r'\s*```$', '', clean)
        clean = clean.strip()
        try:
            result = json.loads(clean)
        except json.JSONDecodeError:
            m = re.search(r'\{[\s\S]*\}', clean)
            if m:
                result = json.loads(m.group())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response: {str(e)}")

    if not result:
        raise HTTPException(status_code=500, detail="LLM returned no parseable JSON")

    db_manager.save_market_result("prospect_intel", request.technology, cache_key_raw, result)
    return result

if __name__ == "__main__":
    import uvicorn
    db_manager.init_db()
    uvicorn.run(app, host="0.0.0.0", port=8000)
