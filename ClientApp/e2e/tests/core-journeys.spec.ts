import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

async function login(page: Page, username: string = 'admin', password: string = 'admin@123') {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  await page.fill('input[name="identifier"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  
  await page.waitForURL(`${BASE_URL}/`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

async function waitForRateLimit(page: Page) {
  await page.waitForTimeout(15000); // Wait for rate limit window
}

test.describe('Core User Journeys', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  // ============================================================
  // JOURNEY 1: Authentication
  // ============================================================
  test('J1: Authentication - Login with valid credentials', async () => {
    await login(page);
    await expect(page).toHaveURL(`${BASE_URL}/`);
    await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'j1-login-success.png', fullPage: true });
  });

  test('J2: Authentication - Failed login with invalid credentials', async () => {
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.fill('input[name="identifier"]', 'invalid');
    await page.fill('input[name="password"]', 'wrong');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid credentials')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'j2-login-failed.png', fullPage: true });
  });

  test('J3: Authentication - Empty fields validation', async () => {
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Enter your email or mobile number')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'j3-login-empty.png', fullPage: true });
  });

  // ============================================================
  // JOURNEY 2: Dashboard
  // ============================================================
  test('J4: Dashboard - Loads with stats', async () => {
    await login(page);
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Total Projects')).toBeVisible();
    await expect(page.locator('text=Total Tasks')).toBeVisible();
    await page.screenshot({ path: 'j4-dashboard.png', fullPage: true });
  });

  test('J5: Dashboard - Shows task status breakdown', async () => {
    await login(page);
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=New')).toBeVisible();
    await expect(page.locator('text=In Progress')).toBeVisible();
    await expect(page.locator('text=Completed')).toBeVisible();
  });

  // ============================================================
  // JOURNEY 3: Projects
  // ============================================================
  test('J6: Projects - List page loads', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Projects')).toBeVisible();
    await expect(page.locator('text=Create Project')).toBeVisible();
    await page.screenshot({ path: 'j6-projects-list.png', fullPage: true });
  });

  test('J7: Projects - Create new project', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.click('text=Create Project');
    await page.waitForLoadState('networkidle');
    
    const projectName = `E2E Project ${Date.now()}`;
    await page.fill('input[name="name"]', projectName);
    await page.fill('textarea[name="description"]', 'E2E test project');
    await page.selectOption('select[name="status"]', 'active');
    
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await expect(page.locator(`text=${projectName}`)).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'j7-create-project.png', fullPage: true });
  });

  // ============================================================
  // JOURNEY 4: Tasks
  // ============================================================
  test('J8: Tasks - List page loads', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/tasks`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Tasks')).toBeVisible();
    await expect(page.locator('text=Create Task')).toBeVisible();
    await page.screenshot({ path: 'j8-tasks-list.png', fullPage: true });
  });

  test('J9: Tasks - Create new task', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/tasks`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.click('text=Create Task');
    await page.waitForLoadState('networkidle');
    
    const taskTitle = `E2E Task ${Date.now()}`;
    await page.fill('input[name="title"]', taskTitle);
    await page.fill('textarea[name="description"]', 'E2E test task');
    await page.selectOption('select[name="priority"]', 'high');
    await page.selectOption('select[name="status"]', 'new');
    
    const projectSelect = page.locator('select[name="projectId"]');
    if (await projectSelect.isVisible()) {
      await projectSelect.selectOption({ index: 0 });
    }
    
    await page.fill('input[placeholder*="checklist" i]', 'Test checklist item');
    
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await expect(page.locator(`text=${taskTitle}`)).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'j9-create-task.png', fullPage: true });
  });

  test('J10: Tasks - Kanban board view', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/tasks`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=New')).toBeVisible();
    await expect(page.locator('text=In Progress')).toBeVisible();
    await expect(page.locator('text=Under Review')).toBeVisible();
    await expect(page.locator('text=Completed')).toBeVisible();
  });

  // ============================================================
  // JOURNEY 5: Users
  // ============================================================
  test('J11: Users - List page loads', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/users`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Users')).toBeVisible();
    await expect(page.locator('text=Create User')).toBeVisible();
    await page.screenshot({ path: 'j11-users-list.png', fullPage: true });
  });

  // ============================================================
  // JOURNEY 6: Reports
  // ============================================================
  test('J12: Reports - Page loads', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/reports`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Reports')).toBeVisible();
  });

  // ============================================================
  // JOURNEY 7: Work Diary
  // ============================================================
  test('J13: Diary - Page loads', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/diary`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Work Diary')).toBeVisible();
    await expect(page.locator('text=Add Entry')).toBeVisible();
    await page.screenshot({ path: 'j13-diary.png', fullPage: true });
  });

  // ============================================================
  // JOURNEY 8: Task Templates
  // ============================================================
  test('J14: Templates - List page loads', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/templates`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Templates')).toBeVisible();
    await expect(page.locator('text=Create Template')).toBeVisible();
    await page.screenshot({ path: 'j14-templates.png', fullPage: true });
  });

  // ============================================================
  // JOURNEY 9: Chat
  // ============================================================
  test('J15: Chat - Page loads', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await expect(page.locator('text=Chat')).toBeVisible();
  });

  // ============================================================
  // JOURNEY 10: Settings
  // ============================================================
  test('J16: Settings - Page loads', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Settings')).toBeVisible();
    await page.screenshot({ path: 'j16-settings.png', fullPage: true });
  });

  // ============================================================
  // JOURNEY 11: Navigation
  // ============================================================
  test('J17: Navigation - Sidebar links work', async () => {
    await login(page);
    await waitForRateLimit(page);
    
    const routes = ['/projects', '/tasks', '/users', '/reports', '/diary', '/templates', '/chat', '/settings'];
    
    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
      
      await expect(page).not.toHaveURL(`${BASE_URL}/auth`);
    }
  });

  test('J18: Navigation - 404 for unknown routes', async () => {
    await login(page);
    await waitForRateLimit(page);
    
    await page.goto(`${BASE_URL}/unknown-route`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=404, text=Not Found, text=Page not found')).toBeVisible({ timeout: 5000 });
  });

  // ============================================================
  // JOURNEY 12: Form Validations
  // ============================================================
  test('J19: Validation - Required fields', async () => {
    await login(page);
    await waitForRateLimit(page);
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForLoadState('networkidle');
    
    await page.click('text=Create Project');
    await page.waitForLoadState('networkidle');
    
    await page.click('button[type="submit"]');
    await expect(page.locator('text=required, text=Required')).toBeVisible({ timeout: 5000 });
  });

  test('J20: Validation - Email format', async () => {
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.click('text=Create an account');
    await page.waitForLoadState('networkidle');
    
    await page.fill('input[name="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid email, text=email format')).toBeVisible({ timeout: 5000 });
  });

  test('J21: Validation - Password strength', async () => {
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.click('text=Create an account');
    await page.waitForLoadState('networkidle');
    
    await page.fill('input[name="password"]', 'weak');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=6 characters, text=uppercase, text=lowercase, text=number')).toBeVisible({ timeout: 5000 });
  });

  // ============================================================
  // JOURNEY 13: Protected Route Redirect
  // ============================================================
  test('J22: Auth - Protected route redirect when not authenticated', async () => {
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.waitForTimeout(1000);
    
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await expect(page).toHaveURL(`${BASE_URL}/auth`);
  });
});