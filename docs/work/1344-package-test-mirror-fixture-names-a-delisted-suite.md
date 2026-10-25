---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: tooling
---

# The package test-mirror test names a suite the reach list dropped

## What

`tests/tooling/native-package-test-mirror.test.ts` fails two rows ("listed client suite running its listed leaf", "running a leaf its line does not name"). Both use `tests/client/features/plugin/native-guest-protocol.ct.tsx`, whose `PACKAGE_TEST_REACHES` entry item 0989 removed because the suite no longer imports the guest protocol leaf.

## Done when

The two rows use a suite the reach list does list (or a planted fixture of their own), and `pnpm test:tools tests/tooling/native-package-test-mirror.test.ts` passes.

## Evidence

`tests/tooling/native-package-test-mirror.test.ts` now plants the listed chat suite `tests/client/features/chat/lib/empty-send-and-duration.test.ts` and its listed leaf `continue-on-empty.ts`. Before: 2 failed, 31 passed. After: `pnpm test:tools tests/tooling/native-package-test-mirror.test.ts` passes 33 of 33 on a quiet run.
