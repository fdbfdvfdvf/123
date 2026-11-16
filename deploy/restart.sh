#!/bin/bash
# ری‌استارت اپ داخل codespace — توسط workflow دیپلوی یا gh codespace ssh اجرا می‌شود
cd /workspaces/123
pkill -f "node server/index.js" 2>/dev/null
sleep 1
PORT=3000 NODE_ENV=production nohup node server/index.js > app.log 2>&1 < /dev/null &
sleep 5
curl -s --max-time 5 localhost:3000/api/health || echo STILL_DOWN
