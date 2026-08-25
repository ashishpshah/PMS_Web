import { test, expect } from '@playwright/test';

/**
 * End-to-end coverage for the Register and Login flows on /auth.
 *
 * Reuses this project's existing e2e/playwright.config.ts as-is — it already runs
 * headed (visible browser, for debugging), with slowMo: 1500, --window-size=1280,900,
 * and ignoreHTTPSErrors: true, so nothing extra needs configuring here.
 *
 * No credentials are hard-coded: valid login is exercised with credentials read from
 * environment variables (E2E_LOGIN_USER / E2E_LOGIN_PASSWORD) — set them before running
 * this file, e.g. `E2E_LOGIN_USER=admin E2E_LOGIN_PASSWORD=... npx playwright test
 * register-login.spec.ts`. Registration uses a freshly generated, never-reused email
 * per run so the test is self-contained and repeatable.
 *
 * Note on registration: this app confirms new accounts via a one-time email code
 * (see AuthController's OTP flow), so a fully automated run can't read that code from
 * a real inbox. The registration test therefore verifies everything Playwright *can*
 * observe end-to-end without a mailbox: client-side validation, duplicate-email
 * rejection from the server, and that a valid submission is accepted and hands off to
 * the "enter your verification code" screen.
 */

// This whole file exercises the logged-out /auth screen (register + login), but the
// project's default storageState (e2e/.auth/user.json, written by global-setup) holds an
// already-authenticated admin session. Auth.tsx redirects away from /auth whenever a user
// is present (`if (user) return <Navigate to="/" replace />`), so every test here must start
// from a clean, unauthenticated browser context or it never actually reaches the auth form.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Registration', () => {
  test('rejects a password that fails the strength requirement', async ({ page }) => {
    await page.goto('/auth');
    await page.getByText('Register from here').click();

    await page.getByPlaceholder('John').fill('Jamie');
    await page.getByPlaceholder('Doe').fill('Rivera');
    await page.getByPlaceholder('Enter your email').fill(`e2e.${Date.now()}@example.com`);
    await page.getByPlaceholder('Min 6 chars, A–Z, a–z, 0–9').fill('alllowercase1');
    await page.getByRole('button', { name: 'Send Verification Code' }).click();

    await expect(page.getByText(/uppercase|lowercase|digit/i)).toBeVisible({ timeout: 10_000 });
  });

  test('rejects an email that is already registered', async ({ page }) => {
    await page.goto('/auth');
    await page.getByText('Register from here').click();

    await page.getByPlaceholder('John').fill('Jamie');
    await page.getByPlaceholder('Doe').fill('Rivera');
    // Seeded fixture account from this repo's DB initializer — no password used here,
    // so nothing sensitive is exposed; it only exists to make the duplicate-check fail.
    await page.getByPlaceholder('Enter your email').fill('admin@pms.com');
    await page.getByPlaceholder('Min 6 chars, A–Z, a–z, 0–9').fill('ValidPass123');
    await page.getByRole('button', { name: 'Send Verification Code' }).click();

    await expect(page.getByText(/already registered/i)).toBeVisible({ timeout: 10_000 });
  });

  test('accepts a valid new registration and moves to OTP verification', async ({ page }) => {
    await page.goto('/auth');
    await page.getByText('Register from here').click();

    const uniqueEmail = `e2e.register.${Date.now()}@example.com`;
    await page.getByPlaceholder('John').fill('Jamie');
    await page.getByPlaceholder('Doe').fill('Rivera');
    await page.getByPlaceholder('Enter your email').fill(uniqueEmail);
    await page.getByPlaceholder('Min 6 chars, A–Z, a–z, 0–9').fill('ValidPass123');
    await page.getByRole('button', { name: 'Send Verification Code' }).click();

    // Success is observed as the hand-off to the OTP-entry screen, not full account
    // creation — see the file-level note above on why the OTP itself isn't available here.
    await expect(page.getByText('Back to Sign In')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Login', () => {
  test('shows an error for invalid credentials', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('input[name="identifier"]', `nonexistent.${Date.now()}`);
    await page.fill('input[name="password"]', 'WrongPassword123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 10_000 });
  });

  test('logs in successfully and starts a persisted session', async ({ page }) => {
    const user = process.env.E2E_LOGIN_USER;
    const password = process.env.E2E_LOGIN_PASSWORD;
    test.skip(!user || !password, 'Set E2E_LOGIN_USER / E2E_LOGIN_PASSWORD to run this test.');

    await page.goto('/auth');
    await page.fill('input[name="identifier"]', user!);
    await page.fill('input[name="password"]', password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('**/');
    await expect(page.locator('text=Total Projects')).toBeVisible({ timeout: 10_000 });

    // Session must survive a full page reload, not just client-side navigation.
    await page.reload();
    await expect(page.locator('text=Total Projects')).toBeVisible({ timeout: 10_000 });
  });
});
