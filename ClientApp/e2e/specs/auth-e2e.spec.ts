import { test, expect } from '@playwright/test';

/**
 * End-to-end tests for Register & Login flows (/auth route).
 * Configuration (headed browser, slowMo, viewport, HTTPS errors) is defined in
 * e2e/playwright.config.ts — no additional setup needed here.
 *
 * No hard-coded credentials: valid login uses env vars (E2E_LOGIN_USER / E2E_LOGIN_PASSWORD).
 * Registration uses unique emails per run for idempotency.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('User Registration', () => {
  test('validates password strength requirement', async ({ page }) => {
    await page.goto('/auth');
    await page.getByText('Register from here').click();

    await page.getByPlaceholder('John').fill('Test');
    await page.getByPlaceholder('Doe').fill('User');
    await page.getByPlaceholder('Enter your email').fill(`e2e.${Date.now()}@test.com`);
    await page.getByPlaceholder('Min 6 chars, A–Z, a–z, 0–9').fill('weakpass'); // missing uppercase & digit
    await page.getByRole('button', { name: 'Send Verification Code' }).click();

    await expect(page.getByText(/uppercase|lowercase|digit/i)).toBeVisible({ timeout: 10_000 });
  });

  test('rejects duplicate email', async ({ page }) => {
    await page.goto('/auth');
    await page.getByText('Register from here').click();

    await page.getByPlaceholder('John').fill('Test');
    await page.getByPlaceholder('Doe').fill('User');
    await page.getByPlaceholder('Enter your email').fill('admin@pms.com'); // seeded account
    await page.getByPlaceholder('Min 6 chars, A–Z, a–z, 0–9').fill('ValidPass123');
    await page.getByRole('button', { name: 'Send Verification Code' }).click();

    await expect(page.getByText(/already registered/i)).toBeVisible({ timeout: 10_000 });
  });

  test('accepts valid registration and advances to OTP screen', async ({ page }) => {
    await page.goto('/auth');
    await page.getByText('Register from here').click();

    const email = `e2e.reg.${Date.now()}@example.com`;
    await page.getByPlaceholder('John').fill('Test');
    await page.getByPlaceholder('Doe').fill('User');
    await page.getByPlaceholder('Enter your email').fill(email);
    await page.getByPlaceholder('Min 6 chars, A–Z, a–z, 0–9').fill('ValidPass123');
    await page.getByRole('button', { name: 'Send Verification Code' }).click();

    // Success = hand-off to OTP entry screen (full account creation requires email OTP)
    await expect(page.getByText('Back to Sign In')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('User Login', () => {
  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/auth');

    await page.fill('input[name="identifier"]', `invalid.${Date.now()}@test.com`);
    await page.fill('input[name="password"]', 'WrongPass123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 10_000 });
  });

  test('logs in successfully and persists session across reload', async ({ page }) => {
    const user = process.env.E2E_LOGIN_USER;
    const pass = process.env.E2E_LOGIN_PASSWORD;
    test.skip(!user || !pass, 'Set E2E_LOGIN_USER / E2E_LOGIN_PASSWORD to run.');

    await page.goto('/auth');
    await page.fill('input[name="identifier"]', user!);
    await page.fill('input[name="password"]', pass!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for dashboard navigation + render
    await page.waitForURL('**/');
    await expect(page.getByText('Total Projects')).toBeVisible({ timeout: 10_000 });

    // Session must survive full page reload (not just client-side routing)
    await page.reload();
    await expect(page.getByText('Total Projects')).toBeVisible({ timeout: 10_000 });
  });

  test('shows error for empty identifier', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('input[name="password"]', 'SomePass123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText(/enter your email/i)).toBeVisible({ timeout: 10_000 });
  });

  test('shows error for short password', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('input[name="identifier"]', 'test@example.com');
    await page.fill('input[name="password"]', '123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText(/at least 6 characters/i)).toBeVisible({ timeout: 10_000 });
  });
});