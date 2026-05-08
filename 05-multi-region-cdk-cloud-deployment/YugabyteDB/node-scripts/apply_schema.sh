#!/bin/bash

###############################################################################
#
# This script applies the application database schema to YugabyteDB after
# the custom superuser has been created.
#
# Multi-region notes (06):
#   * Both regions' node 0 run this script. The first to win applies the
#     schema; the second sees `users` already exists and exits cleanly.
#   * Secondary region's node 0 may start before primary's set_password.sh
#     finishes -- so we wait until the custom superuser can authenticate,
#     not just until YSQL accepts connections.
#   * Cross-region quorum can take a few minutes; the wait loops are sized
#     accordingly.
#
# Usage:
#   apply_schema.sh <secret_arn> <region> <master_ip> <ssh_user>
#
###############################################################################

SECRET_ARN=$1
REGION=$2
MASTER_IP=$3
SSH_USER=$4

YB_HOME="/home/$SSH_USER/yugabyte-db"
YSQLSH="${YB_HOME}/tserver/bin/ysqlsh"

echo "Retrieving credentials from Secrets Manager..."
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ARN}" \
  --region "${REGION}" \
  --query 'SecretString' \
  --output text)

if [ -z "$SECRET_JSON" ]; then
  echo "ERROR: Failed to retrieve credentials from Secrets Manager"
  exit 1
fi

USERNAME=$(echo "$SECRET_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")
PASSWORD=$(echo "$SECRET_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
  echo "ERROR: Failed to parse username or password from secret"
  exit 1
fi

# Wait for YSQL up + custom superuser created. The latter only exists after
# primary node 0's set_password.sh runs; secondary node 0 may race past it.
# Up to 30 minutes (cross-region cluster bootstrap + password setup).
echo "Waiting for YSQL + custom superuser to be ready on ${MASTER_IP}..."
MAX_RETRIES=180
RETRY_COUNT=0
while ! PGPASSWORD="${PASSWORD}" "${YSQLSH}" \
        -h "${MASTER_IP}" -p 5433 \
        -U "${USERNAME}" -d yugabyte \
        -c "SELECT 1;" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: YSQL/superuser not ready after ${MAX_RETRIES} attempts"
    exit 1
  fi
  if (( RETRY_COUNT % 6 == 0 )); then
    echo "  still waiting (${RETRY_COUNT}/${MAX_RETRIES})..."
  fi
  sleep 10
done
echo "YSQL + superuser ready."

# Idempotency: if the schema has already been applied (by the other region's
# node 0), skip. The check is on the public.users table, which is the first
# thing schema.sql creates after the pgcrypto extension and aws_region enum.
EXISTS=$(PGPASSWORD="${PASSWORD}" "${YSQLSH}" \
  -h "${MASTER_IP}" -p 5433 \
  -U "${USERNAME}" -d yugabyte \
  -tA \
  -c "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users' LIMIT 1;" \
  2>/dev/null)

if [ "${EXISTS}" = "1" ]; then
  echo "Schema already applied (users table exists). Skipping."
  exit 0
fi

echo "Applying database schema..."
PGPASSWORD="${PASSWORD}" "${YSQLSH}" \
  -h "${MASTER_IP}" -p 5433 \
  -U "${USERNAME}" -d yugabyte \
  -v ON_ERROR_STOP=1 \
  -f /home/${SSH_USER}/schema.sql

if [ $? -ne 0 ]; then
  # If the racing node beat us between the existence check and the apply,
  # treat duplicate-object errors as success rather than failing cfn-init.
  RECHECK=$(PGPASSWORD="${PASSWORD}" "${YSQLSH}" \
    -h "${MASTER_IP}" -p 5433 \
    -U "${USERNAME}" -d yugabyte \
    -tA \
    -c "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users' LIMIT 1;" \
    2>/dev/null)
  if [ "${RECHECK}" = "1" ]; then
    echo "Schema applied by the other region's node 0 during our run. OK."
    exit 0
  fi
  echo "ERROR: Failed to apply schema"
  exit 1
fi
echo "Schema applied successfully."
