import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

// E2E — full-stack `.spec.ts` under tests/e2e (NOT a src mirror; spans the whole app). Browser lane =
// Playwright, never vitest (browser-mode hangs — core/Spine-Testing.md §7). Separate runner, NOT in `pnpm
// check` (`pnpm e2e`).
//
// SKELETON (Phase 0): the `webServer` that boots the stack + the AUTH_MODE / RATE_LIMIT_* /
// RUNNER_OVERRIDE env (neo's shape) land when there's an app to drive — Phase 6 (client + entry + a dev
// script) / Phase 5 (the scripted-runner seam). Until then this config just parses + locates specs.

const inCI = process.env.CI !== undefined;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "reports/e2e-results", // reports/ is gitignored (not playwright's default repo-root dir)
  fullyParallel: false,
  workers: 1, // serial — avoids libSQL :memory: state collisions once the stack is wired
  forbidOnly: inCI,
  retries: inCI ? 2 : 0,
  reporter: [["html", { outputFolder: "reports/e2e-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // webServer: { command: "pnpm dev", url: ".../api/healthz", env: { AUTH_MODE, RATE_LIMIT_*,
  //   RUNNER_OVERRIDE, … } } — added in Phase 6 (no dev script / entry / client yet).
});
