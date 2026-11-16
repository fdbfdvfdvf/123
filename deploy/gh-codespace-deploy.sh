#!/usr/bin/env bash
# از روی دستگاهِ شما (یا هر جایی که gh لاگین است) — کل پایپ‌لاین: repo + codespace + deploy + پورت عمومی
# نیاز: gh (GitHub CLI) با scopes: repo, codespace
set -euo pipefail
cd "$(dirname "$0")/.."   # ریشهٔ ریپو

REPO_NAME="${GH_REPO_NAME:-together-app}"
CS_MACHINE="${GH_CS_MACHINE:-basicLinux32gb}"        # 2core/8GB — مشمول سهمیهٔ رایگان
CS_IDLE="${GH_CS_IDLE:-240m}"                        # تا ۲۴۰ دقیقه مجاز است

gh auth status >/dev/null 2>&1 || { echo "❌ gh لاگین نیست: gh auth login"; exit 1; }

echo "→ ۱) ریپو…"
FULL=$(gh repo view "$REPO_NAME" --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
if [ -z "$FULL" ]; then
  git init -q 2>/dev/null || true
  git add -A
  git commit -qm "together: deploy via codespace" 2>/dev/null || true
  git branch -M main 2>/dev/null || true
  FULL=$(gh repo create "$REPO_NAME" --private --source . --remote origin --push --json nameWithOwner -q .nameWithOwner)
else
  git push -q origin HEAD 2>/dev/null || { git add -A && git commit -qm "update" && git push -q origin HEAD; }
fi
echo "   repo: $FULL"

echo "→ ۲) codespace…"
CS=$(gh codespace list --json name,repository -q ".[] | select(.repository | endswith(\"$REPO_NAME\")) | .name" | tail -1 || true)
if [ -z "$CS" ]; then
  CS=$(gh codespace create -R "$FULL" -m "$CS_MACHINE" -b main --idle-timeout "$CS_IDLE" --json name -q .name)
fi
echo "   codespace: $CS"

echo "→ ۳) انتظار برای Available…"
for i in $(seq 1 60); do
  ST=$(gh codespace list --json name,state -q ".[] | select(.name==\"$CS\") | .state")
  [ "$ST" = "Available" ] && break
  [ "$i" = 60 ] && { echo "❌ codespace آماده نشد ($ST)"; exit 1; }
  sleep 10
done
gh codespace start -c "$CS" >/dev/null 2>&1 || true

echo "→ ۴) بوت‌استرپ داخل codespace…"
gh codespace cp -c "$CS" deploy/codespace-up.sh remote:/tmp/up.sh
gh codespace ssh -c "$CS" -- bash /tmp/up.sh

echo "→ ۵) پورت ۳۰۰۰ عمومی…"
gh codespace ports visibility 3000:public -c "$CS" || gh api -X PUT "/user/codespaces/$CS/ports/3000" -f visibility=open
HOST="${CS//_/-}"
echo ""
echo "✅ تمام شد — URL:"
echo "   https://${HOST}-3000.app.github.dev"
echo "   (تمام مدت روشن‌بودن از سهمیهٔ ۱۲۰ core-hour/ماه مصرف می‌شود؛ خاموش: gh codespace stop -c $CS)"
