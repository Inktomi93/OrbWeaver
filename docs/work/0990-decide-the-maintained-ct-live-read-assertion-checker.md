---
kind: decision
status: open
updated: 2026-10-12
priority: P2
area: tooling
plan: test-foundation
---

# Decide the maintained CT live-read assertion checker

## What

Compare ct-no-oneshot-live-read-assert with maintained Playwright lint rules on the strict CT population. Preserve live-read and imported-snapshot semantics where native tools do not cover them; move syntax-only enforcement to maintained lint where equivalent. Legacy CT repairs are excluded.

## Why

The lint migration does not establish equivalent coverage for typed live-read identity. Population shrink alone is not a reason to delete a real invariant.

## Done when

Record the coverage comparison and keep, replace or narrow the checker with focused positive and negative controls; do not retrofit legacy CTs or duplicate the shared reference reader.

## Evidence

Keep the gate and native rules. Native lint does not replace initializer identity.

### Authority and population

`tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts` owns the predicate. `tests/tooling/verify/gates/ct-no-oneshot-live-read-assert.test.ts` runs the differential controls.

Installed `eslint-plugin-playwright@2.12.1` supplies native rule and parser authority. `eslint.config.js` enables its web-first and count rules at error severity.

Initializer identity uses `tooling/src/floor/code-facts/reference-fact.ts`. Receiver methods and the assertion root use spelling.

Tracked `compilePopulation` inventory admits product CTs in `tests/client/components/`: `flow-dialog.ct.tsx`, `picker-dialog.ct.tsx` and `viewer-dialog.ct.tsx`. It also admits:

- `tests/support/browser/contained-within.ct.tsx`
- `tests/support/browser/touch-floor.ct.tsx`
- `tests/tooling/design-audit-walker.ct.tsx`
- `tests/tooling/snap/ops/overflow.ct.tsx`

`tests/legacy/` is excluded. Inventory is not a live verdict. Product and legacy files are unchanged.

### Differential controls

Fixtures call native ESLint and `runPolicyPass`, asserting findings, rule identifiers, parser success and authority alarms.

| Control | Gate | Native |
| - | - | - |
| Inline text equality; local or mutable snapshot | Reject | Web-first rejection |
| Snapshot alias chain; pure transform; text containment | Reject | Accept |
| Awaited locator count equality | Reject | Count rejection |
| Locator count range; synchronous recorder count | Reject | Accept |
| Recorder input selection; geometry; page evaluation; focus snapshot | Reject | Accept |
| Imported alias; re-exported alias; imported mutable snapshot | Reject | Accept |
| Live snapshot beside clean same-named shadow | Reject live only | Reject live only |
| Plain imported/local value; polling live read; locator `toHaveText` | Accept | Accept |
| `isVisible`; imported assertion alias; bracket text method | Accept | Web-first rejection |
| Destructured geometry; bound read method | Accept | Accept |

Native web-first supports `toBe`, `toEqual`, `toBeTruthy` and `toBeFalsy`. Dereference follows immediate locals, not imports or recursive aliases.

Gate method/matcher limits live in `DOM_READ_METHODS`, `RECORDER_READ_METHODS` and `RETRYING_MATCHERS`. It follows aliases, selections and transforms, recognizing `activeElement` and bare single-argument `expect` with `.not`.

### Decision and verification

Removing an overlapping method loses uncovered snapshots, aliases and transforms. No equivalent independent predicate was demonstrated. A syntax exclusion duplicates native recognition. Keep semantic and native enforcement.

Passed: `pnpm test:scoped tests/tooling/verify/gates/ct-no-oneshot-live-read-assert.test.ts`. Completed report: `success: true`. Slot: `codex-ct-checker-990-706637-2026-10-12T23-41-50-359Z`, published through `reports/test-report.json`. Inline rejection controls imported-snapshot acceptance; native replacement fails that requirement.

`pnpm typecheck --config tsconfig.json` passed. Main owns review, landing and documentation references. Conformance and product CTs are deferred; enforcement did not change.
