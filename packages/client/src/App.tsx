import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute.js';
import { AdminRegisterScreen } from './screens/AdminRegisterScreen.js';
import { LoginScreen } from './screens/LoginScreen.js';

function TripsPlaceholder() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center">
      <p className="font-display text-heading text-xl">Trips — coming in Phase 3</p>
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
            <TripsPlaceholder />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/trips" replace />} />
    </Routes>
  );
}
