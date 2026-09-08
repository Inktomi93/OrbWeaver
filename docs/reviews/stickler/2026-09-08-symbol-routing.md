---
kind: review
status: active
updated: 2026-09-08
---

# Symbol routing review

Review target: the uncommitted #1883 change to `tooling/src/codemod/lib/imports.ts` and its complete integration test over `9cde150af`. The previously-cleared codemod safety work and unrelated shared-tree changes were excluded. `scripts/codemods/type-worlds-scroll-fade.ts` was read only as the immediate consumer; it was not executed.

## Findings

No open findings remain.

## Finding resolved during review

### Medium — a named type route merged into an illegal whole-type default declaration

`tooling/src/codemod/lib/imports.ts:389` — the first target-selection predicate excluded a whole-declaration type import with a default binding only when the incoming route contained a value. A type-only named route therefore merged into `import type Default from "./destination"` and formed `import type Default, { Shape }`, which TypeScript forbids.

Failure scenario: a consumer imports `Shape` through a whole-declaration type import from the old source and already imports a default type from the destination. Routing `Shape` to that destination should preserve both type-only bindings, but the helper creates TS1363 and the diagnostics guard refuses the otherwise legitimate codemod. With the explicit diagnostics opt-out, the invalid bytes could be applied.

Evidence produced this session: installed TypeScript 6.0.3 independently reports TS1363 for a whole-type import combining default and named bindings. The public-harness reproduction is retained at `/tmp/codex-stickler-route-default-type-refusal.log`: diagnostics found TS1363, refused apply, and left disk unchanged.

Resolution verified: destination selection now excludes every whole-declaration type import carrying a default binding, regardless of incoming value/type posture, so the helper creates a separate named type import. The exact public-harness rerun at `/tmp/codex-stickler-route-default-type-green.log` applied with `diagnosticErrors:0` and produced separate `import type Default` and `import { type Shape }` declarations. The committed regression and the complete import-helper suite passed 9/9.

## Verified clean

- Read `imports.ts` and `imports.int.test.ts` in full, then inspected the public codemod export and the immediate scroll-fade consumer without reopening the wider kit review.
- Whole-declaration type imports retain type-only semantics under `verbatimModuleSyntax`; diagnostics are enabled in the proof.
- Routing a value into a named whole-type destination converts that declaration to a mixed value import and marks its existing names `type`.
- Namespace destinations remain intact and receive a separate named import.
- Existing and incoming aliases are compared by exported name plus local binding, so distinct local aliases both survive while exact duplicates remain idempotent.
- A destination equal to the original source is excluded before plan construction; unmapped importers and same-source no-ops are absent from `touchedFiles`.
- Cold final verification: `tests/tooling/codemod/lib/imports.int.test.ts` passed 9/9 with no type errors; `git diff --check` passed on both reviewed files.
- No real repository transformation, board mutation, commit, or broad gate was run.

## Unconfirmed, low priority

None.

## Issue summary

Symbol-routing review confirmed one medium-severity type-syntax defect, repaired and reverified during review; zero findings remain open. Whole/type-specific imports, value merging, namespace destinations, aliases, same-source no-ops, and narrow plan declarations are clean in the reviewed scope. Report: `docs/reviews/stickler/2026-09-08-symbol-routing.md`.
