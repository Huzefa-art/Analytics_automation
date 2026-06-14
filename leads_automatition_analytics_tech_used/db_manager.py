"""
Database manager — Supabase (PostgreSQL) only.
DATABASE_URL must be set in environment — no SQLite fallback.
"""
import os
import json as _json
import hashlib as _hashlib

DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Set it in .env to point to your Supabase instance.")

# ─── Connection factory ───────────────────────────────────────────────────────
def get_pg_conn():
    import psycopg2
    import psycopg2.extras
    import time as _time
    url = DATABASE_URL
    if "sslmode" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"
    last_err = None
    for attempt in range(3):
        try:
            return psycopg2.connect(url)
        except psycopg2.OperationalError as e:
            last_err = e
            if attempt < 2:
                _time.sleep(1 * (attempt + 1))
    raise last_err

# Keep alias so any legacy code calling get_db_connection() still works
def get_db_connection():
    return get_pg_conn()

# ─── Schema DDL ───────────────────────────────────────────────────────────────
LEADS_DDL = """
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
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
    rating TEXT DEFAULT '0',
    reviews TEXT DEFAULT '0',
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
    signal_evidence JSONB DEFAULT '{}',
    current_process TEXT DEFAULT '',
    after_chatbot TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(business_name, website)
);
"""

