import { FullConfig } from '@playwright/test';

const API_BASE = 'http://localhost:5178';

async function globalSetup(_config: FullConfig): Promise<void> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: 'http://localhost:3000' });

  // ── Login via API ─────────────────────────────────────────────────────────
  const loginRes = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { usernameOrEmail: 'admin', password: 'admin@123' },
  });
  const loginBody = await loginRes.json();
  if (!loginBody?.data?.token) {
    console.error('Global setup: login failed —', loginBody?.message ?? 'no token');
    await browser.close();
    return;
  }

  const token = loginBody.data.token;
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Seed E2E test users for reuse across specs ──────────────────────────
  // These stable users let tests reference known IDs instead of creating
  // ad-hoc users in every test.

  const e2eUsers = [
    { userName: 'E2E_Lead',      email: 'E2E_lead@pms.com',      firstName: 'E2E', lastName: 'Lead',      roleId: 2, password: 'Pms@123' },
    { userName: 'E2E_Dev',       email: 'E2E_dev@pms.com',       firstName: 'E2E', lastName: 'Dev',       roleId: 2, password: 'Pms@123' },
    { userName: 'E2E_QA',        email: 'E2E_qa@pms.com',        firstName: 'E2E', lastName: 'QA',        roleId: 2, password: 'Pms@123' },
    { userName: 'E2E_NonAdmin',  email: 'E2E_nonadmin@pms.com',  firstName: 'E2E', lastName: 'NonAdmin',  roleId: 2, password: 'Pms@123' },
  ];

  for (const user of e2eUsers) {
    // Check if user already exists (idempotent)
    const checkRes = await page.request.get(
      `${API_BASE}/api/auth/check-availability?userName=${user.userName}`
    );
    const checkBody = await checkRes.json();
    const alreadyExists = checkBody?.data?.userNameAvailable === false;

    if (!alreadyExists) {
      const createRes = await page.request.post(`${API_BASE}/api/users`, {
        headers: authHeaders,
        data: {
          userName: user.userName,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          password: user.password,
          roleId: user.roleId,
          contactNo: '+91 9876543210',
          isActive: true,
        },
      });
      if (createRes.ok()) {
        console.log(`  ✓ Created E2E user: ${user.userName}`);
      } else {
        const err = await createRes.json().catch(() => ({}));
        console.warn(`  ✗ Failed to create ${user.userName}: ${err.message || createRes.status()}`);
      }
    } else {
      console.log(`  ✓ E2E user already exists: ${user.userName}`);
    }
  }

  // ── Login via UI and save storage state ──────────────────────────────────
  // Playwright storageState only captures cookies + localStorage, not JS module memory.
  // We login via the UI to ensure the in-memory token is set correctly.
  await page.goto('/auth');
  await page.fill('input[name="identifier"]', 'admin');
  await page.fill('input[name="password"]', 'admin@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  await page.waitForLoadState('networkidle');

  await page.context().storageState({ path: 'e2e/.auth/user.json' });
  await browser.close();
}

export default globalSetup;
