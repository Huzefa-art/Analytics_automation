"""
Database manager — supports both SQLite (local) and PostgreSQL (Supabase cloud).
If DATABASE_URL env var is set → uses PostgreSQL.
Otherwise → uses SQLite at DB_PATH.
"""
import sqlite3
import os
import re
import json as _json
import hashlib as _hashlib

DB_PATH = os.getenv("DB_PATH", "leads.db")
CSV_PATH = "results.csv"
DATABASE_URL = os.getenv("DATABASE_URL", "")  # Supabase/PostgreSQL connection string

# ─── Connection factory ───────────────────────────────────────────────────────
def _use_postgres():
    return bool(DATABASE_URL)

def get_pg_conn():
    import psycopg2
    import psycopg2.extras
    # Add sslmode to URL if not already present
    url = DATABASE_URL
    if "sslmode" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"
    conn = psycopg2.connect(url)
    return conn

def get_db_connection():
    """SQLite connection — only used when DATABASE_URL is not set."""
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn

# ─── Schema init ──────────────────────────────────────────────────────────────
LEADS_DDL_PG = """
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(business_name, website)
);
"""

SETTINGS_DDL_PG = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);
"""

MARKET_CACHE_DDL_PG = """
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

def init_db():
    if _use_postgres():
        try:
            _init_pg()
        except Exception as e:
            print(f"PostgreSQL init failed ({e}), falling back to SQLite")
            import os
            os.environ["DATABASE_URL"] = ""  # disable PG so SQLite is used
            _init_sqlite()
    else:
        _init_sqlite()

def _init_pg():
    conn = get_pg_conn()
    try:
        cur = conn.cursor()
        cur.execute(LEADS_DDL_PG)
        cur.execute(SETTINGS_DDL_PG)
        cur.execute(MARKET_CACHE_DDL_PG)
        conn.commit()
        print("PostgreSQL tables initialized.")
    except Exception as e:
        print(f"Error initializing PostgreSQL: {e}")
        conn.rollback()
    finally:
        conn.close()

