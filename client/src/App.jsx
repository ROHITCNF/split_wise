import { createBrowserRouter, RouterProvider } from 'react-router';
import { routes } from '@/routes/router.jsx';

const router = createBrowserRouter(routes);

export default function App() {
  return <RouterProvider router={router} />;
}
