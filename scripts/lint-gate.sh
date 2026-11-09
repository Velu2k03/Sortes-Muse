#!/usr/bin/env bash
# PR lint gate for Sortes.
# 1. Repo lint (`npm run lint`) must be clean: 0 errors, 0 warnings.
# 2. Explicit jsx-a11y run (eslint.gate.config.mjs: 7 rules + motion.* mapping)
#    must have 0 errors and no warning outside scripts/lint-baseline.txt.
# Warnings are matched as tab-delimited `file<TAB>rule<TAB>message` keys (no
# line numbers, lines shift). jsx-a11y messages are fixed rule text (the
# role-based ones name the role), so the message pins WHICH problem a row
# covers: e.g. a new "combobox" prefer-tag-over-role cannot hide behind an
# existing "dialog" row in the same file. Keys are compared as a multiset: a
# 2nd identical warning in the same file counts as new. Each baseline row is
# explained in the lint-fix checklist.
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
# Overrides exist only for the gate's own verify-it-fails probes.
BASELINE="${LINT_GATE_BASELINE:-scripts/lint-baseline.txt}"
CONFIG="${LINT_GATE_CONFIG:-eslint.gate.config.mjs}"
fail=0

echo "== 1/2 repo lint (npm run lint, --max-warnings 0) =="
if npm run --silent lint -- --max-warnings 0; then
  echo "repo lint: clean"
else
  echo "repo lint: FAILED (errors or warnings above)"
  fail=1
fi

echo "== 2/2 explicit jsx-a11y lint vs baseline =="
explicit_ok=0
json="$(mktemp)"; current="$(mktemp)"; new="$(mktemp)"
trap 'rm -f "$json" "$current" "$new"' EXIT
npx eslint src --config "$CONFIG" --format json > "$json"
rc=$?
# eslint exits 0 clean, 1 on lint errors (counted below), 2+ on crash/config error.
if [ "$rc" -gt 1 ]; then
  echo "explicit lint: FAILED (eslint crashed, exit $rc)"
  fail=1
elif ! node -e '
  const fs = require("fs");
  const [jsonPath, root, outPath] = process.argv.slice(1);
  const results = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  let errors = 0; const pairs = [];
  for (const r of results) {
    const file = r.filePath.startsWith(root + "/") ? r.filePath.slice(root.length + 1) : r.filePath;
    for (const m of r.messages) {
      if (m.severity === 2) { errors++; console.log(`ERROR ${file}:${m.line} ${m.ruleId ?? "parse"} ${m.message}`); }
      else pairs.push([file, m.ruleId ?? "parse", m.message.replace(/[\t\n\r]+/g, " ")].join("\t"));
    }
  }
  fs.writeFileSync(outPath, pairs.sort().join("\n") + (pairs.length ? "\n" : ""));
  console.log(`explicit lint: ${errors} errors, ${pairs.length} warnings`);
  process.exit(errors ? 1 : 0);
' "$json" "$ROOT" "$current"; then
  echo "explicit lint: FAILED (errors, or eslint crashed)"
  fail=1
else
  explicit_ok=1
fi

# Baseline compare only when $current is a valid list (skip on crash/errors,
# otherwise an empty $current would list every baseline row as stale).
if [ "$explicit_ok" -eq 1 ]; then
# Lines in current but not in baseline (multiset-aware via comm on sorted input).
LC_ALL=C sort "$current" -o "$current"
LC_ALL=C comm -13 <(LC_ALL=C sort "$BASELINE") "$current" > "$new"
if [ -s "$new" ]; then
  echo "NEW warnings not in $BASELINE:"
  sed 's/^/  + /' "$new"
  fail=1
fi
# Ratchet: baseline rows that no longer occur must be removed, so a later
# regression of the same file/rule/message cannot hide behind a stale row.
stale="$(LC_ALL=C comm -23 <(LC_ALL=C sort "$BASELINE") "$current")"
if [ -n "$stale" ]; then
  echo "STALE baseline rows: baseline has rows that no longer occur, remove them from $BASELINE:"
  printf '%s\n' "$stale" | sed 's/^/  - /'
  fail=1
fi
fi

if [ "$fail" -eq 0 ]; then echo "LINT GATE: PASS"; else echo "LINT GATE: FAIL"; fi
exit "$fail"
