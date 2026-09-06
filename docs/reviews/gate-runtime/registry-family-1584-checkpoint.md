---
kind: handoff
status: active
updated: 2026-09-05
---

# Registry/completeness family checkpoint for #1584

## Outcome

Checkpoint branch `codex/1584-registry-family` starts from `019b28ad8` on `codex/gate-tsmorph-standardization`. Shared registry-definition, tuple-vocabulary, and JSX-tag facts are implemented at `5f965d4a44c7c89a83c4f3d81920d0f52a941526`; gate conversion has not started. The owner checkpoint stopped the first conversion lane before it read or edited repository files.

Final AST/compiler source populations in this family are `.ts`/`.tsx` only. `.mts`/`.cts`/`.mjs`/`.cjs` are excluded as eventual cleanup and must not enter old/new population-equality claims.

## Closed source manifest

The manifest read all nine requested leads in full (3,350 lines), the four structurally adjacent candidates, the legacy helpers, final policy/population/authority/planner/pass/reference/static-value contracts and relevant tests. Structural scans covered all nine lead files and the 420-file TypeScript verifier surface; literal scans corroborated every helper edge.

| Policy | Disposition at checkpoint | Required resume work |
| - | - | - |
| `modal-registry-completeness` | included, unconverted | consume modal-definition and canonical `openModal` facts; entire `@client` population |
| `section-registry-completeness` | included, unconverted | consume section const/factory facts; classify the route import arm without a broad home bypass |
| `home-tile-registry-completeness` | blocked before conversion | add explicit definition/dormancy policy plus exact assembly permission; no silent initializer skips |
| `config-group-completeness` | included, requires split | separate config-group, collection, config-section, anchor, and host-import computations and receipts |
| `chrome-registry-completeness` | included, unconverted | consume chrome-definition plus `CHROME_ZONES` tuple facts; keep two independent receipts |
| `placeholder-copy-registry` | included, unconverted | share section-definition facts and refuse unresolved placeholder values |
| `no-parallel-section-map` | included, requires split | one policy/receipt per section, modal, config-group, and chrome axis; exact reviewed grants only |
| `message-kind-policy-coverage` | included, unconverted | canonical interface/heritage and reader-origin facts; delete the empty deferred table |
| `warning-code-coverage` | included, requires split | separate provider/chat policies, invocation-local state, canonical emit/map facts; delete empty deferrals |
| `registry-assembly-at-door-only` | included adjacent consumer | split hard mutating-register ban from exact reviewed construction permission |
| `modal-body-not-placeholder` | included adjacent consumer | share modal definitions and canonical JSX/body facts |
| `section-factory-contribution-bundle` | included adjacent consumer | replace its type recursion/hop cap with canonical section-factory facts |
| `duplicate-action-doors` | excluded | baseline/cardinality and debt authority belong to a separate conversion lane |

`verify/lib/registry.ts` is also excluded: it is the verification-stage registry, consumed by `run-render`, `ops/run`, and registry-parity, not a UI registry semantic reader.

## Shared fact commit

`5f965d4a` adds six files and 792 lines:

- `createRegistryDefinitionFacts()` is visitor-fed and owns no `Project`, repository walk, path predicate, parser, cache, or hop cap. It recognizes section, modal, home-tile, config-group, collection, config-section, and chrome definitions by canonical type identity; sections alone admit factories. Each kind exposes definition provenance plus receipt-ready resolved/unresolved counts.
- `createTupleVocabularyFacts()` returns ordered string entries with canonical declaration provenance and distinguishes resolved, absent, empty, unsupported, dynamic, write, cycle, ambiguous, and missing results.
- `readJsxTagFact()` normalizes opening/self-closing tags through the existing canonical module-origin reader. Existing callable/member readers remain their one home.

Legacy `section-defs.ts` can delete only after both direct consumers convert. Family imports from `ast-read.ts` and `tuple-read.ts` must disappear, but those helpers remain until their other legacy consumers migrate. No global helper deletion is justified at this checkpoint.

