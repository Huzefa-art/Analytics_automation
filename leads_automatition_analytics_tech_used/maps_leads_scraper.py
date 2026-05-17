import asyncio
import csv
import os
import re
import time
import random
from datetime import datetime
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
import pandas as pd

# --- Configuration ---
RESULTS_CSV = "results.csv"
URLS_TXT = "urls.txt"

def parse_address(address):
    """Attempt to extract City and Country from address string."""
    if not address or address == "N/A":
        return "N/A", "N/A"
    
    parts = [p.strip() for p in address.split(',')]
    if len(parts) >= 2:
        country = parts[-1]
        city_line = parts[-2]
        city_match = re.search(r'^([A-Za-z\s\-]+)', city_line)
        city = city_match.group(1).strip() if city_match else city_line
        return city, country
    return "Unknown", "Unknown"

async def scrape_google_maps(search_url, max_results=50):
    """Scrape business listings from a Google Maps search URL."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        page = await context.new_page()
        await stealth_async(page)
        
        print(f"Opening Google Maps: {search_url}")
        await page.goto(search_url)

        try:
            reject_all = await page.query_selector('button[aria-label="Reject all"]')
            if reject_all:
                await reject_all.click()
        except:
            pass

        await page.wait_for_selector('div[role="feed"]')
        
        results = []
        seen_names = set()
        feed_selector = 'div[role="feed"]'
        
        while len(results) < max_results:
            listings = await page.query_selector_all('div[role="article"]')
            
            for listing in listings:
                try:
                    link_element = await listing.query_selector('a[aria-label]')
                    name = await link_element.get_attribute('aria-label') if link_element else "Unknown"
                    
                    if name in seen_names or name == "Unknown":
                        continue
                    
                    seen_names.add(name)
                    
                    await listing.click()
                    await asyncio.sleep(random.uniform(2.0, 3.5)) # Random wait after click
                    
                    address = "N/A"
                    website = "N/A"
                    phone = "N/A"
                    
                    address_elem = await page.query_selector('button[data-item-id="address"]')
                    if address_elem:
                        address = await address_elem.inner_text()
                        
                    website_elem = await page.query_selector('a[data-item-id="authority"]')
                    if website_elem:
                        website = await website_elem.get_attribute('href')
                        
                    phone_elem = await page.query_selector('button[data-item-id^="phone:tel:"]')
                    if phone_elem:
                        phone = await phone_elem.inner_text()
                    
                    city, country = parse_address(address)
                    print(f"Found: {name} | City: {city} | Website: {website}")
                    
                    results.append({
                        "Business Name": name,
                        "Website": website,
                        "City": city,
                        "Country": country,
                        "Address": address,
                        "Phone": phone
                    })
                    
                    if len(results) >= max_results:
                        break
                        
                except Exception as e:
                    print(f"Error extracting listing: {e}")
                    continue
            
            await page.evaluate(f"document.querySelector('{feed_selector}').scrollBy(0, 1000)")
            await asyncio.sleep(random.uniform(2.0, 4.0)) # Random wait after scroll
            
            end_msg = await page.query_selector('text="You\'ve reached the end of the list"')
            if end_msg:
                break

        await browser.close()
        return results

def save_output(results):
    if not results:
        print("No results to save.")
        return

    # 1. Update results.csv
    df = pd.DataFrame(results)
    file_exists = os.path.isfile(RESULTS_CSV)
    df.to_csv(RESULTS_CSV, mode='a', index=False, header=not file_exists)
    print(f"{'Appended to' if file_exists else 'Created'} {RESULTS_CSV} with {len(results)} new results.")

    # 2. Update urls.txt (Unique URLs only)
    new_urls = [r["Website"] for r in results if r["Website"] != "N/A"]
    if not new_urls:
        print("No websites found to add to urls.txt.")
        return

    existing_urls = set()
    if os.path.exists(URLS_TXT):
        with open(URLS_TXT, "r") as f:
            existing_urls = {line.strip() for line in f if line.strip()}
    
    unique_new_urls = [url for url in new_urls if url not in existing_urls]
    
    if unique_new_urls:
        with open(URLS_TXT, "a") as f:
            for url in unique_new_urls:
                f.write(f"{url}\n")
        print(f"Added {len(unique_new_urls)} new unique URLs to {URLS_TXT}.")
    else:
        print("No new unique URLs found for urls.txt.")

async def main():
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 maps_leads_scraper.py <google_maps_url>")
        return
        
    search_url = sys.argv[1]
    results = await scrape_google_maps(search_url)
    save_output(results)
    print(f"Scraper finished! Found {len(results)} leads.")

if __name__ == "__main__":
    asyncio.run(main())
