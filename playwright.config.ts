import { resolve } from "node:path";
import process from "node:process";
import { budget } from "@orb/tooling/_shared/load-budget";
import type { ReporterDescription } from "@playwright/test";
import { defineConfig, devices } from "@playwright/test";
import { DEV_TARGET_ALLOWED, MODE_PROJECTS, SINGLE_USER } from "./tests/e2e/support/modes.ts";

// E2E — full-stack `.spec.ts` under tests/e2e (NOT a src mirror; spans the whole app). Browser lane =
// Playwright, never vitest (browser-mode hangs — docs/law/Spine-Testing.md §7). Separate runner, NOT in `pnpm
// check` (`pnpm e2e`).
//
// AUTH-MODE PROJECT AXIS (the multi-mode harness): one Playwright project + one webServer PER auth mode
// (tests/e2e/support/modes.ts is the source of truth for each mode's ports/DB/secrets). Each mode gets an
// ISOLATED stack — its own `AUTH_MODE`, DB/assets dir, and a distinct port pair — so the modes never collide
// and a spec can boot the mode it needs:
//   • single-user — the DEFAULT lane (ports 8796/5181, no login; the pre-existing e2e specs run here unchanged).
//   • local       — cookie/BFF sessions (ports 8799/5183); global-setup seeds a member for the multi-human specs.
//   • forward-header — SSO trusted-proxy signed-JWT (ports 8798/5182); the actor mints the JWT in-test.
//   • oidc         — DEFERRED (no mock IdP yet); see modes.ts.
// A spec targets its mode by the Playwright PROJECT name (a project-scoped `test.describe` / the runner's
// `--project=<name>`); the default `pnpm e2e` runs every project.
//
// The stack: `tooling/src/stack/stack.sh start-fg` — the SAME leader body the detached dev supervisor runs (one
// source of truth), foreground so Playwright owns + reaps the child tree. Boot order inside it is server →
// healthz-gated → vite, so vite answering (the baseURL origin) == everything-ready.

const inCI = process.env["CI"] !== undefined;

// Opt-in gate for the real-model-turn specs (tagged `@live`): routine runs EXCLUDE `@live` so `pnpm e2e`
// never spends live model credits. Run them with `E2E_LIVE=1 pnpm e2e`. `grepInvert` drops matching tags.
const e2eLive = process.env["E2E_LIVE"] === "1";
// The manual `pnpm e2e:live` front door promises a real model-turn verdict. Direct/routine e2e runs may
// honestly contain only optional unavailable tests; only that front door enables the all-skipped refusal.
const requireLiveEvidence = process.env["E2E_REQUIRE_EVIDENCE"] === "1";
const requiredLiveReporter = resolve(import.meta.dirname, "tooling/src/verify/ops/required-live-evidence-reporter.ts");
const reporters: ReporterDescription[] = [
  ["list"],
  ["json", { outputFile: "reports/e2e-report.json" }],
  ["html", { outputFolder: "reports/e2e-report", open: "never" }],
  ...(requireLiveEvidence ? [[requiredLiveReporter] as const] : []),
];

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
  command: "bash tooling/src/stack/stack.sh start-fg",
  url: mode.baseUrl,
  reuseExistingServer: mode.name === SINGLE_USER.name && DEV_TARGET_ALLOWED && !inCI,
  timeout: budget(180_000),
  env: mode.webServerEnv,
  stdout: "pipe" as const,
  stderr: "pipe" as const,
}));

export default defineConfig({
  testDir: "tests/e2e",
  // Seed KNOWN DB state over each booted stack's tRPC API before the first spec, then WARM each stack's
  // client in a real browser (support/global-setup.ts — iterates the mode projects, seeds + warms each by
  // its origin). Runs AFTER the webServers are up.
  // docs/work/0062 — runs FIRST (Playwright loads `globalSetup` array entries in order) so the guard's
  // baseline predates the e2e seed/warm-up writes this config's own globalSetup performs against the
  // stack's DB, never against this repo's working tree. Its returned teardown runs LAST, after every
  // spec and after the e2e seed's own teardown (if any), for the same reason.
  globalSetup: [resolve(import.meta.dirname, "tooling/src/_shared/working-tree-guard.ts"), "./tests/e2e/support/global-setup.ts"],
  outputDir: "reports/e2e-results", // reports/ is gitignored
  fullyParallel: false,
  workers: 1, // serial — avoids libSQL :memory: state collisions once the stack is wired
  // 60s, not the 30s default. It USED to be the cold-boot budget: since single-user got its own stack, the
  // FIRST spec of a run paid vite's cold module compile for the whole chat room (measured: chat-persistence
  // @smoke timed out at 30s cold, passed in 25.5s warm). That cost kept growing with the client and crossed
  // 60s too (#571 — the @smoke case died at `page.reload` with `net::ERR_ABORTED`, the abort being the
  // test-timeout context close). Raising it again would only restart that treadmill, so globalSetup now
  // WARMS each mode's client before the first spec and no spec pays cold compile at all. This stays at 60s
  // as headroom for the slowest WARM spec (the room drives real turns), not as a cold-boot budget.
  timeout: budget(60_000),
  ...(e2eLive ? {} : { grepInvert: /@live/u }),
  forbidOnly: inCI,
  retries: inCI ? 2 : 0,
  reporter: reporters,
  use: {
    // retain-on-failure, NOT on-first-retry: local retries=0, so first-retry artifacts NEVER exist for a
    // plain local failure — the exact runs that need diagnosing.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: budget(15_000),
    // Determinism: date/locale-rendering assertions must not depend on the host machine's settings.
    timezoneId: "UTC",
    locale: "en-US",
  },
  projects,
  webServer: webServers,
});
