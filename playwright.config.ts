import process from "node:process";
import { defineConfig, devices } from "@playwright/test";
import { DEV_TARGET_ALLOWED, MODE_PROJECTS, SINGLE_USER } from "./tests/e2e/support/modes.ts";

// E2E — full-stack `.spec.ts` under tests/e2e (NOT a src mirror; spans the whole app). Browser lane =
// Playwright, never vitest (browser-mode hangs — core/Spine-Testing.md §7). Separate runner, NOT in `pnpm
// check` (`pnpm e2e`).
//
// AUTH-MODE PROJECT AXIS (the multi-mode harness): one Playwright project + one webServer PER auth mode
// (tests/e2e/support/modes.ts is the source of truth for each mode's ports/DB/secrets). Each mode gets an
// ISOLATED stack — its own `AUTH_MODE`, DB/assets dir, and a distinct port pair — so the modes never collide
// and a spec can boot the mode it needs:
//   • single-user — the DEFAULT lane (ports 8796/5181, no login; the existing 22 specs run here unchanged).
//   • local       — cookie/BFF sessions (ports 8799/5183); global-setup seeds a member for the multi-human specs.
//   • forward-header — SSO trusted-proxy signed-JWT (ports 8798/5182); the actor mints the JWT in-test.
//   • oidc         — DEFERRED (no mock IdP yet); see modes.ts.
// A spec targets its mode by the Playwright PROJECT name (a project-scoped `test.describe` / the runner's
// `--project=<name>`); the default `pnpm e2e` runs every project.
//
// The stack: `scripts/dev/stack.sh start-fg` — the SAME leader body the detached dev supervisor runs (one
// source of truth), foreground so Playwright owns + reaps the child tree. Boot order inside it is server →
// healthz-gated → vite, so vite answering (the baseURL origin) == everything-ready.

const inCI = process.env["CI"] !== undefined;

// Opt-in gate for the real-model-turn specs (tagged `@live`): routine runs EXCLUDE `@live` so `pnpm e2e`
// never spends live model credits. Run them with `E2E_LIVE=1 pnpm e2e`. `grepInvert` drops matching tags.
const e2eLive = process.env["E2E_LIVE"] === "1";

// One Playwright project per mode. Every project shares the browser/use defaults; each pins its own baseURL
// (its vite origin) + `E2E_BASE_URL` (via the webServer env) so the support tRPC + actor clients hit THAT
// mode's stack.
const projects = MODE_PROJECTS.map((mode) => ({
  name: mode.name,
  testMatch: mode.testMatch,
  use: { ...devices["Desktop Chrome"], baseURL: mode.baseUrl },
}));

// One webServer per mode. EVERY mode boots its OWN isolated stack on distinct ports and NEVER blind-reuses
// (the `reuseExistingServer` hazard: attaching to a stack the harness does not own — it seeded the operator's
// LIVE dev DB that way, see modes.ts's incident note; and attaching to a wrong-MODE stack holding the port
// broke an earlier run). Distinct ports + `reuseExistingServer:false` make each independent.
// The ONE exception is the deliberate `E2E_ALLOW_DEV_TARGET=1` drive: single-user is then aimed at the
// operator's already-running dev stack, so it must REUSE it rather than try to boot a second one on :8788.
// The actor clients target their stack via the spec's per-project Playwright `baseURL` (not an env), so no
// `E2E_BASE_URL` threading is needed here.
const webServers = MODE_PROJECTS.map((mode) => ({
  command: "bash scripts/dev/stack.sh start-fg",
  url: mode.baseUrl,
  reuseExistingServer: mode.name === SINGLE_USER.name && DEV_TARGET_ALLOWED && !inCI,
  timeout: 180_000,
  env: mode.webServerEnv,
  stdout: "pipe" as const,
  stderr: "pipe" as const,
}));

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // Seed KNOWN DB state over each booted stack's tRPC API before the first spec (support/global-setup.ts —
  // iterates the mode projects, seeds each by its origin). Runs AFTER the webServers are up.
  globalSetup: "./tests/e2e/support/global-setup.ts",
  outputDir: "reports/e2e-results", // reports/ is gitignored
  fullyParallel: false,
  workers: 1, // serial — avoids libSQL :memory: state collisions once the stack is wired
  // 60s, not the 30s default: since single-user got its OWN stack (no more reusing a warm dev server), the
  // FIRST spec of a run pays vite's cold module compile for the whole chat room. Measured: chat-persistence
  // @smoke timed out at 30s cold, then passed in 25.5s warm — the budget has to cover the cold path.
  timeout: 60_000,
  ...(e2eLive ? {} : { grepInvert: /@live/u }),
  forbidOnly: inCI,
  retries: inCI ? 2 : 0,
  reporter: [["list"], ["json", { outputFile: "reports/e2e-report.json" }], ["html", { outputFolder: "reports/e2e-report", open: "never" }]],
  use: {
    // retain-on-failure, NOT on-first-retry: local retries=0, so first-retry artifacts NEVER exist for a
    // plain local failure — the exact runs that need diagnosing.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    // Determinism: date/locale-rendering assertions must not depend on the host machine's settings.
    timezoneId: "UTC",
    locale: "en-US",
  },
  projects,
  webServer: webServers,
});
