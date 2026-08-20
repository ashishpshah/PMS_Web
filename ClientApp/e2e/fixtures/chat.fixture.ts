import { test as base, Page, BrowserContext } from '@playwright/test';
import { ChatPage } from '../pages/ChatPage';
import { LoginPage } from '../pages/LoginPage';

type ChatFixtures = {
  userAContext: BrowserContext;
  userAPage: Page;
  userAChat: ChatPage;
  userBContext: BrowserContext;
  userBPage: Page;
  userBChat: ChatPage;
};

/**
 * Chat fixture that creates two authenticated browser contexts (user A and user B)
 * so we can test real-time messaging between them.
 */
export const chatTest = base.extend<ChatFixtures>({
  userAContext: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    await use(ctx);
    await ctx.close();
  },

  userAPage: async ({ userAContext }, use) => {
    const page = await userAContext.newPage();
    await use(page);
    await page.close();
  },

  userAChat: async ({ userAPage }, use) => {
    const chat = new ChatPage(userAPage);
    await chat.goto();
    await use(chat);
  },

  userBContext: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/user.json' });
    await use(ctx);
    await ctx.close();
  },

  userBPage: async ({ userBContext }, use) => {
    const page = await userBContext.newPage();
    await use(page);
    await page.close();
  },

  userBChat: async ({ userBPage }, use) => {
    const chat = new ChatPage(userBPage);
    await chat.goto();
    await use(chat);
  },
});

export { expect } from '@playwright/test';
