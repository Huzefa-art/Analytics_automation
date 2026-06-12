import requests
import json

BASE_URL = "http://localhost:8000"

def test_recommend_departments():
    industries = ["Logistics", "Restaurants", "Real Estate", "SaaS", "Alien Mining"]
    
    for industry in industries:
        print(f"\n--- Testing Industry: {industry} ---")
        try:
            response = requests.get(f"{BASE_URL}/api/market/recommend-departments?industry={industry}")
            if response.status_code == 200:
                depts = response.data if hasattr(response, 'data') else response.json()
                print(f"Found {len(depts)} departments:")
                for d in depts:
                    print(f"  - {d['label']} ({d['slug']})")
            else:
                print(f"Error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Request failed: {e}")

if __name__ == "__main__":
    # Note: This assumes the server is running on port 8000
    test_recommend_departments()
