import { test, expect, Page } from '@playwright/test';

import { resetCollections } from './helpers/resetCollections.js';

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'] ?? 'admin@localhost';
const ADMIN_PASSWORD = 'Securepassword1!';
const FOLLOWER_EMAIL = 'follower@test.com';
const FOLLOWER_PASSWORD = 'followerpass123';

test.describe('Notification inbox', () => {
  test.beforeEach(async () => {
    await resetCollections(
      'users',
      'sessions',
      'trips',
      'entries',
      'invites',
      'notifications',
      'pushsubscriptions',
    );
  });

  async function registerAdmin(page: Page) {
    await page.goto('/register');
    await page.getByLabel(/e-post|email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/visningsnavn|display name/i).fill('Ada Admin');
    await page.getByLabel(/passord|password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /opprett konto|create account/i }).click();
    await page.waitForURL('**/trips');
  }

  async function createTripOnTimeline(page: Page, name: string): Promise<string> {
    await page.goto('/trips');
    await page.getByRole('button', { name: /opprett tur|create trip/i }).click();
    await page.getByLabel(/turnavn|trip name/i).fill(name);
    await page.getByRole('button', { name: /opprett tur|create trip/i }).last().click();
    await page.waitForURL('**/timeline');
    const url = page.url();
    return url.split('/trips/')[1]!.split('/')[0]!;
  }

  async function inviteFollowerToPlatform(page: Page): Promise<string> {
    await page.goto('/admin');
    await page.getByRole('button', { name: /invitasjoner|invites/i }).click();
    await page.getByLabel(/e-post|email/i).fill(FOLLOWER_EMAIL);
    await page.getByLabel(/app-rolle|app role/i).selectOption('follower');
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

  async function acceptInvite(page: Page, inviteLink: string): Promise<void> {
    await page.goto(inviteLink);
    await page.getByLabel(/visningsnavn|display name/i).fill('Felix Follower');
    await page.getByLabel(/passord|password/i).fill(FOLLOWER_PASSWORD);
    await page.getByRole('button', { name: /opprett konto|create account/i }).click();
    await page.waitForURL('**/trips');
  }

  async function addFollowerToTrip(page: Page, tripId: string): Promise<void> {
    await page.goto(`/trips/${tripId}/settings`);
    await expect(
      page.getByRole('heading', { name: /turinnstillinger|trip settings/i }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /inviter nytt medlem|invite new member/i }).click();
    const memberInput = page.getByPlaceholder(/e-post eller kallenavn|email or nickname/i);
    await expect(memberInput).toBeVisible({ timeout: 10_000 });
    await memberInput.fill(FOLLOWER_EMAIL);
    await page.getByRole('button', { name: /^(Legg til|Add)$/ }).click();
    await expect(page.getByText(/medlem lagt til|member added/i)).toBeVisible({
      timeout: 10_000,
    });
  }

  async function createEntryOnTrip(page: Page, tripId: string, title: string): Promise<void> {
    await page.goto(`/trips/${tripId}/timeline`);
    await page.getByRole('button', { name: /legg til innlegg|add entry/i }).click();
    await page.waitForURL('**/entries/new');
    await page.getByLabel(/tittel|title/i).fill(title);
    await page.getByLabel(/innhold|content/i).fill('What a day.');
    await page.getByRole('button', { name: /lagre|save/i }).click();
    await page.waitForURL('**/timeline');
  }

  test('follower receives inbox notification when admin posts an entry, navigates and dismisses it', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await registerAdmin(adminPage);

    const tripId = await createTripOnTimeline(adminPage, 'Arctic Circle');

    const inviteLink = await inviteFollowerToPlatform(adminPage);

    const followerContext = await browser.newContext();
    const followerPage = await followerContext.newPage();
    await acceptInvite(followerPage, inviteLink);

    await addFollowerToTrip(adminPage, tripId);

    const bell = followerPage.getByTestId('notifications-bell');
    await expect(bell).toBeVisible();
    await expect(followerPage.getByTestId('notifications-badge')).toHaveCount(0);

    await createEntryOnTrip(adminPage, tripId, 'Midnight Sun');

    // A reload (or focus) refetches the inbox query.
    await followerPage.reload();

    const badge = followerPage.getByTestId('notifications-badge');
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveText('1');

    await bell.click();
    await expect(followerPage.getByTestId('notifications-list')).toBeVisible();
    await expect(
      followerPage.getByText(/Ada Admin la til et nytt innlegg/),
    ).toBeVisible();
    await expect(followerPage.getByText('Midnight Sun · Arctic Circle')).toBeVisible();

    // Activate the item — should navigate to the timeline with the entry highlighted
    // and dismiss the notification (no unread badge afterwards).
    await followerPage.getByText(/Ada Admin la til et nytt innlegg/).click();
    await followerPage.waitForURL(/\/trips\/.+\/timeline/);
    await expect(
      followerPage.getByRole('heading', { level: 2, name: 'Midnight Sun', exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(followerPage.getByTestId('notifications-badge')).toHaveCount(0, {
      timeout: 10_000,
    });

    await bell.click();
    await expect(followerPage.getByTestId('notifications-empty')).toBeVisible({
      timeout: 10_000,
    });

    await adminContext.close();
    await followerContext.close();
  });

  test('follower who switches the trip notification mode to off does not get notified', async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await registerAdmin(adminPage);

    const tripId = await createTripOnTimeline(adminPage, 'Baltic Voyage');

    const inviteLink = await inviteFollowerToPlatform(adminPage);

    const followerContext = await browser.newContext();
    const followerPage = await followerContext.newPage();
    await acceptInvite(followerPage, inviteLink);

    await addFollowerToTrip(adminPage, tripId);

    // Follower lands on the trip timeline and opts out of new-entry notifications
    // for this trip via the control next to the story-mode toggle.
    await followerPage.goto(`/trips/${tripId}/timeline`);
    const trigger = followerPage.getByTestId('trip-notification-mode-trigger');
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();
    const offOption = followerPage.getByTestId('trip-notification-mode-option-off');
    await expect(offOption).toBeVisible();
    await offOption.click();
    // Popover closes after a successful mutation.
    await expect(followerPage.getByTestId('trip-notification-mode-popover')).toHaveCount(0, {
      timeout: 10_000,
    });

    await createEntryOnTrip(adminPage, tripId, 'Tallinn Harbour');

    await followerPage.reload();

    // With mode=off, neither an inbox item nor an unread badge should appear.
    const bell = followerPage.getByTestId('notifications-bell');
    await expect(bell).toBeVisible();
    // Wait a bit to let any stray notifications land, then assert none did.
    await followerPage.waitForTimeout(1_500);
    await expect(followerPage.getByTestId('notifications-badge')).toHaveCount(0);

    await bell.click();
    await expect(followerPage.getByTestId('notifications-empty')).toBeVisible({
      timeout: 10_000,
    });

    await adminContext.close();
    await followerContext.close();
  });
});
