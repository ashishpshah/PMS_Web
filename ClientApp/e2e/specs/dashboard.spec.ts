import { test, expect } from '../fixtures/auth.fixture';

test.describe('Dashboard — Validation', () => {

  test.describe('Valid data paths', () => {

    test('P0: stat cards are visible after login', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await expect(page.locator('text=Total Projects')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('text=Active Tasks')).toBeVisible();
      await expect(page.locator('text=Team Members')).toBeVisible();
      await expect(page.locator('text=Blocked Tasks')).toBeVisible();
    });

    test('P0: Effort & Productivity section renders', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await expect(page.locator('text=Effort & Productivity')).toBeVisible({ timeout: 10_000 });
    });

    test('P1: My Work section is present', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await expect(page.locator('text=My Work').or(page.locator('text=Recent Tasks'))).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Invalid data paths', () => {

    test('P1: dashboard does not show error state', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      // Verify no error boundaries are triggered
      await expect(page.locator('text=Something went wrong')).not.toBeVisible({ timeout: 5_000 });
      // The dashboard should be functional with default 0 values
      await expect(page.locator('text=Total Projects')).toBeVisible({ timeout: 5_000 });
    });
  });
});