def _init_sqlite():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_name TEXT NOT NULL,
            industry TEXT DEFAULT 'N/A',
            analysis_status TEXT DEFAULT 'Pending',
            website TEXT DEFAULT 'N/A',
            city TEXT DEFAULT 'N/A', country TEXT DEFAULT 'N/A',
            address TEXT DEFAULT 'N/A', phone TEXT DEFAULT 'N/A',
            facebook_page TEXT DEFAULT 'N/A', email TEXT DEFAULT 'N/A',
            ads_active TEXT DEFAULT 'N/A', ad_count TEXT DEFAULT '—',
            oldest_ad_date TEXT DEFAULT '—', cms TEXT DEFAULT 'N/A',
            crm TEXT DEFAULT 'N/A', analytics TEXT DEFAULT 'N/A',
            live_chat TEXT DEFAULT 'N/A', payments TEXT DEFAULT 'N/A',
            advertising TEXT DEFAULT 'N/A', hosting TEXT DEFAULT 'N/A',
            js_frameworks TEXT DEFAULT 'N/A',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(business_name, website)
        )""")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY, value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS market_research_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT NOT NULL UNIQUE, tab TEXT NOT NULL,
            industry TEXT NOT NULL, problem TEXT DEFAULT '',
            result_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )""")
    conn.commit()
    # Auto-migrate from CSV if DB is empty
    cursor.execute("SELECT COUNT(*) as count FROM leads")
    row = cursor.fetchone()
    if row["count"] == 0 and os.path.exists(CSV_PATH):
        try:
            import pandas as pd
            df = pd.read_csv(CSV_PATH)
            for col in CSV_TO_DB_MAP.keys():
                if col not in df.columns:
                    df[col] = "N/A"
            df = df.fillna("N/A")
            migrated = 0
            for _, r in df.iterrows():
                try:
                    cursor.execute("""INSERT OR IGNORE INTO leads
                        (business_name,industry,analysis_status,website,city,country,address,phone,
                         facebook_page,email,ads_active,ad_count,oldest_ad_date,cms,crm,analytics,
                         live_chat,payments,advertising,hosting,js_frameworks)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (str(r["Business Name"]),str(r["Industry"]),str(r["Analysis Status"]),
                         str(r["Website"]),str(r["City"]),str(r["Country"]),str(r["Address"]),
                         str(r["Phone"]),str(r["Facebook Page"]),str(r["Email"]),
                         str(r["Ads Active"]),str(r["Ad Count"]),str(r["Oldest Ad Date"]),
                         str(r["CMS"]),str(r["CRM / Marketing Automation"]),str(r["Analytics"]),
                         str(r["Live Chat / Support"]),str(r["Payments"]),
                         str(r["Advertising / Pixels"]),str(r["Hosting / CDN"]),
                         str(r["JavaScript Frameworks"])))
                    migrated += 1
                except Exception:
                    pass
            conn.commit()
            print(f"Migrated {migrated} records from CSV.")
        except Exception as e:
            print(f"CSV migration failed: {e}")
    conn.close()

# ─── CSV/DB column maps ────────────────────────────────────────────────────────
CSV_TO_DB_MAP = {
    "Business Name": "business_name", "Industry": "industry",
    "Analysis Status": "analysis_status", "Website": "website",
    "City": "city", "Country": "country", "Address": "address",
    "Phone": "phone", "Facebook Page": "facebook_page", "Email": "email",
    "Ads Active": "ads_active", "Ad Count": "ad_count",
    "Oldest Ad Date": "oldest_ad_date", "CMS": "cms",
    "CRM / Marketing Automation": "crm", "Analytics": "analytics",
    "Live Chat / Support": "live_chat", "Payments": "payments",
    "Advertising / Pixels": "advertising", "Hosting / CDN": "hosting",
    "JavaScript Frameworks": "js_frameworks"
}
DB_TO_CSV_MAP = {v: k for k, v in CSV_TO_DB_MAP.items()}

# ─── Settings ────────────────────────────────────────────────────────────────
def get_setting(key: str, default=None):
    if _use_postgres():
        conn = get_pg_conn()
        try:
            import psycopg2.extras
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("SELECT value FROM settings WHERE key = %s", (key,))
            row = cur.fetchone()
            return row["value"] if row else default
        except Exception as e:
            print(f"PG get_setting error: {e}")
            return default
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        try:
            _ensure_settings_table(conn)
            cur = conn.cursor()
            cur.execute("SELECT value FROM settings WHERE key = ?", (key,))
            row = cur.fetchone()
            return row["value"] if row else default
        except Exception as e:
            return default
        finally:
            conn.close()

def set_setting(key: str, value: str):
    if _use_postgres():
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
            print(f"PG set_setting error: {e}")
            conn.rollback()
            return False
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        try:
            _ensure_settings_table(conn)
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
            """, (key, value))
            conn.commit()
            return True
        except Exception as e:
            return False
        finally:
            conn.close()

def get_all_settings() -> dict:
    if _use_postgres():
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
    else:
        conn = get_db_connection()
        try:
            _ensure_settings_table(conn)
            cur = conn.cursor()
            cur.execute("SELECT key, value FROM settings")
            return {r["key"]: r["value"] for r in cur.fetchall()}
        except Exception:
            return {}
        finally:
            conn.close()

