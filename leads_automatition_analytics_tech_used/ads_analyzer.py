import asyncio
import re
import random
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

async def get_fb_page_info(page, fb_url):
    """Visit FB page to extract Page ID."""
    try:
        await page.goto(fb_url, wait_until="networkidle")
        await asyncio.sleep(random.uniform(2.0, 4.5)) # Random pause
        html = await page.content()
        
        # Look for Page ID in various formats
        patterns = [
            r'fb://page/(\d+)',
            r'"pageID":"(\d+)"',
            r'"page_id":"(\d+)"',
            r'/pages/[^/]+/(\d+)',
            r'delegate_page":\{"id":"(\d+)"\}'
        ]
        for pattern in patterns:
            match = re.search(pattern, html)
            if match:
                return match.group(1)
                
    except Exception as e:
        print(f"Error getting FB Page ID for {fb_url}: {e}")
    return None

async def check_meta_ads(fb_url):
    """Check if a Facebook page is running ads."""
    if not fb_url or fb_url == "N/A":
        return {"active": "N/A", "count": 0, "oldest_date": "—"}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        page = await context.new_page()
        await stealth_async(page)
        
        # 1. Get Page ID
        page_id = await get_fb_page_info(page, fb_url)
        
        if not page_id:
            await browser.close()
            return {"active": "Unknown", "count": 0, "oldest_date": "—"}
            
        # 2. Check Ad Library
        if page_id:
            ad_library_url = f"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id={page_id}&search_type=page&media_type=all"
        else:
            # Fallback: search by name
            page_name = fb_url.split("facebook.com/")[-1].split("/")[0].split("?")[0]
            ad_library_url = f"https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q={page_name}&search_type=keyword_unordered&media_type=all"
            
        try:
            await page.goto(ad_library_url, wait_until="networkidle", timeout=60000)
            await asyncio.sleep(random.uniform(4.5, 7.0)) # Longer random pause for ad library
            
            html = await page.content()
            
            # 1. Check for "0 results"
            if "0 results" in html or "No results found" in html:
                return {"active": "No", "count": 0, "oldest_date": "—"}
            
            # 2. Check for results count (e.g., "120 results" or "~120 results")
            results_match = re.search(r'(?:~)?([\d,]+) results', html)
            if results_match:
                count_str = results_match.group(1).replace(",", "")
                return {"active": "Yes", "count": count_str, "oldest_date": "Active"}
            
            # 3. Check for ad cards directly
            ad_cards_count = await page.locator('div[role="article"]').count()
            if ad_cards_count > 0:
                return {"active": "Yes", "count": ad_cards_count, "oldest_date": "Active"}
                
        except Exception as e:
            print(f"Error checking Ad Library for {fb_url}: {e}")
            
        await browser.close()
        return {"active": "No", "count": 0, "oldest_date": "—"}

if __name__ == "__main__":
    # Test
    test_url = "https://www.facebook.com/DextersLondon"
    result = asyncio.run(check_meta_ads(test_url))
    print(result)
