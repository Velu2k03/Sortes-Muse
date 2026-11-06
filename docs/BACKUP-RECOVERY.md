# Sortes - Backup & Recovery

Updated for Phase C (2026-11-07). Status of the facts below: **verified live 2026-11-06 / 2026-11-07** by the Supabase dashboard check (production project, FREE plan).

## Where we stand (verified facts)

- Production database: Supabase Postgres 17.6.1.166, FREE plan, ~27 MB, ~1 user, ~8 transactions, ~1 reading. Project ref `adgputwbdtdmgkiswtnz`.
- **No scheduled backups. No PITR. No restore path.** PITR is a Pro add-on (from $100/month) and is not enabled.
- Pooler: transaction mode port 6543, session mode port 5432, host `aws-0-ap-northeast-1.pooler.supabase.com`, pool size 15, max connections 200.
- Production dumps must use the **session pooler (port 5432)**, never the transaction pooler (6543): transaction mode cannot run `pg_dump` reliably (prepared statements and multi-statement dumps are not supported).
- Target metrics: **RPO:** 24h (daily dumps). **RTO:** under 1h for a logical restore of a 27 MB database (decrypt + restore + verify + point the app at the restored database).
- An upgrade to Postgres 17.11.0.018 is offered in the dashboard: do not apply without Velu's approval.

## Architecture: Primary (Drive) + Fallback (Actions)

1. **Primary runner**: Runtime-managed Muse cron on this VM, daily at 03:00 Asia/Manila, running `scripts/backup-daily.sh`.
   - `pg_dump` writes custom-format dump to `~/workspace/sortes-backups/sortes-<date>.dump`.
   - SHA-256 checksum is computed and recorded in `backup.log`.
   - `age` encrypts the dump with X25519 using the public key from `~/.config/sortes/age-recipient.txt` (or `SORTES_BACKUP_AGE_RECIPIENT_FILE`). Plaintext dump is immediately deleted.
   - Uploads `.dump.age` to Google Drive folder `Sortes Backups` using `/opt/hatch/bin/hatch_gws_cli` (`scripts/backup-drive-upload.mjs`). Same-day re-uploads replace existing content in place.
   - Enforces 14-day retention locally and on Google Drive (keeps newest 14 blobs).
2. **Fallback runner**: GitHub Actions scheduled workflow (template at `docs/github-actions/sortes-backup.yml`; install it as `.github/workflows/sortes-backup.yml` once the pushing token has the `workflow` scope — see the template header), daily at 03:07 Asia/Manila (19:07 UTC).
   - Independent runner on `ubuntu-latest`.
   - Secrets: `SORTES_BACKUP_DATABASE_URL` (repository secret), `AGE_PUBLIC_KEY` (repository variable).
   - Encrypts inside `scripts/backup.mjs` with `SORTES_BACKUP_AGE_RECIPIENT`.
   - Uploads encrypted artifact `sortes-backup-<run_id>` with 14-day retention.
   - Fallback only because public repo scheduled workflows auto-disable after 60 days of repo inactivity and have no delivery SLA.
3. **Working copy**: `~/workspace/sortes-backups/` persists across VM replacements (`~/workspace` persists), providing fast local restore.

## Encryption & Key Ceremony

Backups contain sensitive application data and credentials. Dumps are encrypted with `age` (X25519 plus ChaCha20-Poly1305 AEAD) using asymmetric key separation:
- The runner only holds the **public key** (`age1...`), stored in `~/.config/sortes/age-recipient.txt` (mode 644) and the `AGE_PUBLIC_KEY` Actions variable. The runner can encrypt but can NEVER decrypt.
- The **private key** (`AGE-SECRET-KEY-1...`) is NEVER placed on any runner, never placed in `backup.env`, never put in git, and never printed in chat or logs.
- Test keys vs production ceremony:
  - Test keys may be generated ephemerally for local testing and destroyed immediately.
  - Production key ceremony belongs strictly to Velu:
    1. Keypair generation: `age-keygen -o ~/.config/sortes/age-key.txt && chmod 600 ~/.config/sortes/age-key.txt`.
    2. Extract public key to `~/.config/sortes/age-recipient.txt` (mode 644).
    3. Store private key in Secure Vault via the Vault capture flow (same flow as production `POSTGRES_URL`).
    4. Velu saves a second copy in his personal password manager (and ideally a physical printed copy).
    5. Delete private key from VM: `shred -u ~/.config/sortes/age-key.txt`. Verify file is gone.
  - **CRITICAL WARNING:** Loss of every copy of the private key means all encrypted backups are permanently unrecoverable.

## Alerting & Watchdog

- Primary alert: Morning watchdog via the daily mail digest cron (09:00 Asia/Manila).
  - Watchdog invocation:
    `node /home/hatch/workspace/sortes/scripts/backup-watchdog.mjs`
    (or `npm run db:backup:watchdog`, or with `--json`).
  - Checks `backup.log` for a `backup-ok` event within the last 25 hours.
  - Exits 0 if healthy, exits 1 if missing or if failures occurred.
  - Reports newest backup timestamp, age in hours, file size, and any failures in the last 25 hours.
- Fallback alert: GitHub Actions native email on workflow failure.
- Weekly restore test: Sunday 04:00 Asia/Manila test restore into local Postgres.

