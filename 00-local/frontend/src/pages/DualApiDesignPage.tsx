import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';

export default function DualApiDesignPage() {
    return (
        <ContentLayout header={<Header variant="h1">Dual-API Design</Header>}>
            <Container header={<Header variant="h2">Overview</Header>}>
                <SpaceBetween size="s">
                    <Box fontSize="heading-m">
                        <p>YugabyteDB supports two API modes on top of the same storage layer.</p>
                        <h4>YSQL (SQL API)</h4>
                        <p>
                            The first is YSQL, which is PostgreSQL-compatible SQL.
                            It is designed for relational data, complex queries, and use cases that require strong
                            transactions.
                        </p>
                        <p>
                            Compared to traditional PostgreSQL, YugabyteDB extends transaction support from a single
                            node to a distributed environment across multiple nodes.
                            It supports ACID transactions allowing
                            the system to scale while maintaining strong consistency.
                        </p>
                        <h4>YCQL (NoSQL API)</h4>
                        <p>
                            The second interface is YCQL, which is Cassandra-compatible NoSQL.
                            It is designed for high-throughput workloads, flexible schemas, and simple key-based
                            queries.
                        </p>
                        <p>
                            Compared to Cassandra, YCQL provides strong consistency by default, using a
                            Raft-based architecture.
                            In contrast, Cassandra uses eventual consistency, which means users may sometimes read stale
                            data.
                        </p>
                        <p>
                            Also, Cassandra relies heavily on partition keys for querying, which limits query
                            flexibility.
                            YCQL improves on this by providing better consistency and more predictable behavior.
                        </p>
                        <h4>Shared Storage Engine</h4>
                        <p>
                            As mentioned above the key idea is to have both APIs share the same storage engine.
                        </p>
                        <ul>
                            <li>Data written through either API is stored in the same distributed storage layer (but with different schemas)
                            </li>
                            <li>Features like replication, fault tolerance, sharding, and scaling are shared</li>
                        </ul>
                        <h4>Flexibility</h4>
                        <p>
                            This design gives developers flexibility.
                        </p>
                        <p>
                            You can choose the query model that best fits your use case, without sacrificing distributed
                            database capabilities.
                        </p>
                        <p>For example:</p>
                        <ul>
                            <li>Use YSQL for financial systems that require strong consistency and
                                transactions
                            </li>
                            <li>Use YCQL for high-scale workloads like IoT or logging systems</li>
                        </ul>
                    </Box>
                </SpaceBetween>
            </Container>
        </ContentLayout>
    );
}
