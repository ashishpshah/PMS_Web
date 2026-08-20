import { Page, Locator } from '@playwright/test';

export class ReportsPage {
  readonly page: Page;
  readonly effortStatsSection: Locator;
  readonly hoursSummarySection: Locator;

  constructor(page: Page) {
    this.page = page;
    this.effortStatsSection = page.locator('text=Effort & Productivity');
    this.hoursSummarySection = page.locator('text=Hours Summary');
  }

  async goto() {
    await this.page.goto('/reports');
    await this.page.waitForLoadState('networkidle');
  }

}
