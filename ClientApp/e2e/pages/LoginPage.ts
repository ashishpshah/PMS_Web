import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly identifierInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;
  readonly forgotPasswordLink: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.identifierInput = page.getByPlaceholder('Enter email or mobile');
    this.passwordInput = page.getByPlaceholder('Enter password');
    this.signInButton = page.getByRole('button', { name: /sign in/i });
    this.errorMessage = page.locator('text=Invalid username/email or password');
    this.forgotPasswordLink = page.getByRole('button', { name: /forgot password/i });
    this.registerLink = page.getByText(/register from here/i);
  }

  async goto() {
    await this.page.goto('/auth');
    await this.page.waitForLoadState('networkidle');
  }

  async login(identifier: string, password: string) {
    await this.identifierInput.fill(identifier);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async waitForDashboard() {
    await this.page.waitForURL('**/');
    await this.page.waitForLoadState('networkidle');
  }

  async getErrorMessage(): Promise<Locator> {
    return this.page.locator('text=Invalid username/email or password');
  }
}
