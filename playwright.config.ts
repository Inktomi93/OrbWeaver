import process from "node:process";
import { budget } from "@orb/tooling/floor/host/load-budget";
import type { ReporterDescription } from "@playwright/test";
import { defineConfig, devices } from "@playwright/test";
import {
  BROWSER_PROJECTS,
  DEV_TARGET_ALLOWED,
  E2E_REPORT_PREFIX,
  OIDC_MODE,
  oidcIssuerTls,
  SINGLE_USER,
  selectedModeProjects,
} from "./tests/e2e/support/modes.ts";

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
//   • oidc         — the app as an OIDC client of an HTTPS mock issuer (ports 8795/5184, issuer 8794); its specs
//                    run on the SERVER origin, which serves a client the webServer builds first. See modes.ts.
// A spec targets its mode by the Playwright PROJECT name (a project-scoped `test.describe` / the runner's
// `--project=<name>`); the default `pnpm e2e` runs every project.
//
// The stack: `pnpm stack up-fg` — the SAME leader body the detached dev supervisor runs (one source of
// truth), foreground so Playwright owns + reaps the child tree. Boot order inside it is server →
// healthz-gated → vite, so vite answering (the baseURL origin) == everything-ready.

const inCI = process.env["CI"] !== undefined;

// Opt-in gate for the real-model-turn specs (tagged `@live`): routine runs EXCLUDE `@live` so `pnpm e2e`
// never spends live model credits. Run them with `E2E_LIVE=1 pnpm e2e`. `grepInvert` drops matching tags.
const e2eLive = process.env["E2E_LIVE"] === "1";
const reporters: ReporterDescription[] = [
  ...(process.env["GITHUB_ACTIONS"] ? [["github"] as const] : []),
  ["list"],
  ["./tests/e2e/support/disposable-reporter.ts"],
  ["json", { outputFile: `${E2E_REPORT_PREFIX}-report.json` }],
  ["html", { outputFolder: `${E2E_REPORT_PREFIX}-report`, open: "never" }],
];

// One Playwright project per mode. Every project shares the browser/use defaults; each pins its own baseURL
// (its vite origin) + `E2E_BASE_URL` (via the webServer env) so the support tRPC + actor clients hit THAT
// mode's stack.
const projects = BROWSER_PROJECTS.map(({ name, mode, device, chatStyle }) => ({
  name,
  testMatch: mode.testMatch,
  metadata: { chatStyle, authMode: mode.name },
  use: { ...devices[device], baseURL: mode.baseUrl },
}));

// One webServer per mode. EVERY mode boots its OWN isolated stack on distinct ports and NEVER blind-reuses
// (the `reuseExistingServer` hazard: attaching to a stack the harness does not own — it seeded the operator's
// LIVE dev DB that way, see modes.ts's incident note; and attaching to a wrong-MODE stack holding the port
// broke an earlier run). Distinct ports + `reuseExistingServer:false` make each independent.
// The ONE exception is the deliberate `E2E_ALLOW_DEV_TARGET=1` drive: single-user is then aimed at the
// operator's already-running dev stack, so it must REUSE it rather than try to boot a second one on :8788.
// The actor clients target their stack via the spec's per-project Playwright `baseURL` (not an env), so no
// `E2E_BASE_URL` threading is needed here.
// Playwright starts every configured webServer even when `--project` selects fewer projects, so a
// `--project=single-user` run (the @smoke tier) would still boot every stack. Boot only the selected modes. Read
// from argv because only the runner process starts webServers; workers re-load this file without the flag.
const bootedModes = selectedModeProjects(process.argv);
// The oidc server child trusts the issuer through NODE_EXTRA_CA_CERTS, read once at its boot: mint before it starts.
const optionTerminator = process.argv.indexOf("--");
const collecting = process.argv.slice(0, optionTerminator === -1 ? undefined : optionTerminator).includes("--list");
if (!collecting && bootedModes.includes(OIDC_MODE)) {
  oidcIssuerTls();
}

const STACK_UP = "node tooling/src/stack/cli.ts up-fg";
const webServers = bootedModes.map((mode) => ({
  // A mode whose spec origin is the server builds the client it serves before the stack boots.
  command:
    mode.servedClient === undefined ? STACK_UP : `pnpm --filter @orb/client exec vite build --configLoader native --outDir ${mode.servedClient} && ${STACK_UP}`,
  url: mode.baseUrl,
  reuseExistingServer: mode.name === SINGLE_USER.name && DEV_TARGET_ALLOWED && !inCI,
  gracefulShutdown: { signal: "SIGTERM" as const, timeout: budget(15_000) },
  timeout: budget(180_000),
  env: mode.webServerEnv,
  stdout: "pipe" as const,
  stderr: "pipe" as const,
}));

export default defineConfig({
  testDir: "tests/e2e",
  // Seed selected owned stacks without navigating the client before its first spec.
  // The working-tree guard surrounds setup, specs and teardown.
  globalSetup: ["./tooling/src/floor/testing/working-tree-guard.ts", "./tests/e2e/support/global-setup.ts"],
  outputDir: `${E2E_REPORT_PREFIX}-results`, // reports/ is gitignored
  fullyParallel: false,
  workers: 1, // serial — avoids libSQL :memory: state collisions once the stack is wired
  // The first spec owns its cold navigation within the same native test budget.
  timeout: budget(60_000),
  ...(e2eLive ? {} : { grepInvert: /@live/u }),
  forbidOnly: inCI,
  retries: 0,
  reporter: reporters,
  use: {
    // Preserve evidence from the first failure; there is no retry run.
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
