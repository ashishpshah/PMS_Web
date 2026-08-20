import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: false,
  retries: 0,
  reporter: [['html', { outputFolder: '../playwright-report' }], ['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    launchOptions: {
      slowMo: 1500,
      headless: false,
      args: ["--window-size=1280,900"],
    },
  },

  globalSetup: path.resolve(__dirname, 'global-setup.ts'),

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        storageState: 'e2e/.auth/user.json',
        viewport: { width: 1280, height: 900 },
      },
      testMatch: '**/*.spec.ts',
    },
  ],
});
