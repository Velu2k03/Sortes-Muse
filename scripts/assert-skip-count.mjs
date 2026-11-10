// Point 7: CI guard. Reads a vitest JSON report and fails unless the number
// of skipped tests is exactly the expected one. A Postgres/RLS suite that
// skips for any reason other than the one known quarantine (e.g. a login
// failure, or an empty URL) changes the count and fails the job.
// Usage: node scripts/assert-skip-count.mjs <report.json> <expectedSkips>
import { readFileSync } from "node:fs";

const [file, expectedArg] = process.argv.slice(2);
const expected = Number(expectedArg);
if (!file || !Number.isInteger(expected)) {
  console.error("usage: assert-skip-count.mjs <report.json> <expectedSkips>");
  process.exit(2);
}
const r = JSON.parse(readFileSync(file, "utf8"));
const skipped = (r.numPendingTests ?? 0) + (r.numTodoTests ?? 0);
console.log(`vitest: ${r.numPassedTests} passed, ${r.numFailedTests} failed, ${skipped} skipped (expected skipped: ${expected})`);
if (skipped !== expected) {
  console.error(`::error::Skipped test count ${skipped} != expected ${expected}. A suite skipped for an unexpected reason.`);
  process.exit(1);
}
