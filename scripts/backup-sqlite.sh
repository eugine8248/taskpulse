#!/bin/sh
# backup-sqlite.sh — atomic SQLite backup with daily + weekly rotation.
#
# Runs inside the alpine runtime container; deps: sqlite3 (apk add sqlite).
# Atomic via sqlite3's `.backup` command (vs raw cp which can corrupt
# the file mid-write while the server is serving live requests).
#
# Outputs: /app/backups/taskpulse-<ISO-date>.bak
# Retention: 7 most-recent daily + 4 most-recent weekly (every Sunday).
#
# Usage:
#   docker compose exec taskpulse /bin/sh /app/scripts/backup-sqlite.sh

set -eu

DB=${DB:-/app/data/taskpulse.db}
BACKUP_DIR=${BACKUP_DIR:-/app/backups}
NAME=$(basename "$DB" .db)
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
DOW=$(date -u +%u) # 1..7, 7=Sun

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB" ]; then
  echo "[backup] no db at $DB — skipping"
  exit 0
fi

OUT="$BACKUP_DIR/${NAME}-${TS}.bak"
echo "[backup] $DB -> $OUT"
sqlite3 "$DB" ".backup '$OUT'"

if [ "$DOW" = "7" ]; then
  WEEKLY="$BACKUP_DIR/${NAME}-weekly-${TS}.bak"
  cp "$OUT" "$WEEKLY"
  echo "[backup] weekly tag: $WEEKLY"
fi

# rotation: keep 7 most-recent daily (excluding weeklies)
ls -1t "$BACKUP_DIR/${NAME}"-2*.bak 2>/dev/null | grep -v weekly | tail -n +8 | while read f; do
  echo "[backup] prune daily: $f"
  rm -f "$f"
done

# rotation: keep 4 most-recent weekly
ls -1t "$BACKUP_DIR/${NAME}"-weekly-*.bak 2>/dev/null | tail -n +5 | while read f; do
  echo "[backup] prune weekly: $f"
  rm -f "$f"
done

echo "[backup] done"
