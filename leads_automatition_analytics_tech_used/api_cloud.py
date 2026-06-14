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
    campaign_key: str = ""

def _signal_plan_cache_key(industry: str, pain_points: list = None, campaign_key: str = "") -> str:
    if campaign_key:
        return f"signal_plan:{industry.lower().strip()}:{campaign_key}"
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

ALLOWED SOURCES — priority order (fastest first):
1. Google Maps listing (public GMB card: phone, hours, review count, website link, photos, menu tab, Google Food Ordering panel)
2. Google Search snippet (search "[business name] [keyword]", read snippet only without clicking)
3. Business website (direct URL — homepage, navigation, footer, hero section)
4. BuiltWith.com / Wappalyzer (free public tech lookup: CRM, live chat, ordering tech, analytics)
5. Yelp public listing (hours, phone, reviews, amenities, booking links)
6. TripAdvisor public page (reviews, reservation links, rating trends)
7. OpenTable / Resy public listing (confirms if reservation system exists)
8. Zomato public business page (menu, ordering availability)
9. Indeed public job listings (indeed.com, no login needed)
10. LinkedIn public job search (linkedin.com/jobs, no login needed)
11. Trustpilot public page (review volume, rating trends, response rate)
12. Google Jobs panel (search "jobs at [business name]" in Google SERP)
13. Google News (search "[business name]" in Google News — funding, closures, expansions)
14. Yellow Pages / Foursquare / Bark.com (public business profile)
15. Glassdoor public job listings (basic search, no login)
16. Similarweb public overview (traffic trends)

FACEBOOK/INSTAGRAM RULE — requires login, DO NOT use directly:
Use instead: Source "Google Search (social preview)" — how_to_find: 'Search Google for "[business name] facebook" or "[business name] instagram". Read ONLY the search snippet text. If snippet shows last post older than 30 days, no posts, or account not found — signal is confirmed.'

BANNED: commission rates from delivery platforms, GMB internal fields, Indeed turnover rates, internal POS data, any login-required source.

RULES:
- All signal weights per pain point sum to 100%
- Side 1 signals: 20-30% each. Side 2 signals: 10-20% each
- Multiple sources per signal for cross-validation where possible
- how_to_find must be exact step-by-step instructions

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

    cache_problem = _signal_plan_cache_key(request.industry, campaign_key=request.campaign_key)

    # Check Supabase cache — validate quality before returning
    if not request.force_refresh:
        cached = db_manager.load_market_result("signal_plan", request.industry, cache_problem)
        if cached:
            plan = cached.get("plan", cached) if isinstance(cached, dict) else cached
            if isinstance(plan, list) and plan:
                empty_count = sum(1 for b in plan if not b.get("signals"))
                if empty_count == 0:
                    return plan  # good cache

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
async def get_cached_signal_plan(industry: str, campaign_key: str = ""):
    cache_problem = _signal_plan_cache_key(industry, campaign_key=campaign_key)
    cached = db_manager.load_market_result("signal_plan", industry, cache_problem)
    if not cached:
        raise HTTPException(status_code=404, detail="No saved signal plan for this campaign")
    plan = cached.get("plan", []) if isinstance(cached, dict) else cached
    if isinstance(plan, list) and plan:
        empty_count = sum(1 for b in plan if not b.get("signals"))
        if empty_count > 0:
            raise HTTPException(status_code=404, detail="Cached plan has empty signals — needs regeneration")
    return plan

# ── Prospect Intelligence Endpoints ─────────────────────────────────────────

class ProspectIntelRequest(BaseModel):
    technology: str
    industry: Optional[str] = ""
    departments: Optional[list] = []


def _build_industry_source_profile(industry: str) -> dict:
    """Return allowed review platforms, industry vocabulary, and B2C flag based on industry."""
    ind = (industry or "").lower().strip()
    # B2C hospitality industries — these are the ONLY ones where Yelp/TripAdvisor/OpenTable make sense
    hospitality = {"restaurants", "restaurant", "hotels", "hotel", "hospitality", "cafes", "cafe",
                   "bars", "bar", "pub", "pubs", "nightclub", "spa", "salon", "beauty",
                   "fast food", "fast casual", "fine dining", "catering", "food truck",
                   "bakery", "coffee shop", "ice cream", "pizza", "sushi"}
    # B2C non-hospitality — Yelp ok, TripAdvisor not
    retail_b2c = {"retail", "ecommerce", "e-commerce", "real estate", "real-estate",
                  "fitness", "gym", "dental", "medical", "clinic", "veterinary", "auto repair",
                  "plumbing", "hvac", "electrician", "landscaping", "cleaning", "photography",
                  "wedding", "event planning", "education", "tutoring"}

    is_hospitality = any(h in ind for h in hospitality)
    is_b2c = is_hospitality or any(r in ind for r in retail_b2c)

    # Review platforms
    if is_hospitality:
        review_platforms = "Yelp, TripAdvisor, Google Reviews, Trustpilot"
        booking_platforms = "OpenTable, Resy, Zomato (for restaurants); Booking.com, Expedia (for hotels)"
        review_signals = "customer reviews mentioning long wait times, rude staff, bad food/service, slow response, poor communication, missed reservations"
    elif is_b2c:
        review_platforms = "Yelp, Google Reviews, Trustpilot"
        booking_platforms = "industry-specific booking platforms relevant to the niche"
        review_signals = "customer reviews mentioning poor communication, slow response, unprofessional service, missed appointments"
    else:
        # B2B industries (logistics, manufacturing, SaaS, construction, etc.)
        review_platforms = "Trustpilot, G2, Capterra, TrustRadius, Google Reviews (for general visibility)"
        booking_platforms = "NOT APPLICABLE — do not use restaurant/hotel booking platforms"
        review_signals = "B2B client feedback on platforms like G2/Trustpilot: implementation delays, carrier visibility gaps, missed SLAs, poor account management, accuracy of documentation"

    return {
        "is_b2c": is_b2c,
        "is_hospitality": is_hospitality,
        "review_platforms": review_platforms,
        "booking_platforms": booking_platforms,
        "review_signals": review_signals,
    }


