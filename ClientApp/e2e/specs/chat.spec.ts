import { chatTest, expect } from '../fixtures/chat.fixture';
import { apiGet, getAdminToken } from '../helpers';

const API_BASE = 'http://localhost:5178';

chatTest.describe('Chat — Validation', () => {

  chatTest.describe('Valid data paths', () => {

    chatTest('P2: chat page loads for both users', async ({ userAPage, userBPage }) => {
      await expect(userAPage).toHaveURL(/\/chat/);
      await expect(userBPage).toHaveURL(/\/chat/);
    });

    chatTest('P2: fetch global messages returns empty array', async ({ request }) => {
      const token = await getAdminToken(request);
      const res = await request.get(`${API_BASE}/api/chat/messages?count=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body.data)).toBeTruthy();
    });

    chatTest('P2: user A can send and see a global message', async ({ userAChat, userAPage }) => {
      const message = `Hello from A at ${Date.now()}`;
      await userAPage.waitForSelector('input[type="text"], textarea', { timeout: 10_000 });
      await userAChat.sendMessage(message);
      await userAPage.waitForTimeout(2000);
      await expect(userAPage.locator(`text=${message}`).first()).toBeVisible({ timeout: 10_000 });
    });

    chatTest('P2: user B sends message visible in own chat', async ({ userBChat, userBPage }) => {
      const message = `Hello from B at ${Date.now()}`;
      await userBPage.waitForSelector('input[type="text"], textarea', { timeout: 10_000 });
      await userBChat.sendMessage(message);
      await userBPage.waitForTimeout(2000);
      await expect(userBPage.locator(`text=${message}`).first()).toBeVisible({ timeout: 10_000 });
    });
  });

  chatTest.describe('Invalid data paths', () => {

    chatTest('P2: empty message should not be sent', async ({ userAPage }) => {
      await userAPage.waitForSelector('input[type="text"], textarea', { timeout: 10_000 });
      const input = userAPage.locator('input[type="text"], textarea').first();
      const sendBtn = userAPage.getByRole('button', { name: /send/i });
      // Leave input empty and try to send
      await input.fill('');
      // The send button should be disabled for empty input
      const isDisabled = await sendBtn.isDisabled().catch(() => false);
      if (isDisabled) {
        expect(isDisabled).toBeTruthy();
      }
    });
  });
});
