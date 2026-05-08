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
import { listUsers, listAccounts, createAccount, updateAccount, deleteAccount, getAccountBalance, type User, type Account } from '../api/client';
import SqlPreviewButton from '../components/SqlPreviewModal';

type SelectOption = { label: string; value: string; description?: string };

export default function AccountsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<SelectOption | null>(null);
  const [accountName, setAccountName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [selectedAccounts, setSelectedAccounts] = useState<Account[]>([]);
  const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);

  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [editAccountName, setEditAccountName] = useState('');
  const [editCurrency, setEditCurrency] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  let flashIdCounter = 0;
  function addFlash(item: FlashbarProps.MessageDefinition) {
    const id = String(++flashIdCounter) + Date.now();
    setFlash((prev) => [...prev, { ...item, id, dismissible: true, onDismiss: () => setFlash((f) => f.filter((i) => i.id !== id)) }]);
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      setUsers(await listUsers());
    } catch (err) {
      addFlash({ type: 'error', content: `Failed to load users: ${(err as Error).message}` });
    } finally {
      setLoadingUsers(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const accts = await listAccounts();
      setAccounts(accts);
      const balanceResults = await Promise.all(
        accts.map((a) => getAccountBalance(a.account_id).catch(() => ({ account_id: a.account_id, balance_cents: 0 })))
      );
      setBalances(new Map(balanceResults.map((b) => [b.account_id, b.balance_cents])));
    } catch (err) {
      addFlash({ type: 'error', content: `Failed to load accounts: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); load(); }, []);

  const userOptions: SelectOption[] = users.map((u) => ({
    label: u.full_name,
    value: u.user_id,
    description: u.email,
  }));

  // Build a lookup for the table to show user names instead of raw IDs
  const userMap = new Map(users.map((u) => [u.user_id, u]));

  async function handleCreate() {
    if (!selectedUser || !accountName.trim()) return;
    setSubmitting(true);
    try {
      await createAccount({ user_id: selectedUser.value, account_name: accountName.trim(), currency });
      setSelectedUser(null);
      setAccountName('');
      setCurrency('USD');
      addFlash({ type: 'success', content: 'Account created.' });
      await load();
    } catch (err) {
      addFlash({ type: 'error', content: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(account: Account) {
    setEditAccount(account);
    setEditAccountName(account.account_name);
    setEditCurrency(account.currency);
  }

  async function handleEdit() {
    if (!editAccount) return;
    setEditSubmitting(true);
    try {
      await updateAccount(editAccount.account_id, { account_name: editAccountName, currency: editCurrency });
      setEditAccount(null);
      addFlash({ type: 'success', content: 'Account updated.' });
      await load();
    } catch (err) {
      addFlash({ type: 'error', content: (err as Error).message });
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete() {
    setDeleteSubmitting(true);
    try {
      for (const a of selectedAccounts) {
        await deleteAccount(a.account_id);
      }
      setSelectedAccounts([]);
      setDeleteVisible(false);
      addFlash({ type: 'success', content: `${selectedAccounts.length} account(s) deleted.` });
      await load();
    } catch (err) {
      addFlash({ type: 'error', content: (err as Error).message });
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <ContentLayout header={<Header variant="h1">Accounts</Header>}>
      <SpaceBetween size="l">
        <Flashbar items={flash} />
        <Container header={<Header variant="h2">Create account</Header>}>
          <Form
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <SqlPreviewButton
                  path="/accounts"
                  method="POST"
                  body={{ user_id: selectedUser?.value ?? 'user-id', account_name: accountName.trim() || 'Account Name', currency }}
                />
                <Button variant="primary" loading={submitting} onClick={handleCreate} disabled={!selectedUser || !accountName.trim()}>
                  Create
                </Button>
              </SpaceBetween>
            }
          >
            <SpaceBetween size="m">
              <FormField label="User" constraintText="Required">
                <Select
                  selectedOption={selectedUser}
                  onChange={({ detail }) => setSelectedUser(detail.selectedOption as SelectOption)}
                  options={userOptions}
                  placeholder="Select a user"
                  filteringType="auto"
                  statusType={loadingUsers ? 'loading' : 'finished'}
                  loadingText="Loading users..."
                />
              </FormField>
              <FormField label="Account name" constraintText="Required">
                <Input value={accountName} onChange={({ detail }) => setAccountName(detail.value)} placeholder="e.g. Primary Checking" />
              </FormField>
              <FormField label="Currency" constraintText="3-letter code, defaults to USD">
                <Input value={currency} onChange={({ detail }) => setCurrency(detail.value)} />
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
                  <Button onClick={() => openEdit(selectedAccounts[0])} disabled={selectedAccounts.length !== 1}>Edit</Button>
                  <Button onClick={() => setDeleteVisible(true)} disabled={selectedAccounts.length === 0}>Delete</Button>
                  <SqlPreviewButton path="/accounts" label="Show List Preview" />
                  {selectedAccounts.length === 1 && (
                    <>
                      <SqlPreviewButton path={`/accounts/${selectedAccounts[0].account_id}`} label="Show Get Preview" />
                      <SqlPreviewButton path={`/accounts/${selectedAccounts[0].account_id}/balance`} label="Show Balance Preview" />
                      <SqlPreviewButton path={`/accounts/${selectedAccounts[0].account_id}`} method="DELETE" label="Show Delete Preview" />
                    </>
                  )}
                  <Button iconName="refresh" onClick={() => { load(); loadUsers(); }} />
                </SpaceBetween>
              }
              counter={`(${accounts.length})`}
            >
              Accounts
            </Header>
          }
          columnDefinitions={[
            { id: 'account_id', header: 'Account ID', cell: (item) => item.account_id },
            { id: 'account_name', header: 'Account Name', cell: (item) => item.account_name },
            {
              id: 'user',
              header: 'User',
              cell: (item) => {
                const u = userMap.get(item.user_id);
                return u ? `${u.full_name} (${u.email})` : item.user_id;
              },
            },
            { id: 'balance', header: 'Balance', cell: (item) => {
                const cents = balances.get(item.account_id);
                return cents !== undefined ? `$${(cents / 100).toFixed(2)}` : '-';
              },
            },
            { id: 'currency', header: 'Currency', cell: (item) => item.currency },
            { id: 'created_at', header: 'Created', cell: (item) => new Date(item.created_at).toLocaleString() },
          ]}
          items={accounts}
          loading={loading}
          selectionType="multi"
          selectedItems={selectedAccounts}
          onSelectionChange={({ detail }) => setSelectedAccounts(detail.selectedItems)}
          trackBy="account_id"
          empty={<Box textAlign="center" color="inherit" variant="p">No accounts found.</Box>}
        />
      </SpaceBetween>

      {editAccount && (
        <Modal
          visible
          onDismiss={() => setEditAccount(null)}
          header="Edit account"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setEditAccount(null)}>Cancel</Button>
                <SqlPreviewButton
                  path={`/accounts/${editAccount.account_id}`}
                  method="PUT"
                  body={{ account_name: editAccountName, currency: editCurrency }}
                  label="Show Preview"
                />
                <Button variant="primary" loading={editSubmitting} onClick={handleEdit}>Save</Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <FormField label="Account name">
              <Input value={editAccountName} onChange={({ detail }) => setEditAccountName(detail.value)} />
            </FormField>
            <FormField label="Currency">
              <Input value={editCurrency} onChange={({ detail }) => setEditCurrency(detail.value)} />
            </FormField>
          </SpaceBetween>
        </Modal>
      )}

      <Modal
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        header="Delete account(s)"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleteVisible(false)}>Cancel</Button>
              <Button variant="primary" loading={deleteSubmitting} onClick={handleDelete}>Delete</Button>
            </SpaceBetween>
          </Box>
        }
      >
        Delete {selectedAccounts.length} account(s)? This cannot be undone.
      </Modal>
    </ContentLayout>
  );
}
