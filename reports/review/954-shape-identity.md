# 954 one home for shape identity: lane cb-954

## Outcome

Every shape-pair decision in the copy, placement and respell consumers now goes through one floor comparer. The comparer is `tooling/src/floor/code-facts/shape-copy.ts` together with the pair derivation judgment `shapeDerivesFrom` in `tooling/src/floor/code-facts/shape-derivation.ts`. Consumers keep their own field discovery, leniency, thresholds, ranking and refusal voice. The local comparisons they each wrote are deleted.

## The home

| Symbol | Path | Answers |
| - | - | - |
| `sharedFieldNames` | `tooling/src/floor/code-facts/shape-copy.ts` | The left field names the right side carries, in left order. It makes no checker call. |
| `compareShapeFields` | same | Shared names, the shared names that agree, and whether the two field sets are exact. The agreement runs once per shared name. |
| `compareCopySource` | same | The same comparison in the copy report shape (`ShapeCopyComparison`). |
| `shapesIdentical` | same | Identical field names and mutual declaration assignability in every owning native program. |
| `shapeDerivesFrom` | `tooling/src/floor/code-facts/shape-derivation.ts` | Whether one declaration of a compared pair derives from the other: a direct alias or heritage target, or one shared `typeof` provenance. Component type-graph edges (`component-type-home.ts` `componentTypeGraph`) answer a separate question and keep direct-only `directDerivationTargetKeys`. |
| `ShapeFieldComparison` | `tooling/src/floor/code-facts/shape-copy-contract.ts` | The comparison result type. |

The assignability primitive is unchanged: `fieldTypesAgree` and `declarationTypesAgree` in `assignability.ts`, with the stored native pair answers.

## Consumers moved

| Consumer | Before | After |
| - | - | - |
| `pnpm ast respell` exact tier (`respell-shapes.ts`) | Local direct-target check, local `overlaps` of `typeof` keys, and a local `mutuallyAssignable` | `exactTierResolves`: `shapeDerivesFrom`, then `shapesIdentical` |
| `pnpm ast respell --near` (`respell-near-analysis.ts`) | A second exact check without the `typeof` exclusion, a direct-only derivation set, and a local shared-name agreement loop | Calls the exact tier's `exactTierResolves`. Admission uses `compareShapeFields` and the name bound uses `sharedFieldNames`. |
| `contract-structural-copy` (`verify/lib/contract-structural-copy.ts`) | `agreeingCount` plus a local `exact` | `compareCopySource` |
| Component type home lower data (`component-type-home.ts`, reached by `no-inline-types` and `no-inline-wire-interface`) | `agreeingCount` plus a second local `exact`, and direct-only derivation | `compareCopySource` and `shapeDerivesFrom` |

## Deleted

- `agreeingCount` in the floor `shape-copy.ts`.
- `mutuallyAssignable` and `overlaps` in `ast/lib/respell-shapes.ts`.
- The near tier's `derivedFrom` set and its inline exact re-check.
- The two inline `ShapeCopyComparison` constructions.

## Changed findings

- Component lower data: a component type that shares `typeof` provenance with a lower declaration (`z.infer<typeof wireSchema>` on both sides) is now `derived`. Before, it was `unqualified` with no comparisons. The ownership verdict stays `component-owned`; only the lower-data evidence changes.
- Respell exact and near tiers: no intended change. Two declarations with the same `typeof` provenance resolve to one type, so the near tier excluded them through its exact check already. The near tier now runs its name bound before the derivation check. Neither step calls the checker, so the checker-call counts in the near-tier tests are unchanged.
- `contract-structural-copy`: no intended change. Candidates and agreement calls are the same.

## Verifier correction: qualified `typeof` operands

The verifier refuted the first commit on one P2. `typeQueryDerivationKeys` keyed a `typeof` operand on its resolved symbol. For `typeof aRoute.body` and `typeof bRoute.body`, both resolve to the one `body` declaration of `Route<B>`, so two different types shared one key. The exact tier already exempted such pairs wrongly. The shared `shapeDerivesFrom` spread the mistake to the near tier and to component lower data.

The key now names the root value's declaration plus the member path. An instantiation-expression operand (`typeof f<A>`) also keys its type arguments: a keyword or literal by its text, a non-generic reference by its single declaration. Any other argument leaves the operand with no key. The stored native catalog reads the same function, so `INVENTORY_FORMAT` moves to 25. Main had already taken 24 for another catalog change, so this change needs its own number. The database selects generations by format, so stored catalogs with the old keys are rebuilt rather than read.

Changed findings from the fix:

- Respell exact tier: two identical bodies read from different route values (`typeof aRoute.body` and `typeof bRoute.body`) are now reported. Before, they were exempted as shared provenance.
- Respell near tier: the verifier's pair (memo against note, 66.67%) is reported again, as it was on base.
- Component lower data: a component body read from a different route value is no longer `derived`.

