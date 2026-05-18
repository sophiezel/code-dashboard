#!/usr/bin/env python3
"""
push_health_check.py — monitor push agent health
Run by system-health cron every 5-15 min
"""
import sqlite3, os, sys
from datetime import datetime, timedelta

STATE_DB = os.path.expanduser("~/.hermes/data/push_state.db")
# WeChat alert function — uses hermes weixin send
def alert(msg):
    print(f"ALERT: {msg}")
    # hermes agent will pick up non-zero exit and send to weixin
    sys.exit(1)

ok = True

try:
    db = sqlite3.connect(STATE_DB)
    
    # 1. Heartbeat check (agent alive?)
    hb = db.execute("SELECT last_beat FROM push_heartbeat WHERE id=1").fetchone()
    if not hb:
        print("WARN: no heartbeat")
        ok = False
    else:
        last_beat = datetime.fromisoformat(hb[0])
        age = (datetime.now() - last_beat).total_seconds()
        if age > 300:  # 5 min
            print(f"ALERT: heartbeat stale ({age:.0f}s)")
            ok = False
        else:
            print(f"OK: heartbeat {age:.0f}s ago")
    
    # 2. Push state check (any tables stuck?)
    rows = db.execute("""
        SELECT table_name, last_synced_ts, last_push_at 
        FROM push_state WHERE status='warm' ORDER BY last_synced_ts ASC LIMIT 5
    """).fetchall()
    print(f"Tables tracked: {len(db.execute('SELECT * FROM push_state').fetchall())}")
    
    # 3. Check ECS health
    import urllib.request
    try:
        r = urllib.request.urlopen("https://tiangong.uno/login", timeout=15)
        if r.status in (200, 403, 301, 302):
            print("OK: ECS reachable")
        else:
            print(f"ECS returned {r.status}")
            ok = False
    except Exception as e:
        print(f"ECS unreachable: {e}")
        ok = False
    
    db.close()
except Exception as e:
    print(f"FATAL: {e}")
    ok = False

if ok:
    print("ALL OK")
    sys.exit(0)
else:
    sys.exit(1)
