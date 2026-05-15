#!/bin/bash
# Dashboard launch wrapper
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 > /dev/null 2>&1

cd ~/code/dashboard
exec npx next start -p 3456