## Retention Math

- Database size: ~27 MB (includes catalogs, indexes, free space).
- Typical production dump: ~200 KB realistic (compressed custom format), ~5 MB conservative, 27 MB absolute ceiling.
- 14-day retention bounds:
  - Realistic (~200 KB/day): ~3 MB total (fits Drive 15 GB, fits Actions 500 MB).
  - Conservative (5 MB/day): ~70 MB total (fits Drive 15 GB, fits Actions 500 MB).
  - Worst case (27 MB/day): ~378 MB total (fits Drive 15 GB, fits Actions 500 MB with ~122 MB headroom).
- 14 days is confirmed adequate and fits within free quotas.

## Restore & Recovery Procedure

Restoring into production is a destructive operation that replaces the live database. It requires Velu's explicit approval for that specific incident, and a pre-restore dump of the current production state must be taken first.

### Restoring an encrypted backup (.age)

```bash
# 1. Fetch encrypted backup file (e.g. from Google Drive or ~/workspace/sortes-backups/)
# 2. Retrieve private key from Secure Vault and save to a temporary mode 600 file:
cat << 'EOF' > ~/.config/sortes/age-key-restore.txt
AGE-SECRET-KEY-1...
EOF
chmod 600 ~/.config/sortes/age-key-restore.txt

# 3. Option A: Automated restore via restore.mjs
# Decrypts to a temporary plaintext file in the same directory, runs pg_restore,
# verifies row counts, and deletes the temporary plaintext file:
node scripts/restore.mjs \
  --dump ~/workspace/sortes-backups/sortes-<date>.dump.age \
  --target "postgres://sortes_test:sortes_test_local@localhost:5432/sortes_restore_test" \
  --age-key-file ~/.config/sortes/age-key-restore.txt \
  [--create]

# Option B: Manual decrypt and restore
age -d -i ~/.config/sortes/age-key-restore.txt \
  ~/workspace/sortes-backups/sortes-<date>.dump.age > ~/workspace/sortes-backups/sortes-<date>.dump

# Verify integrity: checksum must match backup-checksum event in backup.log
sha256sum ~/workspace/sortes-backups/sortes-<date>.dump
pg_restore --list ~/workspace/sortes-backups/sortes-<date>.dump > /dev/null

# Restore into target database:
pg_restore --no-owner --no-acl -d sortes_restore_test ~/workspace/sortes-backups/sortes-<date>.dump

# Clean up plaintext dump:
rm -f ~/workspace/sortes-backups/sortes-<date>.dump

# 4. ALWAYS delete the private key file immediately after decryption:
shred -u ~/.config/sortes/age-key-restore.txt
```

### Verification query

After restoring, verify table counts against source numbers:

```sql
SELECT 'users', count(*) FROM users UNION ALL
SELECT 'auth_codes', count(*) FROM auth_codes UNION ALL
SELECT 'transactions', count(*) FROM transactions UNION ALL
SELECT 'readings', count(*) FROM readings UNION ALL
SELECT 'reports', count(*) FROM reports UNION ALL
SELECT 'free_readings', count(*) FROM free_readings UNION ALL
SELECT 'free_interpretations', count(*) FROM free_interpretations UNION ALL
SELECT 'schema_migrations', count(*) FROM schema_migrations
ORDER BY 1;
```

## Scheduler note (Runtime-managed cron)

System `crontab` is NOT installed on this VM. Do not attempt to add crontab entries.
The scheduler on this VM is the runtime-managed cron (Muse scheduler):
- Job title: `Sortes daily production backup`
- Schedule: Daily 03:00 Asia/Manila
- Command: `/home/hatch/workspace/sortes/scripts/backup-daily.sh >> /home/hatch/workspace/sortes-backups/cron.log 2>&1`
- Creating or editing this schedule requires Velu's approval.

## What still needs Velu (pending approvals and items)

1. **Production POSTGRES_URL (session pooler, port 5432)**: Supplied via Secure Vault into `~/.config/sortes/backup.env` (mode 600, `SORTES_BACKUP_DATABASE_URL` only).
2. **Age keypair ceremony**: Run generation ceremony, store private key in Secure Vault, save Velu's second copy in his password manager, and place public key in `~/.config/sortes/age-recipient.txt`.
3. **Google Drive folder creation & approval**: Create the `Sortes Backups` folder in Google Drive and grant connector approval for the first upload.
4. **Daily cron creation approval**: Approve creation of the runtime-managed daily 03:00 Manila backup job.
5. **GitHub Actions configuration**: Add repository secret `SORTES_BACKUP_DATABASE_URL` and repository variable `AGE_PUBLIC_KEY` in `Velu2k03/Sortes-Muse` repository settings.

## NPM Scripts

- `npm run db:backup`: Run local logical backup (`scripts/backup.mjs`).
- `npm run db:backup:daily`: Run full daily cycle including Drive upload (`scripts/backup-daily.sh`).
- `npm run db:backup:upload`: Upload encrypted backup to Google Drive (`scripts/backup-drive-upload.mjs`).
- `npm run db:backup:watchdog`: Run backup health watchdog check (`scripts/backup-watchdog.mjs`).
- `npm run db:restore`: Restore database from dump with row-count verification (`scripts/restore.mjs`).