def _ensure_settings_table(conn):
    cur = conn.cursor()
    cur.execute("""CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    conn.commit()

# ─── Market Research Cache ────────────────────────────────────────────────────
def init_market_cache_table():
    if _use_postgres():
        conn = get_pg_conn()
        try:
            cur = conn.cursor()
            cur.execute(MARKET_CACHE_DDL_PG)
            conn.commit()
        except Exception as e:
            print(f"PG cache table init error: {e}")
            conn.rollback()
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""CREATE TABLE IF NOT EXISTS market_research_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT NOT NULL UNIQUE, tab TEXT NOT NULL,
            industry TEXT NOT NULL, problem TEXT DEFAULT '',
            result_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
        conn.commit()
        conn.close()

def save_market_result(tab: str, industry: str, problem: str, data: dict):
    raw = f"{tab}:{industry.lower()}:{(problem or '').lower()}"
    key = _hashlib.md5(raw.encode()).hexdigest()
    payload = _json.dumps(data)

    if _use_postgres():
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
            print(f"PG save_market_result error: {e}")
            conn.rollback()
            return False
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        try:
            init_market_cache_table()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO market_research_cache (cache_key, tab, industry, problem, result_json, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(cache_key) DO UPDATE SET result_json = excluded.result_json, updated_at = CURRENT_TIMESTAMP
            """, (key, tab, industry, problem or '', payload))
            conn.commit()
            return True
        except Exception as e:
            return False
        finally:
            conn.close()

def load_market_result(tab: str, industry: str, problem: str):
    raw = f"{tab}:{industry.lower()}:{(problem or '').lower()}"
    key = _hashlib.md5(raw.encode()).hexdigest()

    if _use_postgres():
        conn = get_pg_conn()
        try:
            import psycopg2.extras
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("SELECT result_json FROM market_research_cache WHERE cache_key = %s", (key,))
            row = cur.fetchone()
            return _json.loads(row["result_json"]) if row else None
        except Exception as e:
            print(f"PG load_market_result error: {e}")
            return None
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        try:
            init_market_cache_table()
            cur = conn.cursor()
            cur.execute("SELECT result_json FROM market_research_cache WHERE cache_key = ?", (key,))
            row = cur.fetchone()
            return _json.loads(row["result_json"]) if row else None
        except Exception:
            return None
        finally:
            conn.close()

