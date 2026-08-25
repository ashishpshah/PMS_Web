import { test, expect, Page, BrowserContext } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:5178/api';

async function login(page: Page, username: string = 'admin', password: string = 'admin@123') {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('networkidle');
  
  // Fill login form
  await page.fill('input[name="identifier"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  
  // Wait for redirect to dashboard
  await page.waitForURL(`${BASE_URL}/`);
  await page.waitForLoadState('networkidle');
}

async function registerUser(page: Page, userData: { firstName: string; lastName: string; email: string; password: string; contactNo?: string }) {
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('networkidle');
  
  // Click register link
  await page.click('text=Create an account');
  await page.waitForLoadState('networkidle');
  
  // Fill registration form
  await page.fill('input[name="firstName"]', userData.firstName);
  await page.fill('input[name="lastName"]', userData.lastName);
  await page.fill('input[name="email"]', userData.email);
  if (userData.contactNo) {
    await page.fill('input[name="contactNo"]', userData.contactNo);
  }
  await page.fill('input[name="password"]', userData.password);
  await page.click('button[type="submit"]');
  
  // Wait for OTP step or success
  await page.waitForLoadState('networkidle');
}

async function waitForToast(page: Page, message: string) {
  await expect(page.locator(`text=${message}`)).toBeVisible({ timeout: 10000 });
}

test.describe('PMS - Comprehensive E2E Test Suite', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    
    // Set longer timeout for CI
    test.setTimeout(120000);
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ============================================================
  // USER JOURNEY 1: Authentication & Authorization
  // ============================================================
  test.describe('Authentication', () => {
    test('J1.1 - Successful login with valid credentials', async () => {
      await page.goto(`${BASE_URL}/auth`);
      await page.waitForLoadState('networkidle');
      
      // Check login form elements
      await expect(page.locator('input[name="identifier"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
      
      // Login with admin
      await login(page);
      
      // Verify redirect to dashboard
      await expect(page).toHaveURL(`${BASE_URL}/`);
      await expect(page.locator('text=Dashboard')).toBeVisible({ timeout: 10000 });
    });

    test('J1.2 - Failed login with invalid credentials', async () => {
      await page.goto(`${BASE_URL}/auth`);
      await page.waitForLoadState('networkidle');
      
      await page.fill('input[name="identifier"]', 'invalid');
      await page.fill('input[name="password"]', 'wrong');
      await page.click('button[type="submit"]');
      
      // Should show error
      await expect(page.locator('text=Invalid credentials')).toBeVisible({ timeout: 5000 });
    });

    test('J1.3 - Failed login with empty fields', async () => {
      await page.goto(`${BASE_URL}/auth`);
      await page.waitForLoadState('networkidle');
      
      await page.click('button[type="submit"]');
      
      // Should show validation error
      await expect(page.locator('text=Enter your email or mobile number')).toBeVisible({ timeout: 5000 });
    });

    test('J1.4 - Registration flow initiation', async () => {
      await page.goto(`${BASE_URL}/auth`);
      await page.waitForLoadState('networkidle');
      
      await page.click('text=Create an account');
      await page.waitForLoadState('networkidle');
      
      // Should be on register step
      await expect(page.locator('input[name="firstName"]')).toBeVisible();
      await expect(page.locator('input[name="lastName"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
    });

    test('J1.5 - Protected route redirect when not authenticated', async () => {
      // Clear storage to simulate unauthenticated state
      await page.goto(`${BASE_URL}/auth`);
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      
      // Try to access protected route
      await page.goto(`${BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      
      // Should redirect to auth
      await expect(page).toHaveURL(`${BASE_URL}/auth`);
    });

    test('J1.6 - Logout functionality', async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
      
      // Find and click logout (usually in user menu)
      await page.click('[aria-label="User menu"], button:has-text("Logout"), text=Logout');
      await page.waitForLoadState('networkidle');
      
      // Should redirect to auth
      await expect(page).toHaveURL(`${BASE_URL}/auth`);
    });
  });

  // ============================================================
  // USER JOURNEY 2: Dashboard
  // ============================================================
  test.describe('Dashboard', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J2.1 - Dashboard loads with stats', async () => {
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');
      
      // Check dashboard elements
      await expect(page.locator('text=Dashboard')).toBeVisible();
      await expect(page.locator('text=Total Projects')).toBeVisible();
      await expect(page.locator('text=Total Tasks')).toBeVisible();
      await expect(page.locator('text=Active Users')).toBeVisible();
    });

    test('J2.2 - Dashboard shows task status breakdown', async () => {
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');
      
      // Check status cards
      await expect(page.locator('text=New')).toBeVisible();
      await expect(page.locator('text=In Progress')).toBeVisible();
      await expect(page.locator('text=Completed')).toBeVisible();
    });

    test('J2.3 - Dashboard filter by user', async () => {
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');
      
      // Check if user filter dropdown exists
      const userFilter = page.locator('select').filter({ hasText: /user|assignee/i }).first();
      if (await userFilter.isVisible()) {
        await userFilter.selectOption({ index: 0 });
        await page.waitForLoadState('networkidle');
      }
    });

    test('J2.4 - At Risk widget visible', async () => {
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');
      
      // Check for At Risk section
      await expect(page.locator('text=At Risk')).toBeVisible({ timeout: 10000 });
    });
  });

  // ============================================================
  // USER JOURNEY 3: Projects Management
  // ============================================================
  test.describe('Projects', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J3.1 - Projects list page loads', async () => {
      await page.goto(`${BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Projects')).toBeVisible();
      await expect(page.locator('text=Create Project')).toBeVisible();
    });

    test('J3.2 - Create new project', async () => {
      await page.goto(`${BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      
      await page.click('text=Create Project');
      await page.waitForLoadState('networkidle');
      
      // Fill project form
      const projectName = `Test Project ${Date.now()}`;
      await page.fill('input[name="name"]', projectName);
      await page.fill('textarea[name="description"]', 'Test project description');
      await page.selectOption('select[name="status"]', 'active');
      
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      
      // Verify project created
      await expect(page.locator(`text=${projectName}`)).toBeVisible({ timeout: 10000 });
    });

    test('J3.3 - View project details', async () => {
      await page.goto(`${BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      
      // Click on first project
      const firstProject = page.locator('table tbody tr, .project-card').first();
      if (await firstProject.isVisible()) {
        await firstProject.click();
        await page.waitForLoadState('networkidle');
        
        // Should be on project details page
        await expect(page.url()).toContain('/projects/');
      }
    });

    test('J3.4 - Project modules management', async () => {
      await page.goto(`${BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      
      const firstProject = page.locator('table tbody tr, .project-card').first();
      if (await firstProject.isVisible()) {
        await firstProject.click();
        await page.waitForLoadState('networkidle');
        
        // Check modules section
        await expect(page.locator('text=Modules')).toBeVisible({ timeout: 10000 });
      }
    });

    test('J3.5 - Project members assignment', async () => {
      await page.goto(`${BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      
      const firstProject = page.locator('table tbody tr, .project-card').first();
      if (await firstProject.isVisible()) {
        await firstProject.click();
        await page.waitForLoadState('networkidle');
        
        // Check members section
        await expect(page.locator('text=Members')).toBeVisible({ timeout: 10000 });
      }
    });
  });

  // ============================================================
  // USER JOURNEY 4: Tasks & Kanban Board
  // ============================================================
  test.describe('Tasks & Kanban Board', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J4.1 - Tasks list page loads', async () => {
      await page.goto(`${BASE_URL}/tasks`);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Tasks')).toBeVisible();
      await expect(page.locator('text=Create Task')).toBeVisible();
    });

    test('J4.2 - Create new task', async () => {
      await page.goto(`${BASE_URL}/tasks`);
      await page.waitForLoadState('networkidle');
      
      await page.click('text=Create Task');
      await page.waitForLoadState('networkidle');
      
      // Fill task form
      const taskTitle = `Test Task ${Date.now()}`;
      await page.fill('input[name="title"]', taskTitle);
      await page.fill('textarea[name="description"]', 'Test task description');
      await page.selectOption('select[name="priority"]', 'high');
      await page.selectOption('select[name="status"]', 'new');
      
      // Select project if dropdown exists
      const projectSelect = page.locator('select[name="projectId"]');
      if (await projectSelect.isVisible()) {
        await projectSelect.selectOption({ index: 0 });
      }
      
      // Add checklist item
      await page.fill('input[placeholder*="checklist" i], input[placeholder*="Checklist" i]', 'Test checklist item');
      
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      
      // Verify task created
      await expect(page.locator(`text=${taskTitle}`)).toBeVisible({ timeout: 10000 });
    });

    test('J4.3 - Kanban board view', async () => {
      await page.goto(`${BASE_URL}/tasks`);
      await page.waitForLoadState('networkidle');
      
      // Check for Kanban columns
      await expect(page.locator('text=New')).toBeVisible();
      await expect(page.locator('text=In Progress')).toBeVisible();
      await expect(page.locator('text=Under Review')).toBeVisible();
      await expect(page.locator('text=Completed')).toBeVisible();
    });

    test('J4.4 - Task status transition', async () => {
      await page.goto(`${BASE_URL}/tasks`);
      await page.waitForLoadState('networkidle');
      
      // Find a task card
      const taskCard = page.locator('[data-testid="task-card"], .task-card, table tbody tr').first();
      if (await taskCard.isVisible()) {
        // Click to open task details or quick view
        await taskCard.click();
        await page.waitForLoadState('networkidle');
        
        // Check for status actions
        await expect(page.locator('text=Start Work, text=Submit for Review, text=Complete')).toBeVisible({ timeout: 10000 });
      }
    });

    test('J4.5 - Task filters and search', async () => {
      await page.goto(`${BASE_URL}/tasks`);
      await page.waitForLoadState('networkidle');
      
      // Check search input
      const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]');
      if (await searchInput.isVisible()) {
        await searchInput.fill('test');
        await page.waitForLoadState('networkidle');
      }
      
      // Check status filter
      const statusFilter = page.locator('select[name="status"]');
      if (await statusFilter.isVisible()) {
        await statusFilter.selectOption('in-progress');
        await page.waitForLoadState('networkidle');
      }
    });

    test('J4.6 - Task checklist management', async () => {
      await page.goto(`${BASE_URL}/tasks`);
      await page.waitForLoadState('networkidle');
      
      const taskCard = page.locator('[data-testid="task-card"], .task-card, table tbody tr').first();
      if (await taskCard.isVisible()) {
        await taskCard.click();
        await page.waitForLoadState('networkidle');
        
        // Check checklist section
        await expect(page.locator('text=Checklist')).toBeVisible({ timeout: 10000 });
        
        // Toggle checklist item if exists
        const checkbox = page.locator('input[type="checkbox"]').first();
        if (await checkbox.isVisible()) {
          await checkbox.click();
          await page.waitForLoadState('networkidle');
        }
      }
    });
  });

  // ============================================================
  // USER JOURNEY 5: Users Management
  // ============================================================
  test.describe('Users', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J5.1 - Users list page loads', async () => {
      await page.goto(`${BASE_URL}/users`);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Users')).toBeVisible();
      await expect(page.locator('text=Create User')).toBeVisible();
    });

    test('J5.2 - Create new user', async () => {
      await page.goto(`${BASE_URL}/users`);
      await page.waitForLoadState('networkidle');
      
      await page.click('text=Create User');
      await page.waitForLoadState('networkidle');
      
      // Fill user form
      const userEmail = `testuser${Date.now()}@example.com`;
      await page.fill('input[name="firstName"]', 'Test');
      await page.fill('input[name="lastName"]', 'User');
      await page.fill('input[name="email"]', userEmail);
      await page.fill('input[name="password"]', 'Test@123');
      await page.selectOption('select[name="roleId"]', { index: 1 });
      
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      
      // Verify user created
      await expect(page.locator(`text=${userEmail}`)).toBeVisible({ timeout: 10000 });
    });

    test('J5.3 - View user details', async () => {
      await page.goto(`${BASE_URL}/users`);
      await page.waitForLoadState('networkidle');
      
      const firstUser = page.locator('table tbody tr').first();
      if (await firstUser.isVisible()) {
        await firstUser.click();
        await page.waitForLoadState('networkidle');
        
        await expect(page.url()).toContain('/users/');
      }
    });

    test('J5.4 - User status toggle', async () => {
      await page.goto(`${BASE_URL}/users`);
      await page.waitForLoadState('networkidle');
      
      // Look for status toggle
      const statusToggle = page.locator('button:has-text("Activate"), button:has-text("Deactivate"), [role="switch"]').first();
      if (await statusToggle.isVisible()) {
        await statusToggle.click();
        await page.waitForLoadState('networkidle');
      }
    });
  });

  // ============================================================
  // USER JOURNEY 6: Roles & Permissions
  // ============================================================
  test.describe('Roles & Permissions', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J6.1 - Roles list page loads', async () => {
      await page.goto(`${BASE_URL}/roles`);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Roles')).toBeVisible();
    });

    test('J6.2 - View role permissions', async () => {
      await page.goto(`${BASE_URL}/roles`);
      await page.waitForLoadState('networkidle');
      
      const firstRole = page.locator('table tbody tr').first();
      if (await firstRole.isVisible()) {
        await firstRole.click();
        await page.waitForLoadState('networkidle');
        
        // Check permissions matrix
        await expect(page.locator('text=View, text=Create, text=Update, text=Delete')).toBeVisible({ timeout: 10000 });
      }
    });
  });

  // ============================================================
  // USER JOURNEY 7: Reports
  // ============================================================
  test.describe('Reports', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J7.1 - Reports page loads', async () => {
      await page.goto(`${BASE_URL}/reports`);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Reports')).toBeVisible();
    });

    test('J7.2 - User effort report', async () => {
      await page.goto(`${BASE_URL}/reports`);
      await page.waitForLoadState('networkidle');
      
      // Check for effort report section
      await expect(page.locator('text=Effort, text=User Effort')).toBeVisible({ timeout: 10000 });
    });

    test('J7.3 - Date range filter', async () => {
      await page.goto(`${BASE_URL}/reports`);
      await page.waitForLoadState('networkidle');
      
      // Check date pickers
      const dateFrom = page.locator('input[type="date"]').first();
      if (await dateFrom.isVisible()) {
        await dateFrom.fill('2026-01-01');
        await page.waitForLoadState('networkidle');
      }
    });
  });

  // ============================================================
  // USER JOURNEY 8: Work Diary
  // ============================================================
  test.describe('Work Diary', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J8.1 - Diary page loads', async () => {
      await page.goto(`${BASE_URL}/diary`);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Work Diary')).toBeVisible();
      await expect(page.locator('text=Add Entry')).toBeVisible();
    });

    test('J8.2 - Create diary entry', async () => {
      await page.goto(`${BASE_URL}/diary`);
      await page.waitForLoadState('networkidle');
      
      await page.click('text=Add Entry');
      await page.waitForLoadState('networkidle');
      
      // Fill diary entry
      await page.fill('input[type="date"]', new Date().toISOString().split('T')[0]);
      await page.fill('textarea[name="description"]', 'Worked on testing');
      await page.selectOption('select[name="category"]', { index: 0 });
      await page.fill('input[name="hoursSpent"]', '2');
      
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Worked on testing')).toBeVisible({ timeout: 10000 });
    });

    test('J8.3 - Monthly view', async () => {
      await page.goto(`${BASE_URL}/diary`);
      await page.waitForLoadState('networkidle');
      
      // Check monthly calendar view
      await expect(page.locator('text=Mon, text=Tue, text=Wed')).toBeVisible({ timeout: 10000 });
    });
  });

  // ============================================================
  // USER JOURNEY 9: Task Templates
  // ============================================================
  test.describe('Task Templates', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J9.1 - Templates list page loads', async () => {
      await page.goto(`${BASE_URL}/templates`);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Templates')).toBeVisible();
      await expect(page.locator('text=Create Template')).toBeVisible();
    });

    test('J9.2 - Create new template', async () => {
      await page.goto(`${BASE_URL}/templates`);
      await page.waitForLoadState('networkidle');
      
      await page.click('text=Create Template');
      await page.waitForLoadState('networkidle');
      
      // Fill template form
      const templateName = `Test Template ${Date.now()}`;
      await page.fill('input[name="name"]', templateName);
      await page.fill('textarea[name="description"]', 'Test template');
      await page.selectOption('select[name="recurrenceType"]', 'weekly');
      await page.selectOption('select[name="dayOfWeek"]', '1');
      
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator(`text=${templateName}`)).toBeVisible({ timeout: 10000 });
    });

    test('J9.3 - Template items management', async () => {
      await page.goto(`${BASE_URL}/templates`);
      await page.waitForLoadState('networkidle');
      
      const firstTemplate = page.locator('table tbody tr, .template-card').first();
      if (await firstTemplate.isVisible()) {
        await firstTemplate.click();
        await page.waitForLoadState('networkidle');
        
        // Check items section
        await expect(page.locator('text=Items')).toBeVisible({ timeout: 10000 });
      }
    });
  });

  // ============================================================
  // USER JOURNEY 10: Chat
  // ============================================================
  test.describe('Chat', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J10.1 - Chat page loads', async () => {
      await page.goto(`${BASE_URL}/chat`);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Chat')).toBeVisible();
    });

    test('J10.2 - Send message in global channel', async () => {
      await page.goto(`${BASE_URL}/chat`);
      await page.waitForLoadState('networkidle');
      
      // Type and send message
      const messageInput = page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i]');
      if (await messageInput.isVisible()) {
        await messageInput.fill('Test message from E2E');
        await page.keyboard.press('Enter');
        await page.waitForLoadState('networkidle');
        
        await expect(page.locator('text=Test message from E2E')).toBeVisible({ timeout: 10000 });
      }
    });

    test('J10.3 - Room navigation', async () => {
      await page.goto(`${BASE_URL}/chat`);
      await page.waitForLoadState('networkidle');
      
      // Check room list
      await expect(page.locator('text=Rooms, text=Direct')).toBeVisible({ timeout: 10000 });
    });
  });

  // ============================================================
  // USER JOURNEY 11: Settings
  // ============================================================
  test.describe('Settings', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J11.1 - Settings page loads', async () => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');
      
      await expect(page.locator('text=Settings')).toBeVisible();
    });

    test('J11.2 - Profile settings', async () => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');
      
      // Check profile section
      await expect(page.locator('text=Profile, text=Account')).toBeVisible({ timeout: 10000 });
    });

    test('J11.3 - Theme toggle', async () => {
      await page.goto(`${BASE_URL}/settings`);
      await page.waitForLoadState('networkidle');
      
      // Check theme toggle
      const themeToggle = page.locator('[role="switch"], button:has-text("Dark"), button:has-text("Light")').first();
      if (await themeToggle.isVisible()) {
        await themeToggle.click();
        await page.waitForLoadState('networkidle');
      }
    });
  });

  // ============================================================
  // USER JOURNEY 12: Navigation & Routing
  // ============================================================
  test.describe('Navigation & Routing', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J12.1 - Sidebar navigation', async () => {
      await page.goto(`${BASE_URL}/`);
      await page.waitForLoadState('networkidle');
      
      // Check sidebar links
      await expect(page.locator('a[href="/"]')).toBeVisible();
      await expect(page.locator('a[href="/projects"]')).toBeVisible();
      await expect(page.locator('a[href="/tasks"]')).toBeVisible();
      await expect(page.locator('a[href="/users"]')).toBeVisible();
      await expect(page.locator('a[href="/reports"]')).toBeVisible();
      await expect(page.locator('a[href="/diary"]')).toBeVisible();
      await expect(page.locator('a[href="/templates"]')).toBeVisible();
      await expect(page.locator('a[href="/chat"]')).toBeVisible();
      await expect(page.locator('a[href="/settings"]')).toBeVisible();
    });

    test('J12.2 - Direct URL navigation', async () => {
      const routes = ['/projects', '/tasks', '/users', '/reports', '/diary', '/templates', '/chat', '/settings'];
      
      for (const route of routes) {
        await page.goto(`${BASE_URL}${route}`);
        await page.waitForLoadState('networkidle');
        // Should not redirect to auth
        await expect(page).not.toHaveURL(`${BASE_URL}/auth`);
      }
    });

    test('J12.3 - 404 page for unknown routes', async () => {
      await page.goto(`${BASE_URL}/unknown-route`);
      await page.waitForLoadState('networkidle');
      
      // Should show 404 page
      await expect(page.locator('text=404, text=Not Found, text=Page not found')).toBeVisible({ timeout: 5000 });
    });
  });

  // ============================================================
  // USER JOURNEY 13: Form Validations
  // ============================================================
  test.describe('Form Validations', () => {
    test.beforeEach(async () => {
      await login(page);
      await page.waitForLoadState('networkidle');
    });

    test('J13.1 - Required field validation', async () => {
      await page.goto(`${BASE_URL}/projects`);
      await page.waitForLoadState('networkidle');
      
      await page.click('text=Create Project');
      await page.waitForLoadState('networkidle');
      
      await page.click('button[type="submit"]');
      
      // Should show required field errors
      await expect(page.locator('text=required, text=Required')).toBeVisible({ timeout: 5000 });
    });

    test('J13.2 - Email format validation', async () => {
      await page.goto(`${BASE_URL}/auth`);
      await page.waitForLoadState('networkidle');
      
      await page.click('text=Create an account');
      await page.waitForLoadState('networkidle');
      
      await page.fill('input[name="email"]', 'invalid-email');
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=Invalid email, text=email format')).toBeVisible({ timeout: 5000 });
    });

    test('J13.3 - Password strength validation', async () => {
      await page.goto(`${BASE_URL}/auth`);
      await page.waitForLoadState('networkidle');
      
      await page.click('text=Create an account');
      await page.waitForLoadState('networkidle');
      
      await page.fill('input[name="password"]', 'weak');
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=6 characters, text=uppercase, text=lowercase, text=number')).toBeVisible({ timeout: 5000 });
    });
  });
});