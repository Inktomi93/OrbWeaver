---
kind: review
status: active
updated: 2026-09-05
---

# Cold review: shared semantic readers

## Findings

No confirmed findings remain on the final reviewed bytes. Severity ceiling: none.

## Verified clean

### Scope and governing contract

Reviewed the uncommitted `codex/gate-shared-semantic-readers` delta from base `80890046b4f93071d2e77cf242abad31eea31d28` for #1584. The review stayed inside the shared AST/type reader foundations: no gate module or ResourceHost judgment was included.

Read in full before judging the implementation: `.claude/agent-doctrine.md`; `docs/architecture/core/AGENTS.md`; `Core-Laws-and-Precedents.md`; `Core-0-Architecture-and-Structure.md` §9; `Core-Tooling-Law.md` §§2, 4, 6, and 9; `GATE-AUTHORING.md`; `Documentation-Law.md`; `Core-Docs-Formatting-Law.md`; `docs/design/gate-runtime-standardization.md`; both `simple-visitors-*.md` manifests; and `docs/reviews/gate-runtime/shared-semantic-readers.md`.

Read every final changed source and test file in full:

- `tooling/src/verify/contract/{reference-fact,static-authored-value}.ts`
- `tooling/src/verify/lib/{reference-fact,reference-fact-module,reference-fact-call,reference-fact-global,reference-fact-writes,static-authored-value}.ts`
- `tests/tooling/verify/lib/{reference-fact,reference-fact-module,static-authored-value}.test.ts`
- `tests/tooling/verify/lib/{reference-fact-origin,policy-pass-readers}.suite.test.ts`

Also read the unchanged integration seams used by the new proof: `tooling/src/verify/contract/policy.ts`, `tooling/src/verify/lib/policy-pass.ts`, the existing live consumer `tooling/src/verify/lib/gate-contract-origin.ts`, and its full `tests/tooling/verify/lib/gate-contract.test.ts` compatibility suite.

### Adversarial reader probes

In-memory ts-morph probes and the existing consumer suite reproduced six silent-resolution/compatibility classes during review. Each was routed to the warm owner, fixed, and rerun against the final bytes:

| Class | Initial wrong result | Final result |
| - | - | - |
| missing relative or `#` namespace/re-export door | `resolved/external-door` | `unresolved/missing`; bare package door remains `resolved/external-door` |
| member write through const, mutable, assignment-established, object/array-destructured alias | original spelling remained resolved | `unresolved/write`; an alias with no member write remains resolved |
| local export alias and cross-source name collision | canonical source/name/declaration could disagree | same-source public alias resolves coherently; imported local re-export and wrapped imported alias refuse `unsupported` |
| bare-global versus `globalThis` carrier write | one spelling remained resolved | both carrier directions, including computed `globalThis["Date"]`, refuse `write` |
| member invocation through declaration/assignment/destructuring aliases | authored composite remained resolved | direct, object/array declaration, direct assignment, and object/array assignment aliases refuse `dynamic`; free `record(value)` remains resolved by the declared effect boundary |
| stable binding lookup after member mutation | `resolveStableExpression` refused the declaration, so the existing gate-contract consumer lost DELETE/UPDATE and alias mutation findings | binding-only reassignment controls source-expression chasing; module/global origin and static authored values retain full member-effect refusal |

The same write-family review caught one final binding-identity edge: shorthand destructuring assignment initially recorded the synthesized object-property symbol, so `({ Date } = globalThis); Date` stayed resolved in a diagnostic-clean DOM Project. The final `lexicalReferenceSymbol` is shared by write collection, declaration lookup, write inspection, and imported-target chasing; the shorthand write now refuses and an imported shorthand object value still resolves through its canonical source.

Additional positive controls confirmed: 3,000 immutable binding hops resolve without a numeric cap; ambiguous declarations and re-export cycles refuse; dot/optional/computed members normalize; namespace, explicit re-export, export-star, default-import object, imported shorthand, lexical-shadow, call/construct, and call/apply/bind cases retain the intended facts; unresolved authored builders/templates/methods/accessors/holes/prototype setters remain loud.

