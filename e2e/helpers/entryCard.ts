import type { Page } from '@playwright/test';

/** Edit/Delete live in the entry card overflow menu (⋯). */
export async function openEntryAuthorMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /flere valg|more options/i }).click();
}
