import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Uploads a file via the entry form's file input and waits until the server
 * accepts it and the form shows the expected number of thumbnail slots.
 * Avoids racing on the short-lived "uploading" label alone.
 */
export async function uploadEntryImageAndWaitForSlot(
  page: Page,
  fileInput: Locator,
  file: { name: string; mimeType: string; buffer: Buffer },
  expectedSlotCount: number,
): Promise<void> {
  const uploadDone = page.waitForResponse(
    (res) =>
      res.url().includes('/api/v1/media/upload') &&
      res.request().method() === 'POST' &&
      res.ok(),
  );
  await fileInput.setInputFiles(file);
  await uploadDone;
  await expect(page.locator('[data-key]')).toHaveCount(expectedSlotCount, { timeout: 15_000 });
}
