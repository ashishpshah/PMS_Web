import { Page, Locator } from '@playwright/test';

export class UsersPage {
  readonly page: Page;
  readonly createButton: Locator;
  readonly userNameInput: Locator;
  readonly emailInput: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly passwordInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: /create/i });
    this.userNameInput = page.getByPlaceholder(/username/i);
    this.emailInput = page.getByPlaceholder(/email/i);
    this.firstNameInput = page.getByPlaceholder(/first name/i);
    this.lastNameInput = page.getByPlaceholder(/last name/i);
    this.passwordInput = page.getByPlaceholder(/password/i);
    this.saveButton = page.getByRole('button', { name: /save|create/i });
  }

  async goto() {
    await this.page.goto('/users');
    await this.page.waitForLoadState('networkidle');
  }

}
