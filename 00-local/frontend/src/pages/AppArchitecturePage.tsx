import { useMemo } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import {
  ReactFlow,
  Background,
  type Node,
  type BuiltInEdge,
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

const serviceStyle = {
  ...nodeBase,
  width: 160,
  height: 40,
  border: '2px solid #539fe5',
  background: '#0f1b2a',
};

const externalStyle = {
  ...nodeBase,
  width: 160,
  height: 40,
  border: '2px solid #879596',
  background: '#192534',
};

const subnetStyle = {
  ...nodeBase,
  border: '2px solid #8bc34a',
  background: 'rgba(139, 195, 52, 0.05)',
  fontSize: 11,
  paddingTop: '8px',
};

function buildArchitecture(): { nodes: Node[]; edges: BuiltInEdge[] } {
  const innerW = 140;
  const innerH = 40;
  const subnetW = 200;
  const subnetH = 90;
  const subnetGap = 40;
  const vpcPad = 20;
  const vpcW = 2 * subnetW + subnetGap + 2 * vpcPad;
  const subnetY = 35;
  const vpcH = subnetY + subnetH + vpcPad;

  const awsPad = 40;
  const serviceRowY = 50;
  const vpcY = 130;
  const awsW = vpcW + 2 * awsPad;
  const awsH = vpcY + vpcH + awsPad;

  const vpcX = awsPad;
  const subnetLeftX = vpcPad;
  const subnetRightX = vpcPad + subnetW + subnetGap;
  const innerX = (subnetW - innerW) / 2;
  const innerY = (subnetH - innerH) / 2 + 5;

  const apigwX = vpcX + subnetLeftX + (subnetW - 160) / 2;
  const cdnX = vpcX + subnetRightX + (subnetW - 160) / 2;
  const clientX = (awsW - 160) / 2;

  const nodes: Node[] = [
    {
      id: 'client',
      position: { x: clientX, y: 0 },
      data: { label: 'Client' },
      style: { ...externalStyle, height: 50 },
      sourcePosition: Position.Bottom,
    },
    {
      id: 'aws',
      position: { x: 0, y: 80 },
      data: { label: 'AWS' },
      style: {
        ...nodeBase,
        width: awsW,
        height: awsH,
        border: '2px solid #879596',
        background: 'rgba(135, 149, 150, 0.05)',
        fontSize: 12,
        paddingTop: '8px',
      },
    },
    {
      id: 'apigw',
      position: { x: apigwX, y: serviceRowY },
      data: { label: 'API Gateway' },
      style: serviceStyle,
      targetPosition: Position.Top,
      sourcePosition: Position.Left,
      parentId: 'aws',
      extent: 'parent' as const,
    },
    {
      id: 'cloudfront',
      position: { x: cdnX, y: serviceRowY },
      data: { label: 'CDN' },
      style: serviceStyle,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      parentId: 'aws',
      extent: 'parent' as const,
    },
    {
      id: 'vpc',
      position: { x: vpcX, y: vpcY },
      data: { label: 'Private Cloud Network' },
      style: {
        ...nodeBase,
        width: vpcW,
        height: vpcH,
        border: '2px solid #9b59b6',
        background: 'rgba(155, 89, 182, 0.05)',
        fontSize: 11,
        paddingTop: '8px',
      },
      parentId: 'aws',
      extent: 'parent' as const,
    },
    {
      id: 'priv-subnet',
      position: { x: subnetLeftX, y: subnetY },
      data: { label: 'Private Subnet' },
      style: {
        ...subnetStyle,
        width: subnetW,
        height: subnetH,
        border: '2px solid #00bcd4',
        background: 'rgba(0, 188, 212, 0.05)',
      },
      parentId: 'vpc',
      extent: 'parent' as const,
    },
    {
      id: 'lambda',
      position: { x: innerX, y: innerY },
      data: { label: 'Lambda' },
      style: { ...serviceStyle, width: innerW },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      parentId: 'priv-subnet',
      extent: 'parent' as const,
    },
    {
      id: 'yugabyte',
      position: { x: subnetRightX, y: subnetY },
      data: { label: 'YugabyteDB Cluster' },
      style: {
        ...nodeBase,
        width: subnetW,
        height: subnetH,
        border: '2px solid #e67e22',
        background: 'rgba(230, 126, 34, 0.1)',
      },
      targetPosition: Position.Left,
      parentId: 'vpc',
      extent: 'parent' as const,
    },
  ];

  const edgeBase = {
    style: { stroke: '#539fe5', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#539fe5', width: 15, height: 15 },
  };
  const labelStyle = { fill: '#879596', fontSize: 11 };
  const labelBgStyle = { fill: '#0f1b2a' };

  const edges: BuiltInEdge[] = [
    {
      id: 'e-client-cloudfront',
      source: 'client',
      target: 'cloudfront',
      label: 'HTTP',
      labelStyle, labelBgStyle,
      ...edgeBase,
    },
    {
      id: 'e-client-apigw',
      source: 'client',
      target: 'apigw',
      label: 'HTTP',
      labelStyle, labelBgStyle,
      ...edgeBase,
    },
    {
      id: 'e-apigw-lambda',
      source: 'apigw',
      target: 'lambda',
      type: 'smoothstep',
      pathOptions: { offset: 60 },
      label: 'HTTP',
      labelStyle, labelBgStyle,
      ...edgeBase,
    },
    {
      id: 'e-lambda-yugabyte',
      source: 'lambda',
      target: 'yugabyte',
      label: 'YSQL',
      labelStyle, labelBgStyle,
      style: { stroke: '#e67e22', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#e67e22', width: 15, height: 15 },
    },
  ];

  return { nodes, edges };
}

export default function AppArchitecturePage() {
  const { nodes, edges } = useMemo(() => buildArchitecture(), []);

  return (
    <ContentLayout header={<Header variant="h1">Application</Header>}>
      <Container header={<Header variant="h2">Cloud Architecture</Header>}>
        <div style={{ height: 700, background: '#0f1b2a', borderRadius: 8 }}>
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
    </ContentLayout>
  );
}
