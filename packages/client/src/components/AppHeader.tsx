import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';

import { BellIcon, ChevronLeftIcon, HamburgerIcon } from './icons/index.js';
import { MenuDrawer } from './MenuDrawer.js';
import { NotificationsPanel } from './NotificationsPanel.js';

export function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const tripMatch = useMatch('/trips/:id/*');

  const isTripsHome = location.pathname === '/trips';
  const isEntryRoute = location.pathname.includes('/entries/');
  const isProfile = location.pathname === '/profile';
  const isAdmin = location.pathname === '/admin';

  const showBack =
    !isTripsHome && !isEntryRoute && (!!tripMatch || isProfile || isAdmin);

  const handleBack = useCallback(() => {
    if (isProfile || isAdmin) {
      navigate(-1);
      return;
    }
    if (tripMatch?.params.id) {
      const id = tripMatch.params.id;
      if (location.pathname.endsWith('/settings')) {
        navigate(`/trips/${id}/timeline`);
      } else {
        navigate('/trips');
      }
    }
  }, [isAdmin, isProfile, location.pathname, navigate, tripMatch?.params.id]);

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-40 bg-bg-primary border-b border-caption/10 h-14">
        <div className="max-w-lg mx-auto h-full flex items-center justify-between px-4">
          <div className="flex items-center gap-0 md:gap-1 shrink-0">
            {showBack && (
              <button
                type="button"
                aria-label={t('nav.back')}
                onClick={handleBack}
                className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-body hover:text-heading transition-colors rounded-lg"
              >
                <ChevronLeftIcon width={22} height={22} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              aria-label={t('menu.openMenu')}
              onClick={() => setMenuOpen(true)}
              className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-body hover:text-heading transition-colors rounded-lg ${
                showBack ? 'hidden md:inline-flex' : 'inline-flex'
              }`}
            >
              <HamburgerIcon width={22} height={22} />
            </button>
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center px-2">
            {/* Decorative journal pin icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-accent shrink-0"
              aria-hidden="true"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="font-display text-lg text-heading truncate">{t('app.name')}</span>
          </div>

          <button
            type="button"
            aria-label={t('notifications.openPanel')}
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen(true)}
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-body hover:text-heading transition-colors rounded-lg shrink-0"
          >
            <BellIcon width={22} height={22} aria-hidden="true" />
          </button>
        </div>
      </header>

      <MenuDrawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <NotificationsPanel isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}
