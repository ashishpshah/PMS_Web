import { test, expect } from '../fixtures/auth.fixture';
import { createRole, deleteRole, apiPost, apiGet, getAdminToken } from '../helpers';

const API_BASE = 'http://localhost:5178';

test.describe('Roles — Validation', () => {

  test.describe('Valid data paths', () => {

    test('P0: roles page loads without SystemAdmin role', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await page.goto('/roles');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/roles/);
      await expect(page.locator('text=SystemAdmin')).toHaveCount(0);
    });

    test('P1: create a valid role with all fields', async ({ request }) => {
      const suffix = Date.now();
      const { id } = await createRole(request, {
        name: `Senior Dev ${suffix}`,
        code: `SRDEV${suffix}`.slice(0, 10).toUpperCase(),
        level: 3,
        description: 'Senior developer role',
        isAdmin: false,
        isActive: true,
      });
      expect(id).toBeGreaterThan(0);

      await deleteRole(request, id);
    });

    test('P1: update a role', async ({ request }) => {
      const { id } = await createRole(request);
      const token = await getAdminToken(request);
      const res = await request.post(`${API_BASE}/api/roles`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: {
          id,
          name: `Updated Role ${Date.now()}`,
          code: `UPD${Date.now()}`.slice(0, 10).toUpperCase(),
          level: 4,
          description: 'Updated',
          isAdmin: false,
          isActive: true,
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.data.level).toBe(4);

      await deleteRole(request, id);
    });
  });

  test.describe('Invalid data paths — creation validation', () => {

    test('P1: duplicate role code rejected (case-insensitive)', async ({ request }) => {
      const suffix = Date.now();
      const code = `DUP${suffix}`.slice(0, 10).toUpperCase();

      // Create first role
      const { id: firstId } = await createRole(request, { name: 'First', code });
      expect(firstId).toBeGreaterThan(0);

      // Try duplicate with different case
      const token = await getAdminToken(request);
      const res = await request.post(`${API_BASE}/api/roles`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: {
          id: 0,
          name: 'Duplicate',
          code: code.toLowerCase(), // same code, different case
          level: 2,
          description: 'Duplicate',
          isAdmin: false,
          isActive: true,
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json().catch(() => ({}));
      expect(body.message).toContain('already in use');

      await deleteRole(request, firstId);
    });

    test('P1: empty name rejected', async ({ request }) => {
      const token = await getAdminToken(request);
      const res = await request.post(`${API_BASE}/api/roles`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: {
          id: 0,
          name: '',
          code: 'EMPTYNM',
          level: 2,
          description: 'Empty name',
          isAdmin: false,
          isActive: true,
        },
      });
      expect(res.status()).toBe(400);
    });
  });

  test.describe('Invalid data paths — delete protection', () => {

    test('P1: cannot delete SystemAdmin role (id 1)', async ({ request }) => {
      const token = await getAdminToken(request);
      const res = await request.delete(`${API_BASE}/api/roles/1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(403);
      const body = await res.json().catch(() => ({}));
      expect(body.message?.toLowerCase() || '').toContain('protected');
    });
  });
});
