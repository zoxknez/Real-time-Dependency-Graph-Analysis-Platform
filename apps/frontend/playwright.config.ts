import { defineConfig, devices } from '@playwright/test';

const enablePersistentReports = !!process.env.CI || process.env.E2E_REPORTS === '1';
const enableCrossBrowserProjects =
  process.env.E2E_ALL_BROWSERS === '1' || (!!process.env.CI && process.platform !== 'win32');
const e2ePort = process.env.E2E_PORT || '3100';
const managedBaseURL = `http://127.0.0.1:${e2ePort}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || managedBaseURL;

/**
 * Playwright E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : 3,
  
  /* Reporter to use */
  reporter: enablePersistentReports
    ? [
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'test-results/results.json' }],
        ['list'],
      ]
    : [['list']],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL,
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'on-first-retry',
  },
  
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    
    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },

    ...(enableCrossBrowserProjects
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
          },

          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'], reducedMotion: 'reduce' },
          },

          {
            name: 'Mobile Safari',
            use: { ...devices['iPhone 12'], reducedMotion: 'reduce' },
          },
        ]
      : []),
  ],
  
  /* Global timeout for each test */
  timeout: 30 * 1000,
  
  /* Expect timeout */
  expect: {
    timeout: 10 * 1000,
  },
});
