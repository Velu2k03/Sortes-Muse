#!/usr/bin/env bash
# backup-daily.sh — Phase 7 daily production backup wrapper.
#
# NOT ENABLED. This file is the schedule definition only: creating the
# cron job that calls it needs the owner's explicit approval (B-U),
# because it reads the production database URL from a Secure
# Vault-provided env file.
#
# How it is meant to run (after approval):
#   1. The owner saves the production database URL (session pooler,
#      port 5432) as SORTES_BACKUP_DATABASE_URL in an env file at
#      ~/.config/sortes/backup.env (mode 600), supplied via Secure
#      Vault. The file must contain ONLY that one variable.
#   2. A cron job (or the parent agent's scheduler) runs this script
#      daily at 03:00 Asia/Manila:
#        0 3 * * *  TZ=Asia/Manila /home/hatch/workspace/sortes/scripts/backup-daily.sh >> /home/hatch/workspace/sortes-backups/cron.log 2>&1
#      (cron line is indicative; the scheduler owns the exact form.)
#   3. This script sources the env file, runs scripts/backup.mjs
#      (pg_dump custom format, retention keep 14), and appends one
#      JSON line per run to ~/workspace/sortes-backups/backup.log.
#   4. The weekly restore check (scripts/restore.mjs into a fresh
#      local database) is a separate manual step in
#      docs/BACKUP-RECOVERY.md — it is NOT done by this script.
#
# Safety: the script refuses to run if the env file is missing or
# unreadable, and never prints the database URL. pg_dump is read-only
# against production (consistent snapshot, writes nothing).
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
export SORTES_BACKUP_DIR="$HOME/workspace/sortes-backups" SORTES_BACKUP_KEEP=14
exec node scripts/backup.mjs
