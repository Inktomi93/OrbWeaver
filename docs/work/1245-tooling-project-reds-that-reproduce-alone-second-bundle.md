---
kind: bug
status: open
updated: 2026-10-23
priority: P3
area: tooling
---

# Tooling project reds that reproduce alone, second bundle

## What

After item 1240, a full `pnpm test:tools` still leaves these files red when rerun alone at one worker (first error line each): `native-response-lint.int.test.ts` (formData 30 s timeout), `doc/ops/check.int.test.ts` (several work items exceed the 4 KiB cap), `floor/browser/browser-attach.suite.int.test.ts` (touch emulation reports coarse/touch where fine/none was expected), `motion-audit/index.test.ts` (stale `RETRYABLE` copy assertion after 9ff8a1201c; delete that line), `snap/ops/cli-truth.suite.int.test.ts` (accepted-flag ledger vs descriptor grammar), `snap/ops/noise.int.test.ts` (`[]` vs `['/stream']`), `snap/ops/session.suite.int.test.ts` (count 0), `stack/index.test.ts` (lifecycle no longer logs the workloads-worker join; `SERVER_DRAIN_MS` undefined), `ui-audit/index.int.test.ts`, `ui-audit/lib/evidence.test.ts` (stale remedy copy), `ui-audit/ops/hover.int.test.ts`, `ui-audit/ops/hover-walker.int.test.ts`, `ui-audit/ops/walker/state-paint.int.test.ts` (hover and state-paint find nothing). Three more are load-bound and pass alone. Raw output: the primary session scratchpad `treds-full.txt` and `treds-alone.txt`.

## Why

The tooling project is outside `pnpm test` and CI by ruling, so these rot unseen; several are stale copy assertions, which the no-copy-string rule already forbids, and the ui-audit group may be one instrument regression.

## Done when

Each file is green alone or deleted with a reason; copy assertions are removed, not updated; the ui-audit hover and state-paint cause is named and fixed at the instrument or the test; a full `pnpm test:tools` on an idle box lists only load-bound failures, each named.

## Evidence

Filled at landing: what ran and where its output is.
