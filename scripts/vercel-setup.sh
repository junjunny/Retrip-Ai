#!/usr/bin/env bash
# One-shot Vercel setup for Re:Trip: link the project, push every env var from
# .env.local to Production, enable the diagnostics route, deploy.
#
# Run this yourself — it needs your Vercel account:
#   bash scripts/vercel-setup.sh
#
# Prereqs: a Vercel account. The script runs `vercel login` if you're not logged
# in (opens a browser). It never prints a secret value.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }

VERCEL="npx --yes vercel@latest"

echo "==> vercel whoami"
$VERCEL whoami >/dev/null 2>&1 || $VERCEL login

echo "==> linking project (accept the prompts)"
$VERCEL link

# Vars to push: everything real in .env.local + the diagnostics flag.
# NEXT_PUBLIC_* are build-time public (fine), the rest are server secrets.
push() {
  local name="$1" value="$2"
  [ -z "$value" ] && { echo "  skip $name (empty)"; return; }
  # replace if it already exists
  $VERCEL env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | $VERCEL env add "$name" production >/dev/null
  echo "  set $name (len ${#value})"
}

echo "==> pushing env vars to Production"
while IFS= read -r line; do
  case "$line" in ''|\#*) continue;; esac
  name="${line%%=*}"
  value="${line#*=}"
  case "$name" in
    NEXT_PUBLIC_FIREBASE_*|FIREBASE_SERVICE_ACCOUNT_KEY|TOUR_API_KEY_*|WEATHER_API_KEY|KAKAO_API_KEY|LLM_API_KEY)
      push "$name" "$value" ;;
  esac
done < "$ENV_FILE"

push "ENABLE_EXTERNAL_STATUS" "1"

echo "==> deploying to Production (region: icn1 from vercel.json)"
$VERCEL deploy --prod

echo
echo "Done. Now check:"
echo "  curl -s https://<your-domain>/api/dev/external-status | python3 -m json.tool"