The external package `external-door` result is intentionally syntactic and was not treated as export-existence proof. Static authored values were judged as source shape, not as arbitrary runtime effect evaluation: free-function effects, cross-file escaped-reference mutation, Zod/SQL/CSS/JSX semantics, class/schema/typed receiver provenance, and policy-specific subject interpretation remain outside this reader contract as the map states.

### Behavioral and structural verification

The final focused behavior run was green:

```text
pnpm test:scoped tests/tooling/verify/lib/gate-contract.test.ts tests/tooling/verify/lib/reference-fact.test.ts tests/tooling/verify/lib/reference-fact-origin.suite.test.ts tests/tooling/verify/lib/reference-fact-module.test.ts tests/tooling/verify/lib/static-authored-value.test.ts tests/tooling/verify/lib/policy-pass-readers.suite.test.ts --maxWorkers=2
Test Files 6 passed (6)
Tests 73 passed (73)
Type Errors no errors
```

The tests assert real reader output rather than recording only call arguments. The policy-pass proof composes canonical origin plus authored values through the shared visitor walk, consumes a real reviewed grant, converts an unresolved semantic receipt into an incomplete owner, withholds grant liveness, and proves a reused Project recovers without stale reader facts. The focused module regression was red before the strict cross-source canonical fix and green after it. The 17-test existing gate-contract suite separately proves mutation discovery still receives declaration identity for aliases, computed calls, call/apply adapters, `Object.assign`, delete, and update while the paired static-value control refuses the changed authored contents.

Final structural receipts:

- `ast-grep run -p 'new Project($$$ARGS)' -l ts <eight reader files> --inspect summary`: zero matches, `scannedFileCount=8`.
- The equivalent `new WeakMap($$$ARGS)` and `$PROJECT.getSourceFiles($$$ARGS)` sweeps: zero matches, `scannedFileCount=8`; an `rg` cross-check found no `Project`, `WeakMap`, project walk, hop-cap, or depth-budget spelling in the eight source files.
- `ast-grep` call-site sweeps over `tooling/src/verify` and `tests/tooling/verify` scanned 468 TypeScript files: static authored values call `invokedMemberThroughAliases`; source-expression chasing calls `reassignedReferenceSymbols`; origin/static effect checks call `writtenReferenceSymbols`. A literal cross-check found one `aliasEdges` implementation, in `reference-fact-writes.ts`.
- Final line census: the eight reader/contract files total 1,866 lines; `reference-fact-module.ts` is exactly 450 lines, satisfying the tooling cap, and every other file is below it.
- `git diff --check 80890046b --` passed for the tracked delta. Final file hashes were captured after the last type-only cleanup so the full reads and probes refer to the frozen bytes.

### Coverage limits and unread regions

Per the lane brief, this review did not run whole-tree `pnpm check`, the full test battery, broad structure/knip/type programs, the frozen-corpus old/new differential, population equivalence, or performance/RSS acceptance. It did not read or judge gate modules, ResourceHost, policy conversions, grant migrations, or policy-specific receiver/schema/class/JSX semantics. No rendered surface changed, so no browser probe applied.

The parent integration lane owns strict source/test TS7, scoped Biome/ESLint, dependency-cruiser, test-baseline entries, documentation-catalog receipts, and the eventual whole-program barrier. Those parent receipts are not credited as this cold lane's evidence. Within the unchanged policy runtime, only `contract/policy.ts` and `lib/policy-pass.ts` were read in full; their other dependencies were exercised through the focused policy integration test but were not independently reviewed.

## Unconfirmed suspicions

None.

Issue summary: Cold review of #1584's shared semantic reader foundations is clean after six reproduced silent-resolution/compatibility classes were repaired and re-probed. Confirmed finding count: 0; severity ceiling: none. The five reader suites plus the existing consumer compatibility suite pass 73/73 with no Vitest type errors, final structural sweeps show no reader-owned Project/cache/hop cap, and the largest source file meets the 450-line cap. Parent integration still owns the explicitly listed broad type/lint/dependency/catalog/baseline and whole-program receipts. Report: `docs/reviews/stickler/2026-09-05-shared-semantic-readers.md`.
