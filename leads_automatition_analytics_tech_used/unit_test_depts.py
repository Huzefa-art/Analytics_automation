import asyncio
from market_research import recommend_departments, resolve_department_labels

async def test_logic():
    industries = ["Logistics", "Restaurants", "Real Estate", "SaaS", "Medical"]
    
    for industry in industries:
        print(f"\n--- Testing Industry: {industry} ---")
        depts = await recommend_departments(industry)
        print(f"Recommended {len(depts)} departments:")
        slugs = []
        for d in depts:
            print(f"  - {d['label']} ({d['slug']}) | Sub: {d['sub']}")
            slugs.append(d['slug'])
        
        # Test resolution
        resolved = resolve_department_labels(industry, slugs[:2])
        print(f"Resolved Labels (first 2): {resolved}")

if __name__ == "__main__":
    asyncio.run(test_logic())
