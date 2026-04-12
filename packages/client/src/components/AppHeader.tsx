import { BellIcon, HamburgerIcon } from './icons/index.js';

export function AppHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-40 bg-bg-primary border-b border-caption/10 h-14">
      <div className="max-w-lg mx-auto h-full flex items-center justify-between px-4">
        <button
          type="button"
          aria-label="Open menu"
          className="text-body hover:text-heading transition-colors p-1"
        >
          <HamburgerIcon width={22} height={22} />
        </button>

        <div className="flex items-center gap-2">
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
            className="text-accent"
            aria-hidden="true"
          >
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <span className="font-display text-lg text-heading">The Digital Keepsake</span>
        </div>

        <button
          type="button"
          aria-label="Notifications"
          className="text-body hover:text-heading transition-colors p-1"
        >
          <BellIcon width={22} height={22} />
        </button>
      </div>
    </header>
  );
}
