---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: tooling
plan: test-foundation
---

# The package test-mirror test names a suite the reach list dropped

## What

`tests/tooling/native-package-test-mirror.test.ts` fails two rows ("listed client suite running its listed leaf", "running a leaf its line does not name"). Both use `tests/client/features/plugin/native-guest-protocol.ct.tsx`, whose `PACKAGE_TEST_REACHES` entry item 0989 removed because the suite no longer imports the guest protocol leaf.

## Why

A stale suite-to-leaf fixture fails independently of the package import boundary it must test.

## Done when

The two rows use a suite the reach list does list (or a planted fixture of their own), and `pnpm test:tools tests/tooling/native-package-test-mirror.test.ts` passes.

## Evidence

The listed suite, its leaf and the per-suite rule name are now derived from the dependency-cruiser config's own `tests-client-front-doors-only-listed-*` rule copies (generated from `PACKAGE_TEST_REACHES`), so a delisted suite makes the test throw at load rather than fail two rows. `pnpm test:tools tests/tooling/native-package-test-mirror.test.ts`: 41 of 41 passed.

Earlier landing: `tests/tooling/native-package-test-mirror.test.ts` planted the listed chat suite `tests/client/features/chat/lib/empty-send-and-duration.test.ts` and its listed leaf `continue-on-empty.ts`. Before: 2 failed, 31 passed. After: `pnpm test:tools tests/tooling/native-package-test-mirror.test.ts` passes 33 of 33 on a quiet run.
