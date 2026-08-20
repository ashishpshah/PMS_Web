import { test, expect } from '../fixtures/auth.fixture';
import { apiPost, apiGet } from '../helpers';

test.describe('Authentication — Validation', () => {

  test.describe('Valid data paths', () => {

    test('P0: login with username redirects to dashboard', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await expect(page).toHaveURL('/');
      await expect(page.locator('text=Total Projects')).toBeVisible({ timeout: 10_000 });
    });

    test('P0: login with email instead of username', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin@pms.com', 'admin@123');
      await loginPage.waitForDashboard();
      await expect(page).toHaveURL('/');
    });

    test('P0: username availability — available', async ({ request }) => {
      const { body } = await apiGet(request, '/auth/check-availability?userName=newhire_2026');
      expect(body.success).toBeTruthy();
      expect(body.data.userNameChecked).toBe(true);
      expect(body.data.userNameAvailable).toBe(true);
    });

    test('P0: username availability — available with excludeUserId', async ({ request }) => {
      const { body } = await apiGet(request, '/auth/check-availability?userName=admin&excludeUserId=1');
      expect(body.success).toBeTruthy();
      expect(body.data.userNameAvailable).toBe(true); // excluded self
    });

    test('P1: login as seeded E2E_Lead user', async ({ request }) => {
      const res = await request.post('http://localhost:5178/api/auth/login', {
        data: { usernameOrEmail: 'E2E_Lead', password: 'Pms@123' },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.data.user.userName).toBe('E2E_Lead');
      expect(body.data.user.isAdmin).toBe(false);
    });

    test('P1: login with admin token returns valid JWT shape', async ({ request }) => {
      const res = await request.post('http://localhost:5178/api/auth/login', {
        data: { usernameOrEmail: 'admin', password: 'admin@123' },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.token).toBeDefined();
      expect(body.data.token.split('.')).toHaveLength(3); // valid JWT
      expect(body.data.user.id).toBe(1);
      expect(body.data.user.roleId).toBe(1);
      expect(body.data.user.isAdmin).toBe(true);
      expect(body.data.user.roleName).toBe('SystemAdmin');
      expect(body.data.user.fullName).toBe('System Admin');
    });
  });

  test.describe('Invalid data paths', () => {

    test('P0: wrong password returns 401 with error message', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'wrongpassword');
      await expect(loginPage.page.locator('text=Invalid username/email or password')).toBeVisible({ timeout: 10_000 });
    });

    test('P0: non-existent username returns 401', async ({ request }) => {
      const res = await request.post('http://localhost:5178/api/auth/login', {
        data: { usernameOrEmail: 'nonexistent_user_12345', password: 'somepass' },
      });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toContain('Invalid');
    });

    test('P0: empty username field shows frontend validation', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.login('', 'admin@123');
      // The authentication page should show a validation message
      await expect(loginPage.page.locator('text=Enter your email or mobile')).toBeVisible({ timeout: 5_000 });
    });

    test('P0: empty password field shows frontend validation', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.login('admin', '');
      await expect(loginPage.page.locator('text=Password must be at least 6 characters')).toBeVisible({ timeout: 5_000 });
    });

    test('P1: username availability — taken (admin)', async ({ request }) => {
      const { body } = await apiGet(request, '/auth/check-availability?userName=admin');
      expect(body.success).toBeTruthy();
      expect(body.data.userNameChecked).toBe(true);
      expect(body.data.userNameAvailable).toBe(false);
    });

    test('P1: username availability — E2E_Lead is taken (seeded)', async ({ request }) => {
      const { body } = await apiGet(request, '/auth/check-availability?userName=E2E_Lead');
      expect(body.success).toBeTruthy();
      expect(body.data.userNameChecked).toBe(true);
      expect(body.data.userNameAvailable).toBe(false);
    });

    test('P1: username availability — E2E_Dev is taken (seeded)', async ({ request }) => {
      const { body } = await apiGet(request, '/auth/check-availability?userName=E2E_Dev');
      expect(body.success).toBeTruthy();
      expect(body.data.userNameAvailable).toBe(false);
    });

    test('P1: login username is case-sensitive', async ({ request }) => {
      // Username "Admin" (capital A) should not match "admin"
      const res = await request.post('http://localhost:5178/api/auth/login', {
        data: { usernameOrEmail: 'Admin', password: 'admin@123' },
      });
      expect(res.status()).toBe(401);
    });

    test('P1: login email is case-insensitive', async ({ request }) => {
      const res = await request.post('http://localhost:5178/api/auth/login', {
        data: { usernameOrEmail: 'ADMIN@PMS.COM', password: 'admin@123' },
      });
      expect(res.ok()).toBeTruthy();
    });
  });
});
