---
kind: tooling
status: open
updated: 2026-10-24
priority: P3
area: tooling
---

# CT runs end with a pnpm recursive-exec failure line

## What

Every pnpm test:ct run prints \[WebServer] ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL after the tests report. The webServer command in playwright-ct.config.ts runs vite preview under pnpm --filter @orb/client exec, and the configured graceful shutdown stops it with SIGTERM; pnpm likely reports the signal-killed child as a failed exec. Not yet reproduced in isolation.

## Why

A failure line on every passing run trains readers to ignore failure lines, and lanes spend a paragraph per report explaining it away.

## Done when

The cause is confirmed; a passing CT run prints no failure line, by running the preview so the signal exit is not reported as a failure; a real webServer startup failure still fails the run, shown with a planted bad command.

## Evidence

Filled at landing: what ran and where its output is.
