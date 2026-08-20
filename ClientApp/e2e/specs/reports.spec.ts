import { test, expect } from '../fixtures/auth.fixture';
import { apiGet, createProject, createTask, getAdminToken } from '../helpers';

const API_BASE = 'http://localhost:5178';

test.describe('Reports — Validation', () => {

  test.describe('Valid data paths', () => {

    test('P0: reports page loads', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await page.goto('/reports');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/reports/);
    });

    test('P1: effort stats API returns expected shape', async ({ request }) => {
      const { body } = await apiGet(request, '/tasks/effort-stats');
      expect(body.success).toBeTruthy();
      const d = body.data;
      expect(d).toHaveProperty('productiveSeconds');
      expect(d).toHaveProperty('pausedSeconds');
      expect(d).toHaveProperty('usersCurrentlyWorking');
      expect(d).toHaveProperty('usersInPauseReview');
      expect(d).toHaveProperty('topProductiveUsers');
    });

    test('P1: effort stats with window', async ({ request }) => {
      const { body } = await apiGet(request, '/tasks/effort-stats?from=2026-04-01T00:00:00.000Z&to=2026-05-01T00:00:00.000Z');
      expect(body.success).toBeTruthy();
      expect(body.data.fromUtc).toBeDefined();
      expect(body.data.toUtc).toBeDefined();
    });

    test('P2: user effort report for admin', async ({ request }) => {
      const { body } = await apiGet(request, '/reports/user-effort?from=2026-04-01T00:00:00.000Z&to=2026-05-01T00:00:00.000Z');
      expect(body.success).toBeTruthy();
    });

    test('P2: hours summary', async ({ request }) => {
      const token = await getAdminToken(request);
      const res = await request.get(`${API_BASE}/api/reports/hours-summary?userId=1&projectId=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
    });
  });

  test.describe('Invalid data paths', () => {

    test('P2: user transitions report', async ({ request }) => {
      const { body } = await apiGet(request, '/reports/user-transitions');
      expect(body.success).toBeTruthy();
    });
  });
});
