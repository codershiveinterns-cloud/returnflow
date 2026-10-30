#!/usr/bin/env bash
# Nightly backup of the database and uploaded photos.
# crontab -e →  30 2 * * *  /srv/returnflow/deploy/backup.sh >> /var/log/returnflow-backup.log 2>&1
set -euo pipefail
APP=/srv/returnflow
DEST=${BACKUP_DIR:-/srv/backups/returnflow}
KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DEST"

# Consistent online copy of SQLite (safe while the app is running)
sqlite3 "$APP/server/prisma/prod.db" ".backup '$DEST/db-$STAMP.sqlite'"
gzip "$DEST/db-$STAMP.sqlite"

# Private uploads (customer & inspection photos, logos)
tar -czf "$DEST/storage-$STAMP.tar.gz" -C "$APP/server" storage

find "$DEST" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $DEST/db-$STAMP.sqlite.gz"
# Optional off-site copy:  rclone copy "$DEST" remote:returnflow-backups
