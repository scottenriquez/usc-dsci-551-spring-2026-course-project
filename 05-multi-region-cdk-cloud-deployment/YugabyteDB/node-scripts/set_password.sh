#!/bin/bash

###############################################################################
#
# This script retrieves the YugabyteDB credentials from AWS Secrets Manager
# and creates a custom superuser, replacing the default yugabyte user.
#
# Usage:
#   set_password.sh <secret_arn> <region> <master_ip> <ssh_user>
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

echo "Waiting for YSQL to be ready on ${MASTER_IP}..."
MAX_RETRIES=60
RETRY_COUNT=0
while ! "${YSQLSH}" -h "${MASTER_IP}" -p 5433 -U yugabyte -c "SELECT 1;" > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: YSQL not ready after ${MAX_RETRIES} attempts"
    exit 1
  fi
  echo "YSQL not ready yet, retrying in 10 seconds... (${RETRY_COUNT}/${MAX_RETRIES})"
  sleep 10
done

echo "Creating custom superuser '${USERNAME}'..."
"${YSQLSH}" -h "${MASTER_IP}" -p 5433 -U yugabyte -d yugabyte <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${USERNAME}') THEN
    CREATE ROLE ${USERNAME} WITH SUPERUSER LOGIN PASSWORD '${PASSWORD}';
    RAISE NOTICE 'Created superuser role %', '${USERNAME}';
  ELSE
    ALTER ROLE ${USERNAME} WITH PASSWORD '${PASSWORD}';
    RAISE NOTICE 'Updated password for existing role %', '${USERNAME}';
  END IF;
END
\$\$;
EOF

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to configure custom superuser '${USERNAME}'."
  exit 1
fi
echo "Custom superuser '${USERNAME}' configured successfully."

echo "Disabling default yugabyte user..."
"${YSQLSH}" -h "${MASTER_IP}" -p 5433 -U "${USERNAME}" -d yugabyte <<EOF
ALTER ROLE yugabyte WITH NOLOGIN;
EOF

if [ $? -eq 0 ]; then
  echo "Default yugabyte user login disabled."
else
  echo "ERROR: Failed to disable default yugabyte user."
  exit 1
fi
