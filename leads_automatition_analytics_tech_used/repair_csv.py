import pandas as pd
import re
import os

RESULTS_CSV = "results.csv"
URLS_TXT = "urls.txt"

def clean_value(val):
    if pd.isna(val) or not isinstance(val, str):
        return "N/A"
    # Remove special decorative icons like  (address icon) and  (phone icon)
    cleaned = val.replace("", "").replace("", "").strip()
    cleaned = re.sub(r'^\s+|\s+$', '', cleaned)
    return cleaned if cleaned else "N/A"

def clean_url(url):
    cleaned = clean_value(url)
    if cleaned == "N/A":
        return "N/A"
    
    # Filter out Google redirect / sponsored ad click links from business websites
    if cleaned.startswith("/aclk") or "google.com" in cleaned or "google.co.uk" in cleaned:
        return "N/A"
    
    return cleaned

def repair_database():
    if not os.path.exists(RESULTS_CSV):
        print(f"❌ '{RESULTS_CSV}' not found!")
        return

    print(f"📂 Reading '{RESULTS_CSV}' ...")
    df = pd.read_csv(RESULTS_CSV)
    print(f"Loaded {len(df)} total raw rows.")

    repaired_count = 0
    unshifted_count = 0

    for idx, row in df.iterrows():
        city = str(row.get("City", "")).strip().lower()
        
        # Check if the row has shifted columns (i.e. City column has a URL)
        is_shifted = False
        if city.startswith(("http://", "https://", "www.", "/aclk")) or ".co.uk" in city or ".com" in city or ".net" in city or ".org" in city:
            is_shifted = True

        if is_shifted:
            repaired_count += 1
            # Retrieve shifted values
            orig_website = row.get("City")
            orig_city = row.get("Country")
            orig_country = row.get("Address")
            orig_address = row.get("Phone")
            orig_phone = row.get("Website")  # Shuffled Phone got written into Website!

            # Clean and realign
            website = clean_url(orig_website)
            city_cleaned = clean_value(orig_city)
            country_cleaned = clean_value(orig_country)
            address_cleaned = clean_value(orig_address)
            phone_cleaned = clean_value(orig_phone)

            # Assign to corrected columns
            df.at[idx, "Business Name"] = clean_value(row.get("Business Name"))
            df.at[idx, "Website"] = website
            df.at[idx, "City"] = city_cleaned
            df.at[idx, "Country"] = country_cleaned
            df.at[idx, "Address"] = address_cleaned
            df.at[idx, "Phone"] = phone_cleaned
        else:
            unshifted_count += 1
            # Just clean decorative icons and strip whitespace from unshifted rows
            df.at[idx, "Business Name"] = clean_value(row.get("Business Name"))
            df.at[idx, "Website"] = clean_url(row.get("Website"))
            df.at[idx, "City"] = clean_value(row.get("City"))
            df.at[idx, "Country"] = clean_value(row.get("Country"))
            df.at[idx, "Address"] = clean_value(row.get("Address"))
            df.at[idx, "Phone"] = clean_value(row.get("Phone"))

    print(f"✅ Identified {repaired_count} shifted rows and {unshifted_count} unshifted rows.")

    # Drop duplicate rows (e.g. Dolce Vita repeated 40 times)
    before_dup = len(df)
    df = df.drop_duplicates(subset=["Business Name", "Address"], keep="first")
    after_dup = len(df)
    print(f"🧹 Removed {before_dup - after_dup} duplicate rows. Remaining: {after_dup} leads.")

    # Save repaired database
    df.to_csv(RESULTS_CSV, index=False)
    print(f"💾 Repaired database saved to '{RESULTS_CSV}'.")

    # Regenerate urls.txt with unique, valid cleaned URLs
    valid_urls = []
    for u in df["Website"].dropna().unique():
        u_clean = clean_url(u)
        if u_clean != "N/A":
            valid_urls.append(u_clean)
            
    valid_urls = sorted(list(set(valid_urls)))
    
    with open(URLS_TXT, "w") as f:
        for url in valid_urls:
            f.write(f"{url}\n")
    print(f"📝 Regenerated '{URLS_TXT}' with {len(valid_urls)} unique valid URLs.")

if __name__ == "__main__":
    repair_database()
