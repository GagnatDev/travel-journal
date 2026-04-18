import { test, expect, Page } from '@playwright/test';

import { resetCollections } from './helpers/resetCollections.js';

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] ?? 'admin@localhost';
const ADMIN_PASSWORD = 'Securepassword1!';

test.beforeEach(async () => {
  await resetCollections('users', 'sessions');
});

async function registerAdmin(page: Page) {
  await page.goto('/register');
  await page.getByLabel(/e-post|email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/visningsnavn|display name/i).fill('Admin User');
  await page.getByLabel(/passord|password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /opprett konto|create account/i }).click();
  await page.waitForURL('**/trips');
}

test.describe('Admin bootstrap', () => {
  test('admin can register and lands on /trips', async ({ page }) => {
    await registerAdmin(page);
    expect(page.url()).toContain('/trips');
  });

  test('/register stays available without probing admin existence (bootstrap POST still returns 403)', async ({
    page,
  }) => {
    await registerAdmin(page);

    const page2 = await page.context().newPage();
    await page2.goto('/register');
    await expect(page2.getByLabel(/e-post|email/i)).toBeVisible();

    await page2.getByLabel(/e-post|email/i).fill(ADMIN_EMAIL);
    await page2.getByLabel(/visningsnavn|display name/i).fill('Other');
    await page2.getByLabel(/passord|password/i).fill(ADMIN_PASSWORD);
    await page2.getByRole('button', { name: /opprett konto|create account/i }).click();

    await expect(page2.getByRole('alert')).toBeVisible();
  });
});

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await registerAdmin(page);
    // Log out first
    await page.evaluate(async () => {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    });
  });

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-post|email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/passord|password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /logg inn|sign in/i }).click();

    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('correct credentials redirect to /trips', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/e-post|email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/passord|password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /logg inn|sign in/i }).click();

    await page.waitForURL('**/trips');
    expect(page.url()).toContain('/trips');
  });
});

test.describe('Logout & session', () => {
  test('after logout, protected route redirects to /login', async ({ page }) => {
    await registerAdmin(page);

    // Logout via API
    await page.evaluate(async () => {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    });

    // Cookie is cleared server-side; reload so auth bootstrap does not reuse in-memory access token.
    await page.reload();

    await page.goto('/trips');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('reloading with valid cookie skips login screen', async ({ page }) => {
    await registerAdmin(page);

    // Reload the page — should stay on /trips thanks to auto-refresh
    await page.reload();
    await page.waitForURL('**/trips');
    expect(page.url()).toContain('/trips');
  });
});
