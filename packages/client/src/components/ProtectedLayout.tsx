import { Outlet } from 'react-router-dom';

import { ProtectedRoute } from './ProtectedRoute.js';

export function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  );
}
