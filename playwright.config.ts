import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'research/verification/browser-tests.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4187',
    viewport: { width: 1024, height: 768 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Browser routing is deterministic only when workers cannot bypass XRPC mocks.
    // Actual SW installation/offline behavior has a separate stopped-server check.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1024, height: 768 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1024, height: 768 } } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
