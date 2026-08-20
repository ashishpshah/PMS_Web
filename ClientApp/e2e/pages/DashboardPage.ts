import { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly statCards: Locator;
  readonly effortSection: Locator;
  readonly sidebarLinks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.statCards = page.locator('text=Total Projects');
    this.effortSection = page.locator('text=Effort & Productivity');
    this.sidebarLinks = page.locator('nav a, aside a');
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async waitForStats() {
    await this.page.waitForSelector('text=Total Projects');
  }

  async navigateTo(route: string) {
    await this.page.click(`a[href="${route}"]`);
    await this.page.waitForLoadState('networkidle');
  }
}