def make_prospect_intel_prompt(technology: str, industry: str, departments: list = None) -> str:
    from market_research import resolve_department_labels, DEFAULT_DEPARTMENTS
    industry_scope = f"the {industry} industry" if industry else "all industries"
    sp = _build_industry_source_profile(industry)

    if departments and "all" not in departments:
        dept_labels = resolve_department_labels(industry, departments)
        dept_context = "Focus ONLY on these departments/stakeholders:\n" + "\n".join(f"- {d}" for d in dept_labels)
    else:
        dept_context = "Cover ALL relevant departments for this industry (including department groups appropriate to the industry, NOT generic corporate roles)."

    # Build industry-specific source list
    if sp["is_hospitality"]:
        allowed_sources = f"""Business website, Google Maps, Google Search snippet,
BuiltWith.com/Wappalyzer, {sp["review_platforms"]}, {sp["booking_platforms"]},
Indeed/LinkedIn public job search, Google Jobs SERP, Google News, Yellow Pages/Foursquare/Bark.com,
Glassdoor public, Similarweb public. For Facebook/Instagram: Google Search snippet only."""
    elif sp["is_b2c"]:
        allowed_sources = f"""Business website, Google Maps, Google Search snippet,
BuiltWith.com/Wappalyzer, {sp["review_platforms"]},
Indeed/LinkedIn public job search, Google Jobs SERP, Google News, Yellow Pages/Foursquare/Bark.com,
Glassdoor public, Similarweb public. For Facebook/Instagram: Google Search snippet only."""
    else:
        allowed_sources = f"""Business website, Google Maps, Google Search snippet,
BuiltWith.com/Wappalyzer, {sp["review_platforms"]},
Indeed/LinkedIn public job search, Google Jobs SERP, Google News, industry trade directories,
ThomasNet (for manufacturing/logistics), Clutch.co (for services), Glassdoor public, Similarweb public.
DO NOT use: TripAdvisor, OpenTable, Resy, Zomato, Yelp — these platforms do NOT list {industry_scope} businesses.
For Facebook/Instagram: Google Search snippet only."""

    return f"""You are a senior B2B sales strategist and market intelligence analyst.
You have deep knowledge of real-world org structures, job responsibilities, and buying authority.
You think in the specific language and metrics of the target industry — you NEVER copy concepts from unrelated industries.

A company sells: {technology}
Target market: {industry_scope}
Department focus:
{dept_context}

Generate a structured Prospect Intelligence Report with exactly THREE sections.

═══ CRITICAL VALIDATION RULES (APPLY TO EVERY FIELD) ═══
Before outputting ANY pain point, signal, or lead source, apply these hard rules:

RULE 0 — INDUSTRY ISOLATION (MOST IMPORTANT):
This report is about {industry_scope} ONLY.
Do NOT import concepts, metrics, platforms, or language from ANY other industry.
- If the industry is logistics/manufacturing: NEVER mention TripAdvisor, Yelp restaurants, "wait times", "bad food", "rude staff", OpenTable, Resy, Zomato, or any hospitality concept. Use logistics language: shipment delays, carrier communication gaps, tracking visibility, freight costs, SLA breaches, compliance violations.
- If the industry is logistics: Remove Yelp from ALL signal blocks — replace with Trustpilot, G2, or Capterra for B2B reviews, or Indeed/Glassdoor for internal signals.
- If the industry is logistics: Remove "Receptionist" and "front_of_house" from contact roles — logistics companies don't have receptionists making software decisions.
- If the industry is restaurants/hospitality: NEVER mention supply chain, freight, carriers, warehouse ops, or B2B procurement. Use hospitality language: covers, reservations, guest experience, table turns, wait times.
Before EVERY field you output, ask: "Does this concept actually exist in {industry_scope}?" If not, replace it with something that does.

RULE 1 — DIRECT SOLUTION ONLY:
Every pain point MUST be a problem where "{technology}" is a DIRECT and OBVIOUS solution.
- Example of BAD: "Inadequate Staff Training" -> chatbots do NOT train staff. Remove it.
- Example of GOOD: "Missed After-Hours Enquiries" -> chatbots capture 24/7 conversations. Keep it.

RULE 2 — PUBLIC SIGNALS ONLY (NO PRIVATE TOOLS):
NEVER suggest internal or private tools as signal sources. An outsider cannot see into another company's systems.
- BAD SIGNALS: Google Analytics, CRM data, email inbox content, internal ERP reports, private Slack channels.
- GOOD SIGNALS: Public reviews (G2/Trustpilot), live chat presence on website, job board postings (Indeed/LinkedIn), social media activity, public news reports.

RULE 3 — DEPARTMENT-CONTACT ACCURACY:
The "who_feels_pain" job titles and "who_to_contact" job title MUST be people whose ACTUAL responsibilities include this problem IN {industry_scope.upper()}.
Job titles must be real titles that exist in this industry.
Ask yourself: "Would this person LOSE SLEEP over this problem?" If no, pick someone else.

RULE 4 — DIFFERENT DECISION MAKERS PER SOURCE:
Each of the 7 lead sources in Section 3 MUST point to a DIFFERENT decision maker job title.
Do NOT repeat the same title across multiple sources. No repeating "Operations Manager".

RULE 5 — SOURCE-SIGNAL LOGIC:
Use ONLY platforms where {industry_scope} businesses actually exist.
- BuiltWith/Wappalyzer: technology presence/absence — good for ALL pain points.
- Indeed/LinkedIn job posts: hiring signals reveal operational gaps.
- Business website: UX, chat presence, booking/quoting flow — good for ALL pain points.
Minimum 3 signals per pain point (at least 1 from BuiltWith/Wappalyzer). Weights sum to 100%.

RULE 6 — PAIN POINT COUNT:
Generate exactly 4-5 pain points. Quality over quantity. Each must pass Rules 0-5 above.

═══ SECTION 1 — PAIN POINTS ═══
Generate 4-5 pain points that "{technology}" DIRECTLY solves for {industry_scope}.
Each pain point must use {industry_scope} language and metrics, not concepts from other industries.
For each pain point:
- title: short compelling name (max 6 words)
- description: 2-3 sentences explaining the real-world business problem IN {industry_scope} terms
- revenue_impact: specific stat relevant to {industry_scope}
- frequency: one of "very common" / "common" / "occasional"
- why_tech_solves: 1 sentence explaining exactly how {technology} fixes this pain
- who_feels_pain: list of departments and job titles who experience this pain DAILY in {industry_scope} companies.
  Format: [{{"department": "...", "job_titles": ["...", "..."]}}]
  Only include departments from the department focus above.

═══ SECTION 2 — SIGNAL DETECTION PLAN ═══
For EACH pain point above, generate signals proving a business faces that problem and lacks {technology}.
SIDE 1 (solution_gap): proof business has NO {technology} installed.
SIDE 2 (problem_evidence): external proof the pain EXISTS in {industry_scope} terms.

For each signal block also include:
- who_to_contact: the ONE specific person to reach when this signal is confirmed.
  This person must DIRECTLY OWN the problem domain.
  Format: {{"department": "...", "job_title": "...", "why": "1 sentence referencing their specific {industry_scope} responsibilities"}}

ALLOWED SOURCES:
{allowed_sources}

Minimum 3 signals per pain point (at least 1 from BuiltWith/Wappalyzer). Weights sum to 100%.

═══ SECTION 3 — AUDIENCE & LEAD SOURCES ═══
Use ONLY platforms where {industry_scope} businesses can be found.
For each source: platform, search_keyword, why, estimated_volume, filter_tip, is_primary, AND:
- decision_maker: who to email/call from THIS SPECIFIC SOURCE.
  Format: {{"job_title": "...", "department": "...", "why": "...", "how_to_find": "..."}}
  CRITICAL: Each source MUST have a DIFFERENT decision_maker job_title.

Google Maps is always primary with format: "[industry] [city/region]"

═══ OUTPUT FORMAT ═══
Respond ONLY with valid JSON, no markdown fences:
{{
  "technology": "{technology}",
  "industry": "{industry_scope}",
  "departments_targeted": ["list of department slugs"],
  "section1_pain_points": [
    {{
      "title": "...", "description": "...", "revenue_impact": "...",
      "frequency": "very common", "why_tech_solves": "...",
      "who_feels_pain": [{{"department": "...", "job_titles": ["..."]}}]
    }}
  ],
  "section2_signals": [
    {{
      "pain_point_title": "...",
      "who_to_contact": {{"department": "...", "job_title": "...", "why": "..."}},
      "signals": [
        {{
          "signal": "...", "side": "solution_gap", "weight": 25,
          "sources": [{{"name": "BuiltWith.com", "difficulty": "easy", "how_to_find": "..."}}],
          "confirmed_if": "..."
        }}
      ]
    }}
  ],
  "section3_lead_sources": [
    {{
      "platform": "Google Maps", "search_keyword": "...", "why": "...",
      "estimated_volume": "high", "filter_tip": "...", "is_primary": true,
      "decision_maker": {{"job_title": "...", "department": "...", "why": "...", "how_to_find": "..."}}
    }}
  ]
}}"""


def _parse_prospect_intel_response(response: str) -> Optional[dict]:
    import re
    import json
    try:
        clean = response.strip()
        clean = re.sub(r'^```(?:json)?\s*', '', clean)
        clean = re.sub(r'\s*```$', '', clean)
        clean = clean.strip()
        try:
            return json.loads(clean)
        except json.JSONDecodeError:
            m = re.search(r'\{[\s\S]*\}', clean)
            if m:
                return json.loads(m.group())
    except Exception:
        pass
    return None


def _validate_industry_isolation(result: dict, industry: str) -> list:
    """Check the generated output for cross-industry contamination.
    Returns a list of violation strings. Empty list = clean."""
    import json
    violations = []
    ind = (industry or "").lower().strip()
    raw = json.dumps(result).lower()

    # Define forbidden terms per industry family
    hospitality_only_terms = ["tripadvisor", "opentable", "resy", "zomato", "table turn",
                              "covers per night", "guest experience", "host stand",
                              "wait time estimator", "reservation system", "bad food",
                              "rude staff", "slow service", "yelp"]
    b2b_terms = ["shipment delay", "carrier", "freight", "warehouse", "supply chain",
                 "logistics", "fleet", "procurement", "invoice", "compliance",
                 "sla", "bill of lading"]

    is_hospitality = any(h in ind for h in [
        "restaurant", "hotel", "hospitality", "cafe", "bar", "pub", "dining",
        "catering", "bakery", "coffee shop", "spa", "salon"
    ])
    is_b2b = any(b in ind for b in [
        "logistics", "manufacturing", "supply chain", "freight", "warehouse",
        "construction", "industrial", "wholesale", "distribution"
    ])

    if is_b2b and not is_hospitality:
        # Check for hospitality bleed in B2B output
        for term in hospitality_only_terms:
            if term in raw:
                violations.append(f"Hospitality term '{term}' found in {industry} output")

    if is_hospitality and not is_b2b:
        # Check for B2B logistics bleed in hospitality output
        for term in b2b_terms:
            if term in raw:
                violations.append(f"B2B term '{term}' found in {industry} output")

    # Check for forbidden internal signals
    forbidden_signals = ["google analytics", "crm data", "crm software", "erp reports", "internal dashboard", "hubspot data", "salesforce data"]
    for term in forbidden_signals:
        if term in raw:
            violations.append(f"Forbidden internal system '{term}' suggested as a public signal")

    # Check for duplicate decision maker titles in section3
    sources = result.get("section3_lead_sources", [])
    titles = [s.get("decision_maker", {}).get("job_title", "").strip().lower()
              for s in sources if s.get("decision_maker")]
    if len(titles) > 1:
        from collections import Counter
        dupes = {t: c for t, c in Counter(titles).items() if c > 1}
        if dupes:
            violations.append(f"Duplicate decision makers in lead sources: {list(dupes.keys())}")

    return violations


