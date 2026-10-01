import { Navigate, Outlet } from 'react-router';
import { AuthProvider } from '@/auth/AuthProvider.jsx';
import { GuestOnly, RequireAuth } from '@/auth/guards.jsx';
import { ConfirmProvider } from '@/components/ConfirmProvider.jsx';
import { AppShell } from '@/components/layout/AppShell.jsx';
import { NotFoundPage, PlaceholderPage } from '@/components/PlaceholderPage.jsx';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LoginPage } from '@/features/auth/LoginPage.jsx';

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
          { path: '/signup', element: soon('Sign up', 'M10') },
        ],
      },
      { path: '/verify', element: soon('Verify email', 'M10') },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/', element: soon('Dashboard', 'M10') },
              { path: '/groups', element: soon('Groups', 'M10') },
              { path: '/groups/new', element: soon('New group', 'M10') },
              { path: '/groups/:groupId', element: <Navigate to="expenses" replace /> },
              { path: '/groups/:groupId/expenses/new', element: soon('Add expense', 'M11') },
              { path: '/groups/:groupId/expenses/:expenseId', element: soon('Expense', 'M11') },
              {
                path: '/groups/:groupId/expenses/:expenseId/edit',
                element: soon('Edit expense', 'M11'),
              },
              { path: '/groups/:groupId/:tab', element: soon('Group', 'M10–M11') },
              { path: '/notifications', element: soon('Notifications', 'M12') },
              { path: '/reports', element: soon('Reports', 'M12') },
              { path: '/profile', element: soon('Profile', 'M10') },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
