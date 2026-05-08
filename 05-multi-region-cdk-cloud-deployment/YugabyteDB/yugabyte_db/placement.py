PRIMARY_REGION = 'us-west-2'
SECONDARY_REGION = 'us-east-2'

PRIMARY_VPC_CIDR = '10.0.0.0/16'
SECONDARY_VPC_CIDR = '10.1.0.0/16'
PRIMARY_NODE_IPS = ['10.0.3.10', '10.0.4.10', '10.0.5.10']
SECONDARY_NODE_IPS = ['10.1.3.10', '10.1.4.10', '10.1.5.10']
ALL_NODE_IPS = PRIMARY_NODE_IPS + SECONDARY_NODE_IPS
MASTER_RPC_PORT = 7100
TSERVER_RPC_PORT = 9100
YSQL_PORT = 5433
YCQL_PORT = 9042
YEDIS_PORT = 6379
SSM_SECONDARY_VPC_ID = '/yugabytedb/multi-region/secondary-vpc-id'
SSM_SECONDARY_SECRET_ARN = '/yugabytedb/multi-region/credentials-secret-arn'


def ssm_secondary_rtbl(index: int) -> str:
    """Route table IDs of secondary's private subnets, one parameter per subnet."""
    return f'/yugabytedb/multi-region/secondary-rtbl-{index}'


PRIMARY_TAG_PREFIX = 'YugabyteDB-Primary'
SECONDARY_TAG_PREFIX = 'YugabyteDB-Secondary'


def is_primary(region: str) -> bool:
    return region == PRIMARY_REGION


def peer_region(region: str) -> str:
    return SECONDARY_REGION if is_primary(region) else PRIMARY_REGION


def peer_vpc_cidr(region: str) -> str:
    return SECONDARY_VPC_CIDR if is_primary(region) else PRIMARY_VPC_CIDR


def own_vpc_cidr(region: str) -> str:
    return PRIMARY_VPC_CIDR if is_primary(region) else SECONDARY_VPC_CIDR


def own_node_ips(region: str) -> list[str]:
    return PRIMARY_NODE_IPS if is_primary(region) else SECONDARY_NODE_IPS
