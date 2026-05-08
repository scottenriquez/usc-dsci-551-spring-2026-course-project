import {useState, useCallback, useMemo} from 'react';
import Modal from '@cloudscape-design/components/modal';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Spinner from '@cloudscape-design/components/spinner';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tabs from '@cloudscape-design/components/tabs';
import {CodeView} from '@cloudscape-design/code-view';
import {createHighlight} from '@cloudscape-design/code-view/highlight';
import {PgsqlHighlightRules} from 'ace-code/src/mode/pgsql_highlight_rules';
import {
    ReactFlow,
    Background,
    Controls,
    type Node,
    type Edge,
    Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {previewSql, type SqlPreviewStep} from '../api/client';
import {
    parseExplain,
    isWriteOp,
    isSeqScan,
    isAggregateOp,
    isWriteSql,
    classifySql,
    type ExplainNode,
    type ExplainPlan,
} from '../api/explain';

const highlightPgsql = createHighlight(new PgsqlHighlightRules());

type LayerKind = 'intent' | 'entry' | 'step' | 'query' | 'plan' | 'storage' | 'raft' | 'meta' | 'exit';

interface FlowSpec {
    layer: LayerKind;
    title: string;
    subtitle?: string;
    detail?: string[];
}

const LAYER_STYLES: Record<LayerKind, { border: string; background: string; tag: string; tagColor: string }> = {
    intent: {border: '#e2a04a', background: '#241a0d', tag: 'APP', tagColor: '#e2a04a'},
    entry: {border: '#7d8998', background: '#192534', tag: 'AWS', tagColor: '#7d8998'},
    step: {border: '#414d5c', background: '#0f1b2a', tag: 'DBMS', tagColor: '#9ba7b6'},
    query: {border: '#539fe5', background: '#0e1d2e', tag: 'YSQL', tagColor: '#539fe5'},
    plan: {border: '#37bbb0', background: '#0c2024', tag: 'PLAN', tagColor: '#37bbb0'},
    storage: {border: '#a35cce', background: '#1c1428', tag: 'DOCDB', tagColor: '#a35cce'},
    raft: {border: '#5fbe7d', background: '#0e2218', tag: 'RAFT', tagColor: '#5fbe7d'},
    meta: {border: '#414d5c', background: '#101820', tag: 'TIMING', tagColor: '#9ba7b6'},
    exit: {border: '#7d8998', background: '#192534', tag: 'AWS', tagColor: '#7d8998'},
};

function planNodeTitle(n: ExplainNode): string {
    const parts = [n.op];
    if (n.index) parts.push(`using \`${n.index}\``);
    if (n.relation) parts.push(`on \`${n.relation}\``);
    return parts.join(' ');
}

function planNodeDetail(n: ExplainNode): string[] {
    const out: string[] = [];
    if (n.cost) {
        out.push(`cost=${n.cost.startup}..${n.cost.total} · rows=${n.cost.rows} · width=${n.cost.width}`);
    }
    if (n.actual) {
        out.push(`actual ${n.actual.startupMs}..${n.actual.totalMs} ms · rows=${n.actual.rows} · loops=${n.actual.loops}`);
    }
    for (const c of n.conditions) out.push(c);
    return out;
}

const WRITE_STORAGE_DETAIL = [
    'The write is first appended to the `WAL` on the tablet leader to guarantee durability before acknowledgement.',
    'It is then inserted into the in-memory `memtable` as a new `HLC`-stamped `MVCC` version, leaving earlier versions intact.',
    'A background process eventually flushes the `memtable` to immutable `SST` files on disk.',
    'Compaction later merges those `SST` files, discards obsolete versions, and reclaims space held by tombstones.',
];

const RAFT_DETAIL = [
    'The tablet leader streams the log entry to its follower replicas.',
    'The commit is acknowledged to the caller once a majority of replicas have acknowledged the entry.',
    'Provisional records become visible cluster-wide as soon as the transaction commits.',
];

function storageSpecForPlan(plan: ExplainPlan, sql?: string): FlowSpec | null {
    const root = plan.nodes[0];
    if (!root) {
        if (sql && isWriteSql(sql)) {
            return {
                layer: 'storage',
                title: 'DocDB Storage Engine',
                subtitle: '`LSM-tree` write path',
                detail: WRITE_STORAGE_DETAIL,
            };
        }
        return null;
    }
    if (isWriteOp(root.op)) {
        return {
            layer: 'storage',
            title: 'DocDB Storage Engine',
            subtitle: '`LSM-tree` write path',
            detail: WRITE_STORAGE_DETAIL,
        };
    }
    if (isAggregateOp(root.op) || plan.nodes.some(n => isAggregateOp(n.op))) {
        return {
            layer: 'storage',
            title: 'DocDB Storage Engine',
            subtitle: '`LSM-tree` read · aggregate over scanned rows',
            detail: [
                'The request is routed to the owning tablet via a primary key hash, and the `YB-TServer` on that node performs the read.',
                'The `memtable` and one or more `SST` files are consulted at each `LSM` level to locate the matching rows.',
                'An `MVCC` filter ensures that only the latest committed version of each row is returned.',
                'The aggregate is then computed in the `YSQL` layer after the rows are returned from storage.',
            ],
        };
    }
    if (isSeqScan(root.op)) {
        return {
            layer: 'storage',
            title: 'DocDB Storage Engine',
            subtitle: 'Full-table `LSM-tree` read fanned out across every tablet',
            detail: [
                'Each tablet first checks its in-memory `memtable` for the freshest writes, then walks its on-disk `SST` files at each `LSM` level to gather older rows.',
                'Every `YB-TServer` streams its matching rows back, and the `YSQL` layer merges and sorts the combined result set.',
                'An `MVCC` filter ensures that only the latest committed version of each row is returned.',
            ],
        };
    }
    const usingIndex = root.index;
    return {
        layer: 'storage',
        title: 'DocDB Storage Engine',
        subtitle: usingIndex ? `Indexed \`LSM-tree\` read routed via \`${usingIndex}\`` : 'Indexed `LSM-tree` read routed to a single tablet',
        detail: [
            'The index key determines which tablet holds the row, so the request is routed directly to that tablet leader.',
            'The lookup first checks the in-memory `memtable` for the freshest version of the row, then walks the on-disk `SST` files at each `LSM` level until the row is found.',
            'An `MVCC` filter ensures that only the latest committed version of each row is returned.',
        ],
    };
}

function raftSpecForPlan(plan: ExplainPlan, sql?: string): FlowSpec | null {
    const root = plan.nodes[0];
    const isWrite = root ? isWriteOp(root.op) : (sql ? isWriteSql(sql) : false);
    if (!isWrite) return null;
    return {
        layer: 'raft',
        title: 'Raft Consensus',
        subtitle: '`WAL` entry replicated from leader to follower replicas',
        detail: RAFT_DETAIL,
    };
}

function normalizeSentences(text: string): string[] {
    if (!text || !text.trim()) return [];
    return text
        .split(/(?<=\.)\s+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => /[.!?]$/.test(s) ? s : `${s}.`);
}

interface UserIntent {
    title: string;
    subtitle: string;
    detail?: string[];
}

const INTENTS: Record<string, UserIntent> = {
    'GET /users': {title: 'List All Users', subtitle: 'Return every user in the directory'},
    'GET /users/{id}': {title: 'Fetch a Specific User', subtitle: 'Look up a single user by primary key'},
    'POST /users': {title: 'Create a New User', subtitle: 'Add a new user record to the directory'},
    'PUT /users/{id}': {title: 'Update a User Profile', subtitle: 'Modify fields on an existing user'},
    'DELETE /users/{id}': {title: 'Delete a User', subtitle: 'Remove a user from the directory'},
    'GET /accounts': {title: 'List All Accounts', subtitle: 'Return every financial account with computed balances'},
    'GET /accounts/{id}': {title: 'Fetch a Specific Account', subtitle: 'Look up a single account by primary key'},
    'GET /accounts/{id}/balance': {
        title: 'Get the Current Balance for an Account',
        subtitle: 'Computed by summing inbound and outbound transactions'
    },
    'POST /accounts': {title: 'Open a New Account', subtitle: 'Create a financial account belonging to a user'},
    'PUT /accounts/{id}': {title: 'Update an Account', subtitle: 'Modify fields on an existing account'},
    'DELETE /accounts/{id}': {title: 'Close an Account', subtitle: 'Remove a financial account'},
    'GET /transactions': {title: 'List All Transactions', subtitle: 'Return every recorded money movement'},
    'GET /transactions/{id}': {
        title: 'Fetch a Specific Transaction',
        subtitle: 'Look up a single transaction by primary key'
    },
    'POST /transactions': {
        title: 'Record a Money Movement',
        subtitle: 'Transfer funds between accounts (or deposit / withdraw)'
    },
    'DELETE /transactions/{id}': {title: 'Delete a Transaction', subtitle: 'Remove a recorded money movement'},
};

function deriveUserIntent(path: string, method?: string): UserIntent {
    const m = (method ?? 'GET').toUpperCase();
    const normPath = path.split('?')[0].replace(/\/[0-9a-f-]{36}/gi, '/{id}');
    return INTENTS[`${m} ${normPath}`] ?? {
        title: `${m} ${normPath}`,
        subtitle: 'API operation',
    };
}

function buildFlow(steps: SqlPreviewStep[], path: string, method?: string): FlowSpec[] {
    const out: FlowSpec[] = [];

    const intent = deriveUserIntent(path, method);
    out.push({
        layer: 'intent',
        title: `Application Operation: ${intent.title}`,
        subtitle: intent.subtitle,
        detail: [`The user-facing endpoint is \`${(method ?? 'GET').toUpperCase()} ${path}\`.`],
    });

    out.push({
        layer: 'entry',
        title: 'Amazon API Gateway',
        subtitle: 'Public HTTPS endpoint in front of the application',
        detail: [
            'Accepts the incoming HTTPS request from the client.',
            'Routes the request to the backing serverless function.',
        ],
    });

    out.push({
        layer: 'entry',
        title: 'AWS Lambda (CRUD Handler)',
        subtitle: 'Serverless function that owns the request',
        detail: [
            'Loads admin credentials from AWS Secrets Manager.',
            'Opens a `YSQL` (Postgres-compatible) connection inside the VPC using `psycopg2`.',
        ],
    });

    out.push({
        layer: 'entry',
        title: 'Network Load Balancer (NLB)',
        subtitle: 'OSI Model Layer 4 load balancer in front of the YugabyteDB cluster',
        detail: ['Forwards the TCP connection to a healthy EC2 instance across the three Availability Zones.'],
    });

    out.push({
        layer: 'entry',
        title: 'EC2 Node (`YB-TServer` + `YB-Master`)',
        subtitle: 'One of three nodes hosting the distributed YugabyteDB cluster',
        detail: [
            'Each node runs both the `YB-TServer` (tablet I/O) and `YB-Master` (cluster coordination, leader election, rebalancing) services.',
            'The receiving `YB-TServer` accepts the `YSQL` connection and routes the request to the tablet leader holding the relevant rows.',
        ],
    });

    const sqlStepCount = steps.filter(s => s.sql).length;
    let sqlStepIndex = 0;

    steps.forEach((step) => {
        const isRaftStep = /raft/i.test(step.label);

        if (!step.sql) {
            out.push({
                layer: isRaftStep ? 'raft' : 'step',
                title: step.label,
                subtitle: isRaftStep ? 'Write replicated across the cluster via Raft consensus' : 'Backend operation · application-side',
                detail: normalizeSentences(step.description),
            });
            return;
        }

        if (!step.explain) return;

        sqlStepIndex += 1;
        out.push({
            layer: 'intent',
            title: sqlStepCount > 1
                ? `Application Step ${sqlStepIndex} of ${sqlStepCount}: ${step.label}`
                : `Application Step: ${step.label}`,
            subtitle: 'Application-defined behavior translated to a SQL statement',
            detail: normalizeSentences(step.description),
        });

        const plan = parseExplain(step.explain);
        const explainFailed = plan.nodes.length === 0;

        out.push({
            layer: 'query',
            title: 'YSQL Query Layer',
            subtitle: 'Parses the SQL, produces a logical plan, and chooses a physical plan via the cost-based optimizer',
            detail: plan.planningTimeMs !== undefined
                ? [`Planning Time: ${plan.planningTimeMs} ms`]
                : ['Postgres-compatible parser and cost-based planner.'],
        });

        if (explainFailed) {
            const kind = classifySql(step.sql);
            const opLabel = kind === 'other' ? 'Statement' : kind.charAt(0).toUpperCase() + kind.slice(1);
            out.push({
                layer: 'plan',
                title: `${opLabel} (plan unavailable)`,
                subtitle: '`EXPLAIN ANALYZE` could not produce a plan tree',
                detail: [
                    'The planner attempted to run the statement to collect runtime measurements, but execution failed before a plan tree could be produced (for example, a foreign key check on a referenced row).',
                    'Cost estimates and per-node timings are not available, but the downstream storage and replication path is still illustrated below for reference.',
                ],
            });
        } else {
            plan.nodes.forEach(node => {
                out.push({
                    layer: 'plan',
                    title: planNodeTitle(node),
                    subtitle: '`EXPLAIN` plan node',
                    detail: planNodeDetail(node),
                });
            });
        }

        const storage = storageSpecForPlan(plan, step.sql);
        if (storage) out.push(storage);

        const raft = raftSpecForPlan(plan, step.sql);
        if (raft) out.push(raft);

        if (plan.executionTimeMs !== undefined) {
            out.push({
                layer: 'meta',
                title: 'Execution Time',
                subtitle: `${plan.executionTimeMs} ms (server-side)`,
            });
        }
    });

    out.push({
        layer: 'exit',
        title: 'Response Returned',
        subtitle: 'Result delivered back to the client over HTTPS',
        detail: [
            'The transaction is committed in the database.',
            'The result set is serialized to JSON.',
            'The response is returned through the API Gateway to the calling client.',
        ],
    });

    return out;
}

const WRAP_STYLE = {
    whiteSpace: 'normal' as const,
    wordBreak: 'break-word' as const,
    overflowWrap: 'anywhere' as const,
};

const INLINE_CODE_STYLE: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.9em',
    background: 'rgba(148, 163, 184, 0.16)',
    padding: '0 4px',
    borderRadius: 3,
    color: '#e6edf3',
};

