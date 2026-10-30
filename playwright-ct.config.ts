import process from "node:process";
import type { CtCorpusOptions } from "@orb/testkit/ct-corpus";
import { nativeBrowserLaunchOptions } from "@orb/tooling/floor/browser/browser";
import { readConcurrencyProfile } from "@orb/tooling/floor/host/concurrency-profile";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { CT_VITE_PORT } from "@orb/tooling/floor/host/ports";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/floor/testing/test-kinds";
import type { PlaywrightTestConfig } from "@playwright/test";
import { defineConfig, devices } from "@playwright/test";

const BASE_TEST_TIMEOUT_MS = 30_000;
const BASE_EXPECT_TIMEOUT_MS = 5000;
const BASE_ACTION_TIMEOUT_MS = 15_000;
const BASE_SERVER_TIMEOUT_MS = 180_000;
const BASE_STOP_TIMEOUT_MS = 15_000;
const concurrency = readConcurrencyProfile();
const port = Number(process.env["CT_PORT"] ?? CT_VITE_PORT);
const origin = `http://127.0.0.1:${String(port)}`;
const testMatch = TEST_KIND_DEFINITIONS.filter(({ family }) => family === "component").map(({ suffix }) => `**/*${suffix}`);
/** Raw surface-audit evidence stays in the explicit local controls runner, outside CI artifacts. */
export const LOCAL_SURFACE_CONTROLS = ["**/tests/support/browser/surface-measurement.ct.tsx", "**/tests/client/components/described-menu-item.ct.tsx"];

/** The gallery and local framework controls share the application's component-test pipeline. */
export const componentWebServer = {
  command:
    "pnpm --filter @orb/client exec vite build --configLoader native --mode component-test && pnpm --filter @orb/client exec vite preview --configLoader native --mode component-test",
  url: `${origin}/playwright/index.html`,
  reuseExistingServer: false,
  timeout: budget(BASE_SERVER_TIMEOUT_MS),
  gracefulShutdown: { signal: "SIGTERM", timeout: budget(BASE_STOP_TIMEOUT_MS) },
  env: { VITE_PORT: String(port), ORB_ENV_NO_FILE: "1" },
  stdout: "pipe",
  stderr: "pipe",
} satisfies PlaywrightTestConfig["webServer"];

export default defineConfig<CtCorpusOptions>({
  testDir: "tests",
  build: { external: ["**/packages/server/src/**"] },
  globalSetup: "./tooling/src/floor/testing/working-tree-guard.ts",
  testMatch,
  testIgnore: LOCAL_SURFACE_CONTROLS,
  outputDir: "reports/ct-results",
  fullyParallel: true,
  workers: concurrency.ctWorkers,
  timeout: budget(BASE_TEST_TIMEOUT_MS),
  expect: { timeout: budget(BASE_EXPECT_TIMEOUT_MS) },
  forbidOnly: process.env["CI"] !== undefined,
  retries: 0,
  reporter: [
    ...(process.env["GITHUB_ACTIONS"] ? [["github"] as const] : []),
    ["json", { outputFile: "reports/ct-report.json" }],
    ["html", { outputFolder: "reports/ct-report", open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `${origin}/playwright/index.html`,
    reuseContext: true,
    serviceWorkers: "block",
    corpusDirectory: process.env["CT_CORPUS_FIXTURE"],
    // Preserve the first failure without requiring another navigation or test attempt.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: budget(BASE_ACTION_TIMEOUT_MS),
    timezoneId: "UTC",
    locale: "en-US",
    launchOptions: nativeBrowserLaunchOptions("chromium"),
  },
  webServer: componentWebServer,
  projects: [
    { name: "chromium", testIgnore: ["**/tests/tooling/**", ...LOCAL_SURFACE_CONTROLS] },
    // Opt-in (`pnpm test:ct:webkit`): Playwright's WebKit on Linux is WebKitGTK/WPE with patches, not Safari. It has no
    // iOS chrome, reports 0 for every safe-area inset, shows no soft keyboard and has no standalone mode, so it checks
    // layout and parsing only. The run-marker args are Chromium flags and would stop WebKit launching.
    {
      name: "webkit-iphone",
      testMatch: ["**/platform-*.suite.ct.tsx", "**/features/chat/components/composer-two-rows.ct.tsx"],
      use: { ...devices["iPhone 15"], launchOptions: nativeBrowserLaunchOptions("webkit") },
    },
    { name: "tooling", testDir: "tests/tooling" },
  ],
});
