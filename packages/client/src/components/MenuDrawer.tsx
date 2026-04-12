import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../context/ThemeContext.js';
import { useAuth } from '../context/AuthContext.js';
import { ToggleSwitch } from './ui/ToggleSwitch.js';

interface MenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MenuDrawer({ isOpen, onClose }: MenuDrawerProps) {
  const { t, i18n } = useTranslation();
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();

  const currentLang = i18n.language.startsWith('en') ? 'en' : 'nb';

  const handleLanguageToggle = async () => {
    const nextLang = currentLang === 'nb' ? 'en' : 'nb';
    await i18n.changeLanguage(nextLang);
    localStorage.setItem('preferredLocale', nextLang);
  };

  const handleProfileClick = () => {
    navigate('/profile');
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('menu.profile')}
        className={`fixed top-0 left-0 z-50 h-full w-72 max-w-[80vw] bg-bg-primary border-r border-caption/10 shadow-xl flex flex-col transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-caption/10 shrink-0">
          {user && (
            <span className="font-ui text-sm text-body truncate">{user.displayName}</span>
          )}
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="ml-auto text-caption hover:text-body transition-colors p-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Menu items */}
        <div className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {/* Theme toggle */}
          <ToggleSwitch
            id="menu-theme-toggle"
            checked={isDark}
            onChange={toggleTheme}
            label={t('menu.theme')}
          />

          {/* Language toggle */}
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="font-ui text-sm text-body">{t('menu.language')}</span>
            <button
              type="button"
              onClick={handleLanguageToggle}
              className="font-ui text-sm text-accent hover:text-heading transition-colors"
              aria-label={`Switch to ${currentLang === 'nb' ? t('language.en') : t('language.nb')}`}
            >
              {currentLang === 'nb' ? t('language.en') : t('language.nb')}
            </button>
          </div>

          <hr className="border-caption/10 my-2" />

          {/* Profile link */}
          <button
            type="button"
            onClick={handleProfileClick}
            className="w-full text-left font-ui text-sm text-body hover:text-heading transition-colors py-2"
          >
            {t('menu.profile')}
          </button>
        </div>
      </div>
    </>
  );
}
