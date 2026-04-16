import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from './context/AuthContext.js';
import { ThemeProvider } from './context/ThemeContext.js';
import { AppHeader } from './components/AppHeader.js';
import { ProtectedLayout } from './components/ProtectedLayout.js';
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
        <Route element={<ProtectedLayout />}>
          <Route path="/trips" element={<TripDashboardScreen />} />
          <Route path="/trips/:id/timeline" element={<TimelineScreen />} />
          <Route path="/trips/:id/entries/new" element={<CreateEntryScreen />} />
          <Route
            path="/trips/:id/entries/pending/:localId/edit"
            element={<CreateEntryScreen />}
          />
          <Route path="/trips/:id/entries/:entryId/edit" element={<CreateEntryScreen />} />
          <Route path="/trips/:id/map" element={<MapScreen />} />
          <Route path="/trips/:id/settings" element={<TripSettingsScreen />} />
          <Route path="/admin" element={<AdminPanelScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
        </Route>
        <Route path="/" element={<Navigate to="/trips" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
