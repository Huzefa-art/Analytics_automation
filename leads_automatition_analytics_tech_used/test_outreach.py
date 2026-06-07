import os
from dotenv import load_dotenv
load_dotenv()

import db_manager
from market_research import nvidia_chat
import json

def test_query():
    print("Testing get_leads_for_outreach...")
    # Fetch restaurant targets that have emails
    leads = db_manager.get_leads_for_outreach(
        industry="restaurants",
        require_email=True,
        no_ads=False
    )
    print(f"Matched {len(leads)} restaurant leads with emails.")
    if leads:
        print("Sample Lead:")
        print(f"Name: {leads[0].get('Business Name')}")
        print(f"Email: {leads[0].get('Email')}")
        print(f"CMS: {leads[0].get('CMS')}")
        print(f"Payments: {leads[0].get('Payments')}")

def test_llm():
    print("\nTesting LLM Pitch Generation...")
    business_name = "Le Bistro"
    website = "https://lebistro.example.com"
    tech_stack = {"CMS": "WordPress", "CRM": "N/A", "Payments": "N/A"}
    pain_theme = "High Commission Fees on Delivery Apps"
    pain_desc = "Restaurant owners on Reddit complain that third-party delivery apps take 30% cuts on food orders, leaving them with thin margins."
    user_offer = "We build custom online ordering portals that integrate directly with WordPress so you keep 100% of order values."

    from api import make_pitch_prompt
    prompt = make_pitch_prompt(business_name, website, tech_stack, pain_theme, pain_desc, user_offer)
    print("Prompt built. Requesting NVIDIA LLM...")
    response = nvidia_chat(prompt, max_tokens=800)
    print("\nLLM Raw Response:")
    print(response)
    
    try:
        clean_resp = response.strip()
        if clean_resp.startswith("```json"):
            clean_resp = clean_resp[7:]
        if clean_resp.endswith("```"):
            clean_resp = clean_resp[:-3]
        clean_resp = clean_resp.strip()
        parsed = json.loads(clean_resp)
        print("\nSuccessfully parsed JSON response:")
        print(f"Subject: {parsed.get('subject')}")
        print(f"Body:\n{parsed.get('body')}")
    except Exception as e:
        print(f"\nFailed to parse JSON: {e}")

if __name__ == "__main__":
    test_query()
    test_llm()
