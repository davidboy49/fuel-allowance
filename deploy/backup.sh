#!/bin/sh
# Daily backup of the SQLite database. Cron example: 0 2 * * * /opt/fuel-allowance/deploy/backup.sh
set -e
DEST=${1:-/var/backups/fuel-allowance}
mkdir -p "$DEST"
docker compose exec -T app sh -c 'sqlite3 /data/fuel.db ".backup /data/backup.db" 2>/dev/null || cp /data/fuel.db /data/backup.db'
docker compose cp app:/data/backup.db "$DEST/fuel-$(date +%F).db"
find "$DEST" -name 'fuel-*.db' -mtime +30 -delete
