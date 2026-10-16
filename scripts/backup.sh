#!/bin/bash
# DrumSkills: full backup of the Supabase database (all tables AND the login accounts) into ONE dated file.
# It only READS from the database. It never changes or deletes anything there, and it never overwrites an older backup.
#
# One-time setup (see scripts/BACKUP-README.md):
#   1. brew install libpq
#   2. create the private file ~/.drumskills-backup.env with ONE line:   DATABASE_URL='postgresql://...'
# Then run:   bash scripts/backup.sh

set -euo pipefail

ENV_FILE="$HOME/.drumskills-backup.env"
OUT_DIR="$HOME/Documents/DrumSkills backups"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it with one line:  DATABASE_URL='your connection string'  (see scripts/BACKUP-README.md)"
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"
if [ -z "${DATABASE_URL:-}" ]; then echo "DATABASE_URL is empty in $ENV_FILE"; exit 1; fi

PGDUMP="$(command -v pg_dump || true)"
for candidate in /opt/homebrew/opt/libpq/bin/pg_dump /usr/local/opt/libpq/bin/pg_dump; do
  if [ -z "$PGDUMP" ] && [ -x "$candidate" ]; then PGDUMP="$candidate"; fi
done
if [ -z "$PGDUMP" ]; then echo "pg_dump not found. Run:  brew install libpq"; exit 1; fi

mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/drumskills-$(date +%Y-%m-%d-%H%M).sql.gz"
if [ -e "$FILE" ]; then echo "$FILE already exists, not overwriting."; exit 1; fi

echo "Backing up to: $FILE"
# public = all the app's tables, auth = the login accounts. --no-owner / --no-privileges keep the file easy to restore elsewhere.
"$PGDUMP" "$DATABASE_URL" --no-owner --no-privileges --schema=public --schema=auth | gzip > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "Done. Backup size: $SIZE"
if [ "$(wc -c < "$FILE")" -lt 2000 ]; then echo "Warning: the file is very small, something may have gone wrong. Check your connection string."; fi
