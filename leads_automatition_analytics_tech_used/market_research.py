import os
import json
import re as _re
import time
import hashlib
import feedparser
import requests
import urllib.parse
from datetime import datetime, timezone
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

load_dotenv()

# Fix duplicated key value in .env (value may be "nvapi-xxx=nvapi-xxx")
_raw_key = os.getenv("nvidia_api_key", "")
NVIDIA_API_KEY = _raw_key.split("=")[0].strip() if "=" in _raw_key else _raw_key.strip()

SERP_API_KEY = os.getenv("serp_api", "").strip()

import db_manager as _db

router = APIRouter(prefix="/market", tags=["market_research"])

# ─── In-memory cache (short-lived, for deduplication within same session) ────
_session_cache: dict = {}
SESSION_TTL = 300  # 5 min — just prevents double-firing on same request

def _session_key(prefix: str, industry: str, problem: str) -> str:
    raw = f"{prefix}:{industry}:{problem}".lower()
    return hashlib.md5(raw.encode()).hexdigest()

def _session_get(key: str):
    entry = _session_cache.get(key)
    if entry and (time.time() - entry["ts"]) < SESSION_TTL:
        return entry["data"]
    return None

def _session_set(key: str, data):
    _session_cache[key] = {"ts": time.time(), "data": data}

# ─── Request model ────────────────────────────────────────────────────────────
class ResearchRequest(BaseModel):
    industry: str
    problem: Optional[str] = ""

# ─── NVIDIA helper ────────────────────────────────────────────────────────────
def nvidia_chat(prompt: str, max_tokens: int = 1024) -> str:
    if not NVIDIA_API_KEY:
        return "NVIDIA API key not configured."
    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "meta/llama-3.1-8b-instruct",
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.3,
    }
    try:
        r = requests.post(url, headers=headers, json=payload, timeout=60)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"NVIDIA API error: {str(e)}"

# ─── Arctic Shift API (Reddit, no auth) ──────────────────────────────────────

# Industry → specific subreddits for targeted Arctic Shift queries
REDDIT_INDUSTRY_SUBS: dict = {
    "restaurants":        ["restaurantowners", "KitchenConfidential", "serverlife", "bartenders", "ChefTalk"],
    "restaurant":         ["restaurantowners", "KitchenConfidential", "serverlife", "bartenders", "ChefTalk"],
    "food":               ["restaurantowners", "KitchenConfidential", "food", "foodservice", "ChefTalk"],
    "saas":               ["SaaS", "startups", "entrepreneur", "ProductManagement", "webdev"],
    "software":           ["SaaS", "startups", "webdev", "programming", "ProductManagement"],
    "ecommerce":          ["ecommerce", "shopify", "entrepreneur", "smallbusiness", "Flipping"],
    "retail":             ["retailhell", "smallbusiness", "entrepreneur", "Flipping", "ecommerce"],
    "fitness":            ["gym", "personaltraining", "fitness", "entrepreneur", "smallbusiness"],
    "healthcare":         ["medicine", "nursing", "healthIT", "entrepreneur", "smallbusiness"],
    "real estate":        ["realestate", "realtors", "landlord", "PropertyManagement", "smallbusiness"],
    "marketing":          ["marketing", "digital_marketing", "PPC", "SEO", "entrepreneur"],
    "hr":                 ["humanresources", "recruiting", "jobs", "careerguidance", "smallbusiness"],
    "logistics":          ["logistics", "supplychain", "trucking", "smallbusiness", "entrepreneur"],
    "education":          ["Teachers", "education", "edtech", "highereducation", "smallbusiness"],
    "finance":            ["personalfinance", "fintech", "smallbusiness", "entrepreneur", "accounting"],
}
REDDIT_DEFAULT_SUBS = ["entrepreneur", "smallbusiness", "startups", "business", "productivity"]

