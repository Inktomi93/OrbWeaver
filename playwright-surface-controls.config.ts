import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSurfaceAgentReport, readSurfaceOutputRoot, SURFACE_NATIVE_TIMEOUT_MS } from "@orb/testkit/node/helpers";
import { nativeBrowserLaunchOptions } from "@orb/tooling/floor/browser/browser";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { defineConfig, devices } from "@playwright/test";
import componentConfig, { componentWebServer, LOCAL_SURFACE_CONTROLS } from "./playwright-ct.config.ts";

const root = await prepareSurfaceAgentReport(await readSurfaceOutputRoot());

export default defineConfig({
  ...componentConfig,
  testDir: "tests",
  testMatch: LOCAL_SURFACE_CONTROLS,
  testIgnore: [],
  outputDir: join(root, "controls-results"),
  preserveOutput: "always",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  globalTimeout: budget(SURFACE_NATIVE_TIMEOUT_MS),
  captureGitInfo: { commit: false, diff: false },
  reporter: [
    [
      fileURLToPath(import.meta.resolve("./tests/support/node/surface-index-reporter.ts")),
      { runRoot: root, nativeJson: join(root, "controls.json"), htmlDirectory: join(root, "controls-html"), blobDirectory: join(root, "controls-blob") },
    ],
    ["list", { printSteps: true }],
    ["json", { outputFile: join(root, "controls.json") }],
    ["blob", { outputDir: join(root, "controls-blob") }],
    ["html", { outputFolder: join(root, "controls-html"), open: "never" }],
  ],
  use: { ...componentConfig.use, launchOptions: nativeBrowserLaunchOptions("chromium"), reuseContext: false, trace: "retain-on-failure", video: "off" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["iPhone 15"], launchOptions: nativeBrowserLaunchOptions("webkit") } },
  ],
  webServer: {
    ...componentWebServer,
    command: "node scripts/surface-gallery.ts",
    env: { ...componentWebServer.env },
  },
});
