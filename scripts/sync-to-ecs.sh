#!/bin/bash
# ~/code/dashboard/scripts/sync-to-ecs.sh
# Mac → ECS 数据同步：screener.db + reports.db
# 每小时执行一次（Mac crontab）

set -e

SOURCE_SCREENER="$HOME/code/stock-screener/data/screener.db"
SOURCE_REPORTS="$HOME/code/dashboard/data/reports.db"
DEST="root@47.93.214.189:/opt/dashboard/data/"
SSH_KEY="$HOME/.ssh/hermes-ecs"
LOCKFILE="/tmp/dashboard-sync.lock"

# 防止重叠执行
exec 200>"$LOCKFILE"
flock -n 200 || { echo "$(date): sync already running, skipping"; exit 0; }

echo "$(date): === sync start ==="

# 1. WAL checkpoint
sqlite3 "$SOURCE_SCREENER" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null
sqlite3 "$SOURCE_REPORTS" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null

# 2. rsync 推送
rsync -avz --checksum \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
  "$SOURCE_SCREENER" "$SOURCE_REPORTS" \
  "$DEST" 2>&1

# 3. ECS 端重载 PM2（让 better-sqlite3 重新打开文件）
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
  root@47.93.214.189 "pm2 reload dashboard --update-env" 2>/dev/null || true

echo "$(date): === sync done ==="

# 释放锁
flock -u 200