# Negative/positive word-boundary patterns
_NEG_WORDS = [
    "hate", "broken", "terrible", "worst", "frustrated", "frustrating",
    "annoying", "nightmare", "failing", "failed", "impossible", "struggling",
    "painful", "useless", "awful", "horrible", "disaster", "ridiculous",
    "waste", "scam", "overpriced", "unreliable", "buggy", "crashes",
    "slow", "confusing", "complicated", "outdated", "expensive",
]
_POS_WORDS = [
    "love", "great", "amazing", "excellent", "perfect", "awesome",
    "fantastic", "brilliant", "outstanding", "superb", "best",
]
_NEG_PATTERNS = [_re.compile(r'\b' + w + r'\b', _re.IGNORECASE) for w in _NEG_WORDS]
_POS_PATTERNS = [_re.compile(r'\b' + w + r'\b', _re.IGNORECASE) for w in _POS_WORDS]
_PAIN_SEARCH_TERMS = ["problem", "frustrated", "issue", "broken", "hate", "struggle"]


def _sentiment(text: str) -> str:
    neg_score = sum(1 for p in _NEG_PATTERNS if p.search(text))
    pos_score = sum(1 for p in _POS_PATTERNS if p.search(text))
    if neg_score > pos_score:
        return "negative"
    if pos_score > neg_score:
        return "positive"
    if any(_re.search(r'\b' + kw + r'\b', text, _re.IGNORECASE)
           for kw in ["problem", "issue", "broken", "fail", "hate"]):
        return "negative"
    return "neutral"


def _is_relevant(text: str, industry: str, problem: str) -> bool:
    t = text.lower()
    terms = [industry.lower()] + [w for w in industry.lower().split() if len(w) > 3]
    if problem:
        terms += [problem.lower()] + [w for w in problem.lower().split() if len(w) > 3]
    expanded = set(terms)
    for term in list(terms):
        if term.endswith("s") and len(term) > 4:
            expanded.add(term[:-1])
        else:
            expanded.add(term + "s")
    return any(term in t for term in expanded)


def _get_subreddits(industry: str) -> list:
    key = industry.lower().strip()
    if key in REDDIT_INDUSTRY_SUBS:
        return REDDIT_INDUSTRY_SUBS[key]
    for k, subs in REDDIT_INDUSTRY_SUBS.items():
        if k in key or key in k:
            return subs
    return REDDIT_DEFAULT_SUBS


ARCTIC_SHIFT_BASE = "https://arctic-shift.photon-reddit.com/api"

