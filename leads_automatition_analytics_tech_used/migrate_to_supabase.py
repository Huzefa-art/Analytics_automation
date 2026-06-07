"""
One-time migration script: copies all data from local leads.db → Supabase PostgreSQL.
Run from the project root:
    python migrate_to_supabase.py
"""
import os
import json
import sqlite3

# Load .env
from dotenv import load_dotenv
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("❌ DATABASE_URL not set. Add it to .env first.")
    exit(1)

import psycopg2
import psycopg2.extras

SQLITE_PATH = os.getenv("DB_PATH", "leads.db")

print(f"Source SQLite : {SQLITE_PATH}")
print(f"Target Supabase: {DATABASE_URL[:50]}...")
print()

# ── Connect to both ────────────────────────────────────────────────────────────
sqlite_conn = sqlite3.connect(SQLITE_PATH)
sqlite_conn.row_factory = sqlite3.Row

url = DATABASE_URL
if "sslmode" not in url:
    sep = "&" if "?" in url else "?"
    url = f"{url}{sep}sslmode=require"

try:
    pg_conn = psycopg2.connect(url)
    pg_conn.autocommit = False
    print("✅ Connected to Supabase")
except Exception as e:
    print(f"❌ Could not connect to Supabase: {e}")
    exit(1)

pg_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
sqlite_cur = sqlite_conn.cursor()

# ── Create tables if they don't exist ─────────────────────────────────────────
print("\nEnsuring tables exist in Supabase...")
pg_cur.execute("""
    CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        business_name TEXT NOT NULL,
        industry TEXT DEFAULT 'N/A', analysis_status TEXT DEFAULT 'Pending',
        website TEXT DEFAULT 'N/A', city TEXT DEFAULT 'N/A',
        country TEXT DEFAULT 'N/A', address TEXT DEFAULT 'N/A',
        phone TEXT DEFAULT 'N/A', facebook_page TEXT DEFAULT 'N/A',
        email TEXT DEFAULT 'N/A', ads_active TEXT DEFAULT 'N/A',
        ad_count TEXT DEFAULT '—', oldest_ad_date TEXT DEFAULT '—',
        cms TEXT DEFAULT 'N/A', crm TEXT DEFAULT 'N/A',
        analytics TEXT DEFAULT 'N/A', live_chat TEXT DEFAULT 'N/A',
        payments TEXT DEFAULT 'N/A', advertising TEXT DEFAULT 'N/A',
        hosting TEXT DEFAULT 'N/A', js_frameworks TEXT DEFAULT 'N/A',
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(business_name, website)
    )
""")
pg_cur.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT NOW()
    )
""")
pg_cur.execute("""
    CREATE TABLE IF NOT EXISTS market_research_cache (
        id SERIAL PRIMARY KEY,
        cache_key TEXT NOT NULL UNIQUE, tab TEXT NOT NULL,
        industry TEXT NOT NULL, problem TEXT DEFAULT '',
        result_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    )
""")
pg_conn.commit()
print("✅ Tables ready")

# ── Migrate leads ──────────────────────────────────────────────────────────────
print("\nMigrating leads...")
sqlite_cur.execute("SELECT * FROM leads")
leads = sqlite_cur.fetchall()
print(f"  Found {len(leads)} leads in SQLite")

migrated = skipped = 0
for row in leads:
    try:
        pg_cur.execute("""
            INSERT INTO leads (business_name, industry, analysis_status, website,
                city, country, address, phone, facebook_page, email,
                ads_active, ad_count, oldest_ad_date, cms, crm, analytics,
                live_chat, payments, advertising, hosting, js_frameworks)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (business_name, website) DO NOTHING
        """, (
            row["business_name"], row["industry"], row["analysis_status"], row["website"],
            row["city"], row["country"], row["address"], row["phone"],
            row["facebook_page"], row["email"], row["ads_active"], row["ad_count"],
            row["oldest_ad_date"], row["cms"], row["crm"], row["analytics"],
            row["live_chat"], row["payments"], row["advertising"], row["hosting"],
            row["js_frameworks"]
        ))
        migrated += 1
    except Exception as e:
        skipped += 1
pg_conn.commit()
print(f"  ✅ {migrated} leads migrated, {skipped} skipped (duplicates)")

# ── Migrate settings ────────────────────────────────────────────────────────────
print("\nMigrating settings...")
try:
    sqlite_cur.execute("SELECT key, value FROM settings")
    settings = sqlite_cur.fetchall()
    print(f"  Found {len(settings)} settings")
    for row in settings:
        if row["value"]:  # skip empty values
            pg_cur.execute("""
                INSERT INTO settings (key, value) VALUES (%s, %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            """, (row["key"], row["value"]))
    pg_conn.commit()
    print(f"  ✅ {len(settings)} settings migrated")
except Exception as e:
    print(f"  ⚠️  Settings migration failed: {e}")

# ── Migrate market_research_cache ──────────────────────────────────────────────
print("\nMigrating saved market research...")
try:
    sqlite_cur.execute("SELECT * FROM market_research_cache")
    searches = sqlite_cur.fetchall()
    print(f"  Found {len(searches)} saved searches")
    migrated = skipped = 0
    for row in searches:
        try:
            pg_cur.execute("""
                INSERT INTO market_research_cache
                    (cache_key, tab, industry, problem, result_json, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (cache_key) DO UPDATE SET
                    result_json = EXCLUDED.result_json,
                    updated_at  = EXCLUDED.updated_at
            """, (
                row["cache_key"], row["tab"], row["industry"],
                row["problem"] or "", row["result_json"],
                row["updated_at"]
            ))
            migrated += 1
        except Exception as e:
            skipped += 1
    pg_conn.commit()
    print(f"  ✅ {migrated} searches migrated, {skipped} skipped")
except Exception as e:
    print(f"  ⚠️  Market research cache migration failed: {e}")

# ── Summary ────────────────────────────────────────────────────────────────────
print("\nVerifying Supabase counts...")
pg_cur.execute("SELECT COUNT(*) as n FROM leads")
print(f"  Leads in Supabase:          {pg_cur.fetchone()['n']}")
pg_cur.execute("SELECT COUNT(*) as n FROM settings")
print(f"  Settings in Supabase:       {pg_cur.fetchone()['n']}")
pg_cur.execute("SELECT COUNT(*) as n FROM market_research_cache")
print(f"  Saved searches in Supabase: {pg_cur.fetchone()['n']}")

pg_conn.close()
sqlite_conn.close()
print("\n✅ Migration complete!")
