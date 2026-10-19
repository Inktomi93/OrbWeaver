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

The key now names the root value's declaration plus the member path. An instantiation-expression operand (`typeof f<A>`) produces no key. The stored native catalog reads the same function, so `INVENTORY_FORMAT` moves to 25. Main had already taken 24 for another catalog change, so this change needs its own number. The database selects generations by format, so stored catalogs with the old keys are rebuilt rather than read.

Changed findings from the fix:

- Respell exact tier: two identical bodies read from different route values (`typeof aRoute.body` and `typeof bRoute.body`) are now reported. Before, they were exempted as shared provenance.
- Respell near tier: the verifier's pair (memo against note, 66.67%) is reported again, as it was on base.
- Component lower data: a component body read from a different route value is no longer `derived`.

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