def fetch_arctic_shift(industry: str, problem: str) -> list:
    """Fetch Reddit posts via Arctic Shift API — no auth required.
    Rules discovered from API:
    - param is 'query' (not 'q')
    - 'query' REQUIRES 'subreddit' or 'author' to be set
    - 'sort' only accepts 'asc' or 'desc'
    Strategy: query each industry subreddit with pain keywords.
    """
    base_query = f"{industry} {problem}".strip() if problem else industry
    subreddits = _get_subreddits(industry)
    items = []
    seen_ids = set()

    for sub in subreddits:
        for search_kw in _PAIN_SEARCH_TERMS[:2]:  # 2 pain terms per sub
            full_query = f"{base_query} {search_kw}"
            url = (
                f"{ARCTIC_SHIFT_BASE}/posts/search"
                f"?query={urllib.parse.quote(full_query)}"
                f"&subreddit={sub}"
                f"&limit=20&sort=desc"
            )
            try:
                r = requests.get(url, timeout=15, headers={"User-Agent": "MarketResearchBot/1.0"})
                r.raise_for_status()
                posts = r.json().get("data") or []
                for post in posts:
                    pid = post.get("id", "")
                    if pid in seen_ids:
                        continue
                    seen_ids.add(pid)
                    title = post.get("title", "")
                    body  = post.get("selftext", "") or ""
                    if body.strip() in ("[removed]", "[deleted]", ""):
                        body = ""
                    text = f"{title}. {body}"[:500]
                    text = _re.sub(r"\s+", " ", text).strip()
                    if not _is_relevant(text, industry, problem):
                        continue
                    permalink = post.get("permalink", "")
                    link = f"https://reddit.com{permalink}" if permalink else f"https://reddit.com/r/{sub}"
                    created = post.get("created_utc", "")
                    try:
                        date = datetime.utcfromtimestamp(float(created)).strftime("%Y-%m-%d") if created else datetime.now().strftime("%Y-%m-%d")
                    except Exception:
                        date = datetime.now().strftime("%Y-%m-%d")
                    items.append({
                        "quote": text,
                        "source": f"Reddit r/{sub} (via Arctic Shift)",
                        "url": link,
                        "date": date,
                        "sentiment": _sentiment(text),
                        "raw_text": text,
                    })
            except Exception:
                continue
            time.sleep(0.2)

        # Also fetch recent posts from the subreddit without a query filter
        url_recent = (
            f"{ARCTIC_SHIFT_BASE}/posts/search"
            f"?subreddit={sub}&limit=15&sort=desc"
        )
        try:
            r = requests.get(url_recent, timeout=15, headers={"User-Agent": "MarketResearchBot/1.0"})
            r.raise_for_status()
            posts = r.json().get("data") or []
            for post in posts:
                pid = post.get("id", "")
                if pid in seen_ids:
                    continue
                seen_ids.add(pid)
                title = post.get("title", "")
                body  = post.get("selftext", "") or ""
                if body.strip() in ("[removed]", "[deleted]", ""):
                    body = ""
                text = f"{title}. {body}"[:500]
                text = _re.sub(r"\s+", " ", text).strip()
                if not _is_relevant(text, industry, problem):
                    continue
                permalink = post.get("permalink", "")
                link = f"https://reddit.com{permalink}" if permalink else f"https://reddit.com/r/{sub}"
                created = post.get("created_utc", "")
                try:
                    date = datetime.utcfromtimestamp(float(created)).strftime("%Y-%m-%d") if created else datetime.now().strftime("%Y-%m-%d")
                except Exception:
                    date = datetime.now().strftime("%Y-%m-%d")
                items.append({
                    "quote": text,
                    "source": f"Reddit r/{sub} (via Arctic Shift)",
                    "url": link,
                    "date": date,
                    "sentiment": _sentiment(text),
                    "raw_text": text,
                })
        except Exception:
            continue
        time.sleep(0.2)

    return items


# ─── SerpAPI (Google search scraping) ────────────────────────────────────────

# Words that indicate entertainment/irrelevant results — skip these
_SERP_EXCLUDE = [
    "sims", "game", "tv show", "season", "episode", "movie", "film",
    "netflix", "hulu", "disney", "anime", "manga", "playstation", "xbox",
    "steam", "twitch", "youtube channel", "trailer", "cast", "actor",
]

def _is_entertainment(text: str) -> bool:
    t = text.lower()
    return any(excl in t for excl in _SERP_EXCLUDE)


def fetch_serp(industry: str, problem: str) -> list:
    """Fetch Google search results via SerpAPI for pain point signals."""
    if not SERP_API_KEY:
        return []

    queries = [
        f"{industry} problems complaints",
        f"{industry} {problem} issues" if problem else f"{industry} biggest challenges",
        f'"{industry}" "frustrated" OR "broken" OR "doesn\'t work"',
    ]
    items = []
    seen_urls = set()

    for q in queries:
        params = {
            "engine": "google",
            "q": q,
            "api_key": SERP_API_KEY,
            "num": 10,
            "hl": "en",
        }
        try:
            r = requests.get("https://serpapi.com/search", params=params, timeout=20)
            r.raise_for_status()
            data = r.json()

            # Organic results
            for result in data.get("organic_results", []):
                url = result.get("link", "")
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                title   = result.get("title", "")
                snippet = result.get("snippet", "")
                text    = f"{title}. {snippet}"[:500]
                if not _is_relevant(text, industry, problem):
                    continue
                if _is_entertainment(text):
                    continue
                items.append({
                    "quote": text,
                    "source": "Google Search (via SerpAPI)",
                    "url": url,
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "sentiment": _sentiment(text),
                    "raw_text": text,
                })

            # People Also Ask
            for paa in data.get("related_questions", []):
                question = paa.get("question", "")
                answer   = paa.get("snippet", "")
                text     = f"{question} {answer}"[:400]
                if not _is_relevant(text, industry, problem):
                    continue
                if _is_entertainment(text):
                    continue
                link = paa.get("link", "https://google.com")
                if link in seen_urls:
                    continue
                seen_urls.add(link)
                items.append({
                    "quote": text,
                    "source": "Google People Also Ask (via SerpAPI)",
                    "url": link,
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "sentiment": _sentiment(text),
                    "raw_text": text,
                })
        except Exception:
            continue
        time.sleep(0.3)

    return items

