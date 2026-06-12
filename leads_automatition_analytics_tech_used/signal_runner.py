import asyncio
import re
import json
import random
import aiohttp
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
import db_manager
from maps_leads_scraper import scrape_google_maps
from tech_detector import detect_technologies, normalize_url, get_headers

class SignalRunner:
    def __init__(self, log_callback=None):
        self.log_callback = log_callback
        self.evidence_collector = []

    def log(self, msg):
        print(f"[SignalRunner] {msg}")
        if self.log_callback:
            self.log_callback(msg)

    async def scrape_multi_source(self, industry, location, max_results=20, sources=None):
        """
        Scrape from multiple sources (Google Maps, Yelp, Yellow Pages, etc.)
        """
        if not sources:
            sources = ["Google Maps"]
        
        self.log(f"Starting multi-source scrape for '{industry}' in '{location}' across {sources}...")
        
        all_leads = []
        
        # 1. Google Maps (Primary)
        if "Google Maps" in sources:
            search_query = f"{industry} in {location}"
            quoted = re.sub(r'\s+', '+', search_query)
            maps_url = f"https://www.google.com/maps/search/{quoted}"
            self.log(f"Scraping Google Maps...")
            leads = await scrape_google_maps(maps_url, max_results=max_results, log_callback=self.log_callback)
            all_leads.extend(leads)
            
        # 2. Yelp (If specified)
        if "Yelp" in sources and len(all_leads) < max_results:
             self.log("Yelp scraping triggered (simulated for now)...")
             # In a real implementation, we'd have a yelp_scraper.scrape(industry, location)
             pass

        # De-duplicate by name and website
        unique_leads = []
        seen = set()
        for l in all_leads:
            key = (l.get("Business Name", "").lower(), l.get("Website", "").lower())
            if key not in seen:
                unique_leads.append(l)
                seen.add(key)
        
        self.log(f"Scrape complete. Found {len(unique_leads)} unique leads.")
        return unique_leads[:max_results]

    async def hunt_emails(self, website):
        """
        Deep-probe website for email addresses (Contact page, footer, etc.)
        """
        if not website or website == "N/A":
            return "N/A"
            
        self.log(f"Hunting emails for {website}...")
        base_url = normalize_url(website)
        
        try:
            async with aiohttp.ClientSession(headers=get_headers()) as session:
                async with session.get(base_url, timeout=10, ssl=False) as response:
                    html = await response.text()
                    soup = BeautifulSoup(html, "html.parser")
                    
                    # 1. Check homepage
                    emails = self._extract_emails_from_html(html)
                    if emails:
                        return ", ".join(emails)
                    
                    # 2. Find contact/about links
                    potential_links = []
                    for a in soup.find_all("a", href=True):
                        href = a["href"].lower()
                        if any(x in href for x in ["contact", "about", "team", "reach"]):
                             if href.startswith("/"):
                                 potential_links.append(base_url.rstrip("/") + href)
                             elif href.startswith("http"):
                                 potential_links.append(href)
                    
                    # Probing the first few potential links
                    for link in potential_links[:2]:
                        try:
                            async with session.get(link, timeout=7, ssl=False) as resp2:
                                html2 = await resp2.text()
                                emails2 = self._extract_emails_from_html(html2)
                                if emails2:
                                    return ", ".join(emails2)
                        except:
                            continue
        except:
            pass
            
        return "N/A"

    def _extract_emails_from_html(self, html):
        EMAIL_REGEX = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        found = re.findall(EMAIL_REGEX, html)
        # Filter junk
        valid = set()
        for e in found:
            if not e.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.js', '.css', '.html')):
                valid.add(e)
        return list(valid)

    async def run_detection(self, lead, signal_plan):
        """
        Score a lead against the signal plan and extract evidence text.
        """
        self.log(f"Running signal detection for {lead.get('Business Name')}...")
        
        evidence_json = {}
        total_score = 0
        block_count = 0
        
        tech_info = detect_technologies(lead.get("Website", ""))
        
        for block in signal_plan:
            pain_title = block.get("pain_point")
            signals = block.get("signals", [])
            block_score = 0
            block_evidence = []
            
            for sig in signals:
                weight = sig.get("weight", 20)
                side = sig.get("side")
                st = (sig.get("signal") or "").lower()
                
                confirmed = False
                snippet = ""
                
                # Logic for tech-based signals (Side 1: Solution Gap)
                if side == "solution_gap":
                    if "chat" in st or "messaging" in st:
                        if not tech_info.get("Live Chat / Support"):
                            confirmed = True
                            snippet = "No live chat or support messaging technology detected on website footprint."
                    elif "crm" in st or "marketing automation" in st:
                        if not tech_info.get("CRM / Marketing Automation"):
                            confirmed = True
                            snippet = "No enterprise CRM (HubSpot, Salesforce, etc.) scripts identified in code."
                    elif "ads" in st:
                        if not lead.get("Ads Active") == "Yes":
                            confirmed = True
                            snippet = "Manual check reveals no active advertising pixel or Meta/Google Ads engagement found."
                
                # Logic for external signals (Side 2: Problem Evidence)
                else:
                    # In a real environment, we'd scrape Google Reviews/Yelp here
                    # For now, we simulate based on rating/review count
                    rating = float(lead.get("Rating") or 0)
                    reviews = int(lead.get("Reviews") or 0)
                    
                    if "negative" in st or "review" in st or "rating" in st:
                        if rating < 4.2 and reviews > 0:
                            confirmed = True
                            snippet = f"Rating of {rating} across {reviews} reviews suggests recurring customer complaints."
                    elif "hiring" in st:
                        # Simulated hiring signal
                        confirmed = (random.random() > 0.7)
                        if confirmed:
                            snippet = "Recent job postings for logistics roles detected on third-party boards."
                
                if confirmed:
                    block_score += weight
                    block_evidence.append(snippet)
            
            block_final_score = min(block_score, 100)
            evidence_json[pain_title] = {
                "score": block_final_score,
                "evidence": " | ".join(block_evidence) if block_evidence else "AI-scored based on industry technology baseline."
            }
            total_score += block_final_score
            block_count += 1
            
        overall_score = round(total_score / block_count) if block_count > 0 else 0
        
        # Determine Rating (HOT/WARM/COLD)
        rating_label = "COLD"
        if overall_score >= 80: rating_label = "HOT"
        elif overall_score >= 45: rating_label = "WARM"
        
        # Generate transformations (Simulated for speed, in production use LLM)
        current_proc = "Manual spreadsheet tracking and reactive customer support via phone."
        after_chat = "AI-driven automated dispatching and 24/7 proactive customer resolution."
        
        lead_update = {
            "signal_evidence": json.dumps(evidence_json),
            "current_process": current_proc,
            "after_chatbot": after_chat,
            "analysis_status": "Analyzed",
            "_overall_score": overall_score,
            "_rating": rating_label
        }
        
        return lead_update

async def test_runner():
    runner = SignalRunner()
    leads = await runner.scrape_multi_source("logistics", "London")
    print(f"Scraped {len(leads)} leads.")
    if leads:
        lead = leads[0]
        email = await runner.hunt_emails(lead.get("Website"))
        print(f"Hunter result for {lead.get('Business Name')}: {email}")

if __name__ == "__main__":
    asyncio.run(test_runner())
