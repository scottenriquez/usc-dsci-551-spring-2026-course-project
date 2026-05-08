const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }
  return body as T;
}

// --- Types ---

export interface User {
  user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Account {
  account_id: string;
  user_id: string;
  account_name: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  transaction_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  amount_cents: number;
  description: string | null;
  application_source_region: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountBalance {
  account_id: string;
  balance_cents: number;
}

// --- Users ---

export function listUsers() {
  return request<User[]>('/users');
}

export function getUser(id: string) {
  return request<User>(`/users/${id}`);
}

export function createUser(data: { email: string; full_name: string; phone?: string }) {
  return request<User>('/users', { method: 'POST', body: JSON.stringify(data) });
}

export function updateUser(id: string, data: { email?: string; full_name?: string; phone?: string }) {
  return request<User>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteUser(id: string) {
  return request<{ deleted: string }>(`/users/${id}`, { method: 'DELETE' });
}

// --- Accounts ---

export function listAccounts() {
  return request<Account[]>('/accounts');
}

export function getAccount(id: string) {
  return request<Account>(`/accounts/${id}`);
}

export function createAccount(data: { user_id: string; account_name: string; currency?: string }) {
  return request<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) });
}

export function updateAccount(id: string, data: { account_name?: string; currency?: string }) {
  return request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteAccount(id: string) {
  return request<{ deleted: string }>(`/accounts/${id}`, { method: 'DELETE' });
}

// --- Transactions ---

export function listTransactions() {
  return request<Transaction[]>('/transactions');
}

export function getTransaction(id: string) {
  return request<Transaction>(`/transactions/${id}`);
}

export function getAccountBalance(id: string) {
  return request<AccountBalance>(`/accounts/${id}/balance`);
}

export function createTransaction(data: {
  from_account_id?: string;
  to_account_id?: string;
  amount_cents: number;
  description?: string;
  application_source_region?: string;
  idempotency_key?: string;
}) {
  return request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteTransaction(id: string) {
  return request<{ deleted: string }>(`/transactions/${id}`, { method: 'DELETE' });
}

// --- SQL Preview ---

export interface SqlPreviewStep {
  label: string;
  description: string;
  sql?: string;
  explain?: string;
}

export interface SqlPreview {
  sql: string;
  steps?: SqlPreviewStep[];
}

export function previewSql(path: string, method?: string, body?: Record<string, unknown>): Promise<SqlPreview> {
  const params = new URLSearchParams({ preview: 'true' });
  if (method) params.set('method', method);
  if (body) params.set('body', JSON.stringify(body));
  const separator = path.includes('?') ? '&' : '?';
  return request<SqlPreview>(`${path}${separator}${params.toString()}`);
}

// --- CloudWatch Logs ---

export interface LogGroup {
  log_group_name: string;
  stored_bytes: number;
  creation_time: number | null;
}

export interface LogStream {
  log_stream_name: string;
  last_event_timestamp: number | null;
  stored_bytes: number;
}

export interface LogEvent {
  timestamp: number;
  message: string;
  ingestion_time: number | null;
}

export interface LogEventsResponse {
  events: LogEvent[];
  next_forward_token: string | null;
  next_backward_token: string | null;
}

export function listLogGroups() {
  return request<LogGroup[]>('/logs/groups');
}

export function listLogStreams(logGroupName: string) {
  return request<LogStream[]>(`/logs/streams?log_group_name=${encodeURIComponent(logGroupName)}`);
}

export function getLogEvents(params: {
  log_group_name: string;
  log_stream_name: string;
  start_time?: number;
  end_time?: number;
  next_token?: string;
}) {
  const qs = new URLSearchParams();
  qs.set('log_group_name', params.log_group_name);
  qs.set('log_stream_name', params.log_stream_name);
  if (params.start_time) qs.set('start_time', String(params.start_time));
  if (params.end_time) qs.set('end_time', String(params.end_time));
  if (params.next_token) qs.set('next_token', params.next_token);
  return request<LogEventsResponse>(`/logs/events?${qs.toString()}`);
}
