import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Debug Tests', () => {
  test('Debug: Check login page', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForLoadState('networkidle');
    
    // Take screenshot
    await page.screenshot({ path: 'debug-login-page.png', fullPage: true });
    
    // Check page content
    const content = await page.content();
    console.log('Login page loaded, title:', await page.title());
    console.log('Has identifier input:', await page.locator('input[name="identifier"]').count());
    console.log('Has password input:', await page.locator('input[name="password"]').count());
    console.log('Has submit button:', await page.locator('button[type="submit"]').count());
    
    // Try login
    await page.fill('input[name="identifier"]', 'admin');
    await page.fill('input[name="password"]', 'admin@123');
    await page.click('button[type="submit"]');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    console.log('Current URL after login:', page.url());
    
    await page.screenshot({ path: 'debug-after-login.png', fullPage: true });
    
    // Check for any error messages
    const errorText = await page.locator('.text-red, .error, [role="alert"]').textContent();
    if (errorText) console.log('Error text:', errorText);
    
    // Check localStorage
    const userData = await page.evaluate(() => localStorage.getItem('pms_user'));
    console.log('User data in localStorage:', userData);
    
    const token = await page.evaluate(() => localStorage.getItem('pms_refresh_token'));
    console.log('Refresh token in localStorage:', token ? 'present' : 'missing');
  });

  test('Debug: Check dashboard after login', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForLoadState('networkidle');
    
    await page.fill('input[name="identifier"]', 'admin');
    await page.fill('input[name="password"]', 'admin@123');
    await page.click('button[type="submit"]');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'debug-dashboard.png', fullPage: true });
    
    console.log('Dashboard URL:', page.url());
    console.log('Dashboard title:', await page.title());
    
    // Check for common dashboard elements
    const bodyText = await page.locator('body').textContent();
    console.log('Body contains Dashboard:', bodyText?.includes('Dashboard'));
    console.log('Body contains Total Projects:', bodyText?.includes('Total Projects'));
    console.log('Body contains Tasks:', bodyText?.includes('Tasks'));
  });

  test('Debug: Check network requests during login', async ({ page }) => {
    const requests: string[] = [];
    const responses: string[] = [];
    
    page.on('request', req => {
      if (req.url().includes('/api/')) {
        requests.push(`${req.method()} ${req.url()}`);
      }
    });
    
    page.on('response', res => {
      if (res.url().includes('/api/')) {
        responses.push(`${res.status()} ${res.url()}`);
      }
    });
    
    await page.goto(`${BASE_URL}/auth`);
    await page.waitForLoadState('networkidle');
    
    await page.fill('input[name="identifier"]', 'admin');
    await page.fill('input[name="password"]', 'admin@123');
    await page.click('button[type="submit"]');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    console.log('API Requests:', requests);
    console.log('API Responses:', responses);
  });
});