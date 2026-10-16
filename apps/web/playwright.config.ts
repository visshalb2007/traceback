import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const isCI = Boolean(process.env.CI);

/**
 * Smoke tests only: they assert that the shell renders and that guards redirect.
 * The full-stack flows are covered by the API integration suite, so the browser
 * run does not need a live database.
 *
 * Specs use the `.e2e.ts` suffix so Vitest's default include pattern ignores them.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