# ─── Hacker News helper ───────────────────────────────────────────────────────
# Only posts on or after Jan 1 2023
_HN_CUTOFF_TS = 1672531200  # 2023-01-01 00:00:00 UTC

def fetch_hn(industry: str, problem: str) -> list:
    query = urllib.parse.quote(f"{industry} {problem}".strip())
    url = f"https://hn.algolia.com/api/v1/search?query={query}&tags=story&hitsPerPage=50"
    items = []
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        hits = r.json().get("hits", [])
        for h in hits:
            # Strict recency filter using integer unix timestamp
            ts_int = h.get("created_at_i", 0)
            if ts_int < _HN_CUTOFF_TS:
                continue
            title  = h.get("title", "")
            text   = (h.get("story_text") or title)[:400]
            hn_id  = h.get("objectID", "")
            link   = f"https://news.ycombinator.com/item?id={hn_id}"
            ts_str = h.get("created_at", "")
            date   = ts_str[:10] if ts_str else datetime.now().strftime("%Y-%m-%d")
            items.append({
                "quote": text,
                "source": "Hacker News",
                "url": link,
                "date": date,
                "sentiment": _sentiment(text),
                "raw_text": text,
            })
    except Exception:
        pass
    return items

# ─── App Store RSS helper ─────────────────────────────────────────────────────
APP_STORE_APPS = {
    "restaurants": [("284910350", "OpenTable"), ("1091793095", "Toast POS")],
    "default": [("544007664", "Yelp"), ("284910350", "OpenTable")],
}

def fetch_appstore_reviews(industry: str) -> list:
    apps = APP_STORE_APPS.get(industry.lower(), APP_STORE_APPS["default"])
    items = []
    for app_id, app_name in apps:
        url = f"https://itunes.apple.com/us/rss/customerreviews/id={app_id}/sortBy=mostRecent/xml"
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:10]:
                rating_tag = entry.get("im_rating", "5")
                try:
                    rating = int(rating_tag)
                except Exception:
                    rating = 5
                if rating <= 2:
                    text = entry.get("summary", entry.get("title", ""))[:400]
                    link = entry.get("link", f"https://apps.apple.com/app/id{app_id}")
                    published = entry.get("published", "")
                    items.append({
                        "quote": text,
                        "source": f"App Store — {app_name}",
                        "url": link,
                        "date": published[:10] if published else datetime.now().strftime("%Y-%m-%d"),
                        "sentiment": "negative",
                        "raw_text": text,
                    })
        except Exception:
            continue
    return items

# ─── Google Trends helper ─────────────────────────────────────────────────────
def fetch_google_trends(industry: str, problem: str) -> dict:
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 25))
        kw = f"{industry} {problem}".strip() if problem else industry
        pytrends.build_payload([kw], cat=0, timeframe="today 12-m", geo="", gprop="")
        interest = pytrends.interest_over_time()
        related_raw = pytrends.related_queries()

        trend_data = []
        if not interest.empty:
            for date, row in interest.iterrows():
                trend_data.append({"date": str(date)[:10], "value": int(row[kw])})

        rising = []
        if related_raw and kw in related_raw:
            rising_df = related_raw[kw].get("rising")
            if rising_df is not None and not rising_df.empty:
                for _, r in rising_df.head(10).iterrows():
                    rising.append({"query": r["query"], "value": str(r["value"])})

        return {"trend_data": trend_data, "rising_queries": rising, "keyword": kw}
    except Exception as e:
        return {"trend_data": [], "rising_queries": [], "keyword": industry, "error": str(e)}

