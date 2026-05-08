import { useEffect, useState } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Flashbar, { type FlashbarProps } from '@cloudscape-design/components/flashbar';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Modal from '@cloudscape-design/components/modal';
import { listUsers, listAccounts, listTransactions, createTransaction, deleteTransaction, type User, type Account, type Transaction } from '../api/client';
import SqlPreviewButton from '../components/SqlPreviewModal';

type SelectOption = { label: string; value: string; description?: string };

const TRANSACTION_TYPE_OPTIONS = [
  { label: 'Transfer', value: 'transfer' },
  { label: 'Deposit', value: 'deposit' },
  { label: 'Withdrawal', value: 'withdrawal' },
];

export default function TransactionsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const [transactionType, setTransactionType] = useState(TRANSACTION_TYPE_OPTIONS[0]);
  const [fromAccount, setFromAccount] = useState<SelectOption | null>(null);
  const [toAccount, setToAccount] = useState<SelectOption | null>(null);
  const [amountCents, setAmountCents] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<Transaction[]>([]);
  const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  let flashIdCounter = 0;
  function addFlash(item: FlashbarProps.MessageDefinition) {
    const id = String(++flashIdCounter) + Date.now();
    setFlash((prev) => [...prev, { ...item, id, dismissible: true, onDismiss: () => setFlash((f) => f.filter((i) => i.id !== id)) }]);
  }

  const userMap = new Map(users.map((u) => [u.user_id, u]));

  function accountLabel(a: Account): string {
    const u = userMap.get(a.user_id);
    const owner = u ? u.full_name : a.user_id.slice(0, 8);
    return `${a.account_name} (${owner} — ${a.currency})`;
  }

  function accountDescription(a: Account): string {
    return a.account_id;
  }

  const accountOptions: SelectOption[] = accounts.map((a) => ({
    label: accountLabel(a),
    value: a.account_id,
    description: accountDescription(a),
  }));

  const accountMap = new Map(accounts.map((a) => [a.account_id, a]));
  function friendlyAccount(accountId: string | null): string {
    if (!accountId) return '-';
    const a = accountMap.get(accountId);
    if (!a) return accountId;
    return accountLabel(a);
  }

  function transactionTypeLabel(t: Transaction): string {
    if (!t.from_account_id) return 'Deposit';
    if (!t.to_account_id) return 'Withdrawal';
    return 'Transfer';
  }

  async function loadRefs() {
    setLoadingRefs(true);
    try {
      const [u, a] = await Promise.all([listUsers(), listAccounts()]);
      setUsers(u);
      setAccounts(a);
    } catch (err) {
      addFlash({ type: 'error', content: `Failed to load reference data: ${(err as Error).message}` });
    } finally {
      setLoadingRefs(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      setTransactions(await listTransactions());
    } catch (err) {
      addFlash({ type: 'error', content: `Failed to load transactions: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRefs(); load(); }, []);

  const txType = transactionType.value;

  function isCreateDisabled(): boolean {
    if (!amountCents) return true;
    if (txType === 'transfer') return !fromAccount || !toAccount;
    if (txType === 'deposit') return !toAccount;
    if (txType === 'withdrawal') return !fromAccount;
    return true;
  }

  async function handleCreate() {
    setSubmitting(true);
    try {
      await createTransaction({
        ...(txType !== 'deposit' && fromAccount ? { from_account_id: fromAccount.value } : {}),
        ...(txType !== 'withdrawal' && toAccount ? { to_account_id: toAccount.value } : {}),
        amount_cents: parseInt(amountCents, 10),
        ...(description ? { description } : {}),
        application_source_region: 'us-west-2',
      });
      setFromAccount(null);
      setToAccount(null);
      setAmountCents('');
      setDescription('');
      const typeLabel = txType.charAt(0).toUpperCase() + txType.slice(1);
      addFlash({ type: 'success', content: `${typeLabel} created.` });
      await load();
    } catch (err) {
      addFlash({ type: 'error', content: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleteSubmitting(true);
    try {
      for (const t of selectedTransactions) {
        await deleteTransaction(t.transaction_id);
      }
      setSelectedTransactions([]);
      setDeleteVisible(false);
      addFlash({ type: 'success', content: `${selectedTransactions.length} transaction(s) deleted.` });
      await load();
    } catch (err) {
      addFlash({ type: 'error', content: (err as Error).message });
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <ContentLayout header={<Header variant="h1">Transactions</Header>}>
      <SpaceBetween size="l">
        <Flashbar items={flash} />
        <Container header={<Header variant="h2">Create transaction</Header>}>
          <Form
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <SqlPreviewButton
                  path="/transactions"
                  method="POST"
                  body={{
                    ...(txType !== 'deposit' && fromAccount ? { from_account_id: fromAccount.value } : {}),
                    ...(txType !== 'withdrawal' && toAccount ? { to_account_id: toAccount.value } : {}),
                    amount_cents: parseInt(amountCents, 10) || 1000,
                    ...(description ? { description } : {}),
                    application_source_region: 'us-west-2',
                  }}
                />
                <Button variant="primary" loading={submitting} onClick={handleCreate} disabled={isCreateDisabled()}>
                  Create
                </Button>
              </SpaceBetween>
            }
          >
            <SpaceBetween size="m">
              <FormField label="Transaction type">
                <Select
                  selectedOption={transactionType}
                  onChange={({ detail }) => {
                    setTransactionType(detail.selectedOption as typeof transactionType);
                    setFromAccount(null);
                    setToAccount(null);
                  }}
                  options={TRANSACTION_TYPE_OPTIONS}
                />
              </FormField>
              {txType !== 'deposit' && (
                <FormField label={txType === 'withdrawal' ? 'Account' : 'From account'} constraintText="Required">
                  <Select
                    selectedOption={fromAccount}
                    onChange={({ detail }) => setFromAccount(detail.selectedOption as SelectOption)}
                    options={accountOptions}
                    placeholder="Select source account"
                    filteringType="auto"
                    statusType={loadingRefs ? 'loading' : 'finished'}
                    loadingText="Loading accounts..."
                  />
                </FormField>
              )}
              {txType !== 'withdrawal' && (
                <FormField label={txType === 'deposit' ? 'Account' : 'To account'} constraintText="Required">
                  <Select
                    selectedOption={toAccount}
                    onChange={({ detail }) => setToAccount(detail.selectedOption as SelectOption)}
                    options={accountOptions}
                    placeholder="Select destination account"
                    filteringType="auto"
                    statusType={loadingRefs ? 'loading' : 'finished'}
                    loadingText="Loading accounts..."
                  />
                </FormField>
              )}
              <FormField label="Amount (cents)" constraintText="Required — positive integer">
                <Input value={amountCents} onChange={({ detail }) => setAmountCents(detail.value)} inputMode="numeric" />
              </FormField>
              <FormField label="Description" constraintText="Optional">
                <Input value={description} onChange={({ detail }) => setDescription(detail.value)} />
              </FormField>
            </SpaceBetween>
          </Form>
        </Container>
        <Table
          header={
            <Header
              variant="h2"
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button onClick={() => setDeleteVisible(true)} disabled={selectedTransactions.length === 0}>Delete</Button>
                  <SqlPreviewButton path="/transactions" label="Show List Preview" />
                  {selectedTransactions.length === 1 && (
                    <>
                      <SqlPreviewButton path={`/transactions/${selectedTransactions[0].transaction_id}`} label="Show Get Preview" />
                      <SqlPreviewButton path={`/transactions/${selectedTransactions[0].transaction_id}`} method="DELETE" label="Show Delete Preview" />
                    </>
                  )}
                  <Button iconName="refresh" onClick={() => { load(); loadRefs(); }} />
                </SpaceBetween>
              }
              counter={`(${transactions.length})`}
            >
              Transactions
            </Header>
          }
          columnDefinitions={[
            { id: 'transaction_id', header: 'Transaction ID', cell: (item) => item.transaction_id },
            { id: 'type', header: 'Type', cell: (item) => transactionTypeLabel(item) },
            { id: 'from', header: 'From', cell: (item) => friendlyAccount(item.from_account_id) },
            { id: 'to', header: 'To', cell: (item) => friendlyAccount(item.to_account_id) },
            { id: 'amount', header: 'Amount', cell: (item) => `$${(item.amount_cents / 100).toFixed(2)}` },
            { id: 'description', header: 'Description', cell: (item) => item.description ?? '-' },
            { id: 'region', header: 'Region', cell: (item) => item.application_source_region ?? '-' },
            { id: 'created_at', header: 'Created', cell: (item) => new Date(item.created_at).toLocaleString() },
          ]}
          items={transactions}
          loading={loading}
          selectionType="multi"
          selectedItems={selectedTransactions}
          onSelectionChange={({ detail }) => setSelectedTransactions(detail.selectedItems)}
          trackBy="transaction_id"
          empty={<Box textAlign="center" color="inherit" variant="p">No transactions found.</Box>}
        />
      </SpaceBetween>

      <Modal
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        header="Delete transaction(s)"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleteVisible(false)}>Cancel</Button>
              <Button variant="primary" loading={deleteSubmitting} onClick={handleDelete}>Delete</Button>
            </SpaceBetween>
          </Box>
        }
      >
        Delete {selectedTransactions.length} transaction(s)? This cannot be undone.
      </Modal>
    </ContentLayout>
  );
}
