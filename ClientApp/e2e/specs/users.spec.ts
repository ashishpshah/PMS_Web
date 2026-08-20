import { test, expect } from '../fixtures/auth.fixture';
import { createUser, apiPost, apiGet } from '../helpers';

test.describe('Users — Validation', () => {

  test.describe('Valid data paths', () => {

    test('P0: users page loads', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await page.goto('/users');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/users/);
    });

    test('P1: create a valid user with all fields', async ({ request }) => {
      const suffix = Date.now();
      const { id, userName } = await createUser(request, {
        userName: `E2E_ValidUser_${suffix}`,
        email: `E2E_validuser_${suffix}@pms.com`,
        firstName: 'Valid',
        lastName: 'User',
        password: 'Pms@123',
        roleId: 2,
        contactNo: '+91 9876543210',
      });
      expect(id).toBeGreaterThan(0);
      expect(userName).toBe(`E2E_ValidUser_${suffix}`);
    });

    test('P1: create user with optional contactNo omitted', async ({ request }) => {
      const suffix = Date.now();
      const { id } = await createUser(request, {
        userName: `E2E_NoContact_${suffix}`,
        email: `E2E_nocontact_${suffix}@pms.com`,
        firstName: 'No',
        lastName: 'Contact',
        password: 'Pms@123',
        roleId: 2,
        contactNo: undefined,
      });
      expect(id).toBeGreaterThan(0);
    });

    test('P1: create user with empty contactNo string', async ({ request }) => {
      const suffix = Date.now();
      const { id } = await createUser(request, {
        userName: `E2E_EmptyCt_${suffix}`,
        email: `E2E_emptyct_${suffix}@pms.com`,
        firstName: 'Empty',
        lastName: 'Contact',
        password: 'Pms@123',
        roleId: 2,
        contactNo: '',
      });
      expect(id).toBeGreaterThan(0);
    });

    test('P1: email with leading/trailing whitespace is trimmed', async ({ request }) => {
      const suffix = Date.now();
      const { body } = await apiPost(request, '/users', {
        userName: `E2E_Trimmed_${suffix}`,
        email: `  E2E_trimmed_${suffix}@pms.com  `,
        firstName: 'Trimmed',
        lastName: 'Email',
        password: 'Pms@123',
        roleId: 2,
        contactNo: '+91 9876543210',
        isActive: true,
      });
      expect(body.success).toBeTruthy();
      expect(body.data.email).toBe(`E2E_trimmed_${suffix}@pms.com`); // trimmed
    });

    test('P1: seeded E2E users appear in users list', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await page.goto('/users');
      await page.waitForLoadState('networkidle');
      // E2E users seeded in global-setup should be visible
      await expect(page.locator('text=E2E_Lead')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('text=E2E_Dev')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('text=E2E_QA')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('text=E2E_NonAdmin')).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Invalid data paths — model validation', () => {

    test('P1: username too short (minimum 3 chars)', async ({ request }) => {
      const { status, body } = await apiPost(request, '/users', {
        userName: 'ab',
        email: 'ab@pms.com',
        firstName: 'Short',
        lastName: 'Name',
        password: 'Pms@123',
        roleId: 2,
        contactNo: '+91 9876543210',
        isActive: true,
      });
      expect(status).toBe(400);
      expect(body.message?.toLowerCase() || JSON.stringify(body).toLowerCase()).toContain('user');
    });

    test('P1: invalid email format rejected', async ({ request }) => {
      const { status } = await apiPost(request, '/users', {
        userName: 'E2E_BadEmail',
        email: 'not-an-email',
        firstName: 'Bad',
        lastName: 'Email',
        password: 'Pms@123',
        roleId: 2,
        contactNo: '+91 9876543210',
        isActive: true,
      });
      expect(status).toBe(400);
    });

    test('P1: empty firstName rejected', async ({ request }) => {
      const { status } = await apiPost(request, '/users', {
        userName: 'E2E_EmptyFn',
        email: 'E2E_emptyfn@pms.com',
        firstName: '',
        lastName: 'Name',
        password: 'Pms@123',
        roleId: 2,
        contactNo: '+91 9876543210',
        isActive: true,
      });
      expect(status).toBe(400);
    });

    test('P1: password too short (minimum 6 chars)', async ({ request }) => {
      const { status } = await apiPost(request, '/users', {
        userName: 'E2E_ShortPwd',
        email: 'E2E_shortpwd@pms.com',
        firstName: 'Short',
        lastName: 'Pwd',
        password: '123',
        roleId: 2,
        contactNo: '+91 9876543210',
        isActive: true,
      });
      expect(status).toBe(400);
    });

    test('P1: contactNo with invalid characters rejected', async ({ request }) => {
      const suffix = Date.now();
      const { status } = await apiPost(request, '/users', {
        userName: `E2E_BadCt_${suffix}`,
        email: `E2E_badct_${suffix}@pms.com`,
        firstName: 'Bad',
        lastName: 'Contact',
        password: 'Pms@123',
        roleId: 2,
        contactNo: 'abc',
        isActive: true,
      });
      // [Phone] attribute should reject non-phone values
      expect(status).toBe(400);
    });
  });

  test.describe('Invalid data paths — business logic', () => {

    test('P1: cannot assign SystemAdmin role (roleId 1)', async ({ request }) => {
      const suffix = Date.now();
      const { status, body } = await apiPost(request, '/users', {
        userName: `E2E_NoSys_${suffix}`,
        email: `E2E_nosys_${suffix}@pms.com`,
        firstName: 'No',
        lastName: 'SysAdmin',
        password: 'Pms@123',
        roleId: 1,
        contactNo: '+91 9876543210',
        isActive: true,
      });
      expect(status).toBe(400);
      expect(body.message).toContain('System Admin role cannot be assigned');
    });

    test('P1: duplicate username rejected', async ({ request }) => {
      const suffix = Date.now();
      const userName = `E2E_Dupe_${suffix}`;
      // Create first user
      await createUser(request, {
        userName,
        email: `E2E_dupe_${suffix}_first@pms.com`,
      });
      // Try duplicate username
      const { status } = await apiPost(request, '/users', {
        userName,
        email: `E2E_dupe_${suffix}_second@pms.com`,
        firstName: 'Dup',
        lastName: 'User',
        password: 'Pms@123',
        roleId: 2,
        contactNo: '+91 9876543210',
        isActive: true,
      });
      expect(status).toBe(400);
    });

    test('P1: duplicate email rejected', async ({ request }) => {
      const suffix = Date.now();
      const email = `E2E_dupeemail_${suffix}@pms.com`;
      // Create first user
      await createUser(request, {
        userName: `E2E_DupeEmail_${suffix}_first`,
        email,
      });
      // Try duplicate email
      const { status } = await apiPost(request, '/users', {
        userName: `E2E_DupeEmail_${suffix}_second`,
        email,
        firstName: 'Dup',
        lastName: 'Email',
        password: 'Pms@123',
        roleId: 2,
        contactNo: '+91 9876543210',
        isActive: true,
      });
      expect(status).toBe(400);
    });

    test('P1: SystemAdmin cannot reset own password', async ({ request }) => {
      // Target ID 1 (SystemAdmin) should be protected
      const suffix = Date.now();
      const { status, body } = await apiPost(request, `/users/1/reset-password`, {});
      // The reset endpoint uses POST, not PUT
      const res = await request.post(`http://localhost:5178/api/users/1/reset-password`, {
        headers: { Authorization: `Bearer ${(await import('../helpers')).adminHeaders().Authorization}` },
      });
      const result = await res.json();
      expect(res.status()).toBe(403);
      expect(result.message).toContain('protected');
    });
  });
});
