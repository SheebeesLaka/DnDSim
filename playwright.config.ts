import { defineConfig } from '@playwright/test';

// On Windows the tests drive the installed Edge (no browser download). In the dev
// container browsers are pre-installed under /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH);
// never run `playwright install` there. PW_CHANNEL overrides either.
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
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
        channel,
        // WebGL in headless Chromium needs ANGLE's software path (SwiftShader).
        launchOptions: {
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
});
