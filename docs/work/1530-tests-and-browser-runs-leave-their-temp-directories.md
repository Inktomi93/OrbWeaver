---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# Tests and browser runs leave their temp directories behind

## What

The OS temp folder fills with test leftovers: orb-plugin-broker, orb-plugin-folder, orb-plugin-admitted, orb-file-actions, orb-sdk-regression, orb-assets-var, orb-assets-cas and others, plus Chromium profile folders that Playwright, CT and snap runs never remove. Find each creator, give its temp folder an owner that removes it on teardown and on failure (the testkit's disposable stack), and close every browser context and browser the runs open.

## Why

Leftovers reached tens of thousands of entries and helped fill the disk.

## Done when

A full pnpm test, pnpm test:ct and one snap run leave no new orb-\* or Chromium profile entries in the temp folder; a testkit case proves a failing test still removes its folder.

## Evidence

Every runner that starts tests or browsers owns its OS temp folder: `acquireRunTempRoot` in `tooling/src/floor/process/run-temp-root.ts` points TMPDIR, TMP and TEMP at `<tmp>/orb-run-<pid>-<id>`, removes it at exit, and sweeps run folders whose owning pid is dead or reused. It is installed as a Vitest and Playwright globalSetup (`tooling/src/floor/testing/run-temp-root-setup.ts`) and in `runTool`, which every tooling CLI (snap, stack, seed and the rest) enters through.

- Cases: `tests/tooling/floor/process/run-temp-root.int.test.ts` (normal exit removes the folder, a SIGKILLed owner is swept at the next start, a live owner and a reused pid are handled) and `tests/support/node/temp-dir.test.ts` (a failing body still removes the folder `ownedTempDir` made). Each was shown red against a planted break first.
- Full `pnpm test` under the run root: 1 run folder created, none left; failures were the same set that fails with the root disabled, plus load timeouts, except the SDK stand-in fixtures, fixed in `tests/support/node/sdk-process.ts`.
- `pnpm test:ct` on `list-pane-header.ct.tsx` and `gallery.ct.tsx`: 6 passed; `ls -A /tmp` 24089 before, 24087 after; no `.org.chromium.Chromium.*` entry, no `orb-run-*` left.
- One `pnpm snap` drive (Chromium launched and screenshotted): `ls -A /tmp` 24086 before, 24085 after; `orb-*` 3040 before, 3039 after.
- Other lanes share `/tmp`, so each count is a whole-directory count; the new `orb-*` names seen in a window came from their runs on older code.