## Shape identity version table

Each row is one case where the old readers could disagree. The respell and copy verdicts are measured, not reasoned. An uncommitted probe ran the real consumers (`bestCopyMatch` with `contractFields`, `candidateFields` and lenient `createFieldAgreement`; `respellHitsFor`; `respellNearCandidatesFor` at threshold 0; `typeQueryDerivationKeys`). It ran on the same 20 in-memory fixtures twice: once with this lane's source reversed to base 8e47dbc5f3, once on the final source. Every fixture compiles with no diagnostics. Component verdicts come from `tests/tooling/floor/code-facts/component-type-home.test.ts`.

Old readers:

- Copy: `agreeingCount` plus the copy gate's inline exact.
- Respell exact: `mutuallyAssignable`, direct targets and `overlaps` of `typeof` keys.
- Near: direct-only `derivedFrom` plus an inline exact re-check without the `typeof` exclusion.
- Component: `agreeingCount` plus a second inline exact and direct-only derivation.
- The `typeof` key: the operand's resolved symbol, with type arguments ignored.

New: the shared comparer and `shapeDerivesFrom`, with the root-plus-path and instantiation key.

Marks: (a) correct as kept. (b) the stronger version is adopted. (c) different on purpose.

| Case | Copy (old = new unless noted) | Respell exact (old → new) | Near at 0% (old → new) | `typeof` key shared (old → new) | Kept | Mark |
| - | - | - | - | - | - | - |
| Equal names and types | match 4/4, exact | reported → reported | excluded → excluded | no → no | all agree | (a) |
| Domain is a subset of the contract | match 4/4, not exact | none → none | 80% → 80% | no → no | all agree | (a) |
| Domain is a superset of the contract | no match | none → none | 80% → 80% | no → no | copy subset rule | (c): the `contract-structural-copy` header admits subset or equal only; the near tier is the superset view |
| Optional against required (`a?` vs `a`) | match 4/4, exact | none → none | 60% → 60% | no → no | copy lenient, respell strict | (c): `AgreementContext.lenient` in `assignability.ts`; the copy `mustFlag` row "an OPTIONAL field is still the contract's field"; the near narration states bidirectional assignability (`ast/ops/respell.ts`) |
| `readonly` properties | match 4/4, exact | reported → reported | excluded → excluded | no → no | all agree: property `readonly` does not affect assignability | (a) |
| `readonly string[]` against `string[]` | match 4/4, exact | none → none | 60% → 60% | no → no | copy lenient, respell strict | (c): same citations as the optional row |
| Index signature on one side (each direction) | match 4/4, exact | none → none | 100% → 100% | no → no | copy compares data fields; respell compares whole declarations | (c) for the verdicts; (b) owed for diagnostics: the near diff names no difference at 100% |
| One-way assignable (`"x" \| "y"` vs `string`) | no match (3/4 is under 80%) | none → none | 60% → 60% | no → no | all agree | (a) |
| Generic instance `Box<string>` against a literal | not a candidate (no own fields) | reported → reported | excluded → excluded | no → no | copy judges hand-written literals only | (c): the copy gate header names its subjects |
| `Box<number>` against `Box<string>` | not a candidate | none → none | 60% → 60% | no → no | all agree | (a) |
| Direct alias `type D = C` | not a candidate | none → none | excluded → excluded | no → no | all agree | (a) |
| Direct `extends C` | skipped (heritage) | none → none | excluded → excluded | no → no | all agree | (a) |
| `typeof` same unqualified value | not a candidate | exempt → exempt | excluded → excluded | yes → yes | all agree | (a) |
| `typeof` two unqualified values, identical bodies | not a candidate | reported → reported | excluded → excluded | no → no | all agree | (a) |
| `typeof` same root, qualified (`a.body` both) | not a candidate | exempt → exempt | excluded → excluded | yes → yes | all agree | (a) |
| `typeof` two roots, qualified, identical bodies | not a candidate | exempt → **reported** | excluded → excluded | **yes → no** | new key | (b) adopted: the old key shared one member declaration across values; red-first test "a qualified typeof operand keys on its root value" |
| `typeof` two roots, qualified, drifted bodies | not a candidate | none → none | 66.67% → 66.67% (excluded at `bab35f87d4`, restored) | **yes → no** | new key | (b) adopted: verifier fixture; red-first test "a qualified typeof operand from a different root value still reaches the near tier" |
| `typeof make<string>` on both sides | not a candidate | exempt → exempt | excluded → excluded | yes → yes | instantiation key | (b) adopted: the old key ignored arguments and agreed only by accident; `f5a7b21df3` dropped the key and briefly reported it; red-first test "a typeof instantiation keys on its type arguments" |
| `typeof make<string>` against `make<number>` | not a candidate | none → none | 60% → 60% | **yes → no** | instantiation key | (b) adopted: the old key made two different types one provenance; same test |
| Copy-gate exact against component exact | gate: `shared === contract.size` on subsets; component: both sizes | n/a | n/a | n/a | one `exact` (both sizes) | (a): equal on every pair the gate compares, because it compares subsets only |
| Near inline exact re-check against the exact tier | n/a | n/a | same on all 20 cases | n/a | the exact tier's `exactTierResolves` | (a): one verdict now, so near excludes exactly what exact reports or exempts |
| Component lower data, shared unqualified `typeof` | n/a | n/a | n/a | yes → yes | `shapeDerivesFrom` | (b) adopted: before, `unqualified` with no comparisons; now `derived`; test "lower-data derivation uses the shared pair judgment" |
| Component lower data, two qualified roots | n/a | n/a | n/a | yes → no | `shapeDerivesFrom` with the new key | (a): `unqualified` on base and final (`derived` only at `bab35f87d4`); same test |

