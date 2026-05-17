import asyncio
import re
import sys
import random
import pandas as pd
from datetime import datetime
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
from ads_analyzer import get_fb_page_info

async def scrape_ad_portfolio(page, page_id, business_name):
    """Scrape detailed ad content from Meta Ad Library for a Page ID."""
    ad_library_url = f"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id={page_id}&search_type=page&media_type=all"
    
    ads_data = []
    try:
        print(f"    - Visiting Ad Library for {business_name} (ID: {page_id})")
        await page.goto(ad_library_url, wait_until="networkidle", timeout=60000)
        await asyncio.sleep(random.uniform(5.0, 9.0))  # Decent random pause for ad library
        
        # Look for ad cards
        ad_cards = await page.locator('div[role="article"]').all()
        print(f"    - Found {len(ad_cards)} potential ads")
        
        for i, card in enumerate(ad_cards[:10]): # Limit to 10 for performance
            try:
                # 1. Get Status and Date (usually in the header of the card)
                header_text = await card.inner_text()
                
                # Regex for "Started running on MMM DD, YYYY"
                date_match = re.search(r'Started running on ([A-Z][a-z]+ \d{1,2}, \d{4})', header_text)
                start_date = date_match.group(1) if date_match else "Unknown"
                
                # Ad Status
                status = "Active" if "Active" in header_text else "Inactive"
                
                # 2. Get Primary Text
                # Usually in a container with specific structure
                primary_text = "N/A"
                text_containers = await card.locator('div[dir="auto"]').all()
                if len(text_containers) > 0:
                   primary_text = await text_containers[0].inner_text()
                
                # 3. Get Media/Headline (if available)
                # This is harder as it's often nested
                headline = "N/A"
                if len(text_containers) > 1:
                   headline = await text_containers[-1].inner_text()

                ads_data.append({
                    "Business Name": business_name,
                    "Ad Status": status,
                    "Start Date": start_date,
                    "Primary Text": primary_text,
                    "Headline": headline,
                    "Ad Library URL": ad_library_url
                })
            except Exception as e:
                print(f"      ! Error parsing ad card {i}: {e}")
                
    except Exception as e:
        print(f"    ! Error scraping portfolio for {page_id}: {e}")
        
    return ads_data

async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 ad_portfolio_scraper.py <input_excel_file>")
        return

    input_file = sys.argv[1]
    output_file = f"ad_portfolio_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    try:
        # 1. Read Excel
        print(f"Reading {input_file} ...")
        df = pd.read_excel(input_file, sheet_name="Facebook & Ads")
        
        # Filter for rows with Facebook pages
        fb_leads = df[df["Facebook Page"] != "N/A"].to_dict("records")
        print(f"Found {len(fb_leads)} leads with Facebook pages to analyze.")
        
        if not fb_leads:
            print("No Facebook pages found to analyze. Exiting.")
            return

        # 2. Start Playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
            page = await context.new_page()
            await stealth_async(page)
            
            all_portfolios = []
            
            for lead in fb_leads:
                fb_url = lead["Facebook Page"]
                biz_name = lead.get("Website URL", fb_url) # Fallback to URL
                
                print(f"Analyzing: {biz_name}")
                
                # Get Page ID
                page_id = await get_fb_page_info(page, fb_url)
                if page_id:
                    portfolio = await scrape_ad_portfolio(page, page_id, biz_name)
                    all_portfolios.extend(portfolio)
                else:
                    print(f"  - Could not resolve Page ID for {fb_url}")
                
                await asyncio.sleep(random.uniform(2.5, 5.0)) # Be polite jitter
                
            await browser.close()
            
            # 3. Save Results
            if all_portfolios:
                out_df = pd.DataFrame(all_portfolios)
                out_df.to_excel(output_file, index=False)
                print(f"\n✅ Portfolio scrape complete! Saved to: {output_file}")
            else:
                print("\n❌ No ad data found.")

    except Exception as e:
        print(f"Fatal error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
