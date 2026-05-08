#!/bin/bash

###############################################################################
#
# This script applies the application database schema to YugabyteDB after
# the custom superuser has been created.
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

echo "Applying database schema..."
PGPASSWORD="${PASSWORD}" "${YSQLSH}" \
  -h "${MASTER_IP}" -p 5433 \
  -U "${USERNAME}" -d yugabyte \
  -f /home/${SSH_USER}/schema.sql

if [ $? -ne 0 ]; then
  echo "ERROR: Failed to apply schema"
  exit 1
fi
echo "Schema applied successfully."