def list_market_searches():
    if _use_postgres():
        conn = get_pg_conn()
        try:
            import psycopg2.extras
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("""SELECT cache_key, tab, industry, problem, updated_at
                           FROM market_research_cache ORDER BY updated_at DESC""")
            return [{"cache_key": r["cache_key"], "tab": r["tab"],
                     "industry": r["industry"], "problem": r["problem"],
                     "saved_at": str(r["updated_at"])} for r in cur.fetchall()]
        except Exception as e:
            print(f"PG list_market_searches error: {e}")
            return []
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        try:
            init_market_cache_table()
            cur = conn.cursor()
            cur.execute("""SELECT cache_key, tab, industry, problem, updated_at
                           FROM market_research_cache ORDER BY updated_at DESC""")
            return [{"cache_key": r["cache_key"], "tab": r["tab"],
                     "industry": r["industry"], "problem": r["problem"],
                     "saved_at": r["updated_at"]} for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()

def delete_market_result(cache_key: str):
    if _use_postgres():
        conn = get_pg_conn()
        try:
            cur = conn.cursor()
            cur.execute("DELETE FROM market_research_cache WHERE cache_key = %s", (cache_key,))
            conn.commit()
            return cur.rowcount > 0
        except Exception:
            conn.rollback()
            return False
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        try:
            init_market_cache_table()
            cur = conn.cursor()
            cur.execute("DELETE FROM market_research_cache WHERE cache_key = ?", (cache_key,))
            conn.commit()
            return cur.rowcount > 0
        except Exception:
            return False
        finally:
            conn.close()

# ─── Leads ────────────────────────────────────────────────────────────────────
def get_all_leads():
    if _use_postgres():
        conn = get_pg_conn()
        try:
            import psycopg2.extras
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute("SELECT * FROM leads ORDER BY id DESC")
            rows = cur.fetchall()
            return [{DB_TO_CSV_MAP.get(k, k): v for k, v in dict(r).items()
                     if k in DB_TO_CSV_MAP} for r in rows]
        except Exception as e:
            print(f"PG get_all_leads error: {e}")
            return []
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        cur = conn.cursor()
        leads = []
        try:
            cur.execute("SELECT * FROM leads ORDER BY id DESC")
            for row in cur.fetchall():
                lead = {DB_TO_CSV_MAP[col]: row[col]
                        for col in DB_TO_CSV_MAP if col in row.keys()}
                leads.append(lead)
        except Exception as e:
            print(f"SQLite get_all_leads error: {e}")
        finally:
            conn.close()
        return leads

def get_pending_leads(limit=10):
    q = "SELECT website FROM leads WHERE analysis_status = %s AND website != 'N/A' LIMIT %s" \
        if _use_postgres() else \
        "SELECT website FROM leads WHERE analysis_status = ? AND website != 'N/A' LIMIT ?"
    if _use_postgres():
        conn = get_pg_conn()
        try:
            import psycopg2.extras
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(q, ("Pending", limit))
            return [r["website"] for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(q, ("Pending", limit))
            return [r["website"] for r in cur.fetchall()]
        except Exception:
            return []
        finally:
            conn.close()

def insert_lead(lead_dict):
    sql_data = {}
    for csv_key, db_col in CSV_TO_DB_MAP.items():
        default_val = "Pending" if db_col == "analysis_status" else "N/A"
        sql_data[db_col] = str(lead_dict.get(csv_key, lead_dict.get(db_col, default_val)))
    cols = list(sql_data.keys())
    vals = [sql_data[c] for c in cols]

    if _use_postgres():
        ph = ", ".join(["%s"] * len(cols))
        col_str = ", ".join(cols)
        conn = get_pg_conn()
        try:
            cur = conn.cursor()
            cur.execute(f"INSERT INTO leads ({col_str}) VALUES ({ph}) ON CONFLICT (business_name, website) DO NOTHING", vals)
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            return False
        finally:
            conn.close()
    else:
        ph = ", ".join(["?"] * len(cols))
        col_str = ", ".join(cols)
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute(f"INSERT OR REPLACE INTO leads ({col_str}) VALUES ({ph})", vals)
            conn.commit()
            return True
        except Exception as e:
            return False
        finally:
            conn.close()

def update_lead_analysis(website, analysis_dict):
    # Simplified — only SQLite path needed locally
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE leads SET analysis_status='Analyzed', updated_at=CURRENT_TIMESTAMP WHERE website=?", (website,))
        conn.commit()
        return True
    except Exception:
        return False
    finally:
        conn.close()

def get_leads_for_outreach(industry=None, require_email=False, require_phone=False, no_ads=False, no_crm=False, no_live_chat=False, no_payments=False):
    where_clauses = []
    params = []
    
    if industry and industry.lower() != 'all':
        where_clauses.append("LOWER(industry) LIKE %s" if _use_postgres() else "LOWER(industry) LIKE ?")
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
        
    where_str = ""
    if where_clauses:
        where_str = "WHERE " + " AND ".join(where_clauses)
        
    query = f"SELECT * FROM leads {where_str} ORDER BY id DESC"
    
    if _use_postgres():
        conn = get_pg_conn()
        try:
            import psycopg2.extras
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(query, params)
            rows = cur.fetchall()
            return [{DB_TO_CSV_MAP.get(k, k): v for k, v in dict(r).items()
                     if k in DB_TO_CSV_MAP} for r in rows]
        except Exception as e:
            print(f"PG get_leads_for_outreach error: {e}")
            return []
        finally:
            conn.close()
    else:
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            sqlite_query = query.replace("%s", "?")
            cur.execute(sqlite_query, params)
            rows = cur.fetchall()
            leads = []
            for row in rows:
                lead = {DB_TO_CSV_MAP[col]: row[col]
                        for col in DB_TO_CSV_MAP if col in row.keys()}
                leads.append(lead)
            return leads
        except Exception as e:
            print(f"SQLite get_leads_for_outreach error: {e}")
            return []
        finally:
            conn.close()

# ─── Auto-init on import ──────────────────────────────────────────────────────
init_db()
init_market_cache_table()
