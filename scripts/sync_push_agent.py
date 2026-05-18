#!/usr/bin/env python3
"""
sync_push_agent.py — Mac→ECS direct SQLite push using SSH tunnel
Simple, reliable: no Next.js API dependency.
"""
import sqlite3, json, time, os, sys, fcntl, subprocess, tempfile
from datetime import datetime, timedelta

ECS_HOST = "root@47.93.214.189"
SSH_KEY = os.path.expanduser("~/.ssh/hermes-ecs")
ECS_DB = "/opt/dashboard/data/screener.db"
SRC_DB = os.path.expanduser("~/code/stock-screener/data/screener.db")
STATE_DB = os.path.expanduser("~/.hermes/data/push_state.db")
LOCKFILE = "/tmp/push_agent.lock"
LOG_FILE = os.path.expanduser("~/Library/Logs/push_agent.log")

# Lock
_fd = open(LOCKFILE, 'w')
try: fcntl.flock(_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError: print("another instance running"); sys.exit(0)

os.makedirs(os.path.dirname(STATE_DB), exist_ok=True)

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, 'a') as f: f.write(line + "\n")

# State DB
state = sqlite3.connect(STATE_DB)
state.execute("PRAGMA journal_mode=WAL")
state.executescript("""
CREATE TABLE IF NOT EXISTS push_state (
    table_name TEXT PRIMARY KEY, last_synced_ts TEXT,
    status TEXT DEFAULT 'cold', last_push_at TEXT
);
CREATE TABLE IF NOT EXISTS push_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT(datetime('now')),
    table_name TEXT, rows_pushed INTEGER, duration_ms REAL, error TEXT
);
CREATE TABLE IF NOT EXISTS push_heartbeat (
    id INTEGER PRIMARY KEY CHECK(id=1), last_beat TEXT
);
INSERT OR IGNORE INTO push_heartbeat VALUES(1, datetime('now'));
""")
state.commit()

# Table SLA (same as before)
TABLE_SLA = [
    ("intraday_minute","datetime","intraday",570,960,5),
    ("northbound_intraday","datetime","intraday",570,960,5),
    ("stock_daily","trade_date","daily_close",915,1020,60),
    ("index_daily","trade_date","daily_close",915,1020,60),
    ("lhb_daily","trade_date","daily_close",990,1080,120),
    ("block_trades","trade_date","daily_close",1020,1140,120),
    ("limit_up_sentiment","trade_date","daily_close",960,1020,60),
    ("market_breadth_snapshot","datetime","daily_close",960,1020,60),
    ("sentiment_cache","date","daily_close",960,1080,60),
    ("screen_results","screen_date","daily_close",960,1080,60),
    ("recommendation_history","entry_date","daily_close",960,1080,60),
    ("margin_daily","trade_date","t1_morning",480,570,120),
    ("fund_flow_stock","trade_date","t1_morning",480,570,120),
    ("hsgt_daily","trade_date","t1_morning",510,570,120),
    ("hsgt_stock_daily","trade_date","t1_morning",510,570,120),
    ("hsgt_sector_daily","trade_date","t1_morning",510,570,120),
    ("etf_flow_daily","trade_date","t1_morning",540,720,300),
    ("futures_daily","trade_date","daily_close",930,1020,120),
    ("futures_basis","trade_date","daily_close",930,1020,120),
    ("macro_pmi","月份","macro",0,1440,600),
    ("macro_cpi","trade_date","macro",0,1440,600),
    ("macro_ppi","trade_date","macro",0,1440,600),
    ("macro_m2","月份","macro",0,1440,600),
    ("macro_shibor","日期","macro",0,1440,600),
    ("macro_lpr","TRADE_DATE","macro",0,1440,600),
    ("macro_gdp","日期","macro",0,1440,600),
    ("stock_fundamental",None,"static",0,1440,3600),
    ("stock_basic",None,"static",0,1440,3600),
    ("index_global_daily","trade_date","daily_close",915,1440,600),
    ("stock_fund_flow","trade_date","t1_morning",480,720,600),
]

def in_window(ws, we):
    t = datetime.now().hour * 60 + datetime.now().minute
    return ws <= t <= we if ws <= we else t >= ws or t <= we

