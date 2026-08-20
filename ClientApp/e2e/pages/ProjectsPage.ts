import { Page, Locator } from '@playwright/test';

export class ProjectsPage {
  readonly page: Page;
  readonly createButton: Locator;
  readonly nameInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: /create/i });
    this.nameInput = page.getByPlaceholder(/name/i);
    this.saveButton = page.getByRole('button', { name: /save|create/i });
  }

  async goto() {
    await this.page.goto('/projects');
    await this.page.waitForLoadState('networkidle');
  }

}
