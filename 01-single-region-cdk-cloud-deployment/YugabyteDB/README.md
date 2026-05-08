# YugabyteDB Single-Region AWS CDK Deployment

An AWS CDK (Python) project that deploys a three-node YugabyteDB distributed SQL cluster across three availability zones in
a single AWS region.

## Architecture

![Single-Region YugabyteDB Architecture](../Single-Region-YugabyteDB-Architecture.png)

### Infrastructure Components

- **VPC** (`10.0.0.0/16`): Three AZs with public and private subnets, one NAT gateway
- **EC2 instances**: Three `c5.xlarge` instances running Amazon Linux 2 with 50GB `gp3` EBS volumes, deployed in private
  subnets
- **Network Load Balancer**: Internet-facing, exposes YSQL (5433), YCQL (9042), and YEDIS (6379) ports
- **Security groups**: Separate groups for master processes, tablet server processes, and NLB traffic
- **Secrets Manager**: Auto-generates and stores database credentials (username + 32-character password)
- **CloudWatch**: Forwards master, tserver, and YSQL logs from all nodes

### Key Design Decisions

- **Private subnets**: Nodes are not directly internet-accessible; outbound traffic routes through a NAT gateway
- **NLB over ALB**: Supports non-HTTP database protocols with minimal latency
- **RF=3 across 3 AZs**: One master per AZ for fault tolerance against single-AZ failures
- **Cron-based self-healing**: Master and tserver processes are monitored and restarted every 3 minutes if down
- **Deployment ordering**: Node 2 depends on nodes 0 and 1 completing initialization first; credential setup runs only
  on node 2 after the cluster is fully formed

## Project Structure

```
yugabyte_db/
  yugabyte_db_stack.py           # Main stack (parameters, secrets, outputs)
  networking_construct.py        # VPC and subnet configuration
  security_construct.py          # Security group rules
  nodes_construct.py             # EC2 instances with cfn-init
  load_balancer_construct.py     # NLB and target groups
node-scripts/
  install_software.sh            # Downloads YugabyteDB, tunes OS limits
  create_universe.sh             # Configures and starts master/tserver
  start_master.sh                # Cron-driven master process monitor
  start_tserver.sh               # Cron-driven tserver process monitor
  setup_cloudwatch_agent.sh      # CloudWatch log agent configuration
  set_password.sh                # Creates DB user via Secrets Manager
tests/
  unit/test_yugabyte_db_stack.py # CloudFormation resource assertions
```

## Prerequisites

- AWS account with credentials configured
- An EC2 key pair created in the target region
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- Python 3.8+

## Setup and Deployment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cdk synth
cdk deploy --parameters KeyName=<your-key-pair-name>
```

### Stack Parameters

| Parameter      | Default                | Description                                     |
|----------------|------------------------|-------------------------------------------------|
| `KeyName`      | `yugabyte-db-key-pair` | EC2 key pair name for SSH access                |
| `DBVersion`    | `2.1.6.0-b17`          | YugabyteDB release version                      |
| `RFFactor`     | `3`                    | Replication factor                              |
| `InstanceType` | `c5.xlarge`            | EC2 instance type (`c5.xlarge` or `c5.2xlarge`) |
| `DBUsername`   | `ybadmin`              | Database superuser name                         |

## Connecting to the Cluster

After deployment, the stack outputs provide connection details. Retrieve the NLB DNS name and Secrets Manager ARN from
the stack outputs.

```bash
# YSQL (PostgreSQL-compatible)
ysqlsh -U <DBUsername> -h <NLB_DNS> -p 5433

# YCQL (Cassandra-compatible)
ycqlsh <NLB_DNS> 9042

# YEDIS (Redis-compatible)
redis-cli -h <NLB_DNS> -p 6379

# JDBC
postgresql://<DBUsername>@<NLB_DNS>:5433
```

Retrieve the database password from Secrets Manager in the AWS Console using the ARN in the stack outputs.

## Teardown

```bash
cdk destroy
```