function isMonospaceLine(line: string): boolean {
    return /(cost=|actual time=|Cond:|Filter:|Sort Key:|Hash Cond:|\d\s*ms\b)/.test(line);
}

// Renders a string that may contain <code>...</code> HTML (from backend descriptions)
// and/or `...` backticks (from frontend-constructed strings) as inline code spans.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
    const normalized = text.replace(/<code>([^<]+)<\/code>/g, '`$1`');
    const parts = normalized.split(/(`[^`]+`)/);
    return parts.map((part, i) => {
        if (part.length >= 2 && part.startsWith('`') && part.endsWith('`')) {
            return (
                <code key={`${keyPrefix}-${i}`} style={INLINE_CODE_STYLE}>
                    {part.slice(1, -1)}
                </code>
            );
        }
        return <span key={`${keyPrefix}-${i}`}>{part}</span>;
    });
}

function renderNodeLabel(spec: FlowSpec) {
    const style = LAYER_STYLES[spec.layer];
    return (
        <div style={{textAlign: 'left', padding: '2px 4px', color: '#e6edf3', fontFamily: 'inherit'}}>
            <div style={{display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4}}>
        <span style={{
            flexShrink: 0,
            fontSize: 9,
            letterSpacing: 0.6,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 3,
            background: style.tagColor,
            color: '#0a0e14',
            marginTop: 1,
        }}>{style.tag}</span>
                <span style={{fontSize: 12, fontWeight: 700, lineHeight: 1.35, ...WRAP_STYLE}}>
          {renderInline(spec.title, 'title')}
        </span>
            </div>
            {spec.subtitle && (
                <div style={{
                    fontSize: 11,
                    color: '#a3aab4',
                    lineHeight: 1.4,
                    marginBottom: spec.detail?.length ? 4 : 0, ...WRAP_STYLE
                }}>
                    {renderInline(spec.subtitle, 'sub')}
                </div>
            )}
            {spec.detail && spec.detail.length > 0 && (
                <div style={{fontSize: 10.5, color: '#cbd5e1', lineHeight: 1.45}}>
                    {spec.detail.map((line, i) => (
                        <div key={i}
                             style={{fontFamily: isMonospaceLine(line) ? 'monospace' : 'inherit', ...WRAP_STYLE}}>
                            {isMonospaceLine(line) ? line : renderInline(line, `d-${i}`)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const NODE_WIDTH = 460;
const NODE_HORIZONTAL_PADDING = 32; // 14*2 padding + 2*2 border + small slack
const TAG_RESERVED = 44;            // pill width incl. gap, only affects title's first line
const TITLE_CHAR_WIDTH = 6.6;       // 12px bold
const SUBTITLE_CHAR_WIDTH = 5.7;    // 11px regular
const DETAIL_CHAR_WIDTH_PROP = 5.6; // 10.5px proportional
const DETAIL_CHAR_WIDTH_MONO = 6.4; // 10.5px monospace
const TITLE_LINE_HEIGHT = 17;       // 12 * 1.35
const SUBTITLE_LINE_HEIGHT = 16;    // 11 * 1.4
const DETAIL_LINE_HEIGHT = 16;      // 10.5 * 1.45

function wrappedLines(text: string, charsPerLine: number): number {
    if (!text) return 1;
    return text.split('\n').reduce((sum, segment) => sum + Math.max(1, Math.ceil(segment.length / charsPerLine)), 0);
}

// Strip inline-code delimiters so we measure visible text length, not markup length.
function visibleLen(text: string): number {
    return text
        .replace(/<code>([^<]+)<\/code>/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .length;
}

function estimateNodeHeight(spec: FlowSpec): number {
    const usable = NODE_WIDTH - NODE_HORIZONTAL_PADDING;
    const titleFirstLine = Math.max(1, Math.floor((usable - TAG_RESERVED) / TITLE_CHAR_WIDTH));
    const titleRest = Math.max(1, Math.floor(usable / TITLE_CHAR_WIDTH));
    const titleLen = visibleLen(spec.title);
    const titleLines = titleLen <= titleFirstLine
        ? 1
        : 1 + Math.ceil((titleLen - titleFirstLine) / titleRest);

    let h = 8; // top padding inside our inner div
    h += titleLines * TITLE_LINE_HEIGHT;
    h += 4;    // marginBottom under title row

    if (spec.subtitle) {
        const subtitleCharsPerLine = Math.max(1, Math.floor(usable / SUBTITLE_CHAR_WIDTH));
        const stripped = spec.subtitle
            .replace(/<code>([^<]+)<\/code>/g, '$1')
            .replace(/`([^`]+)`/g, '$1');
        h += wrappedLines(stripped, subtitleCharsPerLine) * SUBTITLE_LINE_HEIGHT;
        if (spec.detail?.length) h += 4;
    }

    if (spec.detail?.length) {
        for (const line of spec.detail) {
            const cpl = Math.max(1, Math.floor(usable / (isMonospaceLine(line) ? DETAIL_CHAR_WIDTH_MONO : DETAIL_CHAR_WIDTH_PROP)));
            const stripped = line
                .replace(/<code>([^<]+)<\/code>/g, '$1')
                .replace(/`([^`]+)`/g, '$1');
            h += wrappedLines(stripped, cpl) * DETAIL_LINE_HEIGHT;
        }
    }

    h += 20; // outer node padding (10 top + 10 bottom)
    return Math.ceil(h);
}

function buildFlowGraph(steps: SqlPreviewStep[], path: string, method?: string): {
    nodes: Node[];
    edges: Edge[];
    height: number
} {
    const specs = buildFlow(steps, path, method);
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const gap = 22;

    let y = 0;
    specs.forEach((spec, i) => {
        const h = estimateNodeHeight(spec);
        const style = LAYER_STYLES[spec.layer];

        nodes.push({
            id: `n-${i}`,
            position: {x: 0, y},
            data: {label: renderNodeLabel(spec)},
            style: {
                width: NODE_WIDTH,
                padding: '10px 14px',
                borderRadius: 8,
                border: `2px solid ${style.border}`,
                background: style.background,
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
        });

        if (i > 0) {
            edges.push({
                id: `e-${i - 1}-${i}`,
                source: `n-${i - 1}`,
                target: `n-${i}`,
                animated: true,
                style: {stroke: '#5b6877', strokeWidth: 1.5},
            });
        }
        y += h + gap;
    });

    return {nodes, edges, height: y};
}

function StepFlow({steps, path, method}: { steps: SqlPreviewStep[]; path: string; method?: string }) {
    const {nodes, edges, height} = useMemo(() => buildFlowGraph(steps, path, method), [steps, path, method]);
    const onInit = useCallback(() => {
    }, []);
    const flowHeight = Math.min(900, Math.max(420, height + 80));

    return (
        <div style={{height: flowHeight, background: '#0a0e14', borderRadius: 8, border: '1px solid #1a2331'}}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onInit={onInit}
                fitView
                fitViewOptions={{padding: 0.15}}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                proOptions={{hideAttribution: true}}
            >
                <Background color="#1a2b3c" gap={16}/>
                <Controls showInteractive={false}/>
            </ReactFlow>
        </div>
    );
}

function SqlAndExplainView({steps}: { steps: SqlPreviewStep[] }) {
    const sqlSteps = steps
        .map((step, idx) => ({step, idx}))
        .filter(({step}) => Boolean(step.sql));

    return (
        <SpaceBetween size="l">
            {sqlSteps.map(({step, idx}) => (
                <div key={idx}>
                    <Box variant="h4">{step.label}</Box>
                    <div style={{marginTop: 8}}>
                        <CodeView
                            content={step.sql!}
                            highlight={highlightPgsql}
                            lineNumbers
                            wrapLines
                        />
                    </div>
                    {step.explain && (
                        <div style={{marginTop: 12}}>
                            <Box variant="h5"><code>EXPLAIN ANALYZE</code></Box>
                            <pre style={{
                                margin: '4px 0 0',
                                padding: 12,
                                background: '#0f1b2a',
                                color: '#b0bec5',
                                borderRadius: 8,
                                fontSize: 12,
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                overflowX: 'auto',
                            }}>
                                {step.explain}
                            </pre>
                        </div>
                    )}
                </div>
            ))}
        </SpaceBetween>
    );
}

interface SqlPreviewButtonProps {
    path: string;
    method?: string;
    body?: Record<string, unknown>;
    label?: string;
}

export default function SqlPreviewButton({path, method, body, label = 'Show Preview'}: SqlPreviewButtonProps) {
    const [visible, setVisible] = useState(false);
    const [sql, setSql] = useState('');
    const [steps, setSteps] = useState<SqlPreviewStep[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleOpen() {
        setVisible(true);
        setLoading(true);
        setError('');
        setSql('');
        setSteps([]);
        try {
            const result = await previewSql(path, method, body);
            if (result.sql) {
                setSql(result.sql);
            }
            if (result.steps) {
                setSteps(result.steps);
            }
            if (!result.sql && !result.steps) {
                setError('API does not support SQL preview yet. Redeploy the API stack to enable this feature.');
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <Button variant="normal" onClick={handleOpen}>{label}</Button>
            <Modal
                visible={visible}
                onDismiss={() => setVisible(false)}
                header="Preview"
                size="max"
                footer={
                    <Box float="right">
                        <Button onClick={() => setVisible(false)}>Close</Button>
                    </Box>
                }
            >
                {loading && <Box textAlign="center" padding="l"><Spinner size="large"/></Box>}
                {error && <Box color="text-status-error">{error}</Box>}
                {!loading && !error && (sql || steps.length > 0) && (
                    <Tabs
                        tabs={[
                            ...(steps.some(s => s.sql) ? [{
                                id: 'sql',
                                label: 'SQL',
                                content: <SqlAndExplainView steps={steps}/>,
                            }] : (sql ? [{
                                id: 'sql',
                                label: 'SQL',
                                content: (
                                    <CodeView
                                        content={sql}
                                        highlight={highlightPgsql}
                                        lineNumbers
                                        wrapLines
                                    />
                                ),
                            }] : [])),
                            ...(steps.length > 0 ? [{
                                id: 'flow',
                                label: 'Execution Flow',
                                content: <StepFlow steps={steps} path={path} method={method}/>,
                            }] : []),
                        ]}
                    />
                )}
            </Modal>
        </>
    );
}