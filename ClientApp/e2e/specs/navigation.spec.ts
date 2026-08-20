import { test, expect } from '../fixtures/auth.fixture';

test.describe('Navigation — Validation', () => {

  test.describe('Valid data paths', () => {

    test('P0: authenticated user can access all protected routes', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();

      const routes = [
        { label: '/projects', href: '/projects' },
        { label: '/tasks', href: '/tasks' },
        { label: '/users', href: '/users' },
        { label: '/roles', href: '/roles' },
        { label: '/chat', href: '/chat' },
        { label: '/reports', href: '/reports' },
        { label: '/settings', href: '/settings' },
        { label: '/diary', href: '/diary' },
        { label: '/templates', href: '/templates' },
      ];

      for (const route of routes) {
        const navLink = page.locator(`a[href="${route.href}"]`).first();
        if (await navLink.isVisible()) {
          await navLink.click();
          await page.waitForLoadState('networkidle');
          await expect(page).toHaveURL(new RegExp(route.href.replace('/', '\\/')));
        }
      }
    });
  });

  test.describe('Invalid data paths', () => {

    test('P0: unknown route shows 404 / not found', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await page.goto('/this-route-does-not-exist');
      await page.waitForLoadState('networkidle');
      const bodyText = await page.locator('body').innerText();
      const isNotFound = bodyText.includes('Not Found') || bodyText.includes('404') || page.url().includes('/auth');
      expect(isNotFound).toBeTruthy();
    });
  });
});
