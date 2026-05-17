#!/bin/bash
# ~/code/dashboard/scripts/sync-to-ecs.sh
# Mac → ECS 数据同步：screener.db + reports.db
# 每5分钟执行一次（Mac crontab）

set -e

SOURCE_SCREENER="$HOME/code/stock-screener/data/screener.db"
SOURCE_REPORTS="$HOME/code/dashboard/data/reports.db"
DEST="root@47.93.214.189:/opt/dashboard/data/"
SSH_KEY="$HOME/.ssh/hermes-ecs"
LOCKFILE="/tmp/dashboard-sync.lock"
TMPDIR="/tmp/dashboard-sync-$$"

# macOS 兼容锁
shlock -f "$LOCKFILE" -p $$ || { echo "$(date): sync already running, skipping"; exit 0; }
trap 'rm -f "$LOCKFILE"; rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR"
echo "$(date): === sync start ==="

# 1. WAL checkpoint → 确保数据写入主文件
sqlite3 "$SOURCE_SCREENER" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null
sqlite3 "$SOURCE_REPORTS" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null

# 2. .backup 创建一致性快照 → 避免 rsync 传输中的写冲突导致 DB 损坏
sqlite3 "$SOURCE_SCREENER" ".backup '$TMPDIR/screener.db'" 2>/dev/null
sqlite3 "$SOURCE_REPORTS" ".backup '$TMPDIR/reports.db'" 2>/dev/null

# 3. rsync 推送快照
rsync -avz --checksum --inplace \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
  "$TMPDIR/screener.db" "$TMPDIR/reports.db" \
  "$DEST" 2>&1

# 4. ECS 端重载 PM2
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
  root@47.93.214.189 "pm2 reload dashboard --update-env" 2>/dev/null || true

echo "$(date): === sync done ==="
