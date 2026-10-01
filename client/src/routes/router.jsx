import { Navigate, Outlet } from 'react-router';
import { AuthProvider } from '@/auth/AuthProvider.jsx';
import { GuestOnly, RequireAuth } from '@/auth/guards.jsx';
import { ConfirmProvider } from '@/components/ConfirmProvider.jsx';
import { AppShell } from '@/components/layout/AppShell.jsx';
import { NotFoundPage, PlaceholderPage } from '@/components/PlaceholderPage.jsx';
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
import { ProfilePage } from '@/features/profile/ProfilePage.jsx';

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

const soon = (title, milestone) => <PlaceholderPage title={title} milestone={milestone} />;

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
                      { path: 'expenses', element: soon('Expenses', 'M11') },
                      { path: 'balances', element: soon('Balances', 'M11') },
                      { path: 'settlements', element: soon('Settlements', 'M11') },
                      { path: 'activity', element: soon('Activity', 'M11') },
                      { path: 'members', element: <MembersTab /> },
                      { path: 'settings', element: <SettingsTab /> },
                    ],
                  },
                  { path: 'expenses/new', element: soon('Add expense', 'M11') },
                  { path: 'expenses/:expenseId', element: soon('Expense', 'M11') },
                  { path: 'expenses/:expenseId/edit', element: soon('Edit expense', 'M11') },
                ],
              },
              { path: '/notifications', element: soon('Notifications', 'M12') },
              { path: '/reports', element: soon('Reports', 'M12') },
              { path: '/profile', element: <ProfilePage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
