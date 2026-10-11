import { defineConfig } from '@playwright/test';

// Browsers are pre-installed under /opt/pw-browsers in the dev container
// (PLAYWRIGHT_BROWSERS_PATH); never run `playwright install` there.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: 'node scripts/dev.mjs',
    url: 'http://127.0.0.1:5173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
    // a server started for the tests plays in a throwaway campaign, never your real one
    env: { DNDSIM_CAMPAIGN_DIR: 'test-results/e2e-campaign' },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // WebGL in headless Chromium needs ANGLE's software path (SwiftShader).
        launchOptions: {
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
});
