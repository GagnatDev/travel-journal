import { test, expect, Page } from '@playwright/test';

import { resetCollections } from './helpers/resetCollections.js';

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] ?? 'admin@localhost';
const ADMIN_PASSWORD = 'Securepassword1!';

test.beforeEach(async () => {
  await resetCollections('users', 'sessions', 'trips', 'invites');
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
  const tripIdMatch = page.url().match(/\/trips\/([^/]+)/);
  if (!tripIdMatch) {
    throw new Error(`Expected a /trips/:id URL before opening settings, got: ${page.url()}`);
  }
  await page.goto(`/trips/${tripIdMatch[1]}/settings`);
  await expect(page.getByRole('heading', { name: /trip settings|turinnstillinger/i })).toBeVisible();
}

test.describe('Trip dashboard', () => {
  test('admin creates a trip and it appears under Planned', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');

    await createTrip(page, 'Japan 2025');
    const tripsListLoaded = page.waitForResponse(
      (res) =>
        res.request().method() === 'GET' &&
        new URL(res.url()).pathname === '/api/v1/trips' &&
        res.ok(),
    );
    await page.goto('/trips');
    await tripsListLoaded;

    await expect(page.getByText('Japan 2025')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/planlagte|planned/i)).toBeVisible({ timeout: 20_000 });
  });

  test('follower does not see Create Trip button', async ({ page, context }) => {
    await registerAdmin(page);
    await page.goto('/admin');

    await page.getByRole('button', { name: /invitasjoner|invites/i }).click();
    await page.getByLabel(/e-post|email/i).fill('follower-e2e@localhost');
    await page.getByLabel(/app-rolle|app role/i).selectOption('follower');
    await page.getByRole('button', { name: /opprett invitasjon|create invite/i }).click();

    const inputs = page.locator('input[readonly]');
    await expect(inputs.first()).toBeVisible({ timeout: 10_000 });
    let inviteLink = '';
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const val = await inputs.nth(i).inputValue();
      if (val.includes('/invite/accept')) {
        inviteLink = val;
        break;
      }
    }
    expect(inviteLink).toContain('/invite/accept');

    const followerPage = await context.newPage();
    await followerPage.goto(inviteLink);
    await followerPage.getByLabel(/visningsnavn|display name/i).fill('Follower E2E');
    await followerPage.getByLabel(/passord|password/i).fill('Followerpass1!');
    await followerPage.getByRole('button', { name: /opprett konto|create account/i }).click();
    await followerPage.waitForURL('**/trips');

    await followerPage.goto('/trips');
    await expect(
      followerPage.getByRole('button', { name: /opprett tur|create trip/i }),
    ).toHaveCount(0);
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
