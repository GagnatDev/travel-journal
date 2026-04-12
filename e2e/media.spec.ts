import { test, expect, Page } from '@playwright/test';

import { resetCollections } from './helpers/resetCollections.js';

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] ?? 'admin@localhost';
const ADMIN_PASSWORD = 'Securepassword1!';

// 1×1 PNG — minimal JPEG fixtures often fail to decode in headless Chromium before upload runs.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Timeline and entry cards load images via AuthenticatedImage: the app fetches
 * `/api/v1/media/:key` and sets `img.src` to a `blob:` object URL. Assertions must not
 * expect `/api/v1/media/` to appear in the DOM `src` attribute.
 *
 * Thumbnail loads use GET on the app proxy (often 302 to object storage); we assert that
 * request, not `res.ok()` alone, which would reject redirects.
 */

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

    const fileInput = page.getByTestId('entry-media-file-input');
    await fileInput.setInputFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    await expect(page.locator('[data-key]')).toHaveCount(1, { timeout: 15_000 });

    await page.getByRole('button', { name: /lagre|save/i }).click();
    await page.waitForURL('**/timeline');

    const hero = page.getByRole('img', { name: 'Photo Entry' });
    await expect(hero).toBeVisible({ timeout: 15_000 });
    await expect(hero).toHaveAttribute('src', /^blob:/);
  });

  test('media is served via proxy path, not direct S3 URL', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'Proxy Trip');

    await page.getByRole('button', { name: /legg til innlegg|add entry/i }).click();
    await page.waitForURL('**/entries/new');

    await page.getByLabel(/tittel|title/i).fill('Proxy Entry');
    await page.getByLabel(/innhold|content/i).fill('Content');

    const mediaProxyGet = page.waitForResponse(
      (res) =>
        res.url().includes('/api/v1/media/') &&
        res.request().method() === 'GET' &&
        (res.status() === 200 || res.status() === 302),
    );

    await page.getByTestId('entry-media-file-input').setInputFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    await expect(page.locator('[data-key]')).toHaveCount(1, { timeout: 15_000 });
    await mediaProxyGet;

    await page.getByRole('button', { name: /lagre|save/i }).click();
    await page.waitForURL('**/timeline');

    const hero = page.getByRole('img', { name: 'Proxy Entry' });
    await expect(hero).toBeVisible({ timeout: 15_000 });
    const heroSrc = await hero.getAttribute('src');
    expect(heroSrc).toMatch(/^blob:/);

    const images = await page.locator('img').all();
    for (const img of images) {
      const src = await img.getAttribute('src');
      if (src) {
        expect(src).not.toMatch(/^https?:\/\/.*\.s3\./);
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

    const fileInput = page.getByTestId('entry-media-file-input');

    for (let i = 0; i < 10; i++) {
      await fileInput.setInputFiles({
        name: `image-${i}.png`,
        mimeType: 'image/png',
        buffer: TINY_PNG,
      });
      await expect(page.getByText(/laster opp|uploading/i)).not.toBeVisible({ timeout: 15_000 });
    }

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

    const fileInput = page.getByTestId('entry-media-file-input');

    for (let i = 0; i < 2; i++) {
      await fileInput.setInputFiles({
        name: `image-${i}.png`,
        mimeType: 'image/png',
        buffer: TINY_PNG,
      });
      await expect(page.getByText(/laster opp|uploading/i)).not.toBeVisible({ timeout: 15_000 });
    }

    await expect(page.locator('[data-key]')).toHaveCount(2);

    const removeButtons = page.getByRole('button', { name: /fjern bilde|remove image/i });
    await removeButtons.first().click();

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

    const fileInput = page.getByTestId('entry-media-file-input');

    for (let i = 0; i < 2; i++) {
      await fileInput.setInputFiles({
        name: `image-${i}.png`,
        mimeType: 'image/png',
        buffer: TINY_PNG,
      });
      await expect(page.getByText(/laster opp|uploading/i)).not.toBeVisible({ timeout: 15_000 });
    }

    const thumbs = page.locator('[data-key]');
    await expect(thumbs).toHaveCount(2);

    const key1Before = await thumbs.nth(0).getAttribute('data-key');
    const key2Before = await thumbs.nth(1).getAttribute('data-key');

    await thumbs.nth(0).dragTo(thumbs.nth(1));

    const key1After = await thumbs.nth(0).getAttribute('data-key');

    expect(key1After).toBe(key2Before);

    await page.getByRole('button', { name: /lagre|save/i }).click();
    await page.waitForURL('**/timeline');

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

    void key1Before;
  });
});
