import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';

export default function StorageAndIndexingPage() {
  return (
    <ContentLayout header={<Header variant="h1">Storage and Indexing</Header>}>
      <Container header={<Header variant="h2">Overview</Header>}>
        <SpaceBetween size="s">
          <Box fontSize="heading-m">
            <p>
              Beneath the YSQL and YCQL query layers, every YugabyteDB node persists data
              through a distributed key-value store called <code>DocDB</code>, which is
              built on top of <code>RocksDB</code> using a Log-Structured Merge-tree
              (<code>LSM-tree</code>) structure. This design choice is what gives the
              database its scalability characteristics (especially for write-heavy
              workloads).
            </p>

            <h4><code>LSM-Tree</code> Storage Engine</h4>
            <p>
              Incoming writes are first stored in an in-memory structure called a
              <code>memtable</code>. When the <code>memtable</code> is full, the data is
              flushed to disk as immutable files called Sorted String Tables
              (<code>SSTs</code>).
            </p>
            <p>
              As more <code>SSTs</code> accumulate, a background process called compaction
              merges them, which improves read efficiency by reducing the number of files
              a query must consult and physically discards outdated versions of rows.
            </p>

            <h4>Sequential Writes</h4>
            <p>
              Because writes always land in the <code>memtable</code> first and only reach
              disk in batched <code>SST</code> flushes, the <code>LSM-tree</code> design
              enables sequential disk writes instead of random writes. This significantly
              improves performance in write-intensive workloads compared to traditional
              B-tree-based systems that perform in-place updates.
            </p>

            <h4>Primary and Secondary Indexes</h4>
            <p>
              YugabyteDB supports both primary and secondary indexes. The primary key
              determines how data is partitioned and distributed across tablets, so a
              point lookup by primary key is routed directly to the tablet leader holding
              the row.
            </p>
            <p>
              Secondary indexes allow efficient lookup of non-primary attributes. They are
              themselves distributed across nodes and stored in the same
              <code>LSM-tree</code> structure as the base data. During query execution,
              the cost-based planner chooses between sequential scans and index scans
              depending on the availability of indexes and the selectivity of the
              predicate.
            </p>
            <p>
              Composite indexes with included columns, for example
              <code>idx_transactions_from_account</code> on
              <code>(from_account_id, created_at desc) include (amount_cents)</code>,
              support covered queries where every column the query needs is already
              present in the index entry. The planner can then satisfy the request without
              ever consulting the base table.
            </p>
          </Box>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}
