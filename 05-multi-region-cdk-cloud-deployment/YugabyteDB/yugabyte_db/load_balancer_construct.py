from typing import List
from aws_cdk import (
    aws_ec2 as ec2,
    aws_elasticloadbalancingv2 as elbv2,
    aws_elasticloadbalancingv2_targets as targets,
)
from constructs import Construct

TSERVER_PORTS = {
    'YSQL': 5433,
    'YCQL': 9042,
    'YEDIS': 6379,
}


class LoadBalancerConstruct(Construct):
    def __init__(
            self,
            scope: Construct,
            construct_id: str,
            *,
            vpc: ec2.IVpc,
            nodes: List[ec2.CfnInstance],
            tserver_security_group: ec2.ISecurityGroup,
            role: str,
    ) -> None:
        super().__init__(scope, construct_id)
        suffix = 'Primary' if role == 'primary' else 'Secondary'
        self.nlb = elbv2.NetworkLoadBalancer(
            self,
            'YugabyteNLB',
            vpc=vpc,
            internet_facing=True,
            load_balancer_name=f'YugabyteDB-{suffix}',
        )
        nlb_sg = self.nlb.connections.security_groups[0]
        for name, port in TSERVER_PORTS.items():
            nlb_sg.add_ingress_rule(
                ec2.Peer.any_ipv4(),
                ec2.Port.tcp(port),
                f'{name} client access',
            )
            ec2.CfnSecurityGroupEgress(
                self,
                f'NLBEgress{name}',
                group_id=nlb_sg.security_group_id,
                ip_protocol='tcp',
                from_port=port,
                to_port=port,
                destination_security_group_id=tserver_security_group.security_group_id,
                description=f'{name} to targets',
            )
            ec2.CfnSecurityGroupIngress(
                self,
                f'TServerIngress{name}',
                group_id=tserver_security_group.security_group_id,
                ip_protocol='tcp',
                from_port=port,
                to_port=port,
                source_security_group_id=nlb_sg.security_group_id,
                description=f'{name} from NLB',
            )
            target_group = elbv2.NetworkTargetGroup(
                self,
                f'{name}TargetGroup',
                vpc=vpc,
                port=port,
                protocol=elbv2.Protocol.TCP,
                target_type=elbv2.TargetType.INSTANCE,
                health_check=elbv2.HealthCheck(
                    protocol=elbv2.Protocol.TCP,
                    port=str(port),
                ),
            )
            for node in nodes:
                target_group.node.add_dependency(node)
                target_group.add_target(
                    targets.InstanceIdTarget(instance_id=node.ref, port=port)
                )
            self.nlb.add_listener(
                f'{name}Listener',
                port=port,
                protocol=elbv2.Protocol.TCP,
                default_target_groups=[target_group],
            )
