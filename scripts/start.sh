#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 > /dev/null 2>&1

# Direct env var setting for debug — bypass SOPS
export SQLCIPHER_KEY=$(python3 ~/code/dashboard/scripts/load_key.py | cut -d= -f2)
echo "KEY=${SQLCIPHER_KEY:0:10}..." >> ~/.hermes/logs/dashboard_start.log

cd ~/code/dashboard
exec node node_modules/.bin/next start -p 3456
