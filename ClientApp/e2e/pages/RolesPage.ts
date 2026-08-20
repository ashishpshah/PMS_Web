import { Page, Locator } from '@playwright/test';

export class RolesPage {
  readonly page: Page;
  readonly createButton: Locator;
  readonly roleNameInput: Locator;
  readonly roleCodeInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: /create/i });
    this.roleNameInput = page.getByPlaceholder(/name/i);
    this.roleCodeInput = page.getByPlaceholder(/code/i);
    this.saveButton = page.getByRole('button', { name: /save|create/i });
  }

  async goto() {
    await this.page.goto('/roles');
    await this.page.waitForLoadState('networkidle');
  }

}
