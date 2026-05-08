#!/bin/bash

###############################################################################
#
# Installs and configures the CloudWatch agent to ship YugabyteDB logs.
#
# Usage:
#   setup_cloudwatch_agent.sh <stack_name> <node_index>
#
###############################################################################

STACK_NAME=$1
NODE_INDEX=$2
YB_HOME=/home/${USER}/yugabyte-db
LOG_GROUP_PREFIX="/yugabytedb/${STACK_NAME}"

# Install the CloudWatch agent
sudo yum install -y amazon-cloudwatch-agent

# Write the agent configuration
sudo tee /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json > /dev/null <<EOF
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "${YB_HOME}/master/master.out",
            "log_group_name": "${LOG_GROUP_PREFIX}/master",
            "log_stream_name": "node-${NODE_INDEX}/master.out",
            "retention_in_days": -1
          },
          {
            "file_path": "${YB_HOME}/master/master.err",
            "log_group_name": "${LOG_GROUP_PREFIX}/master",
            "log_stream_name": "node-${NODE_INDEX}/master.err",
            "retention_in_days": -1
          },
          {
            "file_path": "${YB_HOME}/data/disk0/yb-data/master/logs/yb-master.*.log.INFO.*",
            "log_group_name": "${LOG_GROUP_PREFIX}/master",
            "log_stream_name": "node-${NODE_INDEX}/master-INFO",
            "retention_in_days": -1
          },
          {
            "file_path": "${YB_HOME}/data/disk0/yb-data/master/logs/yb-master.*.log.WARNING.*",
            "log_group_name": "${LOG_GROUP_PREFIX}/master",
            "log_stream_name": "node-${NODE_INDEX}/master-WARNING",
            "retention_in_days": -1
          },
          {
            "file_path": "${YB_HOME}/data/disk0/yb-data/master/logs/yb-master.*.log.ERROR.*",
            "log_group_name": "${LOG_GROUP_PREFIX}/master",
            "log_stream_name": "node-${NODE_INDEX}/master-ERROR",
            "retention_in_days": -1
          },
          {
            "file_path": "${YB_HOME}/tserver/tserver.out",
            "log_group_name": "${LOG_GROUP_PREFIX}/tserver",
            "log_stream_name": "node-${NODE_INDEX}/tserver.out",
            "retention_in_days": -1
          },
          {
            "file_path": "${YB_HOME}/tserver/tserver.err",
            "log_group_name": "${LOG_GROUP_PREFIX}/tserver",
            "log_stream_name": "node-${NODE_INDEX}/tserver.err",
            "retention_in_days": -1
          },
          {
            "file_path": "${YB_HOME}/data/disk0/yb-data/tserver/logs/yb-tserver.*.log.WARNING.*",
            "log_group_name": "${LOG_GROUP_PREFIX}/tserver",
            "log_stream_name": "node-${NODE_INDEX}/tserver-WARNING",
            "retention_in_days": -1
          },
          {
            "file_path": "${YB_HOME}/data/disk0/yb-data/tserver/logs/yb-tserver.*.log.ERROR.*",
            "log_group_name": "${LOG_GROUP_PREFIX}/tserver",
            "log_stream_name": "node-${NODE_INDEX}/tserver-ERROR",
            "retention_in_days": -1
          },
          {
            "file_path": "${YB_HOME}/data/disk0/yb-data/tserver/logs/postgresql-*.log",
            "log_group_name": "${LOG_GROUP_PREFIX}/ysql",
            "log_stream_name": "node-${NODE_INDEX}/postgresql",
            "retention_in_days": -1
          },
          {
            "file_path": "/var/log/cloud-init-output.log",
            "log_group_name": "${LOG_GROUP_PREFIX}/cfn-init",
            "log_stream_name": "node-${NODE_INDEX}/cloud-init-output",
            "retention_in_days": -1
          },
          {
            "file_path": "/var/log/cfn-init.log",
            "log_group_name": "${LOG_GROUP_PREFIX}/cfn-init",
            "log_stream_name": "node-${NODE_INDEX}/cfn-init",
            "retention_in_days": -1
          },
          {
            "file_path": "/var/log/cfn-init-cmd.log",
            "log_group_name": "${LOG_GROUP_PREFIX}/cfn-init",
            "log_stream_name": "node-${NODE_INDEX}/cfn-init-cmd",
            "retention_in_days": -1
          },
          {
            "file_path": "/tmp/apply_schema.log",
            "log_group_name": "${LOG_GROUP_PREFIX}/cfn-init",
            "log_stream_name": "node-${NODE_INDEX}/apply_schema",
            "retention_in_days": -1
          }
        ]
      }
    }
  }
}
EOF

# Start the agent
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
  -s
