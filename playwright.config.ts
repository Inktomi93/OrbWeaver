import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

// E2E — full-stack `.spec.ts` under tests/e2e (NOT a src mirror; spans the whole app). Browser lane =
// Playwright, never vitest (browser-mode hangs — core/Spine-Testing.md §7). Separate runner, NOT in `pnpm
// check` (`pnpm e2e`).
//
// The stack: `scripts/dev/stack.sh start-fg` — the SAME leader body the detached dev supervisor runs
// (one source of truth), foreground so Playwright owns + reaps the child tree. Boot order inside it is
// server → healthz-gated → vite, so vite answering (:5173, the baseURL origin) == everything-ready —
// the url gate below deliberately targets vite, NOT :8788 (probes that want the API hit :8788 direct).
// reuseExistingServer locally: a running `stack.sh start` daemon (same env pins) gets reused instead
// of colliding on ports.

const inCI = process.env.CI !== undefined;

// Opt-in gate for the ONE real-model-turn spec (start-chat-with-character, tagged `@live`): routine runs
// EXCLUDE `@live` so `pnpm e2e` (and the CI smoke gate) never spend live model credits. Run it explicitly
// with `E2E_LIVE=1 pnpm e2e`. `grepInvert` drops matching titles/tags from the run.
const e2eLive = process.env.E2E_LIVE === "1";

// The env pin floor — MUST match scripts/dev/stack.sh (the script `: "${VAR:=default}"`-defaults the
// same values, so this map only matters for determinism when the invoking shell carries strays; the
// secrets are DEV-ONLY deterministic literals, insecure by design).
//
// ENGINES_POSTURE=adopt-only (A.4): the e2e stack ADOPTS the shared box-level fleet when it's up and NEVER
// spawns/manages it. Routine `pnpm e2e` is model-free (the @live spec is grep-excluded), so nothing touches
// the engines; the pin matters for the `E2E_LIVE=1` runs — the live cell needs the vllm backend REGISTERED
// (adopt-only registers it, off/VLLM_DISABLED=true would not) and adopts the fleet, so engines-down fails
// fast with the named "engines down — pnpm engines:start" message instead of a timeout.
const stackEnv = {
  ENGINES_POSTURE: "adopt-only",
  AUTH_MODE: "single-user",
  SESSION_SECRET: "orbweaver-dev-only-session-secret-insecure",
  CREDENTIALS_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  LOCAL_INITIAL_PASSWORD: "orbweaver-dev-password",
  // The rpg-lite @live spec (rpg-lite-loop.spec.ts) reads the provider request body back off
  // /api/_debug/wire/captures to prove the extraction/turn prompt was well-formed — the recorder is a no-op
  // unless enabled here (WIRE_CAPTURE=on wires the sink into the backends; off ⇒ the ring is never written,
  // /api/_debug/wire/captures returns []). NOTE: RPG_TRACE is deliberately NOT set — the rpg flight recorder
  // (R-OBS) is an unbuilt seam (contract-only) and would be inert; lite's every hop RESULT is observable from
  // getTrackerView + wire-captures + canon, so the internal per-hop trace is neither present nor needed here.
  WIRE_CAPTURE: "on",
};

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // Seed KNOWN DB state over the app's tRPC API before the first spec — the suite no longer depends on
  // ambient `./orbweaver.db` drift (a wiped/latched library used to silently redden everything). Runs AFTER
  // the webServer is up. Boot stays start-only (no seed hidden in the webServer command; setup owns it).
  globalSetup: "./tests/e2e/support/global-setup.ts",
  outputDir: "reports/e2e-results", // reports/ is gitignored (not playwright's default repo-root dir)
  fullyParallel: false,
  workers: 1, // serial — avoids libSQL :memory: state collisions once the stack is wired
  // Exclude the `@live` real-model-turn spec unless E2E_LIVE=1 (see e2eLive above) — the routine + CI-smoke
  // default is model-free. `grepInvert` matches against the test title (the `@live` tag is appended to it).
  ...(e2eLive ? {} : { grepInvert: /@live/u }),
  forbidOnly: inCI,
  retries: inCI ? 2 : 0,
  // list = live CLI visibility (stops every ad-hoc run needing --reporter=line); json = machine-readable
  // results (extracting a failing test's NAME from html/summary output cost real re-runs, 2026-07-24).
  reporter: [["list"], ["json", { outputFile: "reports/e2e-report.json" }], ["html", { outputFolder: "reports/e2e-report", open: "never" }]],
  // Assertion default stays 5s except where a spec overrides; a hung ACTION fails at 15s with a precise
  // "action timeout" instead of burning the whole test timeout into a vaguer expect failure.
  use: {
    baseURL: "http://localhost:5173",
    // retain-on-failure, NOT on-first-retry: local retries=0, so first-retry artifacts NEVER exist for a
    // plain local failure — the exact runs that need diagnosing (2026-07-24 audit). Video stays OFF
    // (owner ruling): trace snapshots + the failure screenshot cover diagnosis, and `pnpm record`
    // (scripts/probes/record.ts) exists for the rare deliberate recording — no per-run encode cost for
    // artifacts nobody opens.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    // Determinism: date/locale-rendering assertions must not depend on the host machine's settings.
    timezoneId: "UTC",
    locale: "en-US",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bash scripts/dev/stack.sh start-fg",
    // Vite, not :8788 — the leader healthz-gates the server BEFORE booting vite (see header). And
    // `localhost`, not 127.0.0.1: vite v8 binds [::1] only; the IPv4 loopback never answers.
    url: "http://localhost:5173",
    reuseExistingServer: !inCI,
    // Cold boot = tsx compile + healthz gate (≤60s in-script) + vite; generous so CI never flakes here.
    timeout: 180_000,
    env: stackEnv,
    // Pipe the boot output into playwright's own stdout/stderr — without this a webServer boot FAILURE
    // logs only "was not able to start. Exit code: 1" and the actual boot error is swallowed
    // (undiagnosable from the verify stage log, 2026-07-17).
    stdout: "pipe",
    stderr: "pipe",
  },
});
