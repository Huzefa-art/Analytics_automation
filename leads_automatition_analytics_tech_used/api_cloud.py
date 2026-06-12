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

if __name__ == "__main__":
    import uvicorn
    db_manager.init_db()
    port = int(os.getenv("PORT", 8000))
    print(f"Starting server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
