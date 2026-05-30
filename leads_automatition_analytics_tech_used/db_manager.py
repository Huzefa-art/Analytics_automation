import sqlite3
import os
import pandas as pd
import re

DB_PATH = "leads.db"
CSV_PATH = "results.csv"

# Map CSV headers to SQLite column names
CSV_TO_DB_MAP = {
    "Business Name": "business_name",
    "Industry": "industry",
    "Analysis Status": "analysis_status",
    "Website": "website",
    "City": "city",
    "Country": "country",
    "Address": "address",
    "Phone": "phone",
    "Facebook Page": "facebook_page",
    "Email": "email",
    "Ads Active": "ads_active",
    "Ad Count": "ad_count",
    "Oldest Ad Date": "oldest_ad_date",
    "CMS": "cms",
    "CRM / Marketing Automation": "crm",
    "Analytics": "analytics",
    "Live Chat / Support": "live_chat",
    "Payments": "payments",
    "Advertising / Pixels": "advertising",
    "Hosting / CDN": "hosting",
    "JavaScript Frameworks": "js_frameworks"
}

# Reverse map for returning data back matching expected column formats
DB_TO_CSV_MAP = {v: k for k, v in CSV_TO_DB_MAP.items()}

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_name TEXT NOT NULL,
            industry TEXT DEFAULT 'N/A',
            analysis_status TEXT DEFAULT 'Pending',
            website TEXT DEFAULT 'N/A',
            city TEXT DEFAULT 'N/A',
            country TEXT DEFAULT 'N/A',
            address TEXT DEFAULT 'N/A',
            phone TEXT DEFAULT 'N/A',
            facebook_page TEXT DEFAULT 'N/A',
            email TEXT DEFAULT 'N/A',
            ads_active TEXT DEFAULT 'N/A',
            ad_count TEXT DEFAULT '—',
            oldest_ad_date TEXT DEFAULT '—',
            cms TEXT DEFAULT 'N/A',
            crm TEXT DEFAULT 'N/A',
            analytics TEXT DEFAULT 'N/A',
            live_chat TEXT DEFAULT 'N/A',
            payments TEXT DEFAULT 'N/A',
            advertising TEXT DEFAULT 'N/A',
            hosting TEXT DEFAULT 'N/A',
            js_frameworks TEXT DEFAULT 'N/A',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(business_name, website)
        )
    """)
    conn.commit()
    
    # Run automatic migration from results.csv if db is currently empty
    cursor.execute("SELECT COUNT(*) as count FROM leads")
    row = cursor.fetchone()
    if row["count"] == 0 and os.path.exists(CSV_PATH):
        print("leads.db is currently empty. Starting automatic migration from results.csv...")
        try:
            df = pd.read_csv(CSV_PATH)
            # Ensure all needed columns are present
            for col in CSV_TO_DB_MAP.keys():
                if col not in df.columns:
                    df[col] = "N/A"
            df = df.fillna("N/A")
            
            migrated_count = 0
            for _, row_data in df.iterrows():
                try:
                    cursor.execute(f"""
                        INSERT OR IGNORE INTO leads (
                            business_name, industry, analysis_status, website, city, country, address, phone,
                            facebook_page, email, ads_active, ad_count, oldest_ad_date,
                            cms, crm, analytics, live_chat, payments, advertising, hosting, js_frameworks
                        ) VALUES (
                            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                        )
                    """, (
                        str(row_data["Business Name"]),
                        str(row_data["Industry"]),
                        str(row_data["Analysis Status"]),
                        str(row_data["Website"]),
                        str(row_data["City"]),
                        str(row_data["Country"]),
                        str(row_data["Address"]),
                        str(row_data["Phone"]),
                        str(row_data["Facebook Page"]),
                        str(row_data["Email"]),
                        str(row_data["Ads Active"]),
                        str(row_data["Ad Count"]),
                        str(row_data["Oldest Ad Date"]),
                        str(row_data["CMS"]),
                        str(row_data["CRM / Marketing Automation"]),
                        str(row_data["Analytics"]),
                        str(row_data["Live Chat / Support"]),
                        str(row_data["Payments"]),
                        str(row_data["Advertising / Pixels"]),
                        str(row_data["Hosting / CDN"]),
                        str(row_data["JavaScript Frameworks"])
                    ))
                    migrated_count += 1
                except Exception as e:
                    print(f"Error migrating row: {e}")
            conn.commit()
            print(f"Successfully migrated {migrated_count} records from results.csv into leads.db!")
        except Exception as e:
            print(f"Automatic migration failed: {e}")
            
    conn.close()

def insert_lead(lead_dict):
    """
    Inserts a newly scraped lead into SQLite.
    Expected dict keys match CSV_TO_DB_MAP or standard results columns.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Normalize keys to SQL columns
    sql_data = {}
    for csv_key, db_col in CSV_TO_DB_MAP.items():
        default_val = "Pending" if db_col == "analysis_status" else "N/A"
        sql_data[db_col] = str(lead_dict.get(csv_key, lead_dict.get(db_col, default_val)))
        
    try:
        cursor.execute("""
            INSERT OR REPLACE INTO leads (
                business_name, industry, analysis_status, website, city, country, address, phone,
                facebook_page, email, ads_active, ad_count, oldest_ad_date,
                cms, crm, analytics, live_chat, payments, advertising, hosting, js_frameworks,
                updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                CURRENT_TIMESTAMP
            )
        """, (
            sql_data["business_name"],
            sql_data["industry"],
            sql_data["analysis_status"],
            sql_data["website"],
            sql_data["city"],
            sql_data["country"],
            sql_data["address"],
            sql_data["phone"],
            sql_data["facebook_page"],
            sql_data["email"],
            sql_data["ads_active"],
            sql_data["ad_count"],
            sql_data["oldest_ad_date"],
            sql_data["cms"],
            sql_data["crm"],
            sql_data["analytics"],
            sql_data["live_chat"],
            sql_data["payments"],
            sql_data["advertising"],
            sql_data["hosting"],
            sql_data["js_frameworks"]
        ))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error inserting lead into SQLite: {e}")
        return False
    finally:
        conn.close()

