import os
import re
import json
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from bs4 import BeautifulSoup

# ── Config ─────────────────────────────────────────────────────────────────
SLACK_WEBHOOK = os.environ.get("SLACK_WEBHOOK_URL", "")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    )
}

# Keywords to prioritize AI / software / dev tools
AI_KEYWORDS = [
    "ai", "llm", "gpt", "agent", "automation", "copilot", "ml", "model",
    "open source", "api", "developer", "tool", "saas", "platform", "workflow",
    "database", "cloud", "devops", "productivity", "no-code", "low-code",
    "vector", "embedding", "rag", "chatbot", "assistant", "inference",
    "deploy", "monitor", "pipeline", "data", "analytics", "search",
    "integration", "plugin", "extension", "cli", "sdk", "framework",
    "self-hosted", "privacy", "security", "startup", "launch"
]

MAX_PER_SOURCE = 8


# ── Helpers ────────────────────────────────────────────────────────────────

def is_relevant(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in AI_KEYWORDS)


def truncate(text: str, length: int = 120) -> str:
    return text[:length].rstrip() + "…" if len(text) > length else text


def safe_get(url: str, **kwargs):
    try:
        r = requests.get(url, headers=HEADERS, timeout=15, **kwargs)
        r.raise_for_status()
        return r
    except Exception as e:
        print(f"  ⚠  Failed {url}: {e}")
        return None


# ── Source 1: Product Hunt RSS ─────────────────────────────────────────────

def fetch_product_hunt() -> list:
    print("📦 Fetching Product Hunt...")
    r = safe_get("https://www.producthunt.com/feed")
    if not r:
        return []

    items = []
    try:
        root = ET.fromstring(r.text)
        channel = root.find("channel")
        for item in (channel.findall("item") if channel else []):
            title = (item.findtext("title") or "").strip()
            desc  = BeautifulSoup(item.findtext("description") or "", "html.parser").get_text(" ").strip()
            link  = (item.findtext("link") or "").strip()

            if not title:
                continue
            if not is_relevant(title + " " + desc):
                continue

            items.append({
                "title": title,
                "desc":  truncate(desc),
                "link":  link,
                "meta":  ""
            })
            if len(items) >= MAX_PER_SOURCE:
                break
    except Exception as e:
        print(f"  ⚠  PH parse error: {e}")

    print(f"   → {len(items)} relevant products found")
    return items


# ── Source 2: GitHub Trending ──────────────────────────────────────────────

def fetch_github_trending() -> list:
    print("💻 Fetching GitHub Trending...")
    r = safe_get("https://github.com/trending")
    if not r:
        return []

    soup  = BeautifulSoup(r.text, "html.parser")
    repos = soup.select("article.Box-row")
    items = []

    for repo in repos:
        # Name
        h2 = repo.find("h2")
        if not h2:
            continue
        name = " ".join(h2.get_text().split()).replace(" / ", "/")

        # Description
        p = repo.find("p")
        desc = p.get_text(strip=True) if p else ""

        # Stars today
        spans = repo.find_all("span", class_=re.compile("d-inline-block"))
        stars_today = ""
        for s in spans:
            t = s.get_text(strip=True)
            if "stars today" in t:
                stars_today = t.replace(" stars today", " ⭐ today")
                break

        # Language
        lang_span = repo.find("span", itemprop="programmingLanguage")
        lang = lang_span.get_text(strip=True) if lang_span else ""

        link = "https://github.com/" + name.replace(" ", "")

        if not is_relevant(name + " " + desc):
            continue

        meta_parts = []
        if lang:        meta_parts.append(lang)
        if stars_today: meta_parts.append(stars_today)

        items.append({
            "title": name,
            "desc":  truncate(desc) if desc else "No description",
            "link":  link,
            "meta":  "  •  ".join(meta_parts)
        })

        if len(items) >= MAX_PER_SOURCE:
            break

    print(f"   → {len(items)} relevant repos found")
    return items


# ── Source 3: Hacker News (Show HN) ───────────────────────────────────────

def fetch_hacker_news() -> list:
    print("🗞  Fetching Hacker News Show HN...")
    r = safe_get("https://hacker-news.firebaseio.com/v0/showstories.json")
    if not r:
        return []

    story_ids = r.json()[:60]
    items = []

    for sid in story_ids:
        if len(items) >= MAX_PER_SOURCE:
            break
        sr = safe_get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json")
        if not sr:
            continue
        story = sr.json()
        if not story or story.get("type") != "story":
            continue

        title = story.get("title", "")
        score = story.get("score", 0)
        url   = story.get("url", f"https://news.ycombinator.com/item?id={sid}")

        clean_title = re.sub(r"^Show HN:\s*", "", title, flags=re.IGNORECASE).strip()

        if not is_relevant(clean_title):
            continue

        items.append({
            "title": clean_title,
            "desc":  "",
            "link":  url,
            "meta":  f"⬆️ {score} points"
        })

    print(f"   → {len(items)} relevant stories found")
    return items


# ── Slack Formatter ────────────────────────────────────────────────────────

def build_slack_payload(ph: list, gh: list, hn: list) -> dict:
    today = datetime.now(timezone.utc).strftime("%A, %d %B %Y")
    total = len(ph) + len(gh) + len(hn)

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"🔥 Daily AI & Tech Digest  —  {today}",
                "emoji": True
            }
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"*{total} trending products* sourced from Product Hunt · GitHub Trending · Hacker News"
                }
            ]
        },
        {"type": "divider"}
    ]

    def add_section(emoji: str, source_name: str, items: list):
        if not items:
            return
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"{emoji} *{source_name}*"
            }
        })
        for item in items:
            lines = [f"*<{item['link']}|{item['title']}>*"]
            if item["desc"]:
                lines.append(item["desc"])
            if item["meta"]:
                lines.append(f"_{item['meta']}_")
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "\n".join(lines)
                }
            })
        blocks.append({"type": "divider"})

    add_section("🚀", "Product Hunt — Today's Launches", ph)
    add_section("💻", "GitHub Trending — Blowing Up Now", gh)
    add_section("🗞", "Hacker News — Show HN Products", hn)

    blocks.append({
        "type": "context",
        "elements": [
            {
                "type": "mrkdwn",
                "text": "Built with ❤️  |  <https://github.com/trending|GitHub> · <https://www.producthunt.com|Product Hunt> · <https://news.ycombinator.com/show|HN>"
            }
        ]
    })

    return {"blocks": blocks}


# ── Post to Slack ──────────────────────────────────────────────────────────

def post_to_slack(payload: dict) -> bool:
    if not SLACK_WEBHOOK:
        print("\n⚠  SLACK_WEBHOOK_URL not set — printing payload instead:\n")
        print(json.dumps(payload, indent=2))
        return False

    r = requests.post(
        SLACK_WEBHOOK,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=15
    )
    if r.status_code == 200 and r.text == "ok":
        print("\n✅  Digest posted to Slack!")
        return True
    else:
        print(f"\n❌  Slack error {r.status_code}: {r.text}")
        return False


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    print(f"\n{'─'*55}")
    print(f"  AI & Tech Digest  —  {datetime.now().strftime('%d %b %Y %H:%M UTC')}")
    print(f"{'─'*55}\n")

    ph = fetch_product_hunt()
    gh = fetch_github_trending()
    hn = fetch_hacker_news()

    if not ph and not gh and not hn:
        print("\n⚠  No data fetched from any source. Check your connection.")
        return

    payload = build_slack_payload(ph, gh, hn)
    post_to_slack(payload)


if __name__ == "__main__":
    main()
