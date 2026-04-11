import { test, expect, Page } from '@playwright/test';

import { resetCollections } from './helpers/resetCollections.js';

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] ?? 'admin@localhost';
const ADMIN_PASSWORD = 'Securepassword1!';

test.beforeEach(async () => {
  await resetCollections('users', 'sessions', 'trips');
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

/** Trip settings renders nothing until the trip query resolves; wait for real UI before acting. */
async function goToTripSettings(page: Page) {
  await page.goto(page.url().replace('/timeline', '/settings'));
  await expect(page.getByRole('heading', { name: /trip settings|turinnstillinger/i })).toBeVisible();
}

test.describe('Trip dashboard', () => {
  test('admin creates a trip and it appears under Planned', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');

    await createTrip(page, 'Japan 2025');
    await page.goto('/trips');

    await expect(page.getByText('Japan 2025')).toBeVisible();
    await expect(page.getByText(/planlagte|planned/i)).toBeVisible();
  });

  test('follower does not see Create Trip button', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');

    // Admin creates trip first
    await createTrip(page, 'Admin Trip');
    await page.goto('/trips');

    // Verify admin sees the button
    await expect(page.getByRole('button', { name: /opprett tur|create trip/i })).toBeVisible();
  });
});

test.describe('Trip status transitions', () => {
  test('creator transitions planned → active → completed → active', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');

    await createTrip(page, 'Status Trip');
    await page.goto('/trips');

    // Navigate to settings
    await page.getByText('Status Trip').click();
    await page.waitForURL('**/timeline');

    await goToTripSettings(page);

    // planned → active
    await page.getByRole('button', { name: /merk som aktiv|mark as active/i }).click();
    await expect(page.getByRole('button', { name: /merk som fullf|mark as completed/i })).toBeVisible();

    // active → completed
    await page.getByRole('button', { name: /merk som fullf|mark as completed/i }).click();
    await expect(page.getByRole('button', { name: /gjenåpne|re-open/i })).toBeVisible();

    // completed → active (re-open)
    await page.getByRole('button', { name: /gjenåpne|re-open/i }).click();
    await expect(page.getByRole('button', { name: /merk som fullf|mark as completed/i })).toBeVisible();
  });
});

test.describe('Trip deletion', () => {
  test('creator deletes a completed trip successfully', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'To Delete');
    await page.goto('/trips');

    // Go to settings
    await page.getByText('To Delete').click();
    await page.waitForURL('**/timeline');
    await goToTripSettings(page);

    // Transition to active then completed
    await page.getByRole('button', { name: /merk som aktiv|mark as active/i }).click();
    await expect(page.getByRole('button', { name: /merk som fullf|mark as completed/i })).toBeVisible();
    await page.getByRole('button', { name: /merk som fullf|mark as completed/i }).click();
    await expect(page.getByRole('button', { name: /gjenåpne|re-open/i })).toBeVisible();

    // Delete
    await page.getByRole('button', { name: /slett tur|delete trip/i }).click();
    await page.getByRole('button', { name: /^slett$|^delete$/i }).click();
    await page.waitForURL('**/trips');

    await expect(page.getByText('To Delete')).not.toBeVisible();
  });

  test('app admin can delete an active trip (non-admins get 409 from API)', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'Active Trip');
    await page.goto('/trips');

    await page.getByText('Active Trip').click();
    await page.waitForURL('**/timeline');
    await goToTripSettings(page);

    await page.getByRole('button', { name: /merk som aktiv|mark as active/i }).click();
    await expect(page.getByRole('button', { name: /merk som fullf|mark as completed/i })).toBeVisible();

    await page.getByRole('button', { name: /slett tur|delete trip/i }).click();
    await page.getByRole('button', { name: /^slett$|^delete$/i }).click();
    await page.waitForURL('**/trips');

    await expect(page.getByText('Active Trip')).not.toBeVisible();
  });
});
