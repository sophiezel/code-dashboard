#!/bin/bash
# ~/code/dashboard/scripts/deploy-to-ecs.sh
# Mac → ECS Dashboard 部署脚本
# 构建 + 推送 + 重启，不含 --delete 避免误删 ECS 手写文件
set -e

SSH_KEY="$HOME/.ssh/hermes-ecs"
DEST="root@47.93.214.189:/opt/dashboard/"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
RSYNC="rsync -avz -e \"ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10\""

echo "=== 1. Build ==="
cd ~/code/dashboard
npx next build 2>&1 | tail -5

echo "=== 2. Rsync standalone (no --delete) ==="
eval "$RSYNC .next/standalone/ $DEST"

echo "=== 3. Rsync static ==="
eval "$RSYNC .next/static/ root@47.93.214.189:/opt/dashboard/.next/static/"

echo "=== 4. PM2 reload ==="
eval "$SSH root@47.93.214.189 'pm2 reload dashboard --update-env && pm2 status'"

echo "=== Done. Verify: https://tiangong.uno ==="
