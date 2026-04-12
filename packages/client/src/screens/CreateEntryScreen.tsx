import { useTranslation } from 'react-i18next';

import { EntryFormBody } from './createEntry/EntryFormBody.js';
import { useCreateEntryScreen } from './createEntry/useCreateEntryScreen.js';

export function CreateEntryScreen() {
  const { t } = useTranslation();
  const form = useCreateEntryScreen();

  return (
    <div className="min-h-screen bg-bg-primary pb-8">
      <header className="px-4 pt-8 pb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl text-heading">
          {form.isServerEdit || form.isPendingEdit ? t('entries.editTitle') : t('entries.newTitle')}
        </h1>
      </header>

      <EntryFormBody {...form} />
    </div>
  );
}
