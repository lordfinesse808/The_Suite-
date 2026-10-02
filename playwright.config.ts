import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `rm -rf .data/e2e && pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: ".data/e2e", MOCK_WHATSAPP: "true", LLM_MODE: "mock", APP_URL: `http://localhost:${PORT}`, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
