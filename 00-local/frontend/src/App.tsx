import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import AppLayout from '@cloudscape-design/components/app-layout';
import SideNavigation from '@cloudscape-design/components/side-navigation';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import UsersPage from './pages/UsersPage';
import AccountsPage from './pages/AccountsPage';
import TransactionsPage from './pages/TransactionsPage';
import DatabaseLogsPage from './pages/DatabaseLogsPage';
import HomePage from './pages/HomePage';
import SchemaPage from './pages/SchemaPage';
import AppArchitecturePage from './pages/AppArchitecturePage';
import DualApiDesignPage from './pages/DualApiDesignPage';
import StorageAndIndexingPage from './pages/StorageAndIndexingPage';
import MultiNodeDeploymentPage from './pages/MultiNodeDeploymentPage';
import FailoverAndSelfHealingPage from './pages/FailoverAndSelfHealingPage';

const NAV_ITEMS = [
  { type: 'link' as const, text: 'Authors', href: '/' },
  {
    type: 'section' as const,
    text: 'Focus Areas',
    items: [
      { type: 'link' as const, text: 'Dual-API Design', href: '/focus/dual-api-design' },
      { type: 'link' as const, text: 'Storage and Indexing', href: '/focus/storage-and-indexing' },
      { type: 'link' as const, text: 'Multi-Node Cloud Deployment', href: '/focus/multi-node-deployment' },
      { type: 'link' as const, text: 'Failover and Self-Healing', href: '/focus/failover-and-self-healing' },
    ],
  },
  {
    type: 'section' as const,
    text: 'Application',
    items: [
      { type: 'link' as const, text: 'Architecture', href: '/application/architecture' },
      { type: 'link' as const, text: 'Users', href: '/users' },
      { type: 'link' as const, text: 'Accounts', href: '/accounts' },
      { type: 'link' as const, text: 'Transactions', href: '/transactions' },
    ],
  },
  {
    type: 'section' as const,
    text: 'Database',
    items: [
      { type: 'link' as const, text: 'Schema', href: '/schema' },
      { type: 'link' as const, text: 'Logs', href: '/database-logs' },
    ],
  },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(true);

  return (
    <>
      <div id="top-nav">
        <TopNavigation
          identity={{ title: 'DSCI-551 Course Project: YugabyteDB', href: '/' }}
          i18nStrings={{ overflowMenuTriggerText: 'More', overflowMenuTitleText: 'All' }}
        />
      </div>
      <AppLayout
        navigation={
          <SideNavigation
            activeHref={location.pathname}
            items={NAV_ITEMS}
            onFollow={(e) => {
              e.preventDefault();
              navigate(e.detail.href);
            }}
          />
        }
        navigationOpen={navOpen}
        onNavigationChange={({ detail }) => setNavOpen(detail.open)}
        toolsHide
        content={
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/application/architecture" element={<AppArchitecturePage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/database-logs" element={<DatabaseLogsPage />} />
            <Route path="/schema" element={<SchemaPage />} />
            <Route path="/focus/dual-api-design" element={<DualApiDesignPage />} />
            <Route path="/focus/storage-and-indexing" element={<StorageAndIndexingPage />} />
            <Route path="/focus/multi-node-deployment" element={<MultiNodeDeploymentPage />} />
            <Route path="/focus/failover-and-self-healing" element={<FailoverAndSelfHealingPage />} />
          </Routes>
        }
      />
    </>
  );
}