SETTINGS_DDL = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);
"""

MARKET_CACHE_DDL = """
CREATE TABLE IF NOT EXISTS market_research_cache (
    id SERIAL PRIMARY KEY,
    cache_key TEXT NOT NULL UNIQUE,
    tab TEXT NOT NULL,
    industry TEXT NOT NULL,
    problem TEXT DEFAULT '',
    result_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
"""

# ─── CSV/DB column maps ────────────────────────────────────────────────────────
CSV_TO_DB_MAP = {
    "Business Name": "business_name", "Industry": "industry",
    "Analysis Status": "analysis_status", "Website": "website",
    "City": "city", "Country": "country", "Address": "address",
    "Phone": "phone", "Facebook Page": "facebook_page", "Email": "email",
    "Rating": "rating", "Reviews": "reviews",
    "Ads Active": "ads_active", "Ad Count": "ad_count",
    "Oldest Ad Date": "oldest_ad_date", "CMS": "cms",
    "CRM / Marketing Automation": "crm", "Analytics": "analytics",
    "Live Chat / Support": "live_chat", "Payments": "payments",
    "Advertising / Pixels": "advertising", "Hosting / CDN": "hosting",
    "JavaScript Frameworks": "js_frameworks",
    "Signal Evidence": "signal_evidence",
    "Current Process": "current_process",
    "After Chatbot": "after_chatbot"
}
DB_TO_CSV_MAP = {v: k for k, v in CSV_TO_DB_MAP.items()}

# ─── Schema init ──────────────────────────────────────────────────────────────
def init_db():
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute(LEADS_DDL)
        cur.execute(SETTINGS_DDL)
        cur.execute(MARKET_CACHE_DDL)
        conn.commit()
        print("PostgreSQL tables initialized.")
    except Exception as e:
        conn.rollback()
        raise RuntimeError(f"Failed to initialize PostgreSQL schema: {e}")
    finally:
        conn.close()
    migrate_db()

def migrate_db():
    """Add columns if they are missing in existing tables."""
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        # Columns to add to 'leads' table
        new_cols = [
            ("rating", "TEXT DEFAULT '0'"),
            ("reviews", "TEXT DEFAULT '0'"),
            ("signal_evidence", "JSONB DEFAULT '{}'"),
            ("current_process", "TEXT DEFAULT ''"),
            ("after_chatbot", "TEXT DEFAULT ''")
        ]
        for col_name, col_type in new_cols:
            try:
                cur.execute(f"ALTER TABLE leads ADD COLUMN {col_name} {col_type}")
                print(f"Added column {col_name} to leads.")
            except Exception:
                conn.rollback() # column likely already exists
        conn.commit()
    except Exception as e:
        print(f"Migration error: {e}")
    finally:
        conn.close()

def init_market_cache_table():
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute(MARKET_CACHE_DDL)
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise RuntimeError(f"Failed to initialize market_research_cache table: {e}")
    finally:
        conn.close()

# ─── Settings ─────────────────────────────────────────────────────────────────
def get_setting(key: str, default=None):
    conn = get_pg_conn()
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT value FROM settings WHERE key = %s", (key,))
        row = cur.fetchone()
        return row["value"] if row else default
    except Exception as e:
        print(f"get_setting error: {e}")
        return default
    finally:
        conn.close()

def set_setting(key: str, value: str):
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO settings (key, value, updated_at) VALUES (%s, %s, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        """, (key, value))
        conn.commit()
        return True
    except Exception as e:
        print(f"set_setting error: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def get_all_settings() -> dict:
    conn = get_pg_conn()
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT key, value FROM settings")
        return {r["key"]: r["value"] for r in cur.fetchall()}
    except Exception:
        return {}
    finally:
        conn.close()

# ─── Market Research Cache ────────────────────────────────────────────────────
def save_market_result(tab: str, industry: str, problem: str, data: dict):
    raw = f"{tab}:{industry.lower()}:{(problem or '').lower()}"
    key = _hashlib.md5(raw.encode()).hexdigest()
    payload = _json.dumps(data)
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO market_research_cache (cache_key, tab, industry, problem, result_json, updated_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (cache_key) DO UPDATE SET result_json = EXCLUDED.result_json, updated_at = NOW()
        """, (key, tab, industry, problem or '', payload))
        conn.commit()
        return True
    except Exception as e:
        print(f"save_market_result error: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def load_market_result(tab: str, industry: str, problem: str):
    raw = f"{tab}:{industry.lower()}:{(problem or '').lower()}"
    key = _hashlib.md5(raw.encode()).hexdigest()
    conn = get_pg_conn()
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT result_json FROM market_research_cache WHERE cache_key = %s", (key,))
        row = cur.fetchone()
        return _json.loads(row["result_json"]) if row else None
    except Exception as e:
        print(f"load_market_result error: {e}")
        return None
    finally:
        conn.close()

def load_market_result_by_key(cache_key: str):
    conn = get_pg_conn()
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT result_json FROM market_research_cache WHERE cache_key = %s", (cache_key,))
        row = cur.fetchone()
        return _json.loads(row["result_json"]) if row else None
    except Exception as e:
        print(f"load_market_result_by_key error: {e}")
        return None
    finally:
        conn.close()

def list_market_searches():
    conn = get_pg_conn()
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT cache_key, tab, industry, problem, updated_at
            FROM market_research_cache ORDER BY updated_at DESC
        """)
        return [{"cache_key": r["cache_key"], "tab": r["tab"],
                 "industry": r["industry"], "problem": r["problem"],
                 "saved_at": str(r["updated_at"])} for r in cur.fetchall()]
    except Exception as e:
        print(f"list_market_searches error: {e}")
        return []
    finally:
        conn.close()

def delete_market_result(cache_key: str):
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM market_research_cache WHERE cache_key = %s", (cache_key,))
        conn.commit()
        return cur.rowcount > 0
    except Exception as e:
        print(f"delete_market_result error: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def clear_all_market_results():
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM market_research_cache")
        conn.commit()
        return cur.rowcount
    except Exception as e:
        print(f"clear_all_market_results error: {e}")
        conn.rollback()
        return 0
    finally:
        conn.close()

# ─── Leads ────────────────────────────────────────────────────────────────────
def get_all_leads():
    conn = get_pg_conn()
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM leads ORDER BY id DESC")
        return [{DB_TO_CSV_MAP.get(k, k): v for k, v in dict(r).items()
                 if k in DB_TO_CSV_MAP} for r in cur.fetchall()]
    except Exception as e:
        print(f"get_all_leads error: {e}")
        return []
    finally:
        conn.close()

def get_pending_leads(limit=10):
    conn = get_pg_conn()
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT website FROM leads WHERE analysis_status = %s AND website != 'N/A' LIMIT %s",
            ("Pending", limit)
        )
        return [r["website"] for r in cur.fetchall()]
    except Exception:
        return []
    finally:
        conn.close()

def insert_lead(lead_dict):
    sql_data = {}
    for csv_key, db_col in CSV_TO_DB_MAP.items():
        val = lead_dict.get(csv_key, lead_dict.get(db_col))
        if db_col == "signal_evidence" and isinstance(val, (dict, list)):
            sql_data[db_col] = _json.dumps(val)
        elif val is None:
            sql_data[db_col] = "Pending" if db_col == "analysis_status" else "N/A"
        else:
            sql_data[db_col] = str(val)
            
    cols = list(sql_data.keys())
    vals = [sql_data[c] for c in cols]
    ph = ", ".join(["%s"] * len(cols))
    col_str = ", ".join(cols)
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            f"INSERT INTO leads ({col_str}) VALUES ({ph}) ON CONFLICT (business_name, website) DO NOTHING",
            vals
        )
        conn.commit()
        return True
    except Exception as e:
        print(f"insert_lead error: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def update_lead_analysis(website, analysis_dict):
    """Update lead with tech stack, email, ads, and signal runner results."""
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        
        # Prepare fields for update
        updates = []
        params = []
        
        for k, v in analysis_dict.items():
            db_col = CSV_TO_DB_MAP.get(k, k)
            if db_col in ["signal_evidence"] and isinstance(v, (dict, list, str)):
                # Ensure it's valid JSON
                if isinstance(v, str):
                    try:
                        _json.loads(v)
                        updates.append(f"{db_col} = %s::jsonb")
                        params.append(v)
                    except: pass 
                else:
                    updates.append(f"{db_col} = %s::jsonb")
                    params.append(_json.dumps(v))
            else:
                updates.append(f"{db_col} = %s")
                params.append(str(v))
        
        if updates:
            updates.append("analysis_status = %s")
            params.append("Analyzed")
            updates.append("updated_at = NOW()")
            
            query = f"UPDATE leads SET {', '.join(updates)} WHERE website = %s"
            params.append(website)
            
            cur.execute(query, params)
            conn.commit()
            return True
    except Exception as e:
        print(f"update_lead_analysis error: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def get_leads_for_outreach(industry=None, require_email=False, require_phone=False,
                            no_ads=False, no_crm=False, no_live_chat=False, no_payments=False):
    where_clauses = []
    params = []

    if industry and industry.lower() != 'all':
        where_clauses.append("LOWER(industry) LIKE %s")
        params.append(f"%{industry.lower()}%")
    if require_email:
        where_clauses.append("email IS NOT NULL AND email != 'N/A' AND email != ''")
    if require_phone:
        where_clauses.append("phone IS NOT NULL AND phone != 'N/A' AND phone != ''")
    if no_ads:
        where_clauses.append("(ads_active = 'No' OR ads_active = 'N/A' OR ads_active IS NULL)")
    if no_crm:
        where_clauses.append("(crm = 'N/A' OR crm = '[]' OR crm = '' OR crm IS NULL)")
    if no_live_chat:
        where_clauses.append("(live_chat = 'N/A' OR live_chat = '[]' OR live_chat = '' OR live_chat IS NULL)")
    if no_payments:
        where_clauses.append("(payments = 'N/A' OR payments = '[]' OR payments = '' OR payments IS NULL)")

    where_str = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    query = f"SELECT * FROM leads {where_str} ORDER BY id DESC"

    conn = get_pg_conn()
    try:
        import psycopg2.extras
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(query, params)
        return [{DB_TO_CSV_MAP.get(k, k): v for k, v in dict(r).items()
                 if k in DB_TO_CSV_MAP} for r in cur.fetchall()]
    except Exception as e:
        print(f"get_leads_for_outreach error: {e}")
        return []
    finally:
        conn.close()

# ─── Auto-init on import ──────────────────────────────────────────────────────
init_db()
