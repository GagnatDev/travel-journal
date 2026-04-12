import type { TFunction } from 'i18next';

interface StoryModeToggleProps {
  storyMode: boolean;
  onToggle: () => void;
  t: TFunction;
}

export function StoryModeToggle({ storyMode, onToggle, t }: StoryModeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={t('storyMode.toggle')}
      aria-pressed={storyMode}
      data-testid="story-mode-toggle"
      className={`p-2 rounded-full transition-colors ${
        storyMode ? 'bg-accent/10 text-accent' : 'text-caption hover:text-heading'
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    </button>
  );
}
