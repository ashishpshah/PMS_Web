import { Page, Locator } from '@playwright/test';

export class ChatPage {
  readonly page: Page;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messageList: Locator;
  readonly globalTab: Locator;

  constructor(page: Page) {
    this.page = page;
    this.messageInput = page.getByPlaceholder(/message|type a message/i);
    this.sendButton = page.getByRole('button', { name: /send/i });
    this.messageList = page.locator('[data-testid="chat-messages"]');
    this.globalTab = page.getByRole('button', { name: /global|general/i });
  }

  async goto() {
    await this.page.goto('/chat');
    await this.page.waitForLoadState('networkidle');
  }

  async sendMessage(text: string) {
    await this.messageInput.fill(text);
    await this.sendButton.click();
  }

  async getLastMessageText(): Promise<string> {
    const messages = this.messageList.locator('> *');
    const count = await messages.count();
    if (count === 0) return '';
    return (await messages.nth(count - 1).innerText()) ?? '';
  }

  async waitForMessage(text: string) {
    await this.page.waitForSelector(`text=${text}`, { timeout: 10_000 });
  }
}
