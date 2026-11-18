#!/usr/bin/env bash
# داخل Codespace اجرا می‌شود: postgres + app را بالا می‌آورد و health می‌گیرد
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ ۱) انتظار برای dockerd…"
for i in $(seq 1 60); do
  docker info >/dev/null 2>&1 && break
  [ "$i" = 60 ] && { echo "❌ docker آماده نشد"; exit 1; }
  sleep 5
done
echo "   docker OK"

echo "→ ۲) compose up --build…"
docker compose -f deploy/compose.codespace.yaml up --build -d

echo "→ ۳) health check…"
for i in $(seq 1 40); do
  if curl -sf "http://localhost:3000/api/health" >/tmp/health.json 2>/dev/null; then
    echo "✅ Together زنده است"
    cat /tmp/health.json; echo
    if [ -n "${CODESPACE_NAME:-}" ]; then
      HOST="${CODESPACE_NAME//_/-}"
      echo ""
      echo "🌍 URL عمومی (بعد از public کردن پورت ۳۰۰۰):"
      echo "   https://${HOST}-3000.app.github.dev"
    fi
    echo ""
    echo "دستورات مفید:"
    echo "  docker compose -f deploy/compose.codespace.yaml logs -f app"
    echo "  docker compose -f deploy/compose.codespace.yaml restart app"
    exit 0
  fi
  sleep 5
done
echo "🟡 health هنوز پاسخ نمی‌دهد — لاگ:"
docker compose -f deploy/compose.codespace.yaml logs --tail 40 app
exit 1