## Observed verification

| Check | Result |
| - | - |
| focused registry/tuple fact tests | green: 2 files, 11 tests, no type errors |
| tooling type program | green after the owned optional factory-body error was fixed |
| scoped Biome/ESLint | green before the final factory-boundary test; Biome then reported one formatting-only delta, whose exact suggested form was applied; not rerun under the checkpoint directive |
| focused dependency-cruiser | green: 12 modules, 40 dependencies |
| root graph type program | red only at concurrent final-descriptor/legacy-render incompatibilities in `tests/tooling/verify/lib/render.int.test.ts` and `tests/tooling/verify/ops/scoped.int.test.ts`; the owned registry-fact error is absent |

No whole-tree structure/check, full test battery, current-corpus gate differential, performance/RSS run, global baseline, or catalog regeneration was run. The earlier `pnpm gate:contract` invocation completed without a retained readable result and is not evidence.

## First-class provider integration

Commit `3d8abaf5b` replaces policy-owned collector construction with `registryDefinitionFact`, a first-class `defineFact` provider over `@client`. The planner records its independent population, the dispatcher feeds it once in the shared walk, and policies read the completed per-kind view through declared `ctx.fact` access. Its provider receipt aggregates all seven definition kinds while each policy retains its own independent kind receipt and missing/empty/unresolved verdict. The five registry fact tests pass through the provider runtime; no registry policy conversion is credited yet.

The same commit makes provider dependencies required descriptor data (`facts`, including explicit `[]`), validates their branded/direct shape, rejects duplicate ids and selected-file consumers, owns ResourceHost acquisition/receipts, and withholds every consumer on one provider failure. The focused provider foundation passed 114 tests plus 18 adjacent reader/resource/static-class/tuple tests. `pnpm gate:contract` now reports 1,414 findings across 256 modules; the remaining count is intentionally red migration work.

## Known limits

- A function-valued registry field makes the complete JSON-like `authoredValue` unresolved while object-root provenance remains resolved; policies must read required scalar/object fields explicitly.
- Namespace/destructured tuple value carriers currently return explicit `dynamic` refusals. They never shrink the vocabulary silently.
- Final findings require literal token/offset coordinates and must remain inside their effective source population. Dynamic diagnostic detail belongs in message/subject/operation.
- Cross-file policies use `execution: "entire-population"`; independent denominators must never be summed.
- No final reviewed-grant data home is introduced here. A conversion needing a permission must emit exact stable subject/operation identity and use the separately-owned authority input; a broad path/file bypass blocks conversion.

## Resume order

1. Re-read the active design, both gate-runtime censuses, `GATE-AUTHORING.md`, this handoff, and commit `5f965d4a` in full. Re-run the two focused fact tests and tooling typecheck; rerun scoped Biome because its final formatted bytes were not rechecked.
2. Cold-review the shared fact commit before relying on it. Pay particular attention to type-origin ambiguity, section factory return ownership, function-valued object semantics, duplicate tuple declarations, and receipt withholding.
3. Run the old nine-gate proof/current-corpus baseline before editing gate modules. Persist output outside the tree with explicit `.ts`/`.tsx` population counts.
4. Convert disjoint batches: definition integrity; config; assembly/parallel-map authority; message/warning coverage. Do not start a batch whose exact grant or missing semantic fact is unresolved.
5. For each converted policy, run same-fixture old/new findings, current-corpus differential, exact population equality or classified delta, policy conformance, `gate:contract` reduction, focused tests, both owning type programs, scoped Biome/ESLint, and focused dependency-cruiser.
6. Delete `section-defs.ts` only after a symbol-aware importer scan plus literal corroboration proves zero consumers. Leave `ast-read.ts`, `tuple-read.ts`, and stage `registry.ts` to their remaining owners.
7. Update this document with the final converted/excluded table. Global test-baseline and documentation-catalog reconciliation remain parent integration work by owner directive.
