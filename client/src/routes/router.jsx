import { Navigate, Outlet } from 'react-router';
import { AuthProvider } from '@/auth/AuthProvider.jsx';
import { GuestOnly, RequireAuth } from '@/auth/guards.jsx';
import { ConfirmProvider } from '@/components/ConfirmProvider.jsx';
import { AppShell } from '@/components/layout/AppShell.jsx';
import { NotFoundPage } from '@/components/NotFoundPage.jsx';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoginPage } from '@/features/auth/LoginPage.jsx';
import { SignupPage } from '@/features/auth/SignupPage.jsx';
import { VerifyPage } from '@/features/auth/VerifyPage.jsx';
import { DashboardPage } from '@/features/dashboard/DashboardPage.jsx';
import { GroupLoader } from '@/features/groups/GroupContext.jsx';
import { GroupLayout } from '@/features/groups/GroupLayout.jsx';
import { GroupsPage } from '@/features/groups/GroupsPage.jsx';
import { NewGroupPage } from '@/features/groups/NewGroupPage.jsx';
import { SettingsTab } from '@/features/groups/SettingsTab.jsx';
import { MembersTab } from '@/features/members/MembersTab.jsx';
import { ActivityTab } from '@/features/activity/ActivityTab.jsx';
import { BalancesTab } from '@/features/balances/BalancesTab.jsx';
import { ExpenseDetailPage } from '@/features/expenses/ExpenseDetailPage.jsx';
import { ExpenseFormPage } from '@/features/expenses/ExpenseFormPage.jsx';
import { ExpensesTab } from '@/features/expenses/ExpensesTab.jsx';
import { SettlementsTab } from '@/features/settlements/SettlementsTab.jsx';
import { ProfilePage } from '@/features/profile/ProfilePage.jsx';
import { NotificationsPage } from '@/features/notifications/NotificationsPage.jsx';
import { ReportsPage } from '@/features/reports/ReportsPage.jsx';

function Root() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <ConfirmProvider>
          <Outlet />
          <Toaster position="top-right" richColors />
        </ConfirmProvider>
      </TooltipProvider>
    </AuthProvider>
  );
}

/** Route table (WIREFRAMES §0.3). */
export const routes = [
  {
    element: <Root />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/signup', element: <SignupPage /> },
        ],
      },
      { path: '/verify', element: <VerifyPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <DashboardPage /> },
              { path: '/groups', element: <GroupsPage /> },
              { path: '/groups/new', element: <NewGroupPage /> },
              {
                path: '/groups/:groupId',
                element: <GroupLoader />,
                children: [
                  {
                    element: <GroupLayout />,
                    children: [
                      { index: true, element: <Navigate to="expenses" replace /> },
                      { path: 'expenses', element: <ExpensesTab /> },
                      { path: 'balances', element: <BalancesTab /> },
                      { path: 'settlements', element: <SettlementsTab /> },
                      { path: 'activity', element: <ActivityTab /> },
                      { path: 'members', element: <MembersTab /> },
                      { path: 'settings', element: <SettingsTab /> },
                    ],
                  },
                  { path: 'expenses/new', element: <ExpenseFormPage /> },
                  { path: 'expenses/:expenseId', element: <ExpenseDetailPage /> },
                  { path: 'expenses/:expenseId/edit', element: <ExpenseFormPage /> },
                ],
              },
              { path: '/notifications', element: <NotificationsPage /> },
              { path: '/reports', element: <ReportsPage /> },
              { path: '/profile', element: <ProfilePage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
