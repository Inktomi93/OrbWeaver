import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { SurfacePass } from "@orb/testkit/iso";
import { SURFACE_PASSES } from "@orb/testkit/iso";
import type { SurfaceWalkOptions } from "@orb/testkit/node/helpers";
import { prepareSurfaceAgentReport, readSurfaceRunConfig, SURFACE_BOOT_DIAGNOSTIC_TITLE, SURFACE_NATIVE_TIMEOUT_MS } from "@orb/testkit/node/helpers";
import { nativeBrowserLaunchOptions } from "@orb/tooling/floor/browser/browser";
import { budget } from "@orb/tooling/floor/host/load-budget";
import type { PlaywrightWorkerOptions } from "@playwright/test";
import { defineConfig, devices } from "@playwright/test";

const run = await readSurfaceRunConfig();
await prepareSurfaceAgentReport(run.runRoot);
const appearance = appearanceSettingsSchema.parse({});
const TEST_TIMEOUT_MS = 180_000;
const EXPECT_TIMEOUT_MS = 5000;
const ACTION_TIMEOUT_MS = 15_000;
const NAVIGATION_TIMEOUT_MS = 30_000;
const DESKTOP_WIDTHS = { narrow: 900, regular: 1440, wide: 1920 } as const;
const desktop = [
  { name: "content", list: false, context: false },
  { name: "list-content", list: true, context: false },
  { name: "content-context", list: false, context: true },
  { name: "all-panes", list: true, context: true },
] as const;

const ARTIFACT_OPTIONS = {
  measurement: { trace: "off", screenshot: "off", video: "off" },
  evidence: { trace: "on", screenshot: "only-on-failure", video: "off" },
} as const satisfies Record<SurfacePass, Pick<PlaywrightWorkerOptions, "trace" | "screenshot" | "video">>;

const paneProjects = [
  ...Object.values(DESKTOP_WIDTHS).flatMap((width) =>
    desktop.map(({ name, list, context }) => ({
      name: `desktop-${String(width)}-${name}`,
      ...(width === DESKTOP_WIDTHS.regular ? {} : { grepInvert: /Chat reading style/ }),
      use: { ...devices["Desktop Chrome"], viewport: { width, height: 1000 }, requestedPanes: { kind: "desktop" as const, panes: { list, context } } },
    })),
  ),
  ...desktop.map(({ name, list, context }) => ({
    name: `desktop-text150-${name}`,
    grepInvert: /Chat reading style/,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: 1440, height: 1000 },
      fontScale: 1.5,
      requestedPanes: { kind: "desktop" as const, panes: { list, context } },
    },
  })),
  ...["chromium", "webkit"].flatMap((browserName) =>
    [
      { name: "portrait", width: 390, height: 844 },
      { name: "landscape", width: 844, height: 390 },
    ].map(({ name, width, height }) => ({
      name: `${browserName}-phone-${name}`,
      use: {
        ...(browserName === "webkit" ? devices["iPhone 15"] : devices["Pixel 7"]),
        launchOptions: nativeBrowserLaunchOptions(browserName === "webkit" ? "webkit" : "chromium"),
        viewport: { width, height },
        requestedPanes: { kind: "mobile" as const, screen: "production navigation" },
      },
    })),
  ),
];

export default defineConfig<SurfaceWalkOptions>({
  testDir: "tests/e2e",
  testMatch: ["**/corpus-surface-walk.spec.ts"],
  testIgnore: [],
  globalSetup: "./tooling/src/floor/testing/working-tree-guard.ts",
  outputDir: join(run.runRoot, "walk-results"),
  preserveOutput: "always",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  repeatEach: 1,
  forbidOnly: true,
  globalTimeout: budget(SURFACE_NATIVE_TIMEOUT_MS),
  captureGitInfo: { commit: false, diff: false },
  timeout: budget(TEST_TIMEOUT_MS),
  expect: { timeout: budget(EXPECT_TIMEOUT_MS) },
  reporter: [
    [
      fileURLToPath(import.meta.resolve("./tests/support/node/surface-index-reporter.ts")),
      {
        runRoot: run.runRoot,
        nativeJson: join(run.runRoot, "walk.json"),
        htmlDirectory: join(run.runRoot, "walk-html"),
        blobDirectory: join(run.runRoot, "walk-blob"),
      },
    ],
    ["list", { printSteps: true }],
    ["json", { outputFile: join(run.runRoot, "walk.json") }],
    ["blob", { outputDir: join(run.runRoot, "walk-blob"), fileName: "walk.zip" }],
    ["html", { outputFolder: join(run.runRoot, "walk-html"), open: "never" }],
  ],
  use: {
    baseURL: run.origin,
    launchOptions: nativeBrowserLaunchOptions("chromium"),
    actionTimeout: budget(ACTION_TIMEOUT_MS),
    navigationTimeout: budget(NAVIGATION_TIMEOUT_MS),
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "no-preference",
    colorScheme: "dark",
    contrast: "no-preference",
    forcedColors: "none",
    chatStyle: "flat",
    fontScale: appearance.fontScale,
  },
  projects: [
    ...paneProjects.flatMap((project) =>
      SURFACE_PASSES.map((surfacePass) => ({
        ...project,
        name: `${project.name}-${surfacePass}`,
        grepInvert: new RegExp(
          ["grepInvert" in project ? project.grepInvert.source : undefined, SURFACE_BOOT_DIAGNOSTIC_TITLE].filter((source) => source !== undefined).join("|"),
        ),
        use: { ...project.use, surfacePass, ...ARTIFACT_OPTIONS[surfacePass] },
      })),
    ),
    {
      name: "chromium-boot-diagnostic",
      grep: new RegExp(SURFACE_BOOT_DIAGNOSTIC_TITLE),
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        requestedPanes: { kind: "desktop", panes: { list: false, context: false } },
        surfacePass: "evidence",
        ...ARTIFACT_OPTIONS.evidence,
      },
    },
  ],
});
