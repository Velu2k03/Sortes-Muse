<!--
  Sortes PR checklist (Notes N2, B1d). The order is the gate: back
  up, apply, then merge. A merge before the migration is applied
  deploys code the database cannot run (the 009 incident).
-->

## PR checklist

- [ ] Fresh backup taken (run id: <!-- sortes-backup.yml run id, e.g. 12345678901 -->)
- [ ] Migration applied to prod before merge, if `migrations/` changed (run id: <!-- sortes-migrate.yml run id -->, label `migration-applied-to-prod` added)
- [ ] Gates pass (`npx tsc --noEmit`, `npm run lint:gate`, `npm run build`, `npm test`)
- [ ] Live verified after merge (homepage 200, `/api/health` 200 with all migrations applied)

## What this PR does

<!-- Short summary: what changed and why. -->

## Notes for the reviewer

<!-- Anything the reviewer should check first: migration order, money paths, manual steps. -->