### Consumers whose result changed

- Respell exact reports identical bodies read from different values, through a member path or an instantiation with different arguments. The two declarations derive from different values, so they share no provenance. An identical structure is exactly what the exact tier exists to report.
- Component lower data reports `derived` for a component type that shares one unqualified `typeof` origin with a lower declaration. Both sides name one value through one generic, so they resolve to one type.
- No copy-gate verdict changed on any case.

### Owed

- (b) Near diagnostics: a 100% near pair that differs only by an index signature prints a diff naming no difference. A board item: "respell --near names declaration-level differences". Done when the diff names an index signature or other non-field difference.

## Item 1154: shape fields store names only

Every stored and native shape field carried its fully printed type text. No consumer read it:

- Copy and component compare field names, and agreement goes through assignability.
- Respell's only reader copied it into `NearFieldDiff.renamed[].type`. The printed diff (`nearFieldDiffText`) and the JSON evidence never emit that value; only tests asserted it.

Evidence: codegraph over `ShapeField`, `readShapeFields` and `NearFieldDiff`; `rg` for `.type` reads on shape fields and for `renamed` across `tooling/src` (1,487 files scanned); `rg` for `ShapeField`, `FieldPair` and the printing call across `tooling`, `tests` and `docs` (7,232 files scanned, 0 left after the change).

The field is removed everywhere it lived:

| Place | Change |
| - | - |
| Contract | `ShapeField` deleted; `readShapeFields` returns field names. |
| Schema | `shapeCatalogSchema` `copy` and `respell` are string arrays. |
| Capture | `extractShape` no longer prints types. |
| Stored catalog | `inventory_shape_field` drops `type`. `STORAGE_SCHEMA_VERSION` moves to 16; a schema 1 to 15 store drops and recreates the field table, because its rows are a cache the current format rebuilds. |
| Respell | `ShapeEntry.fields` is the ordered name list; `renamed` rows are `{ from, to }`. |

Scoped measurement: the catalog worker's own `extractShape` over every shape node of the contracts program only (196 authored sources), in one process under the heavy lock.

| Run | Shapes | Fields | Printed type text | Extraction | Peak RSS | Box load |
| - | - | - | - | - | - | - |
| Before | 5,371 | 143,330 | 1,285,576,401 bytes | 145.8 s | 4,209 MiB | 18 |
| After | 5,371 | 143,330 | 0 bytes | 9.6 s | 1,490 MiB | 25 |

## Kept apart, with reasons

| Reader | Why it stays separate |
| - | - |
| Copy versus respell leniency | Copy agreement relaxes `readonly` and `?`. Respell is strict. The consumer passes its leniency to the shared comparer; this lane does not change it. |
| `test-production-clone` (`function-shape.ts`) | Item 954 keeps function-clone syntax on its own reader. |
| `test-hand-shape` (`shape-association.ts`) | Item 966 owns it. It judges native relations at production boundaries, not whether two declarations are the same. |
| Base UI expander (`verify/lib/baseui-expand.ts`) | It builds the prop vocabulary for a manifest. It never compares two shapes. |
| `orb/no-test-fabrication` | An ESLint selector rule with no shape comparison. |
| `verify/lib/json-column-origin-context.ts` `sameShape` | It matches JSON-column normalizer output, which is item 953's JSON-column reader and outside this lane's scope. Item 953 should move it onto `typeRelationAcross` or the shared comparer. |

## Evidence

See the lane report for commands and results. The full-tree before and after runs for respell and the three gates belong to primary: `/tmp/claude-1000/954-heavy/before/` and `/tmp/claude-1000/954-heavy/after/`.
