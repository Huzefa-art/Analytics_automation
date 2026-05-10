import asyncio
import csv
import os
import re
import time
from datetime import datetime
from playwright.async_api import async_playwright
import pandas as pd

# --- Configuration ---
# To use Google Sheets, you need a service_account.json and the Sheet ID
GSHEET_CREDENTIALS = "service_account.json"
GSHEET_NAME = "Maps Leads Scraper Results"

# Tech Fingerprints
FINGERPRINTS = {
    "HubSpot": ["hs-scripts.com", "_hsq", "js.hs-scripts.com"],
    "WordPress": ["/wp-content/", "/wp-includes/"],
    "Shopify": ["cdn.shopify.com"],
    "Webflow": ["webflow.com"],
    "Mailchimp": ["chimpstatic.com"],
    "ActiveCampaign": ["trackcmp.net"],
    "Google Tag Manager": ["googletagmanager.com"]
}

async def detect_tech(page, url):
    """Detect technologies on a website using a Playwright page."""
    tech_detected = []
    has_hubspot = False
    
    try:
        print(f"  [Scanner] Visiting: {url}")
        # Wait for network idle to ensure scripts are loaded
        await page.goto(url, timeout=30000, wait_until="networkidle")
        
        # Add a small delay for any extra dynamic content
        await asyncio.sleep(2)
        
        content = await page.content()
        content_lower = content.lower()
        
        for tech, patterns in FINGERPRINTS.items():
            if any(p.lower() in content_lower for p in patterns):
                tech_detected.append(tech)
                if tech == "HubSpot":
                    has_hubspot = True
                    
    except Exception as e:
        print(f"  [Scanner] Error on {url}: {e}")
        return "N/A", "N/A", "Error"

    tools_str = ", ".join(tech_detected) if tech_detected else "None"
    hubspot_yn = "Yes" if has_hubspot else "No"
    
    # Lead Scoring
    if has_hubspot:
        score = "Hot"
    elif tech_detected:
        score = "Warm"
    else:
        score = "Cold"
        
    return tools_str, hubspot_yn, score

async def scrape_google_maps(search_url, max_results=50):
    """Scrape business listings from a Google Maps search URL."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False) # Headed to see progress
        context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        page = await context.new_page()
        
        print(f"Opening Google Maps: {search_url}")
        await page.goto(search_url)
        await page.wait_for_selector('div[role="feed"]')
        
        results = []
        seen_names = set()
        
        # Scroll the feed to load results
        feed_selector = 'div[role="feed"]'
        
        while len(results) < max_results:
            # Get all result containers (usually links with specific aria-label)
            # This selector is common for business items in the feed
            listings = await page.query_selector_all('div[role="article"]')
            
            for listing in listings:
                try:
                    # Get business name from the aria-label of the link or the text content
                    # Often the link itself has the name in aria-label
                    link_element = await listing.query_selector('a[aria-label]')
                    name = await link_element.get_attribute('aria-label') if link_element else "Unknown"
                    
                    if name in seen_names or name == "Unknown":
                        continue
                    
                    seen_names.add(name)
                    
                    # Click to get details
                    await listing.click()
                    await asyncio.sleep(2) # Wait for details pane to load
                    
                    # Extract details from the right pane
                    address = "N/A"
                    website = "N/A"
                    phone = "N/A"
                    
                    # Selectors for details
                    address_elem = await page.query_selector('button[data-item-id="address"]')
                    if address_elem:
                        address = await address_elem.inner_text()
                        
                    website_elem = await page.query_selector('a[data-item-id="authority"]')
                    if website_elem:
                        website = await website_elem.get_attribute('href')
                        
                    phone_elem = await page.query_selector('button[data-item-id^="phone:tel:"]')
                    if phone_elem:
                        phone = await phone_elem.inner_text()
                    
                    print(f"Found: {name} | Website: {website}")
                    
                    results.append({
                        "Business Name": name,
                        "Website": website,
                        "Address": address,
                        "Phone": phone
                    })
                    
                    if len(results) >= max_results:
                        break
                        
                except Exception as e:
                    print(f"Error extracting listing: {e}")
                    continue
            
            # Scroll down the feed
            await page.evaluate(f'document.querySelector("{feed_selector}").scrollBy(0, 1000)')
            await asyncio.sleep(2)
            
            # Check if we reached the end
            end_msg = await page.query_selector('text="You\'ve reached the end of the list"')
            if end_msg:
                break

        # Process each website for tech stack
        scanner_page = await context.new_page()
        final_results = []
        
        for res in results:
            if res["Website"] != "N/A":
                # Add 2-3 second delay between scans as requested
                await asyncio.sleep(3)
                tools, hs_yn, score = await detect_tech(scanner_page, res["Website"])
            else:
                tools, hs_yn, score = "None", "No", "Cold"
            
            res.update({
                "Tools Detected": tools,
                "HubSpot Y/N": hs_yn,
                "Lead Score": score
            })
            final_results.append(res)
            
        await browser.close()
        return final_results

def save_to_csv(results, filename="results.csv"):
    df = pd.DataFrame(results)
    df.to_csv(filename, index=False)
    print(f"Saved results to {filename}")

def save_to_gsheets(results):
    try:
        import gspread
        from oauth2client.service_account import ServiceAccountCredentials
        
        if not os.path.exists(GSHEET_CREDENTIALS):
            print("Google Sheets credentials not found. Skipping GSheets output.")
            return
            
        scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
        creds = ServiceAccountCredentials.from_json_keyfile_name(GSHEET_CREDENTIALS, scope)
        client = gspread.authorize(creds)
        
        try:
            sheet = client.open(GSHEET_NAME).sheet1
        except gspread.SpreadsheetNotFound:
            sheet = client.create(GSHEET_NAME).sheet1
            
        # Update header
        header = ["Business Name", "Website", "Address", "Phone", "Tools Detected", "HubSpot Y/N", "Lead Score"]
        sheet.insert_row(header, 1)
        
        # Prepare data rows
        data_rows = []
        for r in results:
            data_rows.append([
                r.get("Business Name", ""),
                r.get("Website", ""),
                r.get("Address", ""),
                r.get("Phone", ""),
                r.get("Tools Detected", ""),
                r.get("HubSpot Y/N", ""),
                r.get("Lead Score", "")
            ])
            
        sheet.insert_rows(data_rows, 2)
        print("Successfully updated Google Sheet.")
        
    except Exception as e:
        print(f"Error saving to Google Sheets: {e}")

async def main():
    import sys
    if len(sys.argv) < 2:
        print("Usage: python maps_leads_scraper.py <google_maps_url>")
        return
        
    search_url = sys.argv[1]
    results = await scrape_google_maps(search_url)
    
    save_to_csv(results)
    save_to_gsheets(results)
    
    print(f"Finished! Processed {len(results)} leads.")

if __name__ == "__main__":
    asyncio.run(main())
