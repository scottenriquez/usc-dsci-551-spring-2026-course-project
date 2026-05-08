import { useEffect, useState } from 'react';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Flashbar, { type FlashbarProps } from '@cloudscape-design/components/flashbar';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import Modal from '@cloudscape-design/components/modal';
import { listUsers, createUser, updateUser, deleteUser, type User } from '../api/client';
import SqlPreviewButton from '../components/SqlPreviewModal';

export default function UsersPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [flash, setFlash] = useState<FlashbarProps.MessageDefinition[]>([]);

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  let flashIdCounter = 0;
  function addFlash(item: FlashbarProps.MessageDefinition) {
    const id = String(++flashIdCounter) + Date.now();
    setFlash((prev) => [...prev, { ...item, id, dismissible: true, onDismiss: () => setFlash((f) => f.filter((i) => i.id !== id)) }]);
  }

  async function load() {
    setLoading(true);
    try {
      setUsers(await listUsers());
    } catch (err) {
      addFlash({ type: 'error', content: `Failed to load users: ${(err as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setSubmitting(true);
    try {
      await createUser({ email, full_name: fullName, ...(phone ? { phone } : {}) });
      setEmail('');
      setFullName('');
      setPhone('');
      addFlash({ type: 'success', content: 'User created.' });
      await load();
    } catch (err) {
      addFlash({ type: 'error', content: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(user: User) {
    setEditUser(user);
    setEditEmail(user.email);
    setEditFullName(user.full_name);
    setEditPhone(user.phone ?? '');
  }

  async function handleEdit() {
    if (!editUser) return;
    setEditSubmitting(true);
    try {
      await updateUser(editUser.user_id, { email: editEmail, full_name: editFullName, phone: editPhone || undefined });
      setEditUser(null);
      addFlash({ type: 'success', content: 'User updated.' });
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
      for (const u of selectedUsers) {
        await deleteUser(u.user_id);
      }
      setSelectedUsers([]);
      setDeleteVisible(false);
      addFlash({ type: 'success', content: `${selectedUsers.length} user(s) deleted.` });
      await load();
    } catch (err) {
      addFlash({ type: 'error', content: (err as Error).message });
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <ContentLayout header={<Header variant="h1">Users</Header>}>
      <SpaceBetween size="l">
        <Flashbar items={flash} />
        <Container header={<Header variant="h2">Create user</Header>}>
          <Form
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <SqlPreviewButton
                  path="/users"
                  method="POST"
                  body={{ email: email || 'user@example.com', full_name: fullName || 'Full Name', ...(phone ? { phone } : {}) }}
                />
                <Button variant="primary" loading={submitting} onClick={handleCreate}>
                  Create
                </Button>
              </SpaceBetween>
            }
          >
            <SpaceBetween size="m">
              <FormField label="Email" constraintText="Required">
                <Input value={email} onChange={({ detail }) => setEmail(detail.value)} placeholder="user@example.com" />
              </FormField>
              <FormField label="Full name" constraintText="Required">
                <Input value={fullName} onChange={({ detail }) => setFullName(detail.value)} />
              </FormField>
              <FormField label="Phone" constraintText="Optional">
                <Input value={phone} onChange={({ detail }) => setPhone(detail.value)} />
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
                  <Button onClick={() => openEdit(selectedUsers[0])} disabled={selectedUsers.length !== 1}>Edit</Button>
                  <Button onClick={() => setDeleteVisible(true)} disabled={selectedUsers.length === 0}>Delete</Button>
                  <SqlPreviewButton path="/users" label="Show List Preview" />
                  {selectedUsers.length === 1 && (
                    <>
                      <SqlPreviewButton path={`/users/${selectedUsers[0].user_id}`} label="Show Get Preview" />
                      <SqlPreviewButton path={`/users/${selectedUsers[0].user_id}`} method="DELETE" label="Show Delete Preview" />
                    </>
                  )}
                  <Button iconName="refresh" onClick={load} />
                </SpaceBetween>
              }
              counter={`(${users.length})`}
            >
              Users
            </Header>
          }
          columnDefinitions={[
            { id: 'user_id', header: 'User ID', cell: (item) => item.user_id },
            { id: 'email', header: 'Email', cell: (item) => item.email },
            { id: 'full_name', header: 'Full name', cell: (item) => item.full_name },
            { id: 'phone', header: 'Phone', cell: (item) => item.phone ?? '-' },
            { id: 'created_at', header: 'Created', cell: (item) => new Date(item.created_at).toLocaleString() },
          ]}
          items={users}
          loading={loading}
          selectionType="multi"
          selectedItems={selectedUsers}
          onSelectionChange={({ detail }) => setSelectedUsers(detail.selectedItems)}
          trackBy="user_id"
          empty={<Box textAlign="center" color="inherit" variant="p">No users found.</Box>}
        />
      </SpaceBetween>

      {editUser && (
        <Modal
          visible
          onDismiss={() => setEditUser(null)}
          header="Edit user"
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setEditUser(null)}>Cancel</Button>
                <SqlPreviewButton
                  path={`/users/${editUser.user_id}`}
                  method="PUT"
                  body={{ email: editEmail, full_name: editFullName, ...(editPhone ? { phone: editPhone } : {}) }}
                  label="Show Preview"
                />
                <Button variant="primary" loading={editSubmitting} onClick={handleEdit}>Save</Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="m">
            <FormField label="Email">
              <Input value={editEmail} onChange={({ detail }) => setEditEmail(detail.value)} />
            </FormField>
            <FormField label="Full name">
              <Input value={editFullName} onChange={({ detail }) => setEditFullName(detail.value)} />
            </FormField>
            <FormField label="Phone">
              <Input value={editPhone} onChange={({ detail }) => setEditPhone(detail.value)} />
            </FormField>
          </SpaceBetween>
        </Modal>
      )}

      <Modal
        visible={deleteVisible}
        onDismiss={() => setDeleteVisible(false)}
        header="Delete user(s)"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setDeleteVisible(false)}>Cancel</Button>
              <Button variant="primary" loading={deleteSubmitting} onClick={handleDelete}>Delete</Button>
            </SpaceBetween>
          </Box>
        }
      >
        Delete {selectedUsers.length} user(s)? This cannot be undone.
      </Modal>
    </ContentLayout>
  );
}
