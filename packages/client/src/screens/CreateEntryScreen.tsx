import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { CreateEntryForm } from './createEntry/CreateEntryForm.js';
import { useCreateEntryScreen } from './createEntry/useCreateEntryScreen.js';

export function CreateEntryScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const form = useCreateEntryScreen();
  const isEditing = form.isServerEdit || form.isPendingEdit;

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary flex flex-col">
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-caption/10">
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={() => navigate(-1)}
          className="font-ui text-xl text-body hover:text-heading transition-colors leading-none"
        >
          ×
        </button>
        <span className="font-ui font-semibold text-heading">
          {isEditing ? t('entries.editTitle') : t('entries.newTitle')}
        </span>
        <span className="w-6" aria-hidden="true" />
      </header>
      <div className="flex-1 overflow-y-auto">
        <CreateEntryForm {...form} />
      </div>
    </div>
  );
}