# ─── Wikipedia market size helper ─────────────────────────────────────────────
def fetch_wikipedia_summary(industry: str) -> dict:
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(industry)}"
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        data = r.json()
        return {
            "title": data.get("title", industry),
            "extract": data.get("extract", "")[:600],
            "url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
            "source": "Wikipedia",
        }
    except Exception:
        return {"title": industry, "extract": "", "url": "", "source": "Wikipedia"}

# ─── NVIDIA clustering for pain points ───────────────────────────────────────
def cluster_pain_points(items: list, industry: str) -> list:
    if not items:
        return []
    snippets = "\n".join([f"- {it['quote'][:200]}" for it in items[:30]])
    prompt = f"""You are a market research analyst. Below are raw complaints and pain points about the {industry} industry.

Group them into 5-8 distinct pain point themes. For each theme return:
1. A short theme title (max 6 words)
2. A one-sentence description of the core problem
3. The indices (0-based) of the items that belong to this theme

Items:
{snippets}

Respond ONLY with valid JSON array like:
[
  {{"theme": "...", "description": "...", "indices": [0, 2, 5]}},
  ...
]"""
    raw = nvidia_chat(prompt, max_tokens=800)
    try:
        json_match = _re.search(r'\[.*\]', raw, _re.DOTALL)
        if json_match:
            clusters = json.loads(json_match.group())
            result = []
            for c in clusters:
                theme_items = [items[i] for i in c.get("indices", []) if i < len(items)]
                if theme_items:
                    result.append({
                        "theme": c.get("theme", "Unknown Theme"),
                        "description": c.get("description", ""),
                        "items": theme_items,
                    })
            return result
    except Exception:
        pass
    # Fallback: return all as one group
    return [{"theme": f"{industry} Pain Points", "description": "Collected complaints and issues", "items": items}]

# ─── NVIDIA audience summarizer ───────────────────────────────────────────────
def analyze_audience(items: list, industry: str) -> dict:
    if not items:
        return {}
    snippets = "\n".join([f"- {it['quote'][:200]}" for it in items[:25]])
    prompt = f"""Analyze these posts from the {industry} industry and extract audience intelligence.

Posts:
{snippets}

Return ONLY valid JSON with this structure:
{{
  "job_titles": ["list of likely job titles/roles mentioned or implied"],
  "company_sizes": ["Small Business", "Mid-Market", "Enterprise"],
  "communities": ["list of subreddits, forums, or platforms mentioned"],
  "language_phrases": ["exact phrases and words they use to describe problems"],
  "seniority_levels": ["Owner", "Manager", "Employee", "C-Suite"],
  "summary": "2-sentence summary of who has this problem"
}}"""
    raw = nvidia_chat(prompt, max_tokens=600)
    try:
        json_match = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception:
        pass
    return {"summary": raw, "job_titles": [], "communities": [], "language_phrases": []}

