---
kind: design
status: active
updated: 2026-08-31
---

# #961 static class provenance repair

## Verdict

Repair the existing shared evaluator in place. The cold report's three failures are semantic gaps in the current composer and object helpers, not evidence for another interpreter or a consumer-specific patch.

## Architecture

### Returned composer authority

`ComposerResolver` continues to own composer identity. A forwarding function earns that identity only from a parameter-forwarding composer call whose value reaches the function's returned expression through value-preserving expression nodes. Calls in statements, nested functions, object/array construction, or unrelated call arguments do not grant authority. Existing expression-bodied arrows and block `return join(...args) ?? ""` wrappers remain supported.

### Namespace re-export resolution

Namespace dot/bracket/destructuring forms resolve the selected export through the same `importedSource` → `exportedDeclarations` → `composerFromDeclaration` chain already used by named imports. External namespaces still use the fixed provenance table. Local aliases recurse with the existing cycle fence; no textual callee name grants identity.

### Object overwrite semantics

Static member reads with known names delegate to `findObjectProperties`, the existing exact-name selected-property resolver, instead of collecting every matching write independently. That gives direct and known-spread writes one later-write-wins implementation. An unresolved later spread invalidates earlier selected writes and records opacity before any ordinary member read can emit a stale exact candidate. Dynamic indexes retain their conservative union path because they have no exact property set to select.

## Rejected alternatives

- A rule-local repair in #951 or #954 is rejected because it would recreate the semantic interpreter #961 exists to centralize.
- A second namespace resolver is rejected because named import/re-export provenance already resolves the declaration chain; namespace access only needs to enter that chain.
- Reusing the old single `Map` accumulator is rejected because it collapses conditional spread alternatives and cannot carry an unknown overwrite forward without leaking an earlier value. The selected-property helper remains the single resolver, but its internal state is branch-aware.
- Treating every call beneath a `return` as transparent is rejected because returned objects and arbitrary wrapper calls can contain a composer call without returning its class-string value.
- Keeping an earlier selected value after an unknown later spread with only a diagnostic is rejected because the public candidate contract calls candidates exact; the diagnostic remains, but the stale candidate is removed.

## Coupled sites

| Site | Obligation |
| - | - |
| `tooling/src/verify/lib/static-class-composer.ts` | Returned-value qualification and namespace export traversal; remain below 450 lines. |
| `tooling/src/verify/lib/static-class-object.ts` | Known-name member reads share exact-property overwrite order; unknown spreads invalidate prior selected writes. |
| `tooling/src/verify/lib/static-class-value.ts` | Existing caller of `evalObjectMember`; no parallel spread semantics added. |
| `tooling/src/verify/lib/static-class-expression.ts` | Public evaluation surfaces remain byte-compatible and policy-neutral. |
| `tooling/src/verify/lib/static-class-jsx.ts` | Existing `findObjectProperties` consumer inherits the corrected unknown-spread semantics. |
| `tests/tooling/verify/lib/static-class-expression.test.ts` | Permanent adversarial controls for all three cold failures and preservation of prior controls. |
| #951/#954 consumers | Deferred by ownership; they consume the repaired API after #961 graduates. |

Current symbol census (`pnpm ast refs`, 6,301 scanned files) finds the four public evaluator surfaces consumed only by their focused test on `main`; internal `findObjectProperties` has three live production callers inside the substrate. No API rename or import move is required.

## Test plan

1. Add three focused controls before implementation:
   - a wrapper that calls `clsx(value)` but returns unrelated prose yields zero candidates;
   - `import * as composer` through a local re-export resolves the aliased `clsx` candidate;
   - a known later spread emits only the newer class value, while an unknown later spread emits no stale exact value and reports opacity.
2. Run the focused file against the unmodified implementation and retain the expected three-test RED receipt.
3. Implement only the two helper repairs above, then rerun the same file green.
4. Re-run the existing real `ContextToggle` chain and `data-has-bg-image` exact-property probes against the worktree source to prove the correction did not collapse those paths.
5. Run the tooling tsconfig typecheck, scoped Biome, file line counts, suppression sweep, and `git diff --check`. Per the repair brief, do not run graph typecheck, `check:structure`, full verification, or repo-wide barriers.

The focused test's pre-fix 14/14 baseline is green. Each new control must fail for its intended semantic reason before source edits; a control that passes before the repair is relabeled a fence and does not count as defect proof.

## Forks and limits

No owner fork is open. This repair does not widen the declared residual limits for HOCs, render factories, rest-prop dataflow, arbitrary call-return object graphs, external unknown composers, or runtime-computed class bodies. The memory index had no task-specific prior lesson for this substrate; current law, exact source, the #961 issue, and the cold report are the design evidence.
