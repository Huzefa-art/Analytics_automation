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

async def scrape_google_maps(search_url, max_results=50, log_callback=None):
    """Scrape business listings from a Google Maps search URL."""
    def log(msg):
        print(msg)
        if log_callback:
            log_callback(msg)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        page = await context.new_page()
        await stealth_async(page)
        
        log(f"Opening Google Maps: {search_url}")
        try:
            await page.goto(search_url, timeout=45000)
        except Exception as e:
            log(f"Warning: page.goto timed out or failed: {e}. Trying to proceed...")

        # Robust Cookie/Consent Dialog Handling
        try:
            consent_buttons = [
                'button[aria-label="Reject all"]',
                'button[aria-label="Accept all"]',
                'button:has-text("Reject all")',
                'button:has-text("Accept all")',
                'button:has-text("I agree")',
                'button:has-text("Agree")',
                '#consent-bump button',
                'form[action*="consent.google"] button'
            ]
            for selector in consent_buttons:
                try:
                    btn = await page.query_selector(selector)
                    if btn and await btn.is_visible():
                        log(f"Dismissing cookie consent screen with selector: {selector}")
                        await btn.click()
                        await page.wait_for_timeout(2000)
                        break
                except:
                    continue
        except Exception as e:
            log(f"Cookie consent bypass: {e}")

        # Multiple selector wait strategy
        feed_selector = 'div[role="feed"]'
        single_selector = 'h1.DUwDvf'
        no_results_selector = 'text="Google Maps can\'t find"'
        
        log("Waiting for layout container...")
        try:
            await page.wait_for_selector(f'{feed_selector}, {single_selector}, {no_results_selector}', timeout=15000)
        except Exception as e:
            log(f"Timeout waiting for layout, checking DOM structure...")

        is_single = await page.query_selector(single_selector) is not None
        is_feed = await page.query_selector(feed_selector) is not None
        
        results = []
        seen_names = set()

        if is_single:
            log("Single business listing layout detected. Extracting detail directly...")
            try:
                name_elem = await page.query_selector(single_selector)
                name = await name_elem.inner_text() if name_elem else "Unknown"
                
                address = "N/A"
                website = "N/A"
                phone = "N/A"
                
                # Asynchronous retry loop to wait for detail pane to fully load
                for _ in range(5):
                    if address == "N/A":
                        address_elem = await page.query_selector('button[data-item-id="address"]')
                        if not address_elem:
                            address_elem = await page.query_selector('button[aria-label*="Address:"]')
                        if not address_elem:
                            address_elem = await page.query_selector('button[aria-label*="address"]')
                        if address_elem:
                            address = await address_elem.inner_text()
                            
                    if website == "N/A":
                        website_elem = await page.query_selector('a[data-item-id="authority"]')
                        if not website_elem:
                            website_elem = await page.query_selector('a[aria-label*="Website"]')
                        if not website_elem:
                            website_elem = await page.query_selector('a[aria-label*="website"]')
                        if website_elem:
                            website = await website_elem.get_attribute('href')
                            
                    if phone == "N/A":
                        phone_elem = await page.query_selector('button[data-item-id^="phone:tel:"]')
                        if not phone_elem:
                            phone_elem = await page.query_selector('button[aria-label*="Phone:"]')
                        if not phone_elem:
                            phone_elem = await page.query_selector('button[aria-label*="phone"]')
                        if phone_elem:
                            phone = await phone_elem.inner_text()
                            
                    if address != "N/A" and website != "N/A" and phone != "N/A":
                        break
                    await asyncio.sleep(0.5)

                # Final fallback for website link extraction from all page anchors
                if website == "N/A":
                    links = await page.query_selector_all('a')
                    for link in links:
                        href = await link.get_attribute('href')
                        if href and ('http' in href) and not any(x in href for x in ['google.com', 'google.co.uk', 'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'google.com/maps']):
                            website = href
                            break
                
                city, country = parse_address(address)
                log(f"Found Single Listing: {name} | City: {city} | Website: {website}")
                
                results.append({
                    "Business Name": name,
                    "Website": website,
                    "City": city,
                    "Country": country,
                    "Address": address,
                    "Phone": phone
                })
            except Exception as e:
                log(f"Error extracting single listing: {e}")

        elif is_feed:
            log("Feed results layout detected. Running listing feed scraper...")
            while len(results) < max_results:
                listings = await page.query_selector_all('div[role="article"]')
                if not listings:
                    log("No listings found inside feed.")
                    break
                
                new_listings_processed = 0
                for listing in listings:
                    try:
                        link_element = await listing.query_selector('a[aria-label]')
                        name = await link_element.get_attribute('aria-label') if link_element else "Unknown"
                        
                        if name in seen_names or name == "Unknown":
                            continue
                        
                        seen_names.add(name)
                        new_listings_processed += 1
                        
                        click_target = link_element if link_element else listing
                        await click_target.scroll_into_view_if_needed()
                        await click_target.click(force=True)
                        await asyncio.sleep(random.uniform(3.0, 4.5)) # Wait for details pane to load
                        
                        address = "N/A"
                        website = "N/A"
                        phone = "N/A"
                        
                        # Asynchronous retry loop to wait for detail pane to load
                        for _ in range(5):
                            if address == "N/A":
                                address_elem = await page.query_selector('button[data-item-id="address"]')
                                if not address_elem:
                                    address_elem = await page.query_selector('button[aria-label*="Address:"]')
                                if not address_elem:
                                    address_elem = await page.query_selector('button[aria-label*="address"]')
                                if address_elem:
                                    address = await address_elem.inner_text()
                                    
                            if website == "N/A":
                                website_elem = await page.query_selector('a[data-item-id="authority"]')
                                if not website_elem:
                                    website_elem = await page.query_selector('a[aria-label*="Website"]')
                                if not website_elem:
                                    website_elem = await page.query_selector('a[aria-label*="website"]')
                                if website_elem:
                                    website = await website_elem.get_attribute('href')
                                    
                            if phone == "N/A":
                                phone_elem = await page.query_selector('button[data-item-id^="phone:tel:"]')
                                if not phone_elem:
                                    phone_elem = await page.query_selector('button[aria-label*="Phone:"]')
                                if not phone_elem:
                                    phone_elem = await page.query_selector('button[aria-label*="phone"]')
                                if phone_elem:
                                    phone = await phone_elem.inner_text()
                                    
                            if address != "N/A" and website != "N/A" and phone != "N/A":
                                break
                            await asyncio.sleep(0.5)

                        # Final fallback for website link extraction from all page anchors
                        if website == "N/A":
                            links = await page.query_selector_all('a')
                            for link in links:
                                href = await link.get_attribute('href')
                                if href and ('http' in href) and not any(x in href for x in ['google.com', 'google.co.uk', 'facebook.com', 'instagram.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'google.com/maps']):
                                    website = href
                                    break
                        
                        city, country = parse_address(address)
                        log(f"Found Lead: {name} | City: {city} | Website: {website}")
                        
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
                        log(f"Error extracting listing inside feed: {e}")
                        continue
                
                if len(results) >= max_results:
                    break
                
                if new_listings_processed == 0:
                    log("No new listings found in this scroll pass, attempting scroll to fetch more...")

                await page.evaluate(f"document.querySelector('{feed_selector}').scrollBy(0, 1000)")
                await asyncio.sleep(random.uniform(2.0, 4.0)) # Random wait after scroll
                
                end_msg = await page.query_selector('text="You\'ve reached the end of the list"')
                if end_msg:
                    log("Reached the end of Google Maps listings.")
                    break
        else:
            log("Unrecognized Google Maps layout or no results found.")

        await browser.close()
        return results

def save_output(results, log_callback=None):
    def log(msg):
        print(msg)
        if log_callback:
            log_callback(msg)

    if not results:
        log("No results to save.")
        return

    # Clean up fields (remove decorative icons like  and  and strip surrounding whitespace/newlines)
    for r in results:
        for k in ["Business Name", "Website", "City", "Country", "Address", "Phone"]:
            if k in r and isinstance(r[k], str):
                val = r[k].replace("", "").replace("", "").strip()
                val = re.sub(r'^\s+|\s+$', '', val)
                r[k] = val if val else "N/A"

    # 1. Update results.csv
    df = pd.DataFrame(results)
    file_exists = os.path.isfile(RESULTS_CSV)
    
    if file_exists:
        try:
            # Read header of existing file to align columns perfectly
            existing_df = pd.read_csv(RESULTS_CSV, nrows=0)
            existing_cols = existing_df.columns.tolist()
            # Reindex df to match existing columns, putting any missing columns at the end and filling new columns with N/A
            for col in existing_cols:
                if col not in df.columns:
                    df[col] = "N/A"
            df = df.reindex(columns=existing_cols)
        except Exception as e:
            log(f"Warning aligning columns to {RESULTS_CSV}: {e}")
            
    df.to_csv(RESULTS_CSV, mode='a', index=False, header=not file_exists)
    log(f"{'Appended to' if file_exists else 'Created'} {RESULTS_CSV} with {len(results)} new results.")

    # 2. Update urls.txt (Unique URLs only)
    new_urls = [r["Website"] for r in results if r["Website"] != "N/A"]
    if not new_urls:
        log("No websites found to add to urls.txt.")
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
        log(f"Added {len(unique_new_urls)} new unique URLs to {URLS_TXT}.")
    else:
        log("No new unique URLs found for urls.txt.")

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
