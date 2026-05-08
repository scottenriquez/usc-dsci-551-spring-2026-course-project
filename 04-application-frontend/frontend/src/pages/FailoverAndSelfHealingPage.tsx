import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';

export default function FailoverAndSelfHealingPage() {
  return (
    <ContentLayout header={<Header variant="h1">Failover and Self-Healing</Header>}>
      <Container header={<Header variant="h2">Overview</Header>}>
        <SpaceBetween size="s">
          <Box fontSize="heading-m">
            <p>
              One of the key benefits of a distributed database is the ability to store
              multiple copies of the same data for fault tolerance. However, this raises
              the question of which copy serves as the source of truth when a node fails
              or replicas become out of sync. YugabyteDB answers that question by electing
              a leader for each tablet using the Raft consensus algorithm.
            </p>

            <h4>Raft Consensus and Tablet Leadership</h4>
            <p>
              Every tablet is replicated across multiple nodes, and Raft elects exactly
              one of those replicas as the tablet leader. The leader orchestrates all
              writes, streaming each Write-Ahead Log (<code>WAL</code>) entry to its
              followers and acknowledging the commit only once a majority of replicas
              have accepted the entry.
            </p>
            <p>
              If a node fails, only the tablets that had a Raft leader on that node need
              to be re-elected. Tablets where the failed node was a follower continue to
              serve traffic uninterrupted, because their leader is on a surviving node and
              the remaining replicas still form a majority. With a replication factor of
              three, the cluster can tolerate the loss of any single node, or any single
              Availability Zone, with zero data loss.
            </p>

            <h4>Distributed ACID Guarantees</h4>
            <p>
              YugabyteDB achieves distributed ACID guarantees through four mechanisms that
              work in conjunction. For transactions that span multiple tablets and nodes,
              the database first writes provisional records to <code>DocDB</code>. These
              records remain invisible to readers until the transaction is fully committed,
              which ensures atomicity and prevents partial writes from being observed.
            </p>
            <p>
              When all provisional writes are complete, a dedicated transaction status
              tablet is updated to mark the transaction as committed, which makes the
              provisional records visible across the cluster.
            </p>
            <p>
              Durability is supported by the same Raft-based <code>WAL</code> replication
              described above. Isolation is guaranteed by Multi-Version Concurrency Control
              (<code>MVCC</code>), which keeps multiple timestamped versions of each value
              rather than overwriting them. A read sees only the versions committed before
              the read started.
            </p>
            <p>
              To order events sequentially across the cluster without requiring perfectly
              synchronized physical clocks, YugabyteDB uses hybrid logical clocks
              (<code>HLC</code>). An <code>HLC</code> combines wall-clock time with a
              logical counter so that any two events in the cluster have a well-defined
              causal ordering.
            </p>

            <h4>Limitations</h4>
            <p>
              A key observation from the failover exercise is that YugabyteDB itself
              cannot provision new infrastructure. Once a node is lost, the cluster
              continues to operate at reduced capacity, but bringing capacity back online
              requires either a cloud-based mechanism such as auto-scaling or manual
              provisioning of a new EC2 instance. After the new instance is ready, the
              universe must also be updated so that the new node joins the cluster.
            </p>
          </Box>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
