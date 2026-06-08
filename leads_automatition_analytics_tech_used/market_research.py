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
        import pandas as pd
        pd.set_option('future.no_silent_downcasting', True)
        pytrends = TrendReq(hl="en-US", tz=360, timeout=(10, 35), retries=2, backoff_factor=0.5)
        kw = f"{industry} {problem}".strip() if problem else industry
        pytrends.build_payload([kw], cat=0, timeframe="today 12-m", geo="", gprop="")
        interest = pytrends.interest_over_time()
        related_raw = pytrends.related_queries()

        trend_data = []
        if not interest.empty and kw in interest.columns:
            for date, row in interest.iterrows():
                trend_data.append({"date": str(date)[:10], "value": int(row[kw])})

        # Compute trend signal: rising / falling / stable
        trend_signal = "stable"
        if len(trend_data) >= 8:
            first_half = [d["value"] for d in trend_data[:len(trend_data)//2]]
            second_half = [d["value"] for d in trend_data[len(trend_data)//2:]]
            avg_first = sum(first_half) / len(first_half) if first_half else 0
            avg_second = sum(second_half) / len(second_half) if second_half else 0
            if avg_second > avg_first * 1.1:
                trend_signal = "rising"
            elif avg_second < avg_first * 0.9:
                trend_signal = "falling"

        rising = []
        if related_raw and kw in related_raw:
            rising_df = related_raw[kw].get("rising")
            if rising_df is not None and not rising_df.empty:
                for _, r in rising_df.head(10).iterrows():
                    rising.append({"query": r["query"], "value": str(r["value"])})

        return {
            "trend_data": trend_data,
            "rising_queries": rising,
            "keyword": kw,
            "trend_signal": trend_signal,
            "data_points": len(trend_data),
        }
    except Exception as e:
        return {"trend_data": [], "rising_queries": [], "keyword": industry,
                "trend_signal": "unknown", "data_points": 0, "error": str(e)}

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
# NEW DATA FETCHERS
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Deep Reddit comment analysis via Arctic Shift ────────────────────────────
def fetch_reddit_comments(industry: str, problem: str) -> list:
    """Pull top comments from industry subreddits via Arctic Shift /comments/search."""
    subreddits = _get_subreddits(industry)
    comments = []
    seen_ids = set()

    for sub in subreddits[:3]:  # top 3 subs only — comments endpoint is slower
        url = (
            f"{ARCTIC_SHIFT_BASE}/comments/search"
            f"?subreddit={sub}&limit=25&sort=desc"
        )
        try:
            r = requests.get(url, timeout=20, headers={"User-Agent": "MarketResearchBot/1.0"})
            r.raise_for_status()
            items = r.json().get("data") or []
            for c in items:
                cid = c.get("id", "")
                if cid in seen_ids:
                    continue
                seen_ids.add(cid)
                body = c.get("body", "") or ""
                if body.strip() in ("[removed]", "[deleted]", ""):
                    continue
                if len(body.strip()) < 30:
                    continue
                score = c.get("score", 0) or 0
                permalink = c.get("permalink", "")
                link = f"https://reddit.com{permalink}" if permalink else f"https://reddit.com/r/{sub}"
                created = c.get("created_utc", "")
                try:
                    date = datetime.utcfromtimestamp(float(created)).strftime("%Y-%m-%d") if created else datetime.now().strftime("%Y-%m-%d")
                except Exception:
                    date = datetime.now().strftime("%Y-%m-%d")
                comments.append({
                    "body": body[:600],
                    "score": score,
                    "source": f"Reddit r/{sub} comment (via Arctic Shift)",
                    "url": link,
                    "date": date,
                    "sentiment": _sentiment(body),
                })
        except Exception:
            continue
        time.sleep(0.3)

    # Sort by score descending — highest upvoted = most signal
    comments.sort(key=lambda x: x.get("score", 0), reverse=True)
    return comments[:40]


def analyze_comments_jtbd(comments: list, industry: str) -> dict:
    """NVIDIA AI: extract jobs-to-be-done, feature requests, workarounds, abandoned tools."""
    if not comments:
        return {"feature_requests": [], "workarounds": [], "abandoned_tools": [], "jtbd": [], "summary": ""}

    snippets = "\n".join([f"[score:{c['score']}] {c['body'][:250]}" for c in comments[:25]])
    prompt = f"""You are a product researcher analyzing Reddit comments from the {industry} industry.

Extract structured insights from these comments:
{snippets}

Return ONLY valid JSON:
{{
  "feature_requests": ["list of specific features people are asking for"],
  "workarounds": ["list of manual workarounds or hacks people currently use"],
  "abandoned_tools": ["list of tools/software people tried and stopped using, with reason"],
  "jtbd": ["list of jobs-to-be-done: what people are ultimately trying to accomplish"],
  "unmet_needs": ["problems that have NO existing solution mentioned"],
  "summary": "2-sentence summary of the deepest insights from these comments"
}}"""
    raw = nvidia_chat(prompt, max_tokens=900)
    try:
        json_match = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception:
        pass
    return {"feature_requests": [], "workarounds": [], "abandoned_tools": [],
            "jtbd": [], "unmet_needs": [], "summary": raw}


# ─── G2 / Capterra review scraping ───────────────────────────────────────────
# Industry → known competitor slugs on G2 and Capterra
COMPETITOR_MAP = {
    "restaurants":  [("toast-pos", "g2"), ("square-for-restaurants", "g2"), ("toasttab", "capterra")],
    "restaurant":   [("toast-pos", "g2"), ("square-for-restaurants", "g2")],
    "saas":         [("salesforce", "g2"), ("hubspot", "g2"), ("pipedrive", "g2")],
    "ecommerce":    [("shopify", "g2"), ("woocommerce", "g2"), ("bigcommerce", "g2")],
    "fitness":      [("mindbody", "g2"), ("glofox", "g2"), ("zen-planner", "g2")],
    "healthcare":   [("epic", "g2"), ("athenahealth", "g2"), ("drchrono", "g2")],
    "real estate":  [("zillow", "g2"), ("realpage", "g2"), ("buildium", "g2")],
    "marketing":    [("hubspot", "g2"), ("mailchimp", "g2"), ("activecampaign", "g2")],
    "hr":           [("workday", "g2"), ("bamboohr", "g2"), ("gusto", "g2")],
    "logistics":    [("samsara", "g2"), ("fleetio", "g2"), ("onfleet", "g2")],
    "education":    [("canvas", "g2"), ("blackboard", "g2"), ("google-classroom", "g2")],
    "finance":      [("quickbooks", "g2"), ("xero", "g2"), ("freshbooks", "g2")],
}

def _scrape_g2_reviews(slug: str) -> list:
    """Scrape G2 public review page for a product — no auth needed."""
    from bs4 import BeautifulSoup
    url = f"https://www.g2.com/products/{slug}/reviews"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    reviews = []
    try:
        r = requests.get(url, headers=headers, timeout=20)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        # G2 review cards
        for card in soup.select("[itemprop='review']")[:10]:
            rating_el = card.select_one("[itemprop='ratingValue']")
            rating = float(rating_el.get("content", 5)) if rating_el else 5.0
            body_el = card.select_one("[itemprop='reviewBody']")
            body = body_el.get_text(strip=True)[:400] if body_el else ""
            if not body:
                continue
            date_el = card.select_one("time")
            date = date_el.get("datetime", "")[:10] if date_el else datetime.now().strftime("%Y-%m-%d")
            reviews.append({
                "text": body,
                "rating": rating,
                "source": f"G2 — {slug}",
                "url": url,
                "date": date,
                "sentiment": "negative" if rating <= 3 else "positive",
            })
    except Exception:
        pass
    return reviews


def _scrape_capterra_reviews(slug: str) -> list:
    """Scrape Capterra public review page — no auth needed."""
    from bs4 import BeautifulSoup
    url = f"https://www.capterra.com/p/{slug}/reviews/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
    }
    reviews = []
    try:
        r = requests.get(url, headers=headers, timeout=20)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        for card in soup.select(".review-card, [data-testid='review-card']")[:10]:
            body_el = card.select_one(".review-body, .prose")
            body = body_el.get_text(strip=True)[:400] if body_el else ""
            if not body:
                continue
            reviews.append({
                "text": body,
                "rating": 3.0,
                "source": f"Capterra — {slug}",
                "url": url,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "sentiment": _sentiment(body),
            })
    except Exception:
        pass
    return reviews


def fetch_competitor_reviews(industry: str) -> dict:
    """Fetch G2/Capterra reviews for known competitors in the industry."""
    key = industry.lower().strip()
    competitors = COMPETITOR_MAP.get(key)
    if not competitors:
        for k, v in COMPETITOR_MAP.items():
            if k in key or key in k:
                competitors = v
                break
    if not competitors:
        return {"reviews": [], "competitors": [], "weakness_map": {}}

    all_reviews = []
    competitor_names = []
    for slug, platform in competitors[:3]:
        competitor_names.append(slug)
        if platform == "g2":
            reviews = _scrape_g2_reviews(slug)
        else:
            reviews = _scrape_capterra_reviews(slug)
        all_reviews.extend(reviews)
        time.sleep(0.5)

    # AI weakness map
    weakness_map = {}
    if all_reviews:
        snippets = "\n".join([f"[{r['source']} {r['rating']}★] {r['text'][:200]}" for r in all_reviews[:20]])
        prompt = f"""Analyze these competitor reviews for {industry} software tools.

Reviews:
{snippets}

Return ONLY valid JSON:
{{
  "common_complaints": ["top 5 recurring complaints across all competitors"],
  "missing_features": ["features users want but no competitor offers"],
  "competitor_weaknesses": {{"competitor_name": ["weakness1", "weakness2"]}},
  "opportunity_gaps": ["specific gaps where a new solution could win"],
  "summary": "2-sentence summary of where existing solutions are failing"
}}"""
        raw = nvidia_chat(prompt, max_tokens=800)
        try:
            json_match = _re.search(r'\{.*\}', raw, _re.DOTALL)
            if json_match:
                weakness_map = json.loads(json_match.group())
        except Exception:
            weakness_map = {"summary": raw}

    return {
        "reviews": all_reviews,
        "competitors": competitor_names,
        "weakness_map": weakness_map,
    }


# ─── Willingness to pay signals ───────────────────────────────────────────────
def fetch_pricing_signals(industry: str, problem: str) -> dict:
    """Search Reddit + HN for pricing discussions and scrape competitor pricing pages."""
    pricing_queries = [
        f"{industry} software pricing",
        f"{industry} tool worth it",
        f"{industry} subscription too expensive",
        f"{industry} cancelled subscription",
    ]

    raw_signals = []
    seen_ids = set()

    # Reddit pricing discussions via Arctic Shift
    subreddits = _get_subreddits(industry)
    for sub in subreddits[:2]:
        for kw in ["pricing", "worth it", "expensive"]:
            url = (
                f"{ARCTIC_SHIFT_BASE}/posts/search"
                f"?query={urllib.parse.quote(f'{industry} {kw}')}"
                f"&subreddit={sub}&limit=10&sort=desc"
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
                    body = post.get("selftext", "") or ""
                    if body.strip() in ("[removed]", "[deleted]", ""):
                        body = ""
                    text = f"{title}. {body}"[:400]
                    text = _re.sub(r"\s+", " ", text).strip()
                    if not text:
                        continue
                    permalink = post.get("permalink", "")
                    link = f"https://reddit.com{permalink}" if permalink else f"https://reddit.com/r/{sub}"
                    raw_signals.append({
                        "text": text, "source": f"Reddit r/{sub}", "url": link,
                        "date": datetime.now().strftime("%Y-%m-%d"),
                    })
            except Exception:
                continue
            time.sleep(0.2)

    # HN pricing discussions
    for q in pricing_queries[:2]:
        hn_url = f"https://hn.algolia.com/api/v1/search?query={urllib.parse.quote(q)}&tags=story&hitsPerPage=10"
        try:
            r = requests.get(hn_url, timeout=15)
            r.raise_for_status()
            for h in r.json().get("hits", []):
                if h.get("created_at_i", 0) < _HN_CUTOFF_TS:
                    continue
                title = h.get("title", "")
                hn_id = h.get("objectID", "")
                raw_signals.append({
                    "text": title[:300],
                    "source": "Hacker News",
                    "url": f"https://news.ycombinator.com/item?id={hn_id}",
                    "date": (h.get("created_at") or "")[:10],
                })
        except Exception:
            pass

    # Competitor pricing pages via SerpAPI
    competitor_pricing = []
    if SERP_API_KEY:
        key = industry.lower().strip()
        competitors = COMPETITOR_MAP.get(key, [])
        for slug, _ in competitors[:3]:
            params = {
                "engine": "google",
                "q": f"{slug.replace('-', ' ')} pricing plans",
                "api_key": SERP_API_KEY,
                "num": 3,
            }
            try:
                r = requests.get("https://serpapi.com/search", params=params, timeout=15)
                r.raise_for_status()
                for result in r.json().get("organic_results", [])[:2]:
                    snippet = result.get("snippet", "")
                    if any(c in snippet.lower() for c in ["$", "per month", "per user", "free", "plan"]):
                        competitor_pricing.append({
                            "competitor": slug,
                            "snippet": snippet[:300],
                            "url": result.get("link", ""),
                            "source": "Google Search (via SerpAPI)",
                        })
            except Exception:
                pass
            time.sleep(0.3)

    # AI synthesis
    synthesis = {}
    if raw_signals or competitor_pricing:
        signal_text = "\n".join([f"- {s['text'][:200]}" for s in raw_signals[:20]])
        pricing_text = "\n".join([f"- {p['competitor']}: {p['snippet'][:150]}" for p in competitor_pricing])
        prompt = f"""Analyze pricing signals for {industry} software/tools.

User discussions about pricing:
{signal_text}

Competitor pricing info:
{pricing_text}

Return ONLY valid JSON:
{{
  "price_sensitivity": "high/medium/low",
  "acceptable_price_range": "e.g. $20-50/month",
  "pricing_model_preference": "e.g. per-seat, flat monthly, usage-based",
  "features_worth_premium": ["features users say justify paying more"],
  "price_objections": ["common reasons people cancel or avoid paying"],
  "competitor_price_range": "e.g. $30-200/month",
  "recommendation": "2-sentence pricing strategy recommendation"
}}"""
        raw = nvidia_chat(prompt, max_tokens=700)
        try:
            json_match = _re.search(r'\{.*\}', raw, _re.DOTALL)
            if json_match:
                synthesis = json.loads(json_match.group())
        except Exception:
            synthesis = {"recommendation": raw}

    return {
        "raw_signals": raw_signals[:15],
        "competitor_pricing": competitor_pricing,
        "synthesis": synthesis,
    }


# ─── Master AI synthesis (cross-source) ──────────────────────────────────────
def synthesize_all_sources(
    industry: str, problem: str,
    pain_items: list, comments_analysis: dict,
    trends: dict, competitor_data: dict,
    pricing_data: dict, audience: dict,
) -> dict:
    """NVIDIA AI reads ALL collected data and produces cross-source synthesis."""

    pain_summary = f"{len(pain_items)} pain points collected"
    trend_summary = "No trend data."
    if trends.get("trend_data"):
        vals = [d["value"] for d in trends["trend_data"]]
        avg = sum(vals) / len(vals) if vals else 0
        trend_summary = f"Avg interest {avg:.0f}/100, signal: {trends.get('trend_signal','unknown')}"

    feature_requests = comments_analysis.get("feature_requests", [])[:5]
    workarounds = comments_analysis.get("workarounds", [])[:5]
    abandoned = comments_analysis.get("abandoned_tools", [])[:5]
    unmet = comments_analysis.get("unmet_needs", [])[:5]
    weaknesses = competitor_data.get("weakness_map", {}).get("common_complaints", [])[:5]
    gaps = competitor_data.get("weakness_map", {}).get("opportunity_gaps", [])[:5]
    pricing_rec = pricing_data.get("synthesis", {}).get("recommendation", "")
    price_range = pricing_data.get("synthesis", {}).get("acceptable_price_range", "unknown")
    price_sensitivity = pricing_data.get("synthesis", {}).get("price_sensitivity", "unknown")

    prompt = f"""You are a senior market research analyst. Synthesize ALL research data for the {industry} industry.

DATA SUMMARY:
- Pain points: {pain_summary}
- Google Trends: {trend_summary}
- Rising queries: {', '.join([q['query'] for q in trends.get('rising_queries', [])[:5]])}
- Feature requests from Reddit comments: {feature_requests}
- Workarounds people use: {workarounds}
- Tools people abandoned: {abandoned}
- Unmet needs (no solution exists): {unmet}
- Competitor weaknesses: {weaknesses}
- Opportunity gaps: {gaps}
- Price sensitivity: {price_sensitivity}, acceptable range: {price_range}
- Pricing recommendation: {pricing_rec}

Produce a comprehensive synthesis. Return ONLY valid JSON:
{{
  "cross_source_patterns": ["patterns that appear across multiple data sources"],
  "contradictions": ["e.g. Reddit hates X but G2 reviews praise it — explain each"],
  "highest_opportunity_pains": ["top 3 pains with NO existing solution"],
  "recommended_features": ["top 5 features to build based on all data"],
  "go_to_market_insight": "who to target first and how to reach them",
  "updated_scores": {{
    "pain_intensity": {{"score": 7, "explanation": "..."}},
    "market_size": {{"score": 6, "explanation": "..."}},
    "competition_density": {{"score": 5, "explanation": "..."}},
    "willingness_to_pay": {{"score": 7, "explanation": "..."}},
    "overall_opportunity": {{"score": 7, "explanation": "..."}}
  }},
  "final_recommendation": "pursue/research more/avoid",
  "final_summary": "3-4 sentence executive summary of the entire market opportunity"
}}"""

    raw = nvidia_chat(prompt, max_tokens=1200)
    try:
        json_match = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception:
        pass
    return {
        "cross_source_patterns": [],
        "contradictions": [],
        "highest_opportunity_pains": [],
        "recommended_features": [],
        "go_to_market_insight": "",
        "updated_scores": {},
        "final_recommendation": "research more",
        "final_summary": raw,
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


@router.post("/investment-insights")
async def get_investment_insights(req: ResearchRequest):
    """Generate ranked investment opportunities from all collected research data."""
    sk = _session_key("invest", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    saved = _db.load_market_result("invest", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    # Load all saved research — no new scraping
    pain_data    = _db.load_market_result("pain",           req.industry, req.problem or "") or {}
    deep_reddit  = _db.load_market_result("deep_reddit",    req.industry, req.problem or "") or {}
    competitors  = _db.load_market_result("competitors",    req.industry, req.problem or "") or {}
    pricing      = _db.load_market_result("pricing",        req.industry, req.problem or "") or {}
    validation   = _db.load_market_result("validation",     req.industry, req.problem or "") or {}
    deep_val     = _db.load_market_result("deep_validation",req.industry, req.problem or "") or {}
    overview     = _db.load_market_result("overview",       req.industry, req.problem or "") or {}

    # Extract pain clusters with sources
    pain_clusters = pain_data.get("clusters", [])
    cluster_summaries = []
    for c in pain_clusters[:8]:
        items = c.get("items", [])
        sources = list({i.get("source", "") for i in items if i.get("source")})[:3]
        cluster_summaries.append({
            "theme":       c.get("theme", ""),
            "description": c.get("description", ""),
            "mentions":    len(items),
            "sources":     sources,
            "sample_quote": items[0].get("quote", "")[:200] if items else "",
            "sample_url":   items[0].get("url", "") if items else "",
        })

    # Extract unmet needs from deep reddit
    unmet_needs   = deep_reddit.get("analysis", {}).get("unmet_needs", [])
    feature_reqs  = deep_reddit.get("analysis", {}).get("feature_requests", [])
    workarounds   = deep_reddit.get("analysis", {}).get("workarounds", [])
    abandoned     = deep_reddit.get("analysis", {}).get("abandoned_tools", [])

    # Competitor gaps
    opp_gaps      = competitors.get("weakness_map", {}).get("opportunity_gaps", [])
    missing_feats = competitors.get("weakness_map", {}).get("missing_features", [])
    comp_names    = competitors.get("competitors", [])

    # Pricing signals
    price_sensitivity = pricing.get("synthesis", {}).get("price_sensitivity", "unknown")
    price_range       = pricing.get("synthesis", {}).get("acceptable_price_range", "unknown")
    premium_features  = pricing.get("synthesis", {}).get("features_worth_premium", [])

    # Trend signal
    trend_signal  = overview.get("trends", {}).get("trend_signal", "unknown")
    rising_queries = overview.get("trends", {}).get("rising_queries", [])

    # Validation scores
    scores = {}
    if deep_val.get("synthesis", {}).get("updated_scores"):
        scores = deep_val["synthesis"]["updated_scores"]
    elif validation.get("scores"):
        scores = validation["scores"]

    # Build the AI prompt with all context
    clusters_text = "\n".join([
        f"  - [{c['mentions']} mentions] {c['theme']}: {c['description']} | Sources: {', '.join(c['sources'])}"
        for c in cluster_summaries
    ]) or "  No pain clusters available"

    prompt = f"""You are a startup investment analyst. Based on ALL research data for the {req.industry} industry, 
identify the top investment opportunities — specific problems worth building a product around.

RESEARCH DATA:
Pain Point Clusters (with mention counts and sources):
{clusters_text}

Unmet needs (no existing solution):
{unmet_needs}

Feature requests from users:
{feature_reqs}

Tools people abandoned and why:
{abandoned}

Current workarounds people use (= manual pain = opportunity):
{workarounds}

Competitor gaps:
{opp_gaps}

Missing features in existing tools:
{missing_feats}

Pricing signals:
- Price sensitivity: {price_sensitivity}
- Acceptable price range: {price_range}
- Features worth premium: {premium_features}

Market trend: {trend_signal}
Rising search queries: {[q.get('query','') for q in rising_queries[:5]]}

Validation scores: pain_intensity={scores.get('pain_intensity',{}).get('score','?')}/10, 
market_size={scores.get('market_size',{}).get('score','?')}/10,
competition={scores.get('competition_density',{}).get('score','?')}/10

Produce a ranked list of investment opportunities. Return ONLY valid JSON:
{{
  "opportunities": [
    {{
      "rank": 1,
      "title": "Short opportunity title (max 8 words)",
      "problem_statement": "Clear 1-sentence description of the exact problem",
      "why_now": "Why this is the right time to build this",
      "evidence": ["specific data point 1 with source", "specific data point 2 with source"],
      "target_user": "Who specifically has this problem",
      "monetization": "How to charge for this",
      "competition_level": "none/low/medium/high",
      "confidence": "high/medium/low",
      "sources": ["Reddit r/...", "Hacker News", "App Store", "G2", "Google Trends"]
    }}
  ],
  "executive_summary": "2-3 sentence summary of the overall investment thesis for this market",
  "biggest_risk": "The main risk or challenge in this market",
  "quick_win": "The single fastest path to revenue in this market"
}}

Return 3-6 opportunities ranked by investment potential. Be specific — cite actual data from the research."""

    raw = nvidia_chat(prompt, max_tokens=1400)
    insights = {}
    try:
        json_match = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if json_match:
            insights = json.loads(json_match.group())
    except Exception:
        insights = {"opportunities": [], "executive_summary": raw, "biggest_risk": "", "quick_win": ""}

    # Attach source items to each opportunity from pain clusters
    opps = insights.get("opportunities", [])
    for opp in opps:
        # Find matching pain cluster items for this opportunity
        opp_title = opp.get("title", "").lower()
        matched_items = []
        for c in cluster_summaries:
            if any(word in opp_title for word in c["theme"].lower().split()):
                matched_items.append({
                    "quote":  c["sample_quote"],
                    "url":    c["sample_url"],
                    "source": c["sources"][0] if c["sources"] else "",
                    "mentions": c["mentions"],
                })
        opp["source_items"] = matched_items[:3]

    result = {
        "insights": insights,
        "pain_clusters_used": len(cluster_summaries),
        "data_richness": {
            "has_pain_data":       bool(pain_clusters),
            "has_deep_reddit":     bool(unmet_needs or feature_reqs),
            "has_competitor_data": bool(opp_gaps or missing_feats),
            "has_pricing_data":    price_sensitivity != "unknown",
            "has_trend_data":      trend_signal != "unknown",
        },
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("invest", req.industry, req.problem or "", result)
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


@router.post("/deep-reddit")
async def get_deep_reddit(req: ResearchRequest):
    sk = _session_key("deep_reddit", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    saved = _db.load_market_result("deep_reddit", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    comments = fetch_reddit_comments(req.industry, req.problem or "")
    analysis = analyze_comments_jtbd(comments, req.industry)

    result = {
        "comments": comments,
        "analysis": analysis,
        "total_comments": len(comments),
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("deep_reddit", req.industry, req.problem or "", result)
    _session_set(sk, result)
    return result


@router.post("/competitor-reviews")
async def get_competitor_reviews(req: ResearchRequest):
    sk = _session_key("competitors", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    saved = _db.load_market_result("competitors", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    data = fetch_competitor_reviews(req.industry)

    result = {
        "reviews": data["reviews"],
        "competitors": data["competitors"],
        "weakness_map": data["weakness_map"],
        "total_reviews": len(data["reviews"]),
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("competitors", req.industry, req.problem or "", result)
    _session_set(sk, result)
    return result


@router.post("/pricing-signals")
async def get_pricing_signals(req: ResearchRequest):
    sk = _session_key("pricing", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    saved = _db.load_market_result("pricing", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    data = fetch_pricing_signals(req.industry, req.problem or "")

    result = {
        "raw_signals": data["raw_signals"],
        "competitor_pricing": data["competitor_pricing"],
        "synthesis": data["synthesis"],
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("pricing", req.industry, req.problem or "", result)
    _session_set(sk, result)
    return result


@router.post("/deep-validation")
async def get_deep_validation(req: ResearchRequest):
    """Master synthesis — reads ALL data sources and produces upgraded analysis."""
    sk = _session_key("deep_validation", req.industry, req.problem or "")
    if _session_get(sk):
        return _session_get(sk)
    saved = _db.load_market_result("deep_validation", req.industry, req.problem or "")
    if saved:
        _session_set(sk, saved)
        return saved

    # Gather all data in parallel-ish (sequential but cached)
    arctic_items   = fetch_arctic_shift(req.industry, req.problem or "")
    serp_items     = fetch_serp(req.industry, req.problem or "")
    hn_items       = fetch_hn(req.industry, req.problem or "")
    appstore_items = fetch_appstore_reviews(req.industry)
    all_pain       = arctic_items + serp_items + hn_items + appstore_items

    comments       = fetch_reddit_comments(req.industry, req.problem or "")
    comments_analysis = analyze_comments_jtbd(comments, req.industry)

    trends         = fetch_google_trends(req.industry, req.problem or "")
    competitor_data = fetch_competitor_reviews(req.industry)
    pricing_data   = fetch_pricing_signals(req.industry, req.problem or "")
    audience       = analyze_audience(all_pain, req.industry)

    synthesis = synthesize_all_sources(
        industry=req.industry,
        problem=req.problem or "",
        pain_items=all_pain,
        comments_analysis=comments_analysis,
        trends=trends,
        competitor_data=competitor_data,
        pricing_data=pricing_data,
        audience=audience,
    )

    result = {
        "synthesis": synthesis,
        "data_sources_used": {
            "reddit_posts":       len(arctic_items),
            "google_serp":        len(serp_items),
            "hn_posts":           len(hn_items),
            "app_reviews":        len(appstore_items),
            "reddit_comments":    len(comments),
            "competitor_reviews": len(competitor_data.get("reviews", [])),
            "pricing_signals":    len(pricing_data.get("raw_signals", [])),
            "trend_data_points":  len(trends.get("trend_data", [])),
        },
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.save_market_result("deep_validation", req.industry, req.problem or "", result)
    _session_set(sk, result)
    return result


@router.get("/saved-searches")
async def get_saved_searches():
    """List all saved market research searches from Supabase."""
    return _db.list_market_searches()


@router.get("/saved-searches/{tab}/{cache_key}")
async def load_saved_search(tab: str, cache_key: str):
    """Load a specific saved result by cache key."""
    result = _db.load_market_result_by_key(cache_key)
    if result is None:
        raise HTTPException(status_code=404, detail="Saved search not found")
    return result


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
    count = _db.clear_all_market_results()
    return {"message": f"Cleared {count} saved searches"}


@router.post("/refresh/{tab}")
async def refresh_tab(tab: str, req: ResearchRequest):
    """Force re-fetch a tab by deleting its saved result first, then re-running."""
    raw = f"{tab}:{req.industry.lower()}:{(req.problem or '').lower()}"
    import hashlib, json
    key = hashlib.md5(raw.encode()).hexdigest()
    _db.delete_market_result(key)
    sk = _session_key(tab, req.industry, req.problem or "")
    _session_cache.pop(sk, None)
    return {"message": f"Cache cleared for {tab} — {req.industry}. Re-submit to fetch fresh data."}


# ─── Market Comparison endpoint ───────────────────────────────────────────────
class CompareRequest(BaseModel):
    markets: list  # list of {"industry": str, "problem": str}

def _extract_market_snapshot(industry: str, problem: str) -> dict:
    """Pull all saved data for a market and extract comparison metrics."""
    prob = problem or ""

    # Load each saved tab
    validation   = _db.load_market_result("validation",    industry, prob) or {}
    deep_val     = _db.load_market_result("deep_validation", industry, prob) or {}
    pain         = _db.load_market_result("pain",          industry, prob) or {}
    overview     = _db.load_market_result("overview",      industry, prob) or {}
    pricing      = _db.load_market_result("pricing",       industry, prob) or {}

    # Prefer deep_validation scores if available, fall back to validation
    scores = {}
    if deep_val.get("synthesis", {}).get("updated_scores"):
        scores = deep_val["synthesis"]["updated_scores"]
    elif validation.get("scores"):
        scores = validation["scores"]

    def score(key):
        s = scores.get(key, {})
        return s.get("score", 0) if isinstance(s, dict) else 0

    # Trend signal from overview
    trend_signal = "unknown"
    trend_avg = 0
    if overview.get("trends", {}).get("trend_data"):
        td = overview["trends"]["trend_data"]
        vals = [d["value"] for d in td]
        trend_avg = round(sum(vals) / len(vals)) if vals else 0
        trend_signal = overview["trends"].get("trend_signal", "unknown")

    # Top 3 pain point themes
    top_pains = []
    for cluster in (pain.get("clusters") or [])[:3]:
        top_pains.append(cluster.get("theme", ""))

    # Total sources
    total_sources = pain.get("total_sources", 0)
    dv_sources = deep_val.get("data_sources_used", {})
    if dv_sources:
        total_sources = sum(dv_sources.values())

    # Willingness to pay
    wtp_sensitivity = pricing.get("synthesis", {}).get("price_sensitivity", "—")
    wtp_range       = pricing.get("synthesis", {}).get("acceptable_price_range", "—")

    # Recommendation
    rec = ""
    if deep_val.get("synthesis", {}).get("final_recommendation"):
        rec = deep_val["synthesis"]["final_recommendation"]
    elif validation.get("scores", {}).get("recommendation"):
        rec = validation["scores"]["recommendation"]

    return {
        "industry":          industry,
        "problem":           prob,
        "label":             f"{industry}" + (f" / {prob}" if prob else ""),
        "overall_score":     score("overall_opportunity"),
        "pain_intensity":    score("pain_intensity"),
        "market_size":       score("market_size"),
        "competition":       score("competition_density"),
        "wtp_score":         score("willingness_to_pay"),
        "trend_signal":      trend_signal,
        "trend_avg":         trend_avg,
        "top_pains":         top_pains,
        "total_sources":     total_sources,
        "wtp_sensitivity":   wtp_sensitivity,
        "wtp_range":         wtp_range,
        "recommendation":    rec,
        "has_data":          bool(scores),
    }


def _ai_compare_markets(snapshots: list) -> dict:
    """NVIDIA AI reads all market snapshots and produces comparison insights."""
    summaries = []
    for s in snapshots:
        summaries.append(
            f"Market: {s['label']}\n"
            f"  Overall Score: {s['overall_score']}/10\n"
            f"  Pain Intensity: {s['pain_intensity']}/10\n"
            f"  Market Size: {s['market_size']}/10\n"
            f"  Competition: {s['competition']}/10\n"
            f"  WTP Score: {s['wtp_score']}/10, Sensitivity: {s['wtp_sensitivity']}, Range: {s['wtp_range']}\n"
            f"  Trend: {s['trend_signal']} (avg interest {s['trend_avg']}/100)\n"
            f"  Top Pains: {', '.join(s['top_pains'][:3]) or 'none'}\n"
            f"  Recommendation: {s['recommendation']}"
        )

    prompt = f"""You are a market research analyst comparing {len(snapshots)} markets.

{chr(10).join(summaries)}

Analyze and compare these markets. Return ONLY valid JSON:
{{
  "strongest_opportunity": {{
    "market": "market name",
    "reason": "why it has the strongest opportunity"
  }},
  "least_competition": {{
    "market": "market name",
    "reason": "why it has the least competition"
  }},
  "fastest_growing": {{
    "market": "market name",
    "reason": "why it is trending upward fastest"
  }},
  "recommended_market": {{
    "market": "market name",
    "reason": "2-sentence explanation combining all signals"
  }},
  "comparison_summary": "3-4 sentence executive summary comparing all markets",
  "ranking": ["market1", "market2", "market3", "market4"]
}}

ranking should list markets from best to worst opportunity."""

    raw = nvidia_chat(prompt, max_tokens=800)
    try:
        json_match = _re.search(r'\{.*\}', raw, _re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
    except Exception:
        pass
    return {
        "strongest_opportunity": {"market": "", "reason": raw},
        "least_competition": {"market": "", "reason": ""},
        "fastest_growing": {"market": "", "reason": ""},
        "recommended_market": {"market": "", "reason": ""},
        "comparison_summary": raw,
        "ranking": [],
    }


@router.post("/compare")
async def compare_markets(req: CompareRequest):
    """Compare 2-4 already-researched markets using saved data only."""
    if len(req.markets) < 2:
        raise HTTPException(status_code=400, detail="Minimum 2 markets required for comparison")
    if len(req.markets) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 markets allowed for comparison")

    snapshots = []
    for m in req.markets:
        industry = m.get("industry", "").strip()
        problem  = m.get("problem", "").strip()
        if not industry:
            continue
        snap = _extract_market_snapshot(industry, problem)
        snapshots.append(snap)

    if len(snapshots) < 2:
        raise HTTPException(status_code=400, detail="Not enough valid markets with saved data")

    ai_insights = _ai_compare_markets(snapshots)

    return {
        "snapshots": snapshots,
        "ai_insights": ai_insights,
        "compared_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/compare/available")
async def get_comparable_markets():
    """Return unique industries that have at least validation or pain data saved."""
    all_searches = _db.list_market_searches()
    # Group by industry+problem, only include those with useful tabs
    useful_tabs = {"validation", "pain", "deep_validation"}
    seen = {}
    for s in all_searches:
        if s["tab"] not in useful_tabs:
            continue
        key = f"{s['industry']}||{s['problem'] or ''}"
        if key not in seen:
            seen[key] = {
                "industry": s["industry"],
                "problem":  s["problem"] or "",
                "label":    s["industry"] + (f" / {s['problem']}" if s["problem"] else ""),
                "tabs":     [],
                "saved_at": s["saved_at"],
            }
        seen[key]["tabs"].append(s["tab"])
    return list(seen.values())