def get_all_leads():
    """
    Retrieves all leads from leads.db and outputs a list of dictionaries 
    with original key names matching expected React layout.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    leads = []
    try:
        cursor.execute("SELECT * FROM leads ORDER BY id DESC")
        rows = cursor.fetchall()
        for row in rows:
            lead = {}
            for db_col, csv_key in DB_TO_CSV_MAP.items():
                lead[csv_key] = row[db_col]
            leads.append(lead)
    except Exception as e:
        print(f"Error fetching leads: {e}")
    finally:
        conn.close()
    return leads

def get_pending_leads(limit=10):
    """
    Retrieves the first N pending leads with a valid website for analysis.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    pending = []
    try:
        cursor.execute("""
            SELECT website FROM leads 
            WHERE analysis_status = 'Pending' 
              AND website != 'N/A' 
              AND website IS NOT NULL 
              AND website != ''
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        pending = [row["website"] for row in rows]
    except Exception as e:
        print(f"Error fetching pending leads: {e}")
    finally:
        conn.close()
    return pending

def update_lead_analysis(website, analysis_dict):
    """
    Updates the technology stack and status for a specific website.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Normalize website mapping key
    def clean_url(u):
        if not isinstance(u, str):
            return ""
        u = u.lower().strip()
        u = re.sub(r'^https?://', '', u)
        u = re.sub(r'^www\.', '', u)
        u = u.rstrip('/')
        return u
        
    match_url = clean_url(website)
    if not match_url:
        conn.close()
        return False
        
    try:
        # Fetch all websites to do clean comparison matching
        cursor.execute("SELECT id, website FROM leads")
        rows = cursor.fetchall()
        target_id = None
        for row in rows:
            if clean_url(row["website"]) == match_url:
                target_id = row["id"]
                break
                
        if target_id is not None:
            # Map parameters
            analysis_status = "Analyzed"
            facebook_page = str(analysis_dict.get("Facebook Page", "N/A"))
            email = str(analysis_dict.get("Email", "N/A"))
            ads_active = str(analysis_dict.get("Ads Active", "N/A"))
            ad_count = str(analysis_dict.get("Ad Count", "—"))
            oldest_ad_date = str(analysis_dict.get("Oldest Ad Date", "—"))
            
            cms = str(analysis_dict.get("CMS", "N/A"))
            crm = str(analysis_dict.get("CRM / Marketing Automation", "N/A"))
            analytics = str(analysis_dict.get("Analytics", "N/A"))
            live_chat = str(analysis_dict.get("Live Chat / Support", "N/A"))
            payments = str(analysis_dict.get("Payments", "N/A"))
            advertising = str(analysis_dict.get("Advertising / Pixels", "N/A"))
            hosting = str(analysis_dict.get("Hosting / CDN", "N/A"))
            js_frameworks = str(analysis_dict.get("JavaScript Frameworks", "N/A"))
            
            cursor.execute("""
                UPDATE leads SET
                    analysis_status = ?,
                    facebook_page = ?,
                    email = ?,
                    ads_active = ?,
                    ad_count = ?,
                    oldest_ad_date = ?,
                    cms = ?,
                    crm = ?,
                    analytics = ?,
                    live_chat = ?,
                    payments = ?,
                    advertising = ?,
                    hosting = ?,
                    js_frameworks = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (
                analysis_status, facebook_page, email, ads_active, ad_count, oldest_ad_date,
                cms, crm, analytics, live_chat, payments, advertising, hosting, js_frameworks,
                target_id
            ))
            conn.commit()
            return True
        else:
            print(f"Could not find matching website record for: {website}")
            return False
    except Exception as e:
        print(f"Error updating lead analysis: {e}")
        return False
    finally:
        conn.close()

def init_settings_table(conn):
    """Creates the settings key-value store table if it doesn't exist."""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

def get_setting(key: str, default=None):
    """Retrieve a single setting value by key."""
    conn = get_db_connection()
    try:
        init_settings_table(conn)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row["value"] if row else default
    except Exception as e:
        print(f"Error reading setting '{key}': {e}")
        return default
    finally:
        conn.close()

def set_setting(key: str, value: str):
    """Upsert a setting value by key."""
    conn = get_db_connection()
    try:
        init_settings_table(conn)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        """, (key, value))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error saving setting '{key}': {e}")
        return False
    finally:
        conn.close()

def get_all_settings() -> dict:
    """Retrieve all settings as a dictionary."""
    conn = get_db_connection()
    try:
        init_settings_table(conn)
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        rows = cursor.fetchall()
        return {row["key"]: row["value"] for row in rows}
    except Exception as e:
        print(f"Error reading all settings: {e}")
        return {}
    finally:
        conn.close()

# Always initialize database table on import
init_db()

# ─── Market Research Persistent Cache ────────────────────────────────────────

import json as _json
import hashlib as _hashlib

def init_market_cache_table():
    """Creates the market_research_cache table if it doesn't exist."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS market_research_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT NOT NULL UNIQUE,
            tab TEXT NOT NULL,
            industry TEXT NOT NULL,
            problem TEXT DEFAULT '',
            result_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def save_market_result(tab: str, industry: str, problem: str, data: dict):
    """Persist a market research result to SQLite. Upserts on same key."""
    raw = f"{tab}:{industry.lower()}:{(problem or '').lower()}"
    key = _hashlib.md5(raw.encode()).hexdigest()
    conn = get_db_connection()
    try:
        init_market_cache_table()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO market_research_cache (cache_key, tab, industry, problem, result_json, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(cache_key) DO UPDATE SET
                result_json = excluded.result_json,
                updated_at  = CURRENT_TIMESTAMP
        """, (key, tab, industry, problem or '', _json.dumps(data)))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error saving market result: {e}")
        return False
    finally:
        conn.close()

def load_market_result(tab: str, industry: str, problem: str):
    """Load a saved market research result. Returns dict or None."""
    raw = f"{tab}:{industry.lower()}:{(problem or '').lower()}"
    key = _hashlib.md5(raw.encode()).hexdigest()
    conn = get_db_connection()
    try:
        init_market_cache_table()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT result_json FROM market_research_cache WHERE cache_key = ?", (key,)
        )
        row = cursor.fetchone()
        return _json.loads(row["result_json"]) if row else None
    except Exception as e:
        print(f"Error loading market result: {e}")
        return None
    finally:
        conn.close()

def list_market_searches():
    """Return all saved searches as a list of metadata dicts (no result payload)."""
    conn = get_db_connection()
    try:
        init_market_cache_table()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT cache_key, tab, industry, problem, updated_at
            FROM market_research_cache
            ORDER BY updated_at DESC
        """)
        rows = cursor.fetchall()
        return [
            {
                "cache_key": r["cache_key"],
                "tab":       r["tab"],
                "industry":  r["industry"],
                "problem":   r["problem"],
                "saved_at":  r["updated_at"],
            }
            for r in rows
        ]
    except Exception as e:
        print(f"Error listing market searches: {e}")
        return []
    finally:
        conn.close()

def delete_market_result(cache_key: str):
    """Delete a single saved search by its cache key."""
    conn = get_db_connection()
    try:
        init_market_cache_table()
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM market_research_cache WHERE cache_key = ?", (cache_key,)
        )
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error deleting market result: {e}")
        return False
    finally:
        conn.close()

# Ensure table exists on import
init_market_cache_table()
