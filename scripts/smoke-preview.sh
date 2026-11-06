#!/usr/bin/env bash
# smoke-preview.sh — Phase 7 smoke test for a Sortes deployment URL.
#
# Usage:
#   scripts/smoke-preview.sh <base-url> [expected-status-file]
#
# Checks the public routes return 200 and the renamed routes redirect
# (308) as the release candidate requires. Exits 0 only when every
# check passes. Read-only: no sign-in, no purchase, no data written.
# Console-error checking needs a browser; run the Playwright pass
# separately (see docs/STAGING.md checklist).
set -u
BASE="${1:-${SORTES_SMOKE_URL:-}}"
if [ -z "$BASE" ]; then
  echo "usage: $0 <base-url>   (e.g. https://sortes-muse-git-sortes-transformation-2026-11-05-velus-projects-27f81f38.vercel.app)" >&2
  exit 2
fi
BASE="${BASE%/}"
fail=0
check() { # path expected_status label
  local path="$1" want="$2" label="$3" got
  got=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "$BASE$path" || echo "000")
  if [ "$got" = "$want" ]; then
    echo "PASS  $label  $path -> $got"
  else
    echo "FAIL  $label  $path -> $got (want $want)"
    fail=1
  fi
}
check "/"                    200 "home"
check "/oracles"             200 "oracles"
check "/deck"                200 "deck"
check "/deck/the-fool"       200 "deck card: the fool"
check "/spreads"             200 "spreads"
check "/daily"               200 "daily"
check "/horoscope"           200 "horoscope"
check "/account"             200 "account"
check "/credits"             308 "credits redirects to /oracles"
check "/history"             308 "history redirects to /journal"
check "/journal"             200 "journal"
check "/nonexistent-route-xyz" 404 "unknown route 404s"
# Security headers present on the homepage (CSP added in Phase 1).
headers=$(curl -s -D - -o /dev/null -m 20 "$BASE/" || true)
for h in "content-security-policy" "x-content-type-options" "referrer-policy"; do
  if printf '%s' "$headers" | grep -qi "^$h:"; then
    echo "PASS  header $h present"
  else
    echo "FAIL  header $h missing"
    fail=1
  fi
done
if [ "$fail" -eq 0 ]; then echo "SMOKE PASS ($BASE)"; else echo "SMOKE FAIL ($BASE)"; fi
exit "$fail"
