import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../context/AuthContext.js';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const { t } = useTranslation();

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <p className="font-ui text-body">{t('common.loading')}</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
