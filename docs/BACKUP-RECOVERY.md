# Sortes — Backup & Recovery

Phase 6 (P1b), 2026-11-06. Status of the facts below: **verified live
2026-11-06** by the Supabase dashboard check (production project,
FREE plan).

## Where we stand (verified)

- Production database: Supabase Postgres 17.6.1.166, FREE plan, 27 MB,
  ~1 user, ~8 transactions, ~1 reading.
- **No scheduled backups. No PITR. No restore path.** PITR is a Pro
  add-on (from $100/month) and is not enabled.
- Pooler: transaction mode port 6543, session mode port 5432, host
  `aws-0-ap-northeast-1.pooler.supabase.com`, pool size 15, max
  connections 200.
- An upgrade to Postgres 17.11.0.018 is offered in the dashboard —
  **do not apply without Velu's approval** (approval item).

Because there is no managed backup, the procedure below is a
**logical backup with `pg_dump`**, run on a schedule from this VM,
with dumps stored under the workspace. It does not depend on the Pro
plan. Upgrading to Pro is documented as the optional alternative.

## Backup — exact command (owner approval required before first run)

Use the **session pooler (port 5432)**, never the transaction pooler
(6543) for dumps: transaction mode cannot run `pg_dump` reliably
(prepared statements / multi-statement dumps are not supported).

```bash
# One-time: the staging/production DB password must come from the
# Secure Vault, never pasted in chat or committed. The command below
# reads it from the environment only.
export PGPASSWORD="<from Secure Vault>"
pg_dump \
  "postgres://postgres.<project-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" \
  --format=custom --no-owner --no-acl \
  --file "$HOME/workspace/sortes-backups/sortes-$(date +%Y%m%d-%H%M%S).dump"
unset PGPASSWORD
```

Notes:

- `--format=custom` keeps the dump compressed and restorable with
  `pg_restore` (single table, whole DB, or `--data-only`).
- `--no-owner --no-acl`: the dump is restored into a database owned
  by a different role, so ownership/ACL lines must not be included.
- The dump is **read-only against production**: `pg_dump` takes a
  consistent snapshot and writes nothing. It is still kept out of
  automated runs in this phase; the first run needs Velu's approval.
- A backup script that wraps the above (retention: keep 14 daily dumps)
  lives at `scripts/backup.mjs` — run it as `npm run db:backup` with
  `SORTES_BACKUP_DATABASE_URL` set. It refuses production-looking runs
  without `SORTES_BACKUP_PRODUCTION=1` and remote Supabase URLs without
  `SORTES_BACKUP_ALLOW_REMOTE=1`. Restores use `scripts/restore.mjs`
  (`npm run db:restore -- --dump <file> --target <url> [--create]`),
  which verifies row counts per table after restoring. Both scripts
  were tested end to end on local Postgres 2026-11-06 (Phase 6B):
  dump of a seeded test database (2 users, 1 transaction, 1 reading,
  1 report, 1 free reading, 1 free interpretation, 2 migrations)
  restored into a fresh database with identical counts, and retention
  pruning was verified (keep 2: oldest dumps deleted, newest kept). A
  plain-SQL dump of the same test database is saved at
  `hidden_files/staging-restore-test.sql` for the dashboard task to
  apply to the empty staging project via the SQL editor.

## Schedule (proposed, needs owner approval)

| Cadence | What | Where |
|---|---|---|
| Daily 03:00 Manila | `pg_dump` (custom format), keep 14 daily dumps | This VM, cron, dumps under `~/workspace/sortes-backups/` |
| Weekly | Verify the newest dump restores into local Postgres (see below) | This VM |
| After any migration | `pg_dump` before + after the migration apply | This VM |

**RPO:** up to 24h of data (daily dumps). **RTO:** under 1h for a
logical restore of a 27 MB database (restore + verify + point the
app at the restored database).

## Restore — exact procedure

```bash
# 1. Create the target database (local Postgres, or a fresh Supabase project).
createdb sortes_restore_test   # local example

# 2. Restore the dump.
pg_restore --no-owner --no-acl -d sortes_restore_test \
  ~/workspace/sortes-backups/sortes-<date>.dump

# 3. Verify: row counts per table.
psql -d sortes_restore_test -c \
  "SELECT 'users', count(*) FROM users UNION ALL \
   SELECT 'transactions', count(*) FROM transactions UNION ALL \
   SELECT 'readings', count(*) FROM readings UNION ALL \
   SELECT 'reports', count(*) FROM reports;"

# 4. Only if the counts match the pre-incident counts (recorded in the
#    backup log), point the app at the restored database:
#    set DATABASE_URL to the restored project and restart the app.
#    Never point the app at a restore that has not been verified.
```

Restoring **into production** is a destructive operation: it replaces
the live database. It requires Velu's explicit approval for that
specific incident, and the pre-restore dump of the current (broken)
production state must be taken first.

## Rollback runbook (bad migration / bad deploy)

1. **Stop the bleeding:** revert the deploy in Vercel (previous
   deployment) — this takes the broken code offline in minutes.
2. **Assess the data:** did the bad migration change data, or only
   schema? `schema_migrations` tells you which versions applied.
3. **Schema-only break:** apply the inverse migration (a new numbered
   migration that undoes the change — never edit an applied migration
   file, never `DROP TABLE` by hand in production).
4. **Data corruption:** restore the pre-migration dump into a staging
   database, verify counts, then — with Velu's approval — restore
   into production and re-apply migrations from the last known-good
   dump point.
5. **Record it:** append the incident to the tracker with the dump
   filename, the migration versions involved, and the restore
   verification output.

## Optional alternative: Supabase Pro

- Pro plan + PITR add-on: from $100/month. Gives point-in-time
  recovery (continuous WAL archiving) and scheduled backups with a
  one-click restore in the dashboard.
- Decision: **not required at the current size** (27 MB, ~1 user).
  Revisit when the user base or transaction volume grows, or when
  Velu approves the spend. No code change is needed either way.

## What is still unconfirmed / blocked

- The exact `pg_dump` command above has **not been run against
  production** in this phase (deliberately — it needs owner approval
  first, even though it is read-only). The backup/restore cycle itself
  is proven on local Postgres (Phase 6B, see above); what remains is
  the first production run and the cron schedule.
- The staging Supabase project's DB password was generated by
  Supabase and not recorded; the owner must reset it and share it via
  Secure Vault before any backup/restore can be exercised against
  staging (see `docs/STAGING.md`). A plain-SQL test dump is ready at
  `hidden_files/staging-restore-test.sql` for the SQL-editor path,
  which needs no password.
- No cron job has been created for the daily dump yet — that is a
  scheduled-job change and needs Velu's approval.
