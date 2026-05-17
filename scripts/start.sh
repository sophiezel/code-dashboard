#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 > /dev/null 2>&1

# ── Decrypt secrets via age ──
cd ~/code/dashboard
source scripts/decrypt-env.sh

# ── Start Next.js ──
exec node node_modules/.bin/next start -p 3456
