#!/usr/bin/env bash
# Vercel setup for Re:Trip: link the existing project, push every env var from
# .env.local to Production with the right type, then (after you confirm) deploy.
#
# Run this yourself — it needs your Vercel account:
#   bash scripts/vercel-setup.sh
#
# - Runs `vercel login` only if you're not already logged in (opens a browser).
# - Links to the EXISTING project (won't create a new one if .vercel/ exists;
#   otherwise pick your `retrip-ai` project at the prompt).
# - NEXT_PUBLIC_FIREBASE_* -> `--type config` (public, inlined at build; Firebase
#   web config is public by design, so Vercel's "looks like a credential" guard
#   is bypassed explicitly).
# - server secrets -> `--type secret` (encrypted at rest, not readable back).
# - Never prints a value.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }

VERCEL="npx --yes vercel@latest"

echo "==> vercel whoami"
$VERCEL whoami >/dev/null 2>&1 || $VERCEL login

if [ -f .vercel/project.json ]; then
  echo "==> project already linked (.vercel/project.json) — keeping it"
else
  echo "==> linking project — pick your existing 'retrip-ai' project at the prompt"
  $VERCEL link
fi

# read one value from .env.local by name, without printing it
val_of() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }

# $1 name, $2 type (config|secret)
push() {
  local name="$1" type="$2" value
  value="$(val_of "$name")"
  if [ -z "$value" ]; then echo "  skip $name (empty in $ENV_FILE)"; return; fi
  printf '%s' "$value" | $VERCEL env add "$name" production --type "$type" --force --yes >/dev/null
  echo "  set $name  (type=$type, len=${#value})"
}

echo "==> pushing PUBLIC config vars (NEXT_PUBLIC_*)"
for n in \
  NEXT_PUBLIC_FIREBASE_API_KEY \
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
  NEXT_PUBLIC_FIREBASE_PROJECT_ID \
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
  NEXT_PUBLIC_FIREBASE_APP_ID
do push "$n" config; done

echo "==> pushing SERVER secrets"
for n in \
  FIREBASE_SERVICE_ACCOUNT_KEY \
  TOUR_API_KEY_MAIN \
  TOUR_API_KEY_VISITOR \
  TOUR_API_KEY_ACCESSIBILITY \
  WEATHER_API_KEY \
  KAKAO_API_KEY \
  LLM_API_KEY
do push "$n" secret; done

echo "==> diagnostics flag"
printf '%s' "1" | $VERCEL env add ENABLE_EXTERNAL_STATUS production --type config --force --yes >/dev/null
echo "  set ENABLE_EXTERNAL_STATUS (type=config)"

echo
echo "Env vars registered. Review them:  $VERCEL env ls production"
echo
ans=""
read -r -p "Deploy to Production now (region icn1 from vercel.json)? [y/N] " ans || true
if [ "${ans:-}" = "y" ] || [ "${ans:-}" = "Y" ]; then
  $VERCEL deploy --prod
  echo
  echo "Done. Check the deploy URL then:"
  echo "  curl -s https://<deploy-url>/api/dev/external-status"
else
  echo "Skipped deploy. When ready:  $VERCEL deploy --prod"
fi