# ─── NVIDIA validation scorer ─────────────────────────────────────────────────
def score_validation(industry: str, problem: str, pain_count: int,
                     trend_data: list, rising_queries: list, audience: dict) -> dict:
    trend_summary = "No trend data available."
    if trend_data:
        vals = [d["value"] for d in trend_data]
        avg = sum(vals) / len(vals) if vals else 0
        recent = vals[-3:] if len(vals) >= 3 else vals
        recent_avg = sum(recent) / len(recent) if recent else 0
        trend_summary = f"Average interest: {avg:.0f}/100. Recent 3-month avg: {recent_avg:.0f}/100."

    rising_str = ", ".join([q["query"] for q in rising_queries[:5]]) if rising_queries else "none"
    audience_str = json.dumps(audience, indent=2)[:400] if audience else "{}"

    prompt = f"""You are a startup market validation expert. Analyze this market opportunity:

Industry: {industry}
Problem area: {problem or 'general'}
Pain points found: {pain_count} complaints across Reddit, Hacker News, App Store
Google Trends: {trend_summary}
Rising search queries: {rising_str}
Audience data: {audience_str}

Score each dimension from 1-10 and explain why. Return ONLY valid JSON:
{{
  "pain_intensity": {{
    "score": 7,
    "explanation": "..."
  }},
  "market_size": {{
    "score": 6,
    "explanation": "..."
  }},
  "competition_density": {{
    "score": 5,
    "explanation": "..."
  }},
  "overall_opportunity": {{
    "score": 7,
    "explanation": "..."
  }},
  "summary": "2-3 sentence AI written market summary paragraph",
  "recommendation": "pursue",
  "recommendation_reason": "..."
}}

recommendation must be one of: "pursue", "research more", "avoid"
"""
    raw = nvidia_chat(prompt, max_tokens=900)
    try:
        json_match = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception:
        pass
    return {
        "pain_intensity": {"score": 0, "explanation": "Analysis failed"},
        "market_size": {"score": 0, "explanation": "Analysis failed"},
        "competition_density": {"score": 0, "explanation": "Analysis failed"},
        "overall_opportunity": {"score": 0, "explanation": "Analysis failed"},
        "summary": raw,
        "recommendation": "research more",
        "recommendation_reason": "Could not complete automated analysis.",
    }

