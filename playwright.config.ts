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

// The env pin floor — MUST match scripts/dev/stack.sh (the script `: "${VAR:=default}"`-defaults the
// same values, so this map only matters for determinism when the invoking shell carries strays; the
// secrets are DEV-ONLY deterministic literals, insecure by design). RUNNER_OVERRIDE is deliberately
// absent — the scripted-runner seam rides through from the caller unclobbered.
const stackEnv = {
  VLLM_DISABLED: "true",
  AUTH_MODE: "single-user",
  SESSION_SECRET: "orbweaver-dev-only-session-secret-insecure",
  // biome-ignore lint/security/noSecrets: deterministic DEV-ONLY literal, mirrors scripts/dev/stack.sh
  CREDENTIALS_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  LOCAL_INITIAL_PASSWORD: "orbweaver-dev-password",
};

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
  webServer: {
    command: "bash scripts/dev/stack.sh start-fg",
    // Vite, not :8788 — the leader healthz-gates the server BEFORE booting vite (see header). And
    // `localhost`, not 127.0.0.1: vite v8 binds [::1] only; the IPv4 loopback never answers.
    url: "http://localhost:5173",
    reuseExistingServer: !inCI,
    // Cold boot = tsx compile + healthz gate (≤60s in-script) + vite; generous so CI never flakes here.
    timeout: 180_000,
    env: stackEnv,
  },
});
