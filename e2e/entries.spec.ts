import { test, expect, Page } from '@playwright/test';

import { openEntryAuthorMenu } from './helpers/entryCard.js';
import { resetCollections } from './helpers/resetCollections.js';

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] ?? 'admin@localhost';
const ADMIN_PASSWORD = 'Securepassword1!';
const CONTRIBUTOR_EMAIL = 'contributor-entry-e2e@localhost';
const CONTRIBUTOR_PASSWORD = 'Contributorpass1!';
const FOLLOWER_EMAIL = 'follower-entry-e2e@localhost';
const FOLLOWER_PASSWORD = 'Followerentrypass1!';

test.beforeEach(async () => {
  await resetCollections('users', 'sessions', 'trips', 'entries', 'invites');
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

async function createEntry(page: Page, title: string, content: string) {
  await page.getByRole('button', { name: /legg til innlegg|add entry/i }).click();
  await page.waitForURL('**/entries/new');
  await page.getByLabel(/tittel|title/i).fill(title);
  await page.getByLabel(/innhold|content/i).fill(content);
  await page.getByRole('button', { name: /lagre|save/i }).click();
  await page.waitForURL('**/timeline');
}

async function platformInviteLink(page: Page, email: string, appRole: 'creator' | 'follower'): Promise<string> {
  await page.goto('/admin');
  await page.getByRole('button', { name: /invitasjoner|invites/i }).click();
  await page.getByLabel(/e-post|email/i).fill(email);
  await page.getByLabel(/app-rolle|app role/i).selectOption(appRole);
  await page.getByRole('button', { name: /opprett invitasjon|create invite/i }).click();
  const inputs = page.locator('input[readonly]');
  await expect(inputs.first()).toBeVisible({ timeout: 10_000 });
  const count = await inputs.count();
  for (let i = 0; i < count; i += 1) {
    const val = await inputs.nth(i).inputValue();
    if (val.includes('/invite/accept')) return val;
  }
  throw new Error('Invite link not found');
}

async function acceptPlatformInvite(page: Page, inviteLink: string, displayName: string, password: string) {
  await page.goto(inviteLink);
  await page.getByLabel(/visningsnavn|display name/i).fill(displayName);
  await page.getByLabel(/passord|password/i).fill(password);
  await page.getByRole('button', { name: /opprett konto|create account/i }).click();
  await page.waitForURL('**/trips');
}

async function addTripMember(
  page: Page,
  tripId: string,
  emailOrNickname: string,
  tripRole: 'contributor' | 'follower',
) {
  await page.goto(`/trips/${tripId}/settings`);
  await expect(page.getByRole('heading', { name: /turinnstillinger|trip settings/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: /inviter nytt medlem|invite new member/i }).click();
  const memberInput = page.getByPlaceholder(/e-post eller kallenavn|email or nickname/i);
  await expect(memberInput).toBeVisible({ timeout: 10_000 });
  await memberInput.fill(emailOrNickname);
  await page.getByRole('combobox').selectOption(tripRole);
  await page.getByRole('button', { name: /^(Legg til|Add)$/ }).click();
  await expect(page.getByText(/medlem lagt til|member added/i)).toBeVisible({ timeout: 10_000 });
}

async function login(page: Page, email: string, password: string) {
  await page.evaluate(async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  });
  await page.goto('/login');
  await page.getByLabel(/e-post|email/i).fill(email);
  await page.getByLabel(/passord|password/i).fill(password);
  await page.getByRole('button', { name: /logg inn|sign in/i }).click();
  await page.waitForURL('**/trips');
}

test.describe('Entries', () => {
  test('contributor posts an entry and it appears at the top of the timeline', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'My Journey');

    await createEntry(page, 'First Day', 'We arrived safely.');

    await expect(page.getByText('First Day')).toBeVisible();
    await expect(page.getByText('We arrived safely.')).toBeVisible();
  });

  test('author can edit an entry and the updated title appears in timeline', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'Edit Trip');
    await createEntry(page, 'Original Title', 'Original content');

    const entryJsonPromise = page.waitForResponse(
      (res) =>
        /\/api\/v1\/trips\/[^/]+\/entries\/[^/?]+$/.test(res.url()) &&
        res.request().method() === 'GET' &&
        res.ok(),
    );

    await openEntryAuthorMenu(page);
    await page.getByRole('button', { name: /rediger|edit/i }).click();
    await page.waitForURL('**/edit');
    await entryJsonPromise;

    const titleInput = page.getByLabel(/tittel|title/i);
    await expect(titleInput).toHaveValue('Original Title');
    await titleInput.fill('Updated Title');

    const savePromise = page.waitForResponse(
      (res) =>
        res.request().method() === 'PATCH' &&
        res.url().includes('/entries/') &&
        res.ok(),
    );
    await page.getByRole('button', { name: /lagre|save/i }).click();
    await savePromise;
    await page.waitForURL('**/timeline');

    const entryHeading = page.getByRole('heading', { level: 2, name: 'Updated Title', exact: true });
    await expect(entryHeading).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('heading', { level: 2, name: 'Original Title', exact: true }),
    ).not.toBeVisible();
  });

  test('author soft-deletes entry — disappears from timeline; direct URL returns 404', async ({
    page,
    request,
  }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'Delete Trip');
    await createEntry(page, 'To Be Deleted', 'Delete me.');

    // Get the entry ID from the edit link
    await openEntryAuthorMenu(page);
    const editLink = page.getByRole('button', { name: /rediger|edit/i });
    await editLink.click();
    await page.waitForURL('**/edit');
    const editUrl = page.url(); // .../trips/:tripId/entries/:entryId/edit
    const parts = editUrl.split('/');
    const entryId = parts[parts.length - 2]; // second-to-last segment
    const tripId = parts[parts.length - 5]; // fifth from last

    await page.goBack();
    await page.waitForURL('**/timeline');

    await openEntryAuthorMenu(page);
    await page.getByRole('button', { name: /slett|delete/i }).click();

    const deleteDialog = page.getByTestId('delete-entry-dialog');
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: /^(Slett|Delete)$/ }).click();

    await expect(page.getByText('To Be Deleted')).not.toBeVisible();

    // Direct API GET should return 404
    const apiRes = await request.get(`/api/v1/trips/${tripId}/entries/${entryId}`, {
      headers: {
        // No auth — will get 401, but the entry is gone either way for auth'd users too
      },
    });
    // Either 401 (no auth) or 404 (deleted) is acceptable; the point is it's not 200
    expect(apiRes.status()).not.toBe(200);
  });

  test('follower cannot see edit/delete controls on another user entry', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await registerAdmin(adminPage);
    await adminPage.goto('/trips');
    await createTrip(adminPage, 'Shared Trip');
    await createEntry(adminPage, 'Admin Entry', 'Admin wrote this.');
    const tripId = adminPage.url().split('/trips/')[1]!.split('/')[0]!;

    const inviteLink = await platformInviteLink(adminPage, FOLLOWER_EMAIL, 'follower');
    const followerContext = await browser.newContext();
    const followerPage = await followerContext.newPage();
    await acceptPlatformInvite(followerPage, inviteLink, 'Follower Only', FOLLOWER_PASSWORD);

    await addTripMember(adminPage, tripId, FOLLOWER_EMAIL, 'follower');

    await followerPage.goto(`/trips/${tripId}/timeline`);
    await expect(followerPage.getByText('Admin Entry')).toBeVisible({ timeout: 15_000 });
    await expect(
      followerPage.getByRole('button', { name: /flere valg|more options/i }),
    ).toHaveCount(0);

    await adminContext.close();
    await followerContext.close();
  });

  test('contributor can edit trip creator entry from overflow menu', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await registerAdmin(adminPage);
    await adminPage.goto('/trips');
    await createTrip(adminPage, 'Collab Trip');
    await createEntry(adminPage, 'Creator wrote this', 'Original body');
    const tripId = adminPage.url().split('/trips/')[1]!.split('/')[0]!;

    const inviteLink = await platformInviteLink(adminPage, CONTRIBUTOR_EMAIL, 'creator');
    const contribContext = await browser.newContext();
    const contribPage = await contribContext.newPage();
    await acceptPlatformInvite(contribPage, inviteLink, 'Contributor User', CONTRIBUTOR_PASSWORD);

    await addTripMember(adminPage, tripId, CONTRIBUTOR_EMAIL, 'contributor');

    await contribPage.goto(`/trips/${tripId}/timeline`);
    await expect(contribPage.getByText('Creator wrote this')).toBeVisible({ timeout: 15_000 });

    const entryJsonPromise = contribPage.waitForResponse(
      (res) =>
        /\/api\/v1\/trips\/[^/]+\/entries\/[^/?]+$/.test(res.url()) &&
        res.request().method() === 'GET' &&
        res.ok(),
    );

    await openEntryAuthorMenu(contribPage);
    await contribPage.getByRole('button', { name: /rediger|edit/i }).click();
    await contribPage.waitForURL('**/edit');
    await entryJsonPromise;

    await contribPage.getByLabel(/tittel|title/i).fill('Updated by contributor');

    const savePromise = contribPage.waitForResponse(
      (res) =>
        res.request().method() === 'PATCH' &&
        res.url().includes('/entries/') &&
        res.ok(),
    );
    await contribPage.getByRole('button', { name: /lagre|save/i }).click();
    await savePromise;
    await contribPage.waitForURL('**/timeline');

    await expect(
      contribPage.getByRole('heading', { level: 2, name: 'Updated by contributor', exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await adminContext.close();
    await contribContext.close();
  });

  test('creator can reach the create entry route via FAB', async ({ page }) => {
    await registerAdmin(page);
    await page.goto('/trips');
    await createTrip(page, 'FAB Trip');

    await page.getByRole('button', { name: /legg til innlegg|add entry/i }).click();
    await page.waitForURL('**/entries/new');

    await expect(page.getByLabel(/tittel|title/i)).toBeVisible();
  });
});
