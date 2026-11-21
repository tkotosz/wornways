import { defineConfig, devices } from '@playwright/test';

// Browser tests of the web app: Chromium against a preview of the built app.
const port = 4180;

export default defineConfig({
  testDir: 'apps/web/tests',
  testMatch: '**/*.spec.ts',
  // A test may make a whole video, encoded in software.
  timeout: 180_000,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    // Like the unit tests: activities get names from their local start time.
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build -w @wornways/web && npm run preview -w @wornways/web -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
