---
kind: bug
status: doing
updated: 2026-11-27
priority: P3
area: tooling
lane: wt/agent-a1902dde200366c39
plan: snap-secret-hygiene
---

# Keep a snap CLI's noted values until the process exits

## What

`tooling/src/snap/ops/host.ts` calls `forgetPrivateValues` when each run ends, the one-shot CLI run included. Any unhandled rejection Node detects after the run's last I/O turn reaches the crash scrub with nothing noted and prints its URL raw. That covers a late timer and also a rejection created before the run whose detection falls after it, as with a run that finishes inside one microtask drain.

## Why

The crash scrub in `tooling/src/snap/cli.ts` only masks values still noted when the handler runs, so a late rejection quoting a base URL token after the run ends prints the token to the terminal.

## Done when

A one-shot CLI host keeps its run's noted values until process exit, or a host forgets at the start of the next run instead of at the end of this one, and the header of `tooling/src/snap/lib/private-values.ts` states the new lifetime. A red-first child-process test plants a rejection detected after the run returns and shows its token masked.

## Evidence

Filled at landing: what ran and where its output is.
