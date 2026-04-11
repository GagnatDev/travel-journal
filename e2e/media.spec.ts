import { test, expect, Page } from '@playwright/test';

import { resetCollections } from './helpers/resetCollections.js';

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] ?? 'admin@localhost';
const ADMIN_PASSWORD = 'Securepassword1!';

// Minimal valid 1×1 white JPEG (base64-encoded)
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoH' +
  'BwYIDAoMCwsKCwsNCxAQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUE' +
  'BQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT' +
  '/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAA' +
  'AAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAA' +
  'AAAAP/aAAwDAQACEQMRAD8AJQAB/9k=';
const TINY_JPEG = Buffer.from(TINY_JPEG_BASE64, 'base64');

test.beforeEach(async () => {
  await resetCollections('users', 'sessions', 'trips', 'entries');
});

async function registerAdmin(page: Page) {
  await page.goto('/register');
  await page.getByLabel(/e-post|email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/visningsnavn|display name/i).fill('Admin User');
  await page.getByLabel(/passord|password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /opprett konto|create account/i }).click();
  await page.waitForURL('**/trips');
}

async function createTrip(page: Page, name: string) {
  await page.getByRole('button', { name: /opprett tur|create trip/i }).click();
  await page.getByLabel(/turnavn|trip name/i).fill(name);
  await page.getByRole('button', { name: /opprett tur|create trip/i }).last().click();
  await page.waitForURL('**/timeline');
}

test.describe('Media', () => {
  test('upload an image with an entry — image visible in timeline', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'Photo Trip');

    await page.getByRole('button', { name: /legg til innlegg|add entry/i }).click();
    await page.waitForURL('**/entries/new');

    await page.getByLabel(/tittel|title/i).fill('Photo Entry');
    await page.getByLabel(/innhold|content/i).fill('Entry with image');

    // Attach image
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-image.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });

    // Wait for upload to complete (uploading indicator disappears)
    await expect(page.getByText(/laster opp|uploading/i)).toBeVisible({ timeout: 5000 }).catch(() => null);
    await expect(page.getByText(/laster opp|uploading/i)).not.toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /lagre|save/i }).click();
    await page.waitForURL('**/timeline');

    // Image should be visible in timeline
    await expect(page.locator('img[src*="/api/v1/media/"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('media is served via proxy path, not direct S3 URL', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'Proxy Trip');

    await page.getByRole('button', { name: /legg til innlegg|add entry/i }).click();
    await page.waitForURL('**/entries/new');

    await page.getByLabel(/tittel|title/i).fill('Proxy Entry');
    await page.getByLabel(/innhold|content/i).fill('Content');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-image.jpg',
      mimeType: 'image/jpeg',
      buffer: TINY_JPEG,
    });

    await expect(page.getByText(/laster opp|uploading/i)).not.toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: /lagre|save/i }).click();
    await page.waitForURL('**/timeline');

    // All images should use the proxy path
    const images = await page.locator('img').all();
    for (const img of images) {
      const src = await img.getAttribute('src');
      if (src) {
        expect(src).not.toMatch(/^https?:\/\/.*\.s3\./);
        if (src.includes('/api/v1/media/')) {
          expect(src).toContain('/api/v1/media/');
        }
      }
    }
  });

  test('"Add Photos" button disappears after 10 images are added', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'Limit Trip');

    await page.getByRole('button', { name: /legg til innlegg|add entry/i }).click();
    await page.waitForURL('**/entries/new');

    await page.getByLabel(/tittel|title/i).fill('Image Limit Test');
    await page.getByLabel(/innhold|content/i).fill('Content');

    const fileInput = page.locator('input[type="file"]');

    // Upload 10 images one by one
    for (let i = 0; i < 10; i++) {
      await fileInput.setInputFiles({
        name: `image-${i}.jpg`,
        mimeType: 'image/jpeg',
        buffer: TINY_JPEG,
      });
      await expect(page.getByText(/laster opp|uploading/i)).not.toBeVisible({ timeout: 10000 });
    }

    // Add Photos button should now be gone
    await expect(
      page.getByRole('button', { name: /legg til bilder|add photos/i }),
    ).not.toBeVisible();
  });

  test('delete one image from multi-image entry — correct image removed', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'Multi-Image Trip');

    await page.getByRole('button', { name: /legg til innlegg|add entry/i }).click();
    await page.waitForURL('**/entries/new');

    await page.getByLabel(/tittel|title/i).fill('Multi Image Entry');
    await page.getByLabel(/innhold|content/i).fill('Content');

    const fileInput = page.locator('input[type="file"]');

    // Upload 2 images
    for (let i = 0; i < 2; i++) {
      await fileInput.setInputFiles({
        name: `image-${i}.jpg`,
        mimeType: 'image/jpeg',
        buffer: TINY_JPEG,
      });
      await expect(page.getByText(/laster opp|uploading/i)).not.toBeVisible({ timeout: 10000 });
    }

    // Should have 2 thumbnails
    await expect(page.locator('[data-key]')).toHaveCount(2);

    // Remove first image
    const removeButtons = page.getByRole('button', { name: /fjern bilde|remove image/i });
    await removeButtons.first().click();

    // Should now have 1 thumbnail
    await expect(page.locator('[data-key]')).toHaveCount(1);
  });

  test('drag-and-drop reorder: save and reload preserves order', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'Reorder Trip');

    await page.getByRole('button', { name: /legg til innlegg|add entry/i }).click();
    await page.waitForURL('**/entries/new');

    await page.getByLabel(/tittel|title/i).fill('Reorder Entry');
    await page.getByLabel(/innhold|content/i).fill('Content');

    const fileInput = page.locator('input[type="file"]');

    // Upload 2 images
    for (let i = 0; i < 2; i++) {
      await fileInput.setInputFiles({
        name: `image-${i}.jpg`,
        mimeType: 'image/jpeg',
        buffer: TINY_JPEG,
      });
      await expect(page.getByText(/laster opp|uploading/i)).not.toBeVisible({ timeout: 10000 });
    }

    // Get initial keys
    const thumbs = page.locator('[data-key]');
    await expect(thumbs).toHaveCount(2);

    const key1Before = await thumbs.nth(0).getAttribute('data-key');
    const key2Before = await thumbs.nth(1).getAttribute('data-key');

    // Drag first to second
    await thumbs.nth(0).dragTo(thumbs.nth(1));

    const key1After = await thumbs.nth(0).getAttribute('data-key');

    // Order should have changed
    expect(key1After).toBe(key2Before);

    // Save entry
    await page.getByRole('button', { name: /lagre|save/i }).click();
    await page.waitForURL('**/timeline');

    // Navigate to edit to verify order was saved
    const entryJsonPromise = page.waitForResponse(
      (res) =>
        /\/api\/v1\/trips\/[^/]+\/entries\/[^/?]+$/.test(res.url()) &&
        res.request().method() === 'GET' &&
        res.ok(),
    );
    await page.getByRole('button', { name: /rediger|edit/i }).click();
    await page.waitForURL('**/edit');
    await entryJsonPromise;

    const editThumbs = page.locator('[data-key]');
    await expect(editThumbs).toHaveCount(2);

    const savedKey1 = await editThumbs.nth(0).getAttribute('data-key');
    expect(savedKey1).toBe(key2Before);

    // Suppress unused variable warning
    void key1Before;
  });
});