def push_via_ssh(table, rows):
    """Direct SQLite push over SSH — avoids Next.js entirely"""
    if not rows: return True, None
    
    # Build SQL statements
    src = sqlite3.connect(SRC_DB)
    cols = [c[1] for c in src.execute(f'PRAGMA table_info("{table}")')]
    src.close()
    
    sql_lines = []
    for row in rows:
        vals = []
        for c in cols:
            v = row.get(c)
            if v is None: vals.append("NULL")
            elif isinstance(v, (int, float)): vals.append(str(v))
            else: vals.append("'" + str(v).replace("'", "''") + "'")
        cl = ",".join(f'"{c}"' for c in cols)
        sql_lines.append(f"INSERT OR REPLACE INTO {table} ({cl}) VALUES ({','.join(vals)});")
    
    sql_text = "\n".join(sql_lines)
    
    # Write SQL to temp file, scp, and execute on ECS
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as f:
        f.write("PRAGMA journal_mode=WAL;\nBEGIN;\n")
        f.write(sql_text)
        f.write("\nCOMMIT;\n")
        tmpfile = f.name
    
    try:
        # scp to ECS
        subprocess.run(["scp", "-i", SSH_KEY, "-o", "StrictHostKeyChecking=accept-new", 
                        "-o", "ConnectTimeout=10", tmpfile, f"{ECS_HOST}:/tmp/push_{table}.sql"],
                       capture_output=True, timeout=30)
        
        # Execute on ECS
        result = subprocess.run([
            "ssh", "-i", SSH_KEY, "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10",
            ECS_HOST,
            f"sqlite3 {ECS_DB} < /tmp/push_{table}.sql && rm /tmp/push_{table}.sql && echo OK"
        ], capture_output=True, text=True, timeout=60)
        
        if "OK" in result.stdout:
            return True, None
        else:
            return False, result.stderr[:100] if result.stderr else "no output"
    except subprocess.TimeoutExpired:
        return False, "timeout"
    except Exception as e:
        return False, str(e)[:100]
    finally:
        os.unlink(tmpfile)

# Cold start (7-day fallback)
def cold_start():
    log("Cold start...")
    fb = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    for t, _, _, _, _, _ in TABLE_SLA:
        ex = state.execute("SELECT status FROM push_state WHERE table_name=?",[t]).fetchone()
        if ex and ex[0] != 'cold': continue
        state.execute("INSERT OR REPLACE INTO push_state VALUES(?,?,?,?)", [t, fb, 'warm', None])
        log(f"  {t}: {fb}")
    state.commit()
    log("Cold start done")

def main():
    log("=== Push Agent v2 (SSH direct) ===")
    
    ct = state.execute("SELECT COUNT(*) FROM push_state WHERE status='cold'").fetchone()[0]
    tt = state.execute("SELECT COUNT(*) FROM push_state").fetchone()[0]
    if ct > 0 or tt == 0: cold_start()
    
    src = sqlite3.connect(SRC_DB)
    src.row_factory = sqlite3.Row
    
    while True:
        t0 = time.time()
        now = datetime.now()
        
        for table, ts_col, cat, ws, we, interval in TABLE_SLA:
            if not in_window(ws, we): continue
            
            row = state.execute("SELECT last_synced_ts FROM push_state WHERE table_name=?",[table]).fetchone()
            if not row or not row[0]: continue
            last_ts = row[0]
            
            try:
                if ts_col:
                    cur = src.execute(f'SELECT * FROM "{table}" WHERE "{ts_col}" > ? ORDER BY "{ts_col}" LIMIT 200', [last_ts])
                else:
                    cur = src.execute(f'SELECT COUNT(*) FROM "{table}"')
                    count = cur.fetchone()[0]
                    ecs_count = 0  # Skip hash check for now, just push
                    if not ecs_count or count != ecs_count:
                        cur = src.execute(f'SELECT * FROM "{table}" LIMIT 200')
                    else:
                        continue
            except: continue
            
            rows = cur.fetchall()
            if not rows: continue
            
            # Convert to dicts
            cols = [c[1] for c in src.execute(f'PRAGMA table_info("{table}")')]
            data = [{c: r[c] for c in cols} for r in rows]
            
            ok, err = push_via_ssh(table, data)
            if ok:
                if ts_col and rows:
                    new_ts = max(str(r[ts_col]) for r in rows)
                    state.execute("UPDATE push_state SET last_synced_ts=?,last_push_at=? WHERE table_name=?",
                                  [new_ts, now.isoformat(), table])
                log(f"OK {table}: {len(rows)} rows ({time.time()-t0:.1f}s)")
            else:
                log(f"FAIL {table}: {err}")
            state.commit()
        
        state.execute("UPDATE push_heartbeat SET last_beat=?",[now.isoformat()])
        state.commit()
        
        elapsed = time.time() - t0
        sleep_t = max(2, 5 - elapsed)
        time.sleep(sleep_t)

if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: log("Shutdown")
    except Exception as e: log(f"FATAL: {e}"); raise
