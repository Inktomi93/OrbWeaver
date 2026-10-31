---
kind: tooling
status: open
updated: 2026-10-31
priority: P3
area: tooling
plan: test-foundation
---

# CT runs end with a pnpm recursive-exec failure line

## What

Every pnpm test:ct run prints \[WebServer] ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL after the tests report. The webServer command in playwright-ct.config.ts runs vite preview under pnpm --filter @orb/client exec, and the configured graceful shutdown stops it with SIGTERM; pnpm likely reports the signal-killed child as a failed exec. Not yet reproduced in isolation.

## Why

A failure line on every passing run trains readers to ignore failure lines, and lanes spend a paragraph per report explaining it away.

## Done when

The cause is confirmed; a passing CT run prints no failure line, by running the preview so the signal exit is not reported as a failure; a real webServer startup failure still fails the run, shown with a planted bad command.

## Evidence

Cause confirmed in isolation: `timeout -s TERM 4 pnpm --filter @orb/client exec sleep 30` prints `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`; `pnpm --dir packages/client exec sleep 30` under the same SIGTERM prints nothing. The `--filter` form reports a signal-killed child as a failed recursive exec.

`playwright-ct.config.ts` runs the preview under `pnpm --dir packages/client exec`; the build step is unchanged. `CT_PORT=3197 pnpm test:ct tests/client/components/entry-list-consent.ct.tsx`: with the old command the run passes but prints `[WebServer] Error: ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`; with the new one it passes (1 passed) and prints no failure line. A planted `--outDir f1297-missing-dist` on the preview still fails the run: `Process from config.webServer was not able to start. Exit code: 1`, exit 1.
