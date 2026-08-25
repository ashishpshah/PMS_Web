import { FullConfig } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:5178';

async function globalSetup(_config: FullConfig): Promise<void> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: 'http://localhost:3001' });

  // Diagnostics captured from the start, in case the post-login dashboard render never
  // completes (see the catch block around the "Total Projects" wait below).
  const consoleMsgs: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => pageErrors.push(err.stack || err.message));
  page.on('requestfailed', (req) =>
    consoleMsgs.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`)
  );
  const pendingApiRequests = new Set<string>();
  page.on('request', (req) => {
    if (req.url().includes('/api/')) pendingApiRequests.add(`${req.method()} ${req.url()}`);
  });
  page.on('requestfinished', (req) => pendingApiRequests.delete(`${req.method()} ${req.url()}`));
  page.on('response', (res) => {
    pendingApiRequests.delete(`${res.request().method()} ${res.url()}`);
    if (res.status() >= 400) {
      res
        .text()
        .then((body) =>
          consoleMsgs.push(`[http ${res.status()}] ${res.request().method()} ${res.url()}\n    body: ${body.slice(0, 500)}`)
        )
        .catch(() => consoleMsgs.push(`[http ${res.status()}] ${res.request().method()} ${res.url()} (body unreadable)`));
    }
  });

  // ── Login via UI (once) ───────────────────────────────────────────────────
  // A single UI login covers both needs: it gives us a bearer token (from the response body,
  // captured below) for the E2E-user-seeding calls further down, and it's the only way the
  // pms_rt cookie ends up scoped to the right host for the later storageState save — going
  // through Vite's /api proxy at localhost:3000 (like a real browser) rather than posting
  // straight to 127.0.0.1:5178, whose Set-Cookie would be scoped to the wrong host.
  //
  // Deliberately just ONE login call here (not one API-only call plus a separate UI one, as
  // an earlier version of this file did): LoginRateLimitMiddleware caps auth-endpoint POSTs
  // (/login, /refresh, /forgot-password, /register/initiate) at 5 per IP per minute, and
  // register-login.spec.ts's own tests already use 4-5 of that budget — a redundant second
  // login here would push a full suite run past the cap and start failing tests on the app's
  // real (and correctly-working) anti-brute-force protection, not a bug in the app or the test.
  const loginResponsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST'
  );
  await page.goto('/auth');
  await page.fill('input[name="identifier"]', 'admin@pms.com');
  await page.fill('input[name="password"]', 'admin@123');
  await page.click('button[type="submit"]');
  const loginRes = await loginResponsePromise;
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
      `${API_BASE}/api/auth/check-availability?userName=${user.userName}`,
      { headers: authHeaders }
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

  // ── Wait for the post-login navigation, then save storage state ──────────
  // The login above already drove the click that triggers this navigation, so we just wait
  // for it to land and the dashboard to actually render before snapshotting storage state.
  await page.waitForURL('**/');
  // Not 'networkidle': the app opens a persistent SignalR (chat) WebSocket connection
  // right after login, which never lets the network go idle — that wait would hang
  // forever. Wait for a concrete piece of dashboard UI instead (same pattern the actual
  // spec files already use).
  try {
    await page.locator('text=Total Projects').waitFor({ timeout: 60_000 });
  } catch (e) {
    console.error('\n=== DASHBOARD DID NOT RENDER "Total Projects" — DIAGNOSTICS ===');
    console.error('--- Page URL:', page.url());
    console.error('--- Console/network messages:\n' + consoleMsgs.join('\n'));
    console.error('--- Page errors:\n' + pageErrors.join('\n'));
    console.error('--- Still-pending API requests:\n' + Array.from(pendingApiRequests).join('\n'));
    try {
      await page.screenshot({ path: 'e2e/.auth/debug-dashboard.png', fullPage: true });
      console.error('--- Screenshot saved to e2e/.auth/debug-dashboard.png');
    } catch { /* ignore */ }
    const bodyText = await page.locator('body').innerText().catch(() => '(could not read body)');
    console.error('--- Body text (first 2000 chars):\n' + bodyText.slice(0, 2000));
    console.error('=== END DIAGNOSTICS ===\n');
    await browser.close();
    throw e;
  }

  await page.context().storageState({ path: 'e2e/.auth/user.json' });
  await browser.close();
}

export default globalSetup;
