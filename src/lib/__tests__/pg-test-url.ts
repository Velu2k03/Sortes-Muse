// E1: a Postgres suite must not skip silently in CI. Locally (no CI env) a
// missing URL still returns "" so the suite skips and a dev without Postgres
// can run the rest. Under CI a missing URL throws at import, which fails the
// suite file loudly instead of reporting green with the money tests skipped.
export function pgTestUrl(envName: string): string {
  const url = process.env[envName] ?? "";
  if (!url && process.env.CI) {
    throw new Error(
      `${envName} is not set but CI is set: refusing to skip the Postgres suite. ` +
        "Check the CI Postgres service and the job-level env in .github/workflows/lint-gate.yml."
    );
  }
  return url;
}