# ═══════════════════════════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/pain-points")
async def get_pain_points(req: ResearchRequest):
    # 1. Check session cache (prevents double-fire)
    sk = _session_key("pain", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    # 2. Check SQLite persistent cache
    saved = _db.load_market_result("pain", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    arctic_items   = fetch_arctic_shift(req.industry, req.problem or "")
    serp_items     = fetch_serp(req.industry, req.problem or "")
    hn_items       = fetch_hn(req.industry, req.problem or "")
    appstore_items = fetch_appstore_reviews(req.industry)

    all_items = arctic_items + serp_items + hn_items + appstore_items
    clusters  = cluster_pain_points(all_items, req.industry)

    result = {
        "clusters": clusters,
        "total_sources": len(all_items),
        "source_breakdown": {
            "reddit_arctic_shift": len(arctic_items),
            "google_serp":         len(serp_items),
            "hacker_news":         len(hn_items),
            "app_store":           len(appstore_items),
        },
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("pain", req.industry, req.problem or "", result)
    _session_set(sk, result)
    return result


@router.post("/market-overview")
async def get_market_overview(req: ResearchRequest):
    sk = _session_key("overview", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    saved = _db.load_market_result("overview", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    trends = fetch_google_trends(req.industry, req.problem or "")
    wiki   = fetch_wikipedia_summary(req.industry)
    hn_items = fetch_hn(req.industry, "")

    top_companies = []
    for h in hn_items[:8]:
        top_companies.append({
            "name": h["quote"][:80], "source": h["source"],
            "url": h["url"], "date": h["date"],
        })

    result = {
        "trends": trends,
        "wikipedia": wiki,
        "top_discussions": top_companies,
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("overview", req.industry, req.problem or "", result)
    _session_set(sk, result)
    return result


@router.post("/opportunities")
async def get_opportunities(req: ResearchRequest):
    sk = _session_key("opp", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    saved = _db.load_market_result("opp", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    trends   = fetch_google_trends(req.industry, req.problem or "")
    hn_items = fetch_hn(req.industry, "opportunity OR solution OR startup")

    opp_cards = []
    for h in hn_items[:10]:
        opp_cards.append({
            "title": h["quote"][:100], "source": h["source"],
            "url": h["url"], "date": h["date"], "sentiment": h["sentiment"],
        })

    result = {
        "trends": trends,
        "opportunity_cards": opp_cards,
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("opp", req.industry, req.problem or "", result)
    _session_set(sk, result)
    return result


@router.post("/audience")
async def get_audience(req: ResearchRequest):
    sk = _session_key("audience", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    saved = _db.load_market_result("audience", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    arctic_items = fetch_arctic_shift(req.industry, req.problem or "")
    hn_items     = fetch_hn(req.industry, req.problem or "")
    all_items    = arctic_items + hn_items

    audience    = analyze_audience(all_items, req.industry)
    communities = list({item["source"] for item in all_items})

    result = {
        "audience_intel": audience,
        "communities": communities,
        "raw_sources": [{"quote": i["quote"][:150], "source": i["source"],
                         "url": i["url"], "date": i["date"]} for i in all_items[:20]],
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("audience", req.industry, req.problem or "", result)
    _session_set(sk, result)
    return result


@router.post("/validation")
async def get_validation(req: ResearchRequest):
    sk = _session_key("validation", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    saved = _db.load_market_result("validation", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    arctic_items   = fetch_arctic_shift(req.industry, req.problem or "")
    serp_items     = fetch_serp(req.industry, req.problem or "")
    hn_items       = fetch_hn(req.industry, req.problem or "")
    appstore_items = fetch_appstore_reviews(req.industry)
    all_pain       = arctic_items + serp_items + hn_items + appstore_items

    trends   = fetch_google_trends(req.industry, req.problem or "")
    audience = analyze_audience(all_pain, req.industry)

    scores = score_validation(
        industry=req.industry,
        problem=req.problem or "",
        pain_count=len(all_pain),
        trend_data=trends.get("trend_data", []),
        rising_queries=trends.get("rising_queries", []),
        audience=audience,
    )

    result = {
        "scores": scores,
        "data_sources_used": {
            "reddit_posts_arctic_shift": len(arctic_items),
            "google_serp_results":       len(serp_items),
            "hn_posts":                  len(hn_items),
            "app_reviews":               len(appstore_items),
            "trend_data_points":         len(trends.get("trend_data", [])),
        },
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("validation", req.industry, req.problem or "", result)
    _session_set(sk, result)
    return result


@router.get("/saved-searches")
async def get_saved_searches():
    """List all saved market research searches from SQLite."""
    return _db.list_market_searches()


@router.get("/saved-searches/{tab}/{cache_key}")
async def load_saved_search(tab: str, cache_key: str):
    """Load a specific saved result by cache key."""
    conn = _db.get_db_connection()
    try:
        _db.init_market_cache_table()
        import sqlite3
        cursor = conn.cursor()
        cursor.execute(
            "SELECT result_json FROM market_research_cache WHERE cache_key = ?",
            (cache_key,)
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Saved search not found")
        import json
        return json.loads(row["result_json"])
    finally:
        conn.close()


@router.delete("/saved-searches/{cache_key}")
async def delete_saved_search(cache_key: str):
    """Delete a saved search by cache key."""
    deleted = _db.delete_market_result(cache_key)
    if not deleted:
        raise HTTPException(status_code=404, detail="Search not found")
    return {"message": "Deleted successfully"}


@router.delete("/saved-searches")
async def clear_all_saved_searches():
    """Delete ALL saved market research results."""
    conn = _db.get_db_connection()
    try:
        _db.init_market_cache_table()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM market_research_cache")
        conn.commit()
        return {"message": f"Cleared {cursor.rowcount} saved searches"}
    finally:
        conn.close()


@router.post("/refresh/{tab}")
async def refresh_tab(tab: str, req: ResearchRequest):
    """Force re-fetch a tab by deleting its saved result first, then re-running."""
    # Delete from SQLite so the endpoint re-fetches fresh data
    raw = f"{tab}:{req.industry.lower()}:{(req.problem or '').lower()}"
    import hashlib, json
    key = hashlib.md5(raw.encode()).hexdigest()
    _db.delete_market_result(key)
    # Also clear session cache
    sk = _session_key(tab, req.industry, req.problem or "")
    _session_cache.pop(sk, None)
    return {"message": f"Cache cleared for {tab} — {req.industry}. Re-submit to fetch fresh data."}
