import { useMemo } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const nodeBase = {
  borderRadius: 8,
  padding: '10px 16px',
  color: '#d1d5db',
  fontSize: 12,
  fontWeight: 600,
  textAlign: 'center' as const,
};

const azStyle = {
  ...nodeBase,
  border: '2px dashed #00bcd4',
  background: 'rgba(0, 188, 212, 0.05)',
  fontSize: 11,
  paddingTop: '8px',
};

const subnetPublicStyle = {
  ...nodeBase,
  width: 200,
  height: 70,
  border: '2px solid #8bc34a',
  background: '#192534',
};

const subnetPrivateStyle = {
  ...nodeBase,
  width: 200,
  height: 70,
  border: '2px solid #00bcd4',
  background: '#192534',
};

const serviceStyle = {
  ...nodeBase,
  width: 160,
  border: '2px solid #539fe5',
  background: '#0f1b2a',
};

const externalStyle = {
  ...nodeBase,
  width: 160,
  border: '2px solid #879596',
  background: '#192534',
};

function buildArchitecture(): { nodes: Node[]; edges: Edge[] } {
  const azWidth = 620;
  const azHeight = 140;
  const azGap = 60;

  const subnetW = 270;
  const subnetH = 90;
  const innerNodeW = 140;
  const innerNodeH = 40;

  const subnetGap = 30;
  const totalSubnetsW = 2 * subnetW + subnetGap;
  const pubX = (azWidth - totalSubnetsW) / 2;
  const privX = pubX + subnetW + subnetGap;
  const subnetY = (azHeight - subnetH) / 2 + 5;
  const innerY = 35;
  const innerCenterX = 65;

  const innerStyle = {
    ...nodeBase,
    width: innerNodeW,
    height: innerNodeH,
    border: '2px solid #ff9800',
    background: '#0f1b2a',
    fontSize: 11,
  };

  const vpcWidth = azWidth + 220;
  const vpcHeight = 3 * azHeight + 2 * azGap + 60;
  const awsWidth = vpcWidth + 260;
  const awsHeight = vpcHeight + 60;

  const nodes: Node[] = [
    // AWS Region
    {
      id: 'aws',
      position: { x: 0, y: 0 },
      data: { label: 'AWS' },
      style: {
        ...nodeBase,
        width: awsWidth,
        height: awsHeight,
        border: '2px solid #879596',
        background: 'rgba(135, 149, 150, 0.05)',
        fontSize: 12,
        paddingTop: '8px',
      },
    },
    // VPC
    {
      id: 'vpc',
      position: { x: 20, y: 40 },
      data: { label: 'Private Cloud Network' },
      style: {
        ...nodeBase,
        width: vpcWidth,
        height: vpcHeight,
        border: '2px solid #9b59b6',
        background: 'rgba(155, 89, 182, 0.05)',
        fontSize: 11,
        paddingTop: '8px',
      },
      parentId: 'aws',
      extent: 'parent' as const,
    },
    // AZ A
    {
      id: 'az-a',
      position: { x: 200, y: 40 },
      data: { label: 'Availability Zone A' },
      style: { ...azStyle, width: azWidth, height: azHeight },
      parentId: 'vpc',
      extent: 'parent' as const,
    },
    {
      id: 'pub-1',
      position: { x: pubX, y: subnetY },
      data: { label: 'Public Subnet 1' },
      style: { ...subnetPublicStyle, width: subnetW, height: subnetH, paddingTop: '4px' },
      parentId: 'az-a',
      extent: 'parent' as const,
    },
    {
      id: 'nlb-eni-1',
      position: { x: innerCenterX, y: innerY },
      data: { label: 'Network Interface' },
      style: innerStyle,
      parentId: 'pub-1',
      extent: 'parent' as const,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    },
    {
      id: 'priv-1',
      position: { x: privX, y: subnetY },
      data: { label: 'Private Subnet 1' },
      style: { ...subnetPrivateStyle, width: subnetW, height: subnetH, paddingTop: '4px' },
      parentId: 'az-a',
      extent: 'parent' as const,
    },
    {
      id: 'ec2-1',
      position: { x: innerCenterX, y: innerY },
      data: { label: 'Node 1' },
      style: innerStyle,
      parentId: 'priv-1',
      extent: 'parent' as const,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    },
    // AZ B
    {
      id: 'az-b',
      position: { x: 200, y: 40 + azHeight + azGap },
      data: { label: 'Availability Zone B' },
      style: { ...azStyle, width: azWidth, height: azHeight },
      parentId: 'vpc',
      extent: 'parent' as const,
    },
    {
      id: 'pub-2',
      position: { x: pubX, y: subnetY },
      data: { label: 'Public Subnet 2' },
      style: { ...subnetPublicStyle, width: subnetW, height: subnetH, paddingTop: '4px' },
      parentId: 'az-b',
      extent: 'parent' as const,
    },
    {
      id: 'nlb-eni-2',
      position: { x: innerCenterX, y: innerY },
      data: { label: 'Network Interface' },
      style: innerStyle,
      parentId: 'pub-2',
      extent: 'parent' as const,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    },
    {
      id: 'priv-2',
      position: { x: privX, y: subnetY },
      data: { label: 'Private Subnet 2' },
      style: { ...subnetPrivateStyle, width: subnetW, height: subnetH, paddingTop: '4px' },
      parentId: 'az-b',
      extent: 'parent' as const,
    },
    {
      id: 'ec2-2',
      position: { x: innerCenterX, y: innerY },
      data: { label: 'Node 2' },
      style: innerStyle,
      parentId: 'priv-2',
      extent: 'parent' as const,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    },
    // AZ C
    {
      id: 'az-c',
      position: { x: 200, y: 40 + 2 * (azHeight + azGap) },
      data: { label: 'Availability Zone C' },
      style: { ...azStyle, width: azWidth, height: azHeight },
      parentId: 'vpc',
      extent: 'parent' as const,
    },
    {
      id: 'pub-3',
      position: { x: pubX, y: subnetY },
      data: { label: 'Public Subnet 3' },
      style: { ...subnetPublicStyle, width: subnetW, height: subnetH, paddingTop: '4px' },
      parentId: 'az-c',
      extent: 'parent' as const,
    },
    {
      id: 'nlb-eni-3',
      position: { x: innerCenterX, y: innerY },
      data: { label: 'Network Interface' },
      style: innerStyle,
      parentId: 'pub-3',
      extent: 'parent' as const,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    },
    {
      id: 'priv-3',
      position: { x: privX, y: subnetY },
      data: { label: 'Private Subnet 3' },
      style: { ...subnetPrivateStyle, width: subnetW, height: subnetH, paddingTop: '4px' },
      parentId: 'az-c',
      extent: 'parent' as const,
    },
    {
      id: 'ec2-3',
      position: { x: innerCenterX, y: innerY },
      data: { label: 'Node 3' },
      style: innerStyle,
      parentId: 'priv-3',
      extent: 'parent' as const,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    },
    // External services
    {
      id: 'nlb',
      position: { x: 20, y: 40 + azHeight + azGap + subnetY + innerY + innerNodeH / 2 - 20 },
      data: { label: 'Load Balancer' },
      style: { ...serviceStyle, width: 130, height: innerNodeH },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      parentId: 'vpc',
      extent: 'parent' as const,
    },
    {
      id: 'cloudwatch',
      position: { x: vpcWidth + 50, y: 40 + 40 + azHeight + azGap + subnetY + innerY + innerNodeH / 2 - 20 },
      data: { label: 'CloudWatch Logs' },
      style: { ...externalStyle, width: 160, height: innerNodeH },
      parentId: 'aws',
      extent: 'parent' as const,
      targetPosition: Position.Left,
    },
    // Client (outside the AWS region, aligned vertically with the Load Balancer)
    {
      id: 'client',
      position: { x: -200, y: 40 + 40 + azHeight + azGap + subnetY + innerY + innerNodeH / 2 - 20 },
      data: { label: 'Client' },
      style: { ...externalStyle, width: 130, height: innerNodeH },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    },
  ];

  const edgeBase = {
    style: { stroke: '#539fe5', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#539fe5', width: 15, height: 15 },
  };

  const edges: Edge[] = [
    // Client to Load Balancer
    { id: 'e-client-nlb', source: 'client', target: 'nlb', ...edgeBase },
    // NLB to Network Interfaces
    { id: 'e-nlb-eni1', source: 'nlb', target: 'nlb-eni-1', ...edgeBase },
    { id: 'e-nlb-eni2', source: 'nlb', target: 'nlb-eni-2', ...edgeBase },
    { id: 'e-nlb-eni3', source: 'nlb', target: 'nlb-eni-3', ...edgeBase },
    // Network Interfaces to Nodes
    {
      id: 'e-eni1-ec2-1', source: 'nlb-eni-1', target: 'ec2-1',
      ...edgeBase, style: { stroke: '#879596', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#879596', width: 15, height: 15 },
    },
    {
      id: 'e-eni2-ec2-2', source: 'nlb-eni-2', target: 'ec2-2',
      ...edgeBase, style: { stroke: '#879596', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#879596', width: 15, height: 15 },
    },
    {
      id: 'e-eni3-ec2-3', source: 'nlb-eni-3', target: 'ec2-3',
      ...edgeBase, style: { stroke: '#879596', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#879596', width: 15, height: 15 },
    },
    // Nodes to CloudWatch
    {
      id: 'e-n1-cw', source: 'ec2-1', target: 'cloudwatch',
      ...edgeBase, style: { stroke: '#879596', strokeWidth: 1, strokeDasharray: '4' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#879596', width: 15, height: 15 },
    },
    {
      id: 'e-n2-cw', source: 'ec2-2', target: 'cloudwatch',
      ...edgeBase, style: { stroke: '#879596', strokeWidth: 1, strokeDasharray: '4' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#879596', width: 15, height: 15 },
    },
    {
      id: 'e-n3-cw', source: 'ec2-3', target: 'cloudwatch',
      ...edgeBase, style: { stroke: '#879596', strokeWidth: 1, strokeDasharray: '4' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#879596', width: 15, height: 15 },
    },
  ];

  return { nodes, edges };
}

export default function MultiNodeDeploymentPage() {
  const { nodes, edges } = useMemo(() => buildArchitecture(), []);

  return (
    <ContentLayout header={<Header variant="h1">Multi-Node Cloud Deployment</Header>}>
      <SpaceBetween size="l">
        <Container header={<Header variant="h2">Overview</Header>}>
          <SpaceBetween size="s">
            <Box fontSize="heading-m">
              <p>
                YugabyteDB is a distributed database, so the team deployed it as a multi-node cluster
                to exercise the features that only emerge at scale, such as sharding, replication, and
                Raft consensus. The cluster runs as three EC2 instances spread across three AWS
                Availability Zones in a single region, provisioned and configured entirely through
                AWS Cloud Development Kit (CDK).
              </p>
              <h4><code>YB-TServer</code></h4>
              <p>
                Every node in the cluster runs the <code>YB-TServer</code> service.
                <code>YB-TServer</code> is responsible for responding to all read and write I/O
                requests from clients connecting through either YSQL or YCQL.
              </p>
              <p>
                Each <code>YB-TServer</code> hosts one or more tablet peers, which are replicated
                shards of the data. By distributing tablet peers across nodes, the cluster spreads
                both the data and the request load horizontally.
              </p>
              <h4><code>YB-Master</code></h4>
              <p>
                Multiple nodes, but not necessarily all of them, also run the <code>YB-Master</code>
                service. The <code>YB-Master</code> processes form a highly available Raft group that
                handles leader election and overall cluster coordination.
              </p>
              <p>
                The leader handles administrative operations such as enforcing the replication
                factor, re-balancing tablets across nodes, and creating, altering, and dropping
                tables. To keep stress and overhead low on the master processes, <code>YB-Master</code>
                intentionally does not participate in user-table I/O.
              </p>
              <p>
                Each <code>YB-TServer</code> sends periodic heartbeats so the <code>YB-Master</code>
                leader can detect failures, heal the cluster, and reassign tablet leaders when a
                node disappears.
              </p>
              <h4>Three-Node Cluster Across Availability Zones</h4>
              <p>
                The cluster is deployed as three EC2 instances, one per Availability Zone. This
                layout gives the cluster fault tolerance against the loss of any single Availability
                Zone while keeping inter-node latency low enough for synchronous Raft replication.
              </p>
              <h4>Infrastructure-as-Code with CDK</h4>
              <p>
                Rather than configuring the cluster by hand, the entire deployment is described in
                a Python AWS CDK application. A single <code>cdk deploy</code> command creates and
                configures every dependency.
              </p>
              <ul>
                <li>A private VPC with public and private subnets across three Availability Zones</li>
                <li>The three EC2 instances that host the cluster nodes</li>
                <li>Installation of YugabyteDB and its dependencies on each instance</li>
                <li>Startup of the <code>YB-TServer</code> and <code>YB-Master</code> services</li>
                <li>An AWS Network Load Balancer in the public subnets that exposes a limited set of ports for external access</li>
                <li>An AWS Secrets Manager secret that stores the admin credentials securely</li>
                <li>CloudWatch log groups so each node's logs are centrally accessible</li>
              </ul>
              <h4>Schema Initialization</h4>
              <p>
                Schema initialization runs automatically once the cluster is fully formed. The final
                node uses the CloudFormation <code>cfn-init</code> helper to apply the schema after
                the universe is online, which guarantees that initialization runs exactly once and
                only after the leader has been elected.
              </p>
            </Box>
          </SpaceBetween>
        </Container>
        <Container header={<Header variant="h2">Cloud Architecture</Header>}>
          <div style={{ height: 800, background: '#0f1b2a', borderRadius: 8 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1a2b3c" gap={16} />
            </ReactFlow>
          </div>
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}
