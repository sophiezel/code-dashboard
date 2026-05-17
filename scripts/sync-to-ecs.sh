#!/bin/bash
# ~/code/dashboard/scripts/sync-to-ecs.sh
# Mac → ECS 数据同步：screener.db + reports.db
# 每5分钟执行一次（Mac crontab）

set -e

SOURCE_SCREENER="$HOME/code/stock-screener/data/screener.db"
SOURCE_REPORTS="$HOME/code/dashboard/data/reports.db"
DEST_HOST="root@47.93.214.189"
DEST_DIR="/opt/dashboard/data"
SSH_KEY="$HOME/.ssh/hermes-ecs"
LOCKFILE="/tmp/dashboard-sync.lock"
TMPDIR="/tmp/dashboard-sync-$$"

# macOS 兼容锁
shlock -f "$LOCKFILE" -p $$ || { echo "$(date): sync already running, skipping"; exit 0; }
trap 'rm -f "$LOCKFILE"; rm -rf "$TMPDIR"' EXIT

mkdir -p "$TMPDIR"
echo "$(date): === sync start ==="

# 1. WAL checkpoint
sqlite3 "$SOURCE_SCREENER" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null
sqlite3 "$SOURCE_REPORTS" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null

# 2. .backup 创建一致性快照
sqlite3 "$SOURCE_SCREENER" ".backup '$TMPDIR/screener.db'" 2>/dev/null
sqlite3 "$SOURCE_REPORTS" ".backup '$TMPDIR/reports.db'" 2>/dev/null

# 3. ECS 端：先复制现有文件到 .tmp，让 rsync 可以增量比对
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
  "$DEST_HOST" "cp $DEST_DIR/screener.db $DEST_DIR/screener.db.tmp 2>/dev/null; cp $DEST_DIR/reports.db $DEST_DIR/reports.db.tmp 2>/dev/null; true"

# 4. rsync 增量推送到 .tmp（--inplace 直接更新 .tmp 文件，只传差异块）
rsync -avz --checksum --inplace \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
  "$TMPDIR/screener.db" "$DEST_HOST:$DEST_DIR/screener.db.tmp" \
  2>&1

rsync -avz --checksum --inplace \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10" \
  "$TMPDIR/reports.db" "$DEST_HOST:$DEST_DIR/reports.db.tmp" \
  2>&1

# 5. 原子替换 + 重载（同文件系统 mv 是原子的，Dashboard 读到的是完整文件）
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
  "$DEST_HOST" "mv $DEST_DIR/screener.db.tmp $DEST_DIR/screener.db && mv $DEST_DIR/reports.db.tmp $DEST_DIR/reports.db && pm2 reload dashboard --update-env" 2>/dev/null || true

echo "$(date): === sync done ==="
