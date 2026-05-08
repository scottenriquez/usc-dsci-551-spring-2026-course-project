#!/bin/bash
set -euo pipefail
YB_BASE_DIR="${YB_BASE_DIR:-/home/yugabyte/var}"
LOG_DIR="${LOG_DIR:-/var/log/app}"
DB_USER="${POSTGRES_USER:-yugabyte}"
DB_NAME="${POSTGRES_DB:-yugabyte}"
DB_PASSWORD="${POSTGRES_PASSWORD:-yugabyte}"
mkdir -p "$YB_BASE_DIR" "$LOG_DIR"
ADVERTISE_IP="$(hostname -i | awk '{print $1}')"
echo "[start.sh] Launching yugabyted (advertise=$ADVERTISE_IP, base_dir=$YB_BASE_DIR)..."
bin/yugabyted start \
    --background=false \
    --base_dir="$YB_BASE_DIR" \
    --advertise_address="$ADVERTISE_IP" \
    > "$LOG_DIR/yugabyted-stdout.log" 2>&1 &
YB_PID=$!
export PGPASSWORD="$DB_PASSWORD"
echo "[start.sh] Waiting for YSQL on $ADVERTISE_IP:5433..."
for i in $(seq 1 120); do
    if ysqlsh -h "$ADVERTISE_IP" -p 5433 -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
        echo "[start.sh] YSQL is up after ${i} attempt(s)."
        break
    fi
    sleep 2
done
if ! ysqlsh -h "$ADVERTISE_IP" -p 5433 -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo "[start.sh] YSQL never came up. Tailing yugabyted output:"
    tail -n 80 "$LOG_DIR/yugabyted-stdout.log" || true
    exit 1
fi
ysqlsh -h "$ADVERTISE_IP" -p 5433 -U "$DB_USER" -d "$DB_NAME" \
    -c "ALTER USER \"$DB_USER\" WITH PASSWORD '$DB_PASSWORD';" \
    > /dev/null
SENTINEL="$YB_BASE_DIR/.seeded"
if [ ! -f "$SENTINEL" ]; then
    echo "[start.sh] Applying schema..."
    PGHOST="$ADVERTISE_IP" PGPORT=5433 \
        POSTGRES_USER="$DB_USER" POSTGRES_DB="$DB_NAME" \
        bash /opt/init/01_schema.sh

    echo "[start.sh] Loading seed data..."
    PGHOST="$ADVERTISE_IP" PGPORT=5433 \
        POSTGRES_USER="$DB_USER" POSTGRES_DB="$DB_NAME" \
        bash /opt/init/02_seed.sh

    touch "$SENTINEL"
    echo "[start.sh] Seed complete."
else
    echo "[start.sh] Schema already applied (sentinel found at $SENTINEL)."
fi
sleep 2
TSERVER_INFO_LOG="$(find "$YB_BASE_DIR" -name 'yb-tserver*.INFO*' 2>/dev/null | head -1 || true)"
if [ -n "$TSERVER_INFO_LOG" ]; then
    echo "[start.sh] Tailing tserver log: $TSERVER_INFO_LOG -> $LOG_DIR/db.log"
    tail -F -q "$TSERVER_INFO_LOG" >> "$LOG_DIR/db.log" 2>/dev/null &
fi
echo "[start.sh] Ready. Waiting on yugabyted (PID $YB_PID)."
wait "$YB_PID"
