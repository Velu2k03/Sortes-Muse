#!/usr/bin/env bash
# backup-daily.sh - Daily production backup wrapper.
#
# Runs backup.mjs (pg_dump, sha256 checksum, age encryption when a
# recipient key is configured), then uploads the resulting .age blob
# to Google Drive.
# Safety: refuses to run if the env file is missing or unreadable,
# and never prints the database URL.

set -u

ENV_FILE="${SORTES_BACKUP_ENV_FILE:-$HOME/.config/sortes/backup.env}"
if [ ! -r "$ENV_FILE" ]; then
  echo "backup-daily: env file not readable: $ENV_FILE (owner must supply it via Secure Vault)" >&2
  exit 2
fi

# shellcheck source=/dev/null
set -a; . "$ENV_FILE"; set +a
if [ -z "${SORTES_BACKUP_DATABASE_URL:-}" ]; then
  echo "backup-daily: SORTES_BACKUP_DATABASE_URL is not set in $ENV_FILE" >&2
  exit 2
fi

cd "$(dirname "$0")/.." || exit 2

# The two flags below are the approval gates inside scripts/backup.mjs:
# they let it run against a remote Supabase URL (production) on purpose.
export SORTES_BACKUP_PRODUCTION=1 SORTES_BACKUP_ALLOW_REMOTE=1
export SORTES_BACKUP_DIR="${SORTES_BACKUP_DIR:-$HOME/workspace/sortes-backups}"
export SORTES_BACKUP_KEEP="${SORTES_BACKUP_KEEP:-14}"
LOG_FILE="$SORTES_BACKUP_DIR/backup.log"

# Wire in encryption: read recipient public key from ~/.config/sortes/age-recipient.txt
RECIPIENT_FILE="${SORTES_BACKUP_AGE_RECIPIENT_FILE:-$HOME/.config/sortes/age-recipient.txt}"
if [ -r "$RECIPIENT_FILE" ]; then
  export SORTES_BACKUP_AGE_RECIPIENT_FILE="$RECIPIENT_FILE"
else
  echo "backup-daily: warning: recipient file $RECIPIENT_FILE not present; proceeding unencrypted (key ceremony pending)" >&2
  unset SORTES_BACKUP_AGE_RECIPIENT_FILE 2>/dev/null || true
fi

# Run backup.mjs via node (not exec) so the wrapper can continue to the upload step
node scripts/backup.mjs
BACKUP_STATUS=$?
if [ $BACKUP_STATUS -ne 0 ]; then
  echo "backup-daily: backup.mjs failed with exit code $BACKUP_STATUS" >&2
  exit $BACKUP_STATUS
fi

# Locate the newest encrypted .age dump in backup dir
NEWEST_AGE=$(find "$SORTES_BACKUP_DIR" -maxdepth 1 -name "sortes-*.dump.age" -type f 2>/dev/null | sort | tail -n 1)

if [ -z "$NEWEST_AGE" ]; then
  echo "backup-daily: notice: no .age dump found (unencrypted run); skipping Google Drive upload" >&2
  exit 0
fi

# Best-effort offsite upload to Google Drive
node scripts/backup-drive-upload.mjs --file "$NEWEST_AGE"
UPLOAD_STATUS=$?

if [ $UPLOAD_STATUS -ne 0 ]; then
  FAIL_LINE=$(node -e 'console.log(JSON.stringify({ ts: new Date().toISOString(), event: "backup-offsite-failed", file: process.argv[1], status: Number(process.argv[2]) }))' "$NEWEST_AGE" "$UPLOAD_STATUS")
  echo "$FAIL_LINE" >> "$LOG_FILE"
  echo "$FAIL_LINE" >&2
  exit $UPLOAD_STATUS
fi

exit 0