@app.post("/prospect-intel/generate")
async def generate_prospect_intel(request: ProspectIntelRequest):
    from market_research import nvidia_chat

    if not request.technology.strip():
        raise HTTPException(status_code=400, detail="Technology keyword is required")

    # Check cache
    cache_key_raw = f"prospect:{request.technology.lower().strip()}:{(request.industry or '').lower().strip()}:{','.join(sorted(request.departments or []))}"
    cached = db_manager.load_market_result("prospect_intel", request.technology, cache_key_raw)
    if cached:
        # Validate cached result too — if contaminated, regenerate
        violations = _validate_industry_isolation(cached, request.industry or "")
        if not violations:
            return cached
        # Cache is contaminated — fall through to regenerate
        print(f"[prospect-intel] Cache contaminated for {cache_key_raw}, regenerating. Violations: {violations}")

    prompt = make_prospect_intel_prompt(request.technology, request.industry or "", request.departments or [])
    response = nvidia_chat(prompt, max_tokens=6000)

    try:
        result = _parse_prospect_intel_response(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response: {str(e)}")

    if not result:
        raise HTTPException(status_code=500, detail="LLM returned no parseable JSON")

    # Validate industry isolation — retry once if contaminated
    violations = _validate_industry_isolation(result, request.industry or "")
    if violations:
        print(f"[prospect-intel] Contamination detected, retrying. Violations: {violations}")
        # Retry with stronger prompt
        retry_prompt = prompt + (
            f"\n\nIMPORTANT: Your previous attempt had industry contamination issues: "
            f"{'; '.join(violations)}. "
            f"The target industry is {request.industry or 'general'} ONLY. "
            f"Remove ALL concepts, platforms, and language from other industries. "
            f"Each lead source must have a UNIQUE decision maker title."
        )
        response = nvidia_chat(retry_prompt, max_tokens=6000)
        try:
            result = _parse_prospect_intel_response(response)
        except Exception:
            pass
        if not result:
            raise HTTPException(status_code=500, detail="LLM retry failed — no parseable JSON")
        # Check again but accept even if still imperfect
        violations2 = _validate_industry_isolation(result, request.industry or "")
        if violations2:
            print(f"[prospect-intel] Still contaminated after retry: {violations2} — serving anyway")

    # Save to Supabase
    db_manager.save_market_result("prospect_intel", request.technology, cache_key_raw, result)
    return result

@app.post("/prospect-intel/refresh")
async def refresh_prospect_intel(request: ProspectIntelRequest):
    from market_research import nvidia_chat

    if not request.technology.strip():
        raise HTTPException(status_code=400, detail="Technology keyword is required")

    # Check cache
    cache_key_raw = f"prospect:{request.technology.lower().strip()}:{(request.industry or '').lower().strip()}:{','.join(sorted(request.departments or []))}"
    db_manager.load_market_result("prospect_intel", request.technology, cache_key_raw)  # warm up

    prompt = make_prospect_intel_prompt(request.technology, request.industry or "", request.departments or [])
    response = nvidia_chat(prompt, max_tokens=6000)

    try:
        result = _parse_prospect_intel_response(response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response: {str(e)}")

    if not result:
        raise HTTPException(status_code=500, detail="LLM returned no parseable JSON")

    # Validate industry isolation — retry once if contaminated
    violations = _validate_industry_isolation(result, request.industry or "")
    if violations:
        print(f"[prospect-intel/refresh] Contamination detected, retrying. Violations: {violations}")
        # Retry with stronger prompt
        retry_prompt = prompt + (
            f"\n\nIMPORTANT: Your previous attempt had industry contamination issues: "
            f"{'; '.join(violations)}. "
            f"The target industry is {request.industry or 'general'} ONLY. "
            f"Remove ALL concepts, platforms, and language from other industries. "
            f"Each lead source must have a UNIQUE decision maker title."
        )
        response = nvidia_chat(retry_prompt, max_tokens=6000)
        try:
            result = _parse_prospect_intel_response(response)
        except Exception:
            pass
        if not result:
            raise HTTPException(status_code=500, detail="LLM retry failed — no parseable JSON")

    # Save to Supabase
    db_manager.save_market_result("prospect_intel", request.technology, cache_key_raw, result)
    return result

@app.get("/health")
async def health():
    return {"status": "ok", "mode": "cloud"}

# ── Prospect Intel scan results save/load ─────────────────────────────────────
class ScanResultsSaveRequest(BaseModel):
    technology: str
    industry: str
    scored_leads: list   # list of scored lead dicts

@app.post("/prospect-intel/scan-results")
async def save_scan_results(request: ScanResultsSaveRequest):
    """Save signal scan scored results to Supabase for persistence."""
    cache_key = f"scan:{request.technology.lower().strip()}:{(request.industry or '').lower().strip()}"
    db_manager.save_market_result(
        "prospect_scan", request.technology, cache_key,
        {"scored_leads": request.scored_leads, "technology": request.technology, "industry": request.industry}
    )
    return {"status": "saved", "count": len(request.scored_leads)}

@app.get("/prospect-intel/scan-results")
async def load_scan_results(technology: str, industry: str = ""):
    """Load previously saved scan results from Supabase."""
    cache_key = f"scan:{technology.lower().strip()}:{(industry or '').lower().strip()}"
    cached = db_manager.load_market_result("prospect_scan", technology, cache_key)
    if not cached:
        raise HTTPException(status_code=404, detail="No saved scan results for this technology")
    return cached


# ═══════════════════════════════════════════════════════════════════════════════
# PROSPECT INTELLIGENCE V2 — 4 Sub-tab Architecture
# Real HTTP checks, no fabricated scores.
# ═══════════════════════════════════════════════════════════════════════════════

import uuid as _uuid
import re as _re_pi
from bs4 import BeautifulSoup as _BS4

# ── Table DDL (auto-created on startup) ──────────────────────────────────────

_PI_LEADS_DDL = """
CREATE TABLE IF NOT EXISTS pi_leads (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    business_name TEXT,
    website TEXT,
    phone TEXT,
    email TEXT,
    rating TEXT,
    review_count TEXT,
    category TEXT,
    location TEXT,
    source TEXT,
    is_duplicate BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'unanalyzed',
    created_at TIMESTAMP DEFAULT NOW()
);
"""

_PI_ANALYZED_DDL = """
CREATE TABLE IF NOT EXISTS pi_analyzed (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    business_name TEXT,
    website TEXT,
    phone TEXT,
    email TEXT,
    signal_score INTEGER DEFAULT 0,
    confidence_rate INTEGER DEFAULT 0,
    signal_evidence JSONB DEFAULT '{}',
    current_process TEXT DEFAULT '',
    after_chatbot TEXT DEFAULT '',
    decision_maker TEXT DEFAULT '',
    outreach_status TEXT DEFAULT 'not_contacted',
    created_at TIMESTAMP DEFAULT NOW()
);
"""

_PI_SESSIONS_DDL = """
CREATE TABLE IF NOT EXISTS pi_sessions (
    id SERIAL PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    technology TEXT DEFAULT '',
    industry TEXT DEFAULT '',
    pain_points_json TEXT DEFAULT '{}',
    signal_plans_json TEXT DEFAULT '[]',
    leads_count INTEGER DEFAULT 0,
    analyzed_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
"""

def _pi_init_tables():
    try:
        conn = db_manager.get_pg_conn()
        cur = conn.cursor()
        cur.execute(_PI_LEADS_DDL)
        cur.execute(_PI_ANALYZED_DDL)
        cur.execute(_PI_SESSIONS_DDL)
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[pi_tables] Init error: {e}")

def _pi_save_session(session_id: str, technology: str = "", industry: str = "",
                     pain_points=None, signal_plans=None,
                     leads_count=None, analyzed_count=None):
    try:
        conn = db_manager.get_pg_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO pi_sessions (session_id, technology, industry)
            VALUES (%s, %s, %s)
            ON CONFLICT (session_id) DO UPDATE
            SET technology = COALESCE(NULLIF(EXCLUDED.technology, ''), pi_sessions.technology),
                industry = COALESCE(NULLIF(EXCLUDED.industry, ''), pi_sessions.industry),
                updated_at = NOW()
        """, (session_id, technology or '', industry or ''))
        if pain_points is not None:
            cur.execute("UPDATE pi_sessions SET pain_points_json=%s, updated_at=NOW() WHERE session_id=%s",
                        (_json.dumps(pain_points), session_id))
        if signal_plans is not None:
            cur.execute("UPDATE pi_sessions SET signal_plans_json=%s, updated_at=NOW() WHERE session_id=%s",
                        (_json.dumps(signal_plans), session_id))
        if leads_count is not None:
            cur.execute("UPDATE pi_sessions SET leads_count=%s, updated_at=NOW() WHERE session_id=%s",
                        (leads_count, session_id))
        if analyzed_count is not None:
            cur.execute("UPDATE pi_sessions SET analyzed_count=%s, updated_at=NOW() WHERE session_id=%s",
                        (analyzed_count, session_id))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[pi_save_session] {e}")

_pi_init_tables()

# ── Industry → subreddits mapping ────────────────────────────────────────────

_PI_REDDIT_SUBS = {
    "restaurants": ["restaurantowners", "KitchenConfidential", "serverlife"],
    "restaurant": ["restaurantowners", "KitchenConfidential", "serverlife"],
    "food": ["restaurantowners", "food", "foodservice"],
    "real estate": ["realestate", "realtors", "PropertyManagement"],
    "fitness": ["gym", "personaltraining", "fitness"],
    "healthcare": ["medicine", "nursing", "healthIT"],
    "retail": ["retailhell", "smallbusiness", "ecommerce"],
    "logistics": ["logistics", "supplychain", "trucking"],
    "saas": ["SaaS", "startups", "ProductManagement"],
    "education": ["Teachers", "education", "edtech"],
    "finance": ["personalfinance", "fintech", "accounting"],
    "marketing": ["marketing", "digital_marketing", "SEO"],
    "ecommerce": ["ecommerce", "shopify", "Flipping"],
    "construction": ["construction", "HomeImprovement", "smallbusiness"],
    "legal": ["legaladvice", "law", "smallbusiness"],
    "hospitality": ["TalesFromTheFrontDesk", "hotel", "restaurantowners"],
    "beauty": ["Hair", "weddingplanning", "smallbusiness"],
    "dental": ["Dentistry", "medicine", "smallbusiness"],
}

# ── Tech detection pattern dictionaries ─────────────────────────────────────

_LIVE_CHAT_PATTERNS = {
    "Intercom": ["intercom.io", "window.Intercom", "intercomSettings"],
    "Drift": ["drift-widget", "js.driftt.com", "window.drift"],
    "Crisp": ["client.crisp.chat", "window.$crisp"],
    "Tawk.to": ["embed.tawk.to", "Tawk_API"],
    "LiveChat": ["livechatinc.com", "window.__lc"],
    "Zendesk Chat": ["static.zdassets.com", "zESettings"],
    "Freshchat": ["wchat.freshchat.com", "window.fcWidget"],
    "HubSpot Chat": ["js.hs-scripts.com", "HubSpotConversations"],
    "Tidio": ["widget.tidio.co", "tidioChatCode"],
    "Smartsupp": ["smartsuppchat.com", "smartsupp"],
    "Olark": ["static.olark.com", "window.olark"],
    "Pure Chat": ["purechat.com", "window.purechat"],
}

_BOOKING_PATTERNS = {
    "Calendly": ["calendly.com", "window.Calendly"],
    "Acuity Scheduling": ["acuityscheduling.com"],
    "Mindbody": ["mindbodyonline.com"],
    "OpenTable": ["opentable.com"],
    "Booksy": ["booksy.com"],
    "Square Appointments": ["squareup.com/appointments"],
    "Fresha": ["fresha.com"],
    "SimplyBook": ["simplybook.me"],
    "Vagaro": ["vagaro.com"],
}

_CMS_PATTERNS = {
    "WordPress": ["/wp-content/", "/wp-includes/", "wp-json"],
    "Wix": ["wix.com", "wixsite.com", "wixstatic.com"],
    "Squarespace": ["squarespace.com", "sqsp.net", "static.squarespace"],
    "Shopify": ["cdn.shopify.com", "myshopify.com", "Shopify.theme"],
    "Webflow": ["webflow.io", "webflow.com"],
    "Weebly": ["weebly.com", "editmysite.com"],
    "GoDaddy": ["godaddy.com/websites", "secureserver.net"],
}

# ── Core: Fetch website and detect tech signals ──────────────────────────────

def _pi_fetch_and_detect(url: str) -> dict:
    """Real HTTP fetch + HTML parsing. Returns structured findings or explicit error."""
    out = {
        "url": url, "fetched": False, "error": None, "status_code": None,
        "live_chat": [], "booking": [], "contact_forms": [], "has_email_field": False,
        "meta_pixel": False, "google_analytics": False, "cms": [],
        "emails_found": [], "phones_found": [],
    }
    if not url or url in ("N/A", "None", ""):
        out["error"] = "No website URL provided for this lead"
        return out
    if not url.startswith("http"):
        url = "https://" + url
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        resp = requests.get(url, headers=headers, timeout=12, allow_redirects=True)
        html = resp.text
        out["fetched"] = True
        out["status_code"] = resp.status_code

        for name, patterns in _LIVE_CHAT_PATTERNS.items():
            if any(p in html for p in patterns):
                out["live_chat"].append(name)

        for name, patterns in _BOOKING_PATTERNS.items():
            if any(p in html for p in patterns):
                out["booking"].append(name)

        for name, patterns in _CMS_PATTERNS.items():
            if any(p in html for p in patterns):
                out["cms"].append(name)

        out["meta_pixel"] = ("fbq(" in html or "connect.facebook.net" in html or "facebook-jssdk" in html)
        out["google_analytics"] = any(p in html for p in ["gtag(", "ga('send", "analytics.google.com", "googletagmanager.com/gtag"])

        try:
            soup = _BS4(html, "html.parser")
            for form in soup.find_all("form"):
                action = form.get("action", "").lower()
                fid = form.get("id", "").lower()
                fcls = " ".join(form.get("class", [])).lower()
                email_inputs = form.find_all("input", {"type": "email"})
                ctx = action + fid + fcls
                is_contact = any(kw in ctx for kw in ["contact", "enquir", "message", "reach", "form", "email", "touch"])
                if email_inputs or is_contact:
                    out["contact_forms"].append({"action": action[:80], "has_email": bool(email_inputs)})
                    if email_inputs:
                        out["has_email_field"] = True

            raw = soup.get_text() + html
            skip_domains = {"sentry.io", "example.com", "schema.org", "w3.org", "yourdomain", "google.com"}
            emails = set(_re_pi.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", raw))
            out["emails_found"] = [e for e in emails if not any(d in e for d in skip_domains)][:5]
            phones = set(_re_pi.findall(r"(?:tel:)?((?:\+44|\+1|0)[\s\-]?(?:\d[\s\-]?){9,12})", raw))
            out["phones_found"] = list(phones)[:3]
        except Exception:
            pass

    except requests.exceptions.Timeout:
        out["error"] = "Request timed out after 12 seconds"
    except requests.exceptions.SSLError as e:
        out["error"] = f"SSL certificate error: {str(e)[:80]}"
    except requests.exceptions.ConnectionError as e:
        out["error"] = f"Connection failed (site may be down): {str(e)[:80]}"
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {str(e)[:80]}"
    return out

def _pi_check_builtwith(domain: str) -> dict:
    """Query BuiltWith free API if BUILTWITH_API_KEY is configured."""
    api_key = os.getenv("BUILTWITH_API_KEY", "").strip()
    if not api_key:
        return {"available": False, "reason": "BUILTWITH_API_KEY not set — set it in .env to enable BuiltWith checks"}
    try:
        domain = domain.replace("https://", "").replace("http://", "").split("/")[0]
        r = requests.get(f"https://api.builtwith.com/free1/api.json?KEY={api_key}&LOOKUP={domain}", timeout=15)
        if r.status_code == 200:
            data = r.json()
            techs = []
            for result in data.get("Results", []):
                for tech in result.get("Technologies", []):
                    techs.append({"name": tech.get("Name"), "tag": tech.get("Tag")})
            return {"available": True, "techs": techs, "domain": domain}
        return {"available": False, "reason": f"BuiltWith returned HTTP {r.status_code}"}
    except Exception as e:
        return {"available": False, "reason": str(e)[:100]}

def _pi_evaluate_signal(check: dict, website_data: dict, builtwith_data: dict) -> dict:
    """
    Evaluate one signal check against real fetched data.
    Returns {confirmed, evidence, check_method, was_checkable}.
    confirmed is 'yes' | 'no' | 'unable_to_check'.
    """
    sig_type = check.get("signal_type", "")
    side = check.get("side", check.get("signal_type", ""))
    check_name = (check.get("check_name", "") + " " + check.get("confirmed_if", "") + " " + check.get("what_to_check", "")).lower()

    if not website_data.get("fetched"):
        return {
            "confirmed": "unable_to_check",
            "evidence": f"Website unreachable: {website_data.get('error', 'unknown error')}",
            "check_method": "website_html",
            "was_checkable": False,
        }

    # Live chat
    if sig_type == "live_chat" or any(kw in check_name for kw in ["chat", "chatbot", "live chat", "chat widget", "messaging widget"]):
        chats = website_data.get("live_chat", [])
        no_chat = not chats
        return {
            "confirmed": "yes" if no_chat else "no",
            "evidence": ("No live chat widget detected in HTML after full page scan" if no_chat
                         else f"Live chat widget found: {', '.join(chats)}"),
            "check_method": "html_pattern_match",
            "was_checkable": True,
        }

    # Booking / appointments
    if sig_type == "booking" or any(kw in check_name for kw in ["booking", "appointment", "reservation", "scheduling", "book online"]):
        bookings = website_data.get("booking", [])
        no_booking = not bookings
        return {
            "confirmed": "yes" if no_booking else "no",
            "evidence": ("No booking or scheduling system found in HTML" if no_booking
                         else f"Booking system detected: {', '.join(bookings)}"),
            "check_method": "html_pattern_match",
            "was_checkable": True,
        }

    # Contact form
    if sig_type == "contact_form" or any(kw in check_name for kw in ["contact form", "enquiry form", "web form", "lead form"]):
        forms = website_data.get("contact_forms", [])
        no_form = not forms
        return {
            "confirmed": "yes" if no_form else "no",
            "evidence": ("No contact/enquiry form found on the page" if no_form
                         else f"{len(forms)} form(s) found with email or contact fields"),
            "check_method": "html_form_parse",
            "was_checkable": True,
        }

    # Meta Pixel / Facebook Ads
    if sig_type == "meta_pixel" or any(kw in check_name for kw in ["meta pixel", "facebook pixel", "fb pixel", "facebook ads", "meta ads"]):
        has_pixel = website_data.get("meta_pixel", False)
        return {
            "confirmed": "yes" if not has_pixel else "no",
            "evidence": ("No Meta/Facebook Pixel detected (no fbq function or connect.facebook.net)" if not has_pixel
                         else "Meta Pixel found in HTML (fbq function or connect.facebook.net script)"),
            "check_method": "html_pattern_match",
            "was_checkable": True,
        }

    # Google Analytics
    if sig_type == "google_analytics" or any(kw in check_name for kw in ["google analytics", "gtag", "analytics tracking"]):
        has_ga = website_data.get("google_analytics", False)
        return {
            "confirmed": "yes" if not has_ga else "no",
            "evidence": ("No Google Analytics or Tag Manager detected in HTML" if not has_ga
                         else "Google Analytics/GTM script found in HTML"),
            "check_method": "html_pattern_match",
            "was_checkable": True,
        }

    # CMS
    if sig_type == "cms" or any(kw in check_name for kw in ["wordpress", "wix", "squarespace", "shopify", "website platform", "cms"]):
        cms = website_data.get("cms", [])
        return {
            "confirmed": "yes" if cms else "unable_to_check",
            "evidence": (f"CMS detected: {', '.join(cms)}" if cms else "No recognisable CMS fingerprint in HTML — may be custom-built or headless"),
            "check_method": "html_pattern_match",
            "was_checkable": True,
        }

    # CRM via BuiltWith
    if sig_type == "crm" or any(kw in check_name for kw in ["crm", "salesforce", "hubspot", "pipedrive", "zoho", "marketing automation"]):
        if builtwith_data.get("available"):
            crm_kws = ["crm", "salesforce", "hubspot", "pipedrive", "zoho", "mailchimp", "klaviyo", "activecampaign"]
            found = [t["name"] for t in builtwith_data.get("techs", [])
                     if any(k in (t.get("name", "") + t.get("tag", "")).lower() for k in crm_kws)]
            no_crm = not found
            return {
                "confirmed": "yes" if no_crm else "no",
                "evidence": ("No CRM or marketing automation tools found via BuiltWith scan" if no_crm
                             else f"CRM tools detected via BuiltWith: {', '.join(found)}"),
                "check_method": "builtwith_api",
                "was_checkable": True,
            }
        return {
            "confirmed": "unable_to_check",
            "evidence": "BuiltWith API key not configured — set BUILTWITH_API_KEY in .env to enable CRM detection",
            "check_method": "builtwith_api",
            "was_checkable": False,
        }

    # Manual signals (review checks, LinkedIn, Google News, etc.)
    where = check.get("where_to_look", "")
    what = check.get("what_to_search", "")
    return {
        "confirmed": "unable_to_check",
        "evidence": (f"Manual check required — go to: {where}. Search: {what}. "
                     f"Confirmed if: {check.get('confirmed_if', 'see signal definition')}"),
        "check_method": "manual",
        "was_checkable": False,
    }

# ── Yellow Pages sync scraper ────────────────────────────────────────────────

def _pi_yp_sync(query: str, location: str, max_results: int = 10) -> list:
    leads = []
    try:
        url = f"https://www.yellowpages.com/search?search_terms={urllib.parse.quote_plus(query)}&geo_location_terms={urllib.parse.quote_plus(location)}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = requests.get(url, headers=headers, timeout=15)
        soup = _BS4(resp.text, "html.parser")
        for listing in soup.find_all("div", class_="srp-listing")[:max_results]:
            name_el = listing.find("a", class_="business-name")
            phone_el = listing.find("div", class_="phones")
            web_el = listing.find("a", class_="track-visit-website")
            cat_el = listing.find("div", class_="categories")
            if name_el:
                leads.append({
                    "business_name": name_el.get_text(strip=True),
                    "phone": phone_el.get_text(strip=True) if phone_el else "",
                    "website": web_el.get("href", "") if web_el else "",
                    "email": "", "rating": "", "review_count": "",
                    "category": cat_el.get_text(strip=True) if cat_el else query,
                    "location": location, "source": "Yellow Pages",
                })
    except Exception as e:
        print(f"[yellow_pages] {e}")
    return leads

# ── Companies House UK (free API, needs key) ─────────────────────────────────

def _pi_companies_house_sync(industry: str, location: str, max_results: int = 10) -> list:
    api_key = os.getenv("COMPANIES_HOUSE_API_KEY", "").strip()
    if not api_key:
        return []
    leads = []
    try:
        q = urllib.parse.quote(f"{industry} {location}")
        url = f"https://api.company-information.service.gov.uk/search/companies?q={q}&items_per_page={max_results}"
        resp = requests.get(url, auth=(api_key, ""), timeout=10)
        if resp.status_code == 200:
            for item in resp.json().get("items", []):
                leads.append({
                    "business_name": item.get("title", ""),
                    "website": "", "phone": "", "email": "", "rating": "", "review_count": "",
                    "category": item.get("description", industry),
                    "location": item.get("address", {}).get("locality", location),
                    "source": "Companies House UK",
                })
    except Exception as e:
        print(f"[companies_house] {e}")
    return leads

# ── PI V2 request models ──────────────────────────────────────────────────────

class PIV2PainPointsRequest(BaseModel):
    technology: str
    industry: str
    departments: list = []
    session_id: str = ""

class PIV2SignalPlansRequest(BaseModel):
    pain_points: list
    industry: str
    technology: str = ""
    session_id: str = ""

class PIV2ExtractLeadsRequest(BaseModel):
    industry: str
    location: str
    num_leads: int = 20
    sources: List[str] = ["Google Maps"]
    session_id: str = ""

class PIV2AnalyzeRequest(BaseModel):
    leads: list
    signal_plans: list
    technology: str = ""
    industry: str = ""
    session_id: str = ""

# ── Sub-tab 1: Pain Points ───────────────────────────────────────────────────

@app.post("/prospect-intel/v2/pain-points")
async def pi_v2_pain_points(request: PIV2PainPointsRequest):
    """Generate 5-8 pain points using LLM + live web research (Reddit, Indeed)."""
    from market_research import nvidia_chat
    if not request.technology.strip():
        raise HTTPException(400, "Technology keyword is required")

    session_id = request.session_id or str(_uuid.uuid4())[:8]
    reddit_context = ""
    indeed_context = ""

    # 1. Reddit research via Arctic Shift (no auth needed)
    try:
        ind_lower = (request.industry or "").lower()
        subs = _PI_REDDIT_SUBS.get(ind_lower, ["entrepreneur", "smallbusiness", "business"])
        query_enc = urllib.parse.quote(f"{request.technology} {request.industry} problems frustrating")
        for sub in subs[:2]:
            try:
                r = requests.get(
                    f"https://arctic-shift.photon-reddit.com/api/posts/search?q={query_enc}&subreddit={sub}&limit=5&sort=score",
                    timeout=8
                )
                if r.status_code == 200:
                    posts = r.json().get("data", [])
                    for p in posts[:3]:
                        reddit_context += f"[r/{sub}] {p.get('title', '')}: {p.get('selftext', '')[:250]}\n"
            except Exception:
                pass
    except Exception:
        pass

    # 2. Indeed job postings (RSS, no auth)
    try:
        import feedparser
        q_enc = urllib.parse.quote_plus(f"{request.technology} {request.industry}")
        r = requests.get(f"https://www.indeed.com/rss?q={q_enc}&limit=5",
                         headers={"User-Agent": "Mozilla/5.0"}, timeout=8)
        if r.status_code == 200:
            feed = feedparser.parse(r.content)
            for entry in feed.entries[:4]:
                indeed_context += f"[Indeed] {entry.get('title', '')}: {entry.get('summary', '')[:200]}\n"
    except Exception:
        pass

    web_block = ""
    if reddit_context or indeed_context:
        web_block = f"\nLIVE WEB RESEARCH (use to ground pain points in real evidence):\n{reddit_context}{indeed_context}\n"

    dept_str = ", ".join(request.departments) if request.departments else "all relevant departments"
    prompt = f"""You are a senior B2B sales intelligence analyst.
Technology being sold: {request.technology}
Target industry: {request.industry or "general businesses"}
Department focus: {dept_str}
{web_block}
Generate exactly 6 pain points that "{request.technology}" DIRECTLY solves in the {request.industry or "target"} industry.
Each pain point must be specific to this industry — no generic business language.

Return ONLY a valid JSON array (no markdown fences):
[
  {{
    "title": "Short pain name max 6 words",
    "frequency": "very common",
    "description": "2-3 sentences in {request.industry}-specific terms. Vivid and concrete.",
    "revenue_impact": "Specific dollar figures with logic. E.g. '$2,400/month lost because average ticket = $80 × 30 missed calls'",
    "why_tech_solves": "One sentence: exactly how {request.technology} eliminates this pain",
    "job_titles": ["Real Job Title 1", "Real Job Title 2"],
    "web_evidence": "Cite real Reddit/Indeed evidence if available, else leave blank"
  }}
]
Rules: frequency = very common | common | occasional. Revenue impact must include dollar amounts AND calculation logic. Job titles must actually exist in {request.industry} industry."""

    try:
        raw = nvidia_chat(prompt, max_tokens=3000)
        clean = raw.strip()
        clean = _re_pi.sub(r"^```(?:json)?\s*", "", clean)
        clean = _re_pi.sub(r"\s*```$", "", clean)
        pain_points = json.loads(clean)
        if isinstance(pain_points, dict):
            for k in ("pain_points", "points", "results"):
                if k in pain_points and isinstance(pain_points[k], list):
                    pain_points = pain_points[k]
                    break
        if not isinstance(pain_points, list):
            raise ValueError("LLM response was not a JSON array")

        db_manager.save_market_result(
            "pi_pain_v2", request.technology,
            f"pi_pain_v2:{request.technology.lower().strip()}:{(request.industry or '').lower().strip()}",
            {"pain_points": pain_points, "session_id": session_id,
             "technology": request.technology, "industry": request.industry}
        )
        result_data = {
            "session_id": session_id,
            "technology": request.technology,
            "industry": request.industry,
            "pain_points": pain_points,
            "web_research_used": bool(reddit_context or indeed_context),
            "reddit_posts_found": reddit_context.count("[r/"),
            "indeed_jobs_found": indeed_context.count("[Indeed]"),
        }
        _pi_save_session(session_id, request.technology, request.industry or "",
                         pain_points=result_data)
        return result_data
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"LLM returned invalid JSON: {str(e)[:200]}")
    except Exception as e:
        raise HTTPException(500, f"Pain points generation failed: {str(e)}")

# ── Sub-tab 2: Signal Plans ──────────────────────────────────────────────────

@app.post("/prospect-intel/v2/signal-plans")
async def pi_v2_signal_plans(request: PIV2SignalPlansRequest):
    """Generate per-pain-point signal detection plans with industry-appropriate sources."""
    from market_research import nvidia_chat
    if not request.pain_points:
        raise HTTPException(400, "Pain points list is required")

    session_id = request.session_id or str(_uuid.uuid4())[:8]
    industry = request.industry or "general"
    b2b_kws = ["saas", "software", "logistics", "manufacturing", "construction", "legal", "accounting", "finance", "b2b", "recruitment"]
    is_b2b = any(k in industry.lower() for k in b2b_kws)

    if is_b2b:
        allowed = "LinkedIn (public job search), Indeed (public listings), Glassdoor (public), BuiltWith.com, Google News, Trustpilot, G2, Capterra, Business website, Google Search snippet"
        forbidden = "Facebook, Instagram, Google Reviews, Yelp, TripAdvisor"
    else:
        allowed = "Google Maps, Google Reviews, Google Search snippet, Trustpilot, Business website, Yelp, Yellow Pages, Bark.com, Facebook public page (via Google Search snippet only)"
        forbidden = "G2, Capterra, LinkedIn Jobs (B2B platforms), ThomasNet"

    pain_block = "\n".join([f"{i+1}. {pp.get('title','')}: {pp.get('description','')[:200]}"
                             for i, pp in enumerate(request.pain_points)])
    prompt = f"""You are a B2B signal intelligence analyst for the {industry} industry.
Technology: {request.technology or "the product"}

PAIN POINTS:
{pain_block}

For EACH pain point, create a signal detection plan telling a salesperson EXACTLY where to look and what they will find.

ALLOWED SOURCES for {industry}: {allowed}
FORBIDDEN SOURCES for {industry}: {forbidden}

Return ONLY a valid JSON array:
[
  {{
    "pain_point_title": "exact title from list above",
    "decision_maker": {{
      "job_title": "The specific contact when this signal fires",
      "why": "Why they own this problem in {industry}"
    }},
    "checks": [
      {{
        "check_name": "What you are checking",
        "where_to_look": "Exact URL format or tool",
        "what_to_search": "Exact search term or field name",
        "what_to_check": "Specific HTML element, page section, or visible field",
        "confirmed_if": "Boolean condition — specific and measurable",
        "difficulty": "easy",
        "signal_type": "live_chat",
        "auto_checkable": true
      }}
    ]
  }}
]

signal_type MUST be ONE of: live_chat | booking | contact_form | meta_pixel | google_analytics | cms | crm | manual_google_search | manual_linkedin | manual_review_check | manual_indeed
auto_checkable: true ONLY for signal_type in [live_chat, booking, contact_form, meta_pixel, google_analytics, cms]
Generate 4-6 checks per pain point. At least 2 must be auto_checkable: true."""

    try:
        raw = nvidia_chat(prompt, max_tokens=4000)
        clean = raw.strip()
        clean = _re_pi.sub(r"^```(?:json)?\s*", "", clean)
        clean = _re_pi.sub(r"\s*```$", "", clean)
        signal_plans = json.loads(clean)
        if not isinstance(signal_plans, list):
            raise ValueError("Expected JSON array")
        db_manager.save_market_result(
            "pi_signals_v2", industry,
            f"pi_signals_v2:{industry.lower()}:{session_id}",
            {"signal_plans": signal_plans, "session_id": session_id, "industry": industry}
        )
        if session_id:
            _pi_save_session(session_id, request.technology, request.industry or "",
                             signal_plans=signal_plans)
        return {"session_id": session_id, "signal_plans": signal_plans}
    except json.JSONDecodeError as e:
        raise HTTPException(500, f"Failed to parse signal plans: {str(e)[:200]}")
    except Exception as e:
        raise HTTPException(500, f"Signal plan generation failed: {str(e)}")

# ── Sub-tab 3: Lead Extraction ───────────────────────────────────────────────

_pi_v2_extract_status: dict = {}  # session_id -> {done, progress, error, leads}

@app.post("/prospect-intel/v2/extract-leads")
async def pi_v2_extract_leads(request: PIV2ExtractLeadsRequest, background_tasks: BackgroundTasks):
    """Start lead extraction in background. Poll /prospect-intel/v2/extract-leads/status/{session_id}."""
    if not request.industry or not request.location:
        raise HTTPException(400, "Industry and location are required")
    session_id = request.session_id or str(_uuid.uuid4())[:8]
    _pi_v2_extract_status[session_id] = {"done": False, "progress": "Starting...", "error": None, "leads": [], "source_results": {}}
    background_tasks.add_task(_pi_extract_leads_task, request, session_id)
    return {"session_id": session_id, "message": "Lead extraction started"}

async def _pi_extract_leads_task(request: PIV2ExtractLeadsRequest, session_id: str):
    def log(msg):
        if session_id in _pi_v2_extract_status:
            _pi_v2_extract_status[session_id]["progress"] = msg

    all_leads = []
    source_results = {}
    per_source = max(5, request.num_leads // max(len(request.sources), 1))

    for source in request.sources:
        log(f"Scraping {source}...")
        if source == "Google Maps":
            try:
                q = urllib.parse.quote_plus(f"{request.industry} in {request.location}")
                maps_url = f"https://www.google.com/maps/search/{q}"
                results = await scrape_google_maps(maps_url, per_source + 5)
                normalized = [{
                    "business_name": r.get("Business Name", ""),
                    "website": r.get("Website", ""),
                    "phone": r.get("Phone", ""),
                    "email": r.get("Email", ""),
                    "rating": str(r.get("Rating", "")),
                    "review_count": str(r.get("Reviews", "")),
                    "category": r.get("Industry", request.industry),
                    "location": request.location,
                    "source": "Google Maps",
                } for r in results]
                all_leads.extend(normalized)
                source_results["Google Maps"] = {"count": len(normalized), "status": "success"}
            except Exception as e:
                source_results["Google Maps"] = {"count": 0, "status": f"error: {str(e)[:120]}"}

        elif source == "Yellow Pages":
            try:
                loop = asyncio.get_event_loop()
                yp = await loop.run_in_executor(None, lambda: _pi_yp_sync(request.industry, request.location, per_source))
                all_leads.extend(yp)
                source_results["Yellow Pages"] = {"count": len(yp), "status": "success"}
            except Exception as e:
                source_results["Yellow Pages"] = {"count": 0, "status": f"error: {str(e)[:120]}"}

        elif source == "Companies House UK":
            try:
                loop = asyncio.get_event_loop()
                ch = await loop.run_in_executor(None, lambda: _pi_companies_house_sync(request.industry, request.location, per_source))
                if ch:
                    all_leads.extend(ch)
                    source_results["Companies House UK"] = {"count": len(ch), "status": "success"}
                else:
                    source_results["Companies House UK"] = {"count": 0, "status": "not_configured: set COMPANIES_HOUSE_API_KEY in .env"}
            except Exception as e:
                source_results["Companies House UK"] = {"count": 0, "status": f"error: {str(e)[:120]}"}

        else:
            source_results[source] = {"count": 0, "status": "not_automated: requires authentication or browser automation not yet implemented"}

    # Attempt email extraction for leads missing an email
    log(f"Hunting emails for {len(all_leads)} leads...")
    for lead in all_leads:
        if not lead.get("email") and lead.get("website") and lead["website"] not in ("N/A", ""):
            try:
                wd = _pi_fetch_and_detect(lead["website"])
                if wd.get("emails_found"):
                    lead["email"] = wd["emails_found"][0]
                if not lead.get("email"):
                    for path in ["/contact", "/contact-us", "/about", "/about-us"]:
                        try:
                            url_try = lead["website"].rstrip("/") + path
                            r = requests.get(url_try, timeout=5, headers={"User-Agent": "Mozilla/5.0"})
                            if r.status_code == 200:
                                found = _re_pi.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", r.text)
                                skip = {"sentry.io", "example.com", "schema.org", "w3.org"}
                                valid = [e for e in found if not any(d in e for d in skip)]
                                if valid:
                                    lead["email"] = valid[0]
                                    break
                        except Exception:
                            pass
            except Exception:
                pass

    # Deduplicate by phone AND website domain — flag, don't delete
    log("Deduplicating leads...")
    seen_phones: set = set()
    seen_domains: set = set()
    for lead in all_leads:
        phone_norm = _re_pi.sub(r"[\s\-\(\)\+]", "", lead.get("phone", ""))
        raw_web = lead.get("website", "")
        domain = raw_web.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0].lower()

        is_dup = (bool(phone_norm) and phone_norm in seen_phones) or (bool(domain) and domain in seen_domains)
        lead["is_duplicate"] = is_dup
        lead["status"] = "unanalyzed"
        lead["session_id"] = session_id

        if phone_norm:
            seen_phones.add(phone_norm)
        if domain:
            seen_domains.add(domain)

    # Save to pi_leads table
    try:
        conn = db_manager.get_pg_conn()
        cur = conn.cursor()
        for lead in all_leads:
            cur.execute("""
                INSERT INTO pi_leads (session_id, business_name, website, phone, email, rating,
                    review_count, category, location, source, is_duplicate, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (session_id, lead.get("business_name",""), lead.get("website",""),
                  lead.get("phone",""), lead.get("email",""), lead.get("rating",""),
                  lead.get("review_count",""), lead.get("category",""), lead.get("location",""),
                  lead.get("source",""), lead.get("is_duplicate", False), "unanalyzed"))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[pi_leads_save] {e}")

    _pi_save_session(session_id, leads_count=len(all_leads))
    _pi_v2_extract_status[session_id] = {
        "done": True, "progress": f"Done — {len(all_leads)} leads collected",
        "error": None, "leads": all_leads, "source_results": source_results,
        "unique": len([l for l in all_leads if not l.get("is_duplicate")]),
        "duplicates": len([l for l in all_leads if l.get("is_duplicate")]),
    }

@app.get("/prospect-intel/v2/extract-leads/status/{session_id}")
async def pi_v2_extract_status(session_id: str):
    st = _pi_v2_extract_status.get(session_id)
    if not st:
        raise HTTPException(404, "Session not found")
    return st

# ── Sub-tab 4: Signal Analyzer ───────────────────────────────────────────────

_pi_v2_analyze_status: dict = {}  # session_id -> {done, progress, current, total, leads}

@app.post("/prospect-intel/v2/analyze")
async def pi_v2_analyze(request: PIV2AnalyzeRequest, background_tasks: BackgroundTasks):
    """Start signal analysis in background. Poll /prospect-intel/v2/analyze/status/{session_id}."""
    if not request.leads:
        raise HTTPException(400, "No leads to analyze")
    if not request.signal_plans:
        raise HTTPException(400, "No signal plans provided")
    session_id = request.session_id or str(_uuid.uuid4())[:8]
    _pi_v2_analyze_status[session_id] = {
        "done": False, "progress": "Starting...", "current": 0,
        "total": len(request.leads), "leads": [], "error": None,
    }
    background_tasks.add_task(_pi_analyze_task, request, session_id)
    return {"session_id": session_id, "message": "Signal analysis started", "total": len(request.leads)}

async def _pi_analyze_task(request: PIV2AnalyzeRequest, session_id: str):
    from market_research import nvidia_chat

    def log(msg, current=None, total=None):
        entry = _pi_v2_analyze_status.get(session_id, {})
        entry["progress"] = msg
        if current is not None:
            entry["current"] = current
        if total is not None:
            entry["total"] = total
        _pi_v2_analyze_status[session_id] = entry

    analyzed = []
    total = len(request.leads)

    for idx, lead in enumerate(request.leads, 1):
        website = lead.get("website") or lead.get("Website") or ""
        name = lead.get("business_name") or lead.get("Business Name") or ""
        log(f"[{idx}/{total}] Checking {name or website or 'unknown'}...", current=idx, total=total)

        # Real HTTP fetch
        website_data = _pi_fetch_and_detect(website) if (website and website not in ("N/A", "")) else {"fetched": False, "error": "No website"}

        # BuiltWith check
        builtwith_data = {}
        if website and website not in ("N/A", ""):
            domain = website.replace("https://", "").replace("http://", "").split("/")[0]
            builtwith_data = _pi_check_builtwith(domain)

        # Evaluate every check from every signal plan
        all_checks = []
        confirmed_count = 0
        checkable_count = 0

        for plan in request.signal_plans:
            pain_title = plan.get("pain_point_title") or plan.get("pain_point", "")
            dm = plan.get("decision_maker", {})
            for chk in plan.get("checks", []):
                result = _pi_evaluate_signal(chk, website_data, builtwith_data)
                all_checks.append({
                    "pain_point": pain_title,
                    "check_name": chk.get("check_name", ""),
                    "where_to_look": chk.get("where_to_look", ""),
                    "what_to_search": chk.get("what_to_search", ""),
                    "confirmed_if": chk.get("confirmed_if", ""),
                    "confirmed": result["confirmed"],
                    "evidence": result["evidence"],
                    "check_method": result["check_method"],
                    "was_checkable": result["was_checkable"],
                    "difficulty": chk.get("difficulty", ""),
                    "signal_type": chk.get("signal_type", ""),
                    "decision_maker": dm,
                })
                if result["was_checkable"]:
                    checkable_count += 1
                    if result["confirmed"] == "yes":
                        confirmed_count += 1

        confidence_rate = round(confirmed_count / checkable_count * 100) if checkable_count > 0 else 0

        # LLM: current_process and after_chatbot based on REAL evidence
        current_process = ""
        after_tech = ""
        try:
            confirmed_evidence = [c for c in all_checks if c["confirmed"] == "yes"]
            if confirmed_evidence:
                ev_block = "\n".join([f"- {c['check_name']}: {c['evidence']}" for c in confirmed_evidence[:5]])
                lm_resp = nvidia_chat(
                    f"Business: {name} ({request.industry})\nTechnology: {request.technology or 'AI automation'}\nConfirmed signals:\n{ev_block}\n\nIn 1 sentence each:\nCURRENT: What is this business doing TODAY to handle this (specific, not generic)\nAFTER: What changes immediately when they implement {request.technology or 'the technology'}",
                    max_tokens=150
                )
                m1 = _re_pi.search(r"CURRENT:\s*(.+)", lm_resp)
                m2 = _re_pi.search(r"AFTER:\s*(.+)", lm_resp)
                if m1:
                    current_process = m1.group(1).strip()
                if m2:
                    after_tech = m2.group(1).strip()
        except Exception:
            pass

        # Decision maker: from first plan that has confirmed signals
        dm_contact = ""
        for c in all_checks:
            if c["confirmed"] == "yes" and c.get("decision_maker", {}).get("job_title"):
                dm_contact = c["decision_maker"]["job_title"]
                break
        if not dm_contact and request.signal_plans:
            dm_contact = request.signal_plans[0].get("decision_maker", {}).get("job_title", "")

        email_val = (lead.get("email") or lead.get("Email") or
                     (website_data.get("emails_found", [None])[0] if website_data.get("emails_found") else ""))

        analyzed_lead = {
            "business_name": name,
            "website": website,
            "phone": lead.get("phone") or lead.get("Phone", ""),
            "email": email_val,
            "rating": lead.get("rating") or lead.get("Rating", ""),
            "review_count": lead.get("review_count") or lead.get("Reviews", ""),
            "category": lead.get("category") or lead.get("Category") or lead.get("Industry", ""),
            "location": lead.get("location") or lead.get("City", ""),
            "signal_score": confidence_rate,
            "confidence_rate": confidence_rate,
            "confirmed_checks": confirmed_count,
            "total_checkable": checkable_count,
            "total_checks": len(all_checks),
            "signal_evidence": all_checks,
            "current_process": current_process,
            "after_chatbot": after_tech,
            "decision_maker": dm_contact,
            "outreach_status": "not_contacted",
            "website_fetch_status": ("success" if website_data.get("fetched") else website_data.get("error", "not checked")),
            "tech_detected": {
                "live_chat": website_data.get("live_chat", []),
                "booking": website_data.get("booking", []),
                "cms": website_data.get("cms", []),
                "meta_pixel": website_data.get("meta_pixel", False),
                "google_analytics": website_data.get("google_analytics", False),
            },
        }
        analyzed.append(analyzed_lead)

        # Save incrementally to DB
        try:
            conn = db_manager.get_pg_conn()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO pi_analyzed (session_id, business_name, website, phone, email,
                    signal_score, confidence_rate, signal_evidence, current_process, after_chatbot, decision_maker)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s)
            """, (session_id, analyzed_lead["business_name"], analyzed_lead["website"],
                  analyzed_lead["phone"], analyzed_lead["email"],
                  analyzed_lead["signal_score"], analyzed_lead["confidence_rate"],
                  json.dumps(analyzed_lead["signal_evidence"]),
                  analyzed_lead["current_process"], analyzed_lead["after_chatbot"],
                  analyzed_lead["decision_maker"]))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[pi_analyzed_save] {e}")

        _pi_v2_analyze_status[session_id]["leads"] = analyzed

    _pi_v2_analyze_status[session_id]["done"] = True
    _pi_v2_analyze_status[session_id]["progress"] = f"Complete — {len(analyzed)} leads analyzed"
    _pi_save_session(session_id, analyzed_count=len(analyzed))

@app.get("/prospect-intel/v2/analyze/status/{session_id}")
async def pi_v2_analyze_status_check(session_id: str):
    st = _pi_v2_analyze_status.get(session_id)
    if not st:
        raise HTTPException(404, "Session not found")
    return st

@app.get("/prospect-intel/v2/leads/{session_id}")
async def pi_v2_get_leads(session_id: str):
    try:
        import psycopg2.extras
        conn = db_manager.get_pg_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM pi_leads WHERE session_id = %s ORDER BY id DESC", (session_id,))
        leads = [dict(r) for r in cur.fetchall()]
        conn.close()
        return {"session_id": session_id, "leads": leads}
    except Exception as e:
        raise HTTPException(500, f"Error fetching leads: {str(e)}")

@app.get("/prospect-intel/v2/analyzed/{session_id}")
async def pi_v2_get_analyzed(session_id: str):
    try:
        import psycopg2.extras
        conn = db_manager.get_pg_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM pi_analyzed WHERE session_id = %s ORDER BY signal_score DESC", (session_id,))
        results = [dict(r) for r in cur.fetchall()]
        conn.close()
        return {"session_id": session_id, "results": results}
    except Exception as e:
        raise HTTPException(500, f"Error fetching analyzed results: {str(e)}")

@app.get("/prospect-intel/v2/history")
async def pi_v2_history():
    """List all PI sessions ordered by most recent, up to 50."""
    try:
        import psycopg2.extras
        conn = db_manager.get_pg_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT session_id, technology, industry, leads_count, analyzed_count,
                   created_at, updated_at
            FROM pi_sessions ORDER BY updated_at DESC LIMIT 50
        """)
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        for r in rows:
            r["created_at"] = str(r["created_at"])
            r["updated_at"] = str(r["updated_at"])
        return rows
    except Exception as e:
        print(f"[pi_history] {e}")
        return []

@app.get("/prospect-intel/v2/session/{session_id}")
async def pi_v2_load_session(session_id: str):
    """Load a full PI session — pain data, signal plans, plus lead/analyzed counts."""
    try:
        import psycopg2.extras
        conn = db_manager.get_pg_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM pi_sessions WHERE session_id = %s", (session_id,))
        row = cur.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        return {
            "session_id": row["session_id"],
            "technology": row["technology"],
            "industry": row["industry"],
            "pain_data": _json.loads(row["pain_points_json"] or '{}'),
            "signal_plans": _json.loads(row["signal_plans_json"] or '[]'),
            "leads_count": row["leads_count"],
            "analyzed_count": row["analyzed_count"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    db_manager.init_db()
    port = int(os.getenv("PORT", 8000))
    print(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
