import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute.js';
import { AdminRegisterScreen } from './screens/AdminRegisterScreen.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { TripDashboardScreen } from './screens/TripDashboardScreen.js';
import { TripSettingsScreen } from './screens/TripSettingsScreen.js';

function TimelinePlaceholder() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <p className="font-display text-heading text-xl">Timeline — coming in Phase 4</p>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/register" element={<AdminRegisterScreen />} />
      <Route path="/login" element={<LoginScreen />} />
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
            <TimelinePlaceholder />
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
      <Route path="/" element={<Navigate to="/trips" replace />} />
    </Routes>
  );
}
