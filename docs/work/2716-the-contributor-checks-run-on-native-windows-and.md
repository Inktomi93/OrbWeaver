---
kind: bug
status: blocked
updated: 2026-11-12
priority: P2
area: tooling
blocked: owner
plan: cross-platform
---

# The contributor checks run on native Windows and macOS: the lint config loads and two tooling tests hold

## What

The contributor workflow fails on Windows and macOS for reasons that are about the operating system, and it has been red for weeks so nobody read them. On Windows every part of `scripts/eslint-parts.ts` dies at config load: ESLint refuses a config entry whose `files` list is empty. The likely source is a file list the config computes at load, such as `listSlotSurfacePaths` in `tooling/src/eslint/ui-classes/list-slots.ts` spread into `eslint.config.ts`, which finds nothing when paths carry the other separator. `tests/tooling/stack/ops/prod-support.test.ts` expects the Linux error code when a pidfile path is a directory; Windows and macOS answer with a different code. `tests/tooling/floor/process/incarnation.int.test.ts` times out on Windows in the case that stops a live child. Evidence: the contributor run on the pushed main, jobs for Windows and macOS.

## Why

The README promises the contributor commands run natively on macOS and Windows, and no ESLint rule runs at all on Windows today.

## Done when

`pnpm lint:eslint:parts` loads its config and lints on Windows, with every computed file list built from separator-neutral paths and a test that fails when one comes back empty. The pidfile test asserts the behaviour on each system without naming one system's error code. The incarnation case passes on Windows or its cause is found and fixed. The contributor workflow is green on both systems.

## Evidence

Filled at landing: what ran and where its output is.
