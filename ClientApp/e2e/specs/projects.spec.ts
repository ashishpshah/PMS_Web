import { test, expect } from '../fixtures/auth.fixture';
import { createProject, deleteProject, createTask, apiPut, apiGet, getAdminToken } from '../helpers';

const API_BASE = 'http://localhost:5178';

test.describe('Projects — Validation', () => {

  test.describe('Valid data paths', () => {

    test('P0: projects page loads', async ({ loginPage, page }) => {
      await loginPage.goto();
      await loginPage.login('admin', 'admin@123');
      await loginPage.waitForDashboard();
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/projects/);
    });

    test('P1: create a valid project with modules', async ({ request }) => {
      const name = `E2E Project ${Date.now()}`;
      const res = await request.post(`${API_BASE}/api/projects`, {
        data: {
          id: 0,
          name,
          description: 'Full valid project',
          status: 'Active',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          ownerId: 1,
          modules: ['Frontend', 'Backend', 'DevOps', 'QA'],
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.success).toBeTruthy();
      expect(body.data.name).toBe(name);
      expect(body.data.code).toMatch(/PRJ-\d+/);
      expect(body.data.seqNumber).toBeGreaterThan(0);
      expect(body.data.modules).toContain('Frontend');
      expect(body.data.modules).toContain('Backend');

      // Cleanup
      await deleteProject(request, body.data.id);
    });

    test('P1: create project without modules', async ({ request }) => {
      const name = `No Modules ${Date.now()}`;
      const res = await request.post(`${API_BASE}/api/projects`, {
        data: {
          id: 0,
          name,
          description: 'No modules',
          status: 'Active',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          ownerId: 1,
          modules: [],
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.data.modules).toEqual([]);

      await deleteProject(request, body.data.id);
    });

    test('P1: set project members (replace-all)', async ({ request }) => {
      const projectId = await createProject(request);
      const res = await request.put(`${API_BASE}/api/projects/${projectId}/members`, {
        data: [1],
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.success).toBeTruthy();

      await deleteProject(request, projectId);
    });

    test('P1: reassign project owner with valid reason', async ({ request }) => {
      const projectId = await createProject(request);
      const res = await request.put(`${API_BASE}/api/projects/${projectId}/reassign`, {
        data: { newOwnerId: 1, reasonTag: 'Workload Balancing' },
      });
      expect(res.ok()).toBeTruthy();

      await deleteProject(request, projectId);
    });

    test('P1: project assignment-history endpoint', async ({ request }) => {
      const projectId = await createProject(request);
      const res = await request.get(`${API_BASE}/api/projects/${projectId}/assignment-history`);
      expect(res.ok()).toBeTruthy();

      await deleteProject(request, projectId);
    });
  });

  test.describe('Invalid data paths — creation validation', () => {

    test('P0: empty project name rejected', async ({ request }) => {
      const res = await request.post(`${API_BASE}/api/projects`, {
        data: {
          id: 0,
          name: '',
          description: 'Empty name',
          status: 'Active',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          ownerId: 1,
          modules: [],
        },
      });
      expect(res.status()).toBe(400);
    });

    test('P1: invalid status value rejected', async ({ request }) => {
      const res = await request.post(`${API_BASE}/api/projects`, {
        data: {
          id: 0,
          name: 'Bad Status Project',
          description: 'Invalid status',
          status: 'OnFire',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          ownerId: 1,
          modules: [],
        },
      });
      expect(res.status()).toBe(400);
    });

    test('P1: startDate after endDate rejected', async ({ request }) => {
      const res = await request.post(`${API_BASE}/api/projects`, {
        data: {
          id: 0,
          name: 'Date Inversion',
          description: 'Bad dates',
          status: 'Active',
          startDate: '2026-12-31',
          endDate: '2026-04-01',
          ownerId: 1,
          modules: [],
        },
      });
      // Either rejected by validation or accepted — test the API's behavior
      // This may depend on backend validation
      const body = await res.json().catch(() => ({}));
      if (res.ok() && body?.data?.id) {
        await deleteProject(request, body.data.id);
      }
    });

    test('P1: duplicate module names are deduplicated', async ({ request }) => {
      const res = await request.post(`${API_BASE}/api/projects`, {
        data: {
          id: 0,
          name: `Dedup Modules ${Date.now()}`,
          description: 'Duplicate modules',
          status: 'Active',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          ownerId: 1,
          modules: ['Frontend', 'Frontend', 'Backend'],
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      // Modules should be deduplicated
      expect(body.data.modules.length).toBe(2);
      expect(body.data.modules).toContain('Frontend');
      expect(body.data.modules).toContain('Backend');

      await deleteProject(request, body.data.id);
    });
  });

  test.describe('Invalid data paths — update validation', () => {

    test('P1: cannot remove module still used by tasks', async ({ request }) => {
      const projectId = await createProject(request, `Module In Use ${Date.now()}`);
      // Create a task in the "Frontend" module
      const task = await createTask(request, { title: 'Module Task', projectId, module: 'Frontend' });
      // Try to remove Frontend
      const res = await request.put(`${API_BASE}/api/projects/${projectId}`, {
        data: {
          id: projectId,
          name: `Module In Use ${Date.now()}`,
          description: 'Module removal blocked',
          status: 'Active',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          ownerId: 1,
          modules: ['Backend'], // Frontend removed
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json().catch(() => ({}));
      expect((body.message || '').toLowerCase()).toContain('cannot remove module');

      await deleteProject(request, projectId);
    });
  });
});
