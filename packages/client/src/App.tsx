import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from './context/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { AppHeader } from './components/AppHeader.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { OfflineBanner } from './components/OfflineBanner.js';
import { AdminPanelScreen } from './screens/AdminPanelScreen.js';
import { ProfileScreen } from './screens/ProfileScreen.js';
import { AdminRegisterScreen } from './screens/AdminRegisterScreen.js';
import { CreateEntryScreen } from './screens/CreateEntryScreen.js';
import { InviteAcceptScreen } from './screens/InviteAcceptScreen.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { MapScreen } from './screens/MapScreen.js';
import { TimelineScreen } from './screens/TimelineScreen.js';
import { TripDashboardScreen } from './screens/TripDashboardScreen.js';
import { TripSettingsScreen } from './screens/TripSettingsScreen.js';
import { syncPendingEntries } from './offline/entrySync.js';
import { syncPushSubscriptionIfPermitted } from './notifications/push.js';

export function App() {
  const { accessToken, status } = useAuth();
  const queryClient = useQueryClient();

  // Trigger sync on first auth and on every network restore
  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return;

    function runSync() {
      void syncPendingEntries(accessToken!, (tripId) => {
        void queryClient.invalidateQueries({ queryKey: ['entries', tripId] });
      });
    }

    runSync();
    window.addEventListener('online', runSync);
    return () => window.removeEventListener('online', runSync);
  }, [status, accessToken, queryClient]);

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) return;
    void syncPushSubscriptionIfPermitted(accessToken);
  }, [status, accessToken]);

  return (
    <ThemeProvider>
      <OfflineBanner />
      {status === 'authenticated' && <AppHeader />}
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
          path="/trips/:id/entries/pending/:localId/edit"
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
          path="/trips/:id/map"
          element={
            <ProtectedRoute>
              <MapScreen />
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
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfileScreen />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/trips" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
