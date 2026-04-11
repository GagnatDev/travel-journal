import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute.js';
import { AdminPanelScreen } from './screens/AdminPanelScreen.js';
import { AdminRegisterScreen } from './screens/AdminRegisterScreen.js';
import { CreateEntryScreen } from './screens/CreateEntryScreen.js';
import { InviteAcceptScreen } from './screens/InviteAcceptScreen.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { TimelineScreen } from './screens/TimelineScreen.js';
import { TripDashboardScreen } from './screens/TripDashboardScreen.js';
import { TripSettingsScreen } from './screens/TripSettingsScreen.js';

export function App() {
  return (
    <Routes>
      <Route path="/register" element={<AdminRegisterScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/invite/accept" element={<InviteAcceptScreen />} />
      <Route
        path="/trips"
        element={
          <ProtectedRoute>
            <TripDashboardScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trips/:id/timeline"
        element={
          <ProtectedRoute>
            <TimelineScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trips/:id/entries/new"
        element={
          <ProtectedRoute>
            <CreateEntryScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trips/:id/entries/:entryId/edit"
        element={
          <ProtectedRoute>
            <CreateEntryScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trips/:id/settings"
        element={
          <ProtectedRoute>
            <TripSettingsScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPanelScreen />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/trips" replace />} />
    </Routes>
  );
}
