export interface ExplainCost {
  startup: number;
  total: number;
  rows: number;
  width: number;
}

export interface ExplainActual {
  startupMs: number;
  totalMs: number;
  rows: number;
  loops: number;
}

export interface ExplainNode {
  op: string;
  relation?: string;
  index?: string;
  cost?: ExplainCost;
  actual?: ExplainActual;
  conditions: string[];
  depth: number;
}

export interface ExplainPlan {
  nodes: ExplainNode[];
  planningTimeMs?: number;
  executionTimeMs?: number;
}

const COST_RE = /cost=([\d.]+)\.\.([\d.]+)\s+rows=(\d+)\s+width=(\d+)/;
const ACTUAL_RE = /actual time=([\d.]+)\.\.([\d.]+)\s+rows=(\d+)\s+loops=(\d+)/;
const PLANNING_RE = /^Planning Time:\s+([\d.]+)\s*ms/;
const EXECUTION_RE = /^Execution Time:\s+([\d.]+)\s*ms/;
const ATTACHED_LINE_RE = /^(?:Index Cond|Filter|Recheck Cond|Sort Key|Hash Cond|Join Filter|Output|Heap Fetches|Storage Filter|Storage Index Filter|Buffers|Rows Removed by Filter):/;

function parseHead(head: string): { op: string; relation?: string; index?: string } {
  let work = head.trim();
  let index: string | undefined;
  let relation: string | undefined;
  const usingMatch = work.match(/\s+using\s+(\S+)/);
  if (usingMatch) {
    index = usingMatch[1];
    work = work.replace(usingMatch[0], '');
  }
  const onMatch = work.match(/\s+on\s+(\S+)/);
  if (onMatch) {
    relation = onMatch[1];
    work = work.replace(onMatch[0], '');
  }
  return { op: work.trim(), relation, index };
}

function parseParenContent(line: string): string[] {
  const matches = line.matchAll(/\(([^()]+)\)/g);
  return [...matches].map(m => m[1]);
}

export function parseExplain(text: string): ExplainPlan {
  const lines = text.split('\n');
  const nodes: ExplainNode[] = [];
  let planningTimeMs: number | undefined;
  let executionTimeMs: number | undefined;
  let lastNode: ExplainNode | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;

    const planMatch = line.match(PLANNING_RE);
    if (planMatch) { planningTimeMs = parseFloat(planMatch[1]); continue; }
    const execMatch = line.match(EXECUTION_RE);
    if (execMatch) { executionTimeMs = parseFloat(execMatch[1]); continue; }

    const leading = line.match(/^(\s*)/)?.[1].length ?? 0;
    const stripped = line.trim().replace(/^->\s+/, '');

    if (ATTACHED_LINE_RE.test(stripped) && lastNode) {
      lastNode.conditions.push(stripped);
      continue;
    }

    const parenIdx = stripped.indexOf('(cost=');
    if (parenIdx < 0) continue;
    const head = stripped.slice(0, parenIdx).trim();
    const tail = stripped.slice(parenIdx);

    const { op, relation, index } = parseHead(head);
    const parens = parseParenContent(tail);
    const costStr = parens.find(p => p.startsWith('cost='));
    const actualStr = parens.find(p => p.includes('actual time='));

    let cost: ExplainCost | undefined;
    if (costStr) {
      const m = costStr.match(COST_RE);
      if (m) cost = {
        startup: parseFloat(m[1]),
        total: parseFloat(m[2]),
        rows: parseInt(m[3], 10),
        width: parseInt(m[4], 10),
      };
    }

    let actual: ExplainActual | undefined;
    if (actualStr) {
      const m = actualStr.match(ACTUAL_RE);
      if (m) actual = {
        startupMs: parseFloat(m[1]),
        totalMs: parseFloat(m[2]),
        rows: parseInt(m[3], 10),
        loops: parseInt(m[4], 10),
      };
    }

    const node: ExplainNode = {
      op,
      relation,
      index,
      cost,
      actual,
      conditions: [],
      depth: Math.floor(leading / 2),
    };
    nodes.push(node);
    lastNode = node;
  }

  return { nodes, planningTimeMs, executionTimeMs };
}

export function isWriteOp(op: string): boolean {
  return /^(Insert|Update|Delete|ModifyTable|LockRows)\b/.test(op);
}

export function isAggregateOp(op: string): boolean {
  return /\b(Aggregate|GroupAggregate|HashAggregate)\b/.test(op);
}

export function isSeqScan(op: string): boolean {
  return /^Seq Scan|^YB Seq Scan|^Foreign Scan/.test(op);
}

export type SqlKind = 'insert' | 'update' | 'delete' | 'select' | 'other';

export function classifySql(sql: string): SqlKind {
  const m = sql.trim().match(/^(insert|update|delete|select)\b/i);
  if (!m) return 'other';
  return m[1].toLowerCase() as SqlKind;
}

export function isWriteSql(sql: string): boolean {
  const k = classifySql(sql);
  return k === 'insert' || k === 'update' || k === 'delete';
}
