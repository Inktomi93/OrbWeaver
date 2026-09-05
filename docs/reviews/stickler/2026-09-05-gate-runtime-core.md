---
kind: review
status: active
updated: 2026-09-05
---

# Gate runtime core — stickler review

Verdict: **NOT MERGEABLE.** Seven confirmed findings remain: four P1 and three P2. The one-walk dispatcher, phase isolation, subset deferral, source anchoring, authority withholding, and native Node brand identity work, but the two runtime entry doors and the semantic receipt boundary still admit clean empty or malformed executions.

Scope: commit `f070b24c35911578f8f04d8284472fac1fff6bfb` in `.claude/worktrees/codex-gate-runtime-core`. The intended absence of CLI, conformance, and resource-content providers was respected and is not a finding.

## Confirmed findings

### P1 — `tooling/src/verify/lib/policy-loader.ts:67` — an empty module corpus loads successfully

`loadPolicyCorpus` accepts `files=[]`, performs no import or invariant check, and returns `{gates:[], files:[], families:[]}`. A renamed/missing gate directory or a glob/root regression therefore looks like a valid deterministic corpus instead of a tool error.

Concrete failure: the cutover command starts under the wrong root or the corpus directory disappears; the loader supplies zero policies, and the dispatcher can then return a completely clean authority verdict over no work.

Evidence produced this session:

```text
$ node reports/stickler/scratch/runtime-core-stickler-probes.ts
ZERO_LOADER {"gates":[],"files":[],"families":[]}
EMPTY_PASS {"owners":[],"passErrors":[],"authorityErrors":[],"withheld":[],"verdict":{"errors":0,"warnings":0,"blocking":0,"failOnWarnings":false}}
```

This violates the destination's missing/empty population refusal (`docs/design/gate-runtime-standardization.md:87`) and its closed acceptance population (`:198`). Reject a zero-file corpus before return and add the absent-directory/empty-directory controls to `policy-loader.test.ts`.

### P1 — `tooling/src/verify/lib/policy-pass.ts:299` — the dispatcher executes empty, unbranded, and invalid policy inputs without validating the invocation boundary

`runPolicyPass` maps `input.policies` straight into mutable runs. It never calls `isDefinedGatePolicy` or `assertGatePolicyDescriptor`, even though `policy-validation.ts:1` says the validator is shared by loading and invocation boundaries. A structurally copied descriptor that is not branded ran to owner success. A descriptor cast with `analysis:"bogus"`, `execution:"bogus"`, and empty proof arms also ran to owner success with zero errors. An empty list returned the fully clean result above. Duplicate ids execute their hooks before the authority coordinator finally records duplicate-policy errors.

Concrete failure: a future CLI selection/filter path passes a hand-built, stale, duplicated, or empty policy array rather than the exact loader result. Malformed policies execute repository code and can return a clean verdict; duplicate hooks can mutate state or emit output twice before rejection.

Evidence:

```text
UNBRANDED_PASS branded=false -> owner=success, passErrors=[], authorityErrors=[], blocking=0
INVALID_PASS analysis="bogus", execution="bogus", mustFlag=[], mustPass=[] -> owner=success, both error lists empty, blocking=0
DUPLICATE_PASS -> both owner rows executed successfully; authority later emitted duplicate-policy and unselected-owner-result
```

The design requires one `defineGate` contract with no absence defaults (`docs/design/gate-runtime-standardization.md:40-69`) and a brand-only loader. Validate non-empty/unique input plus brand and the full descriptor before `resolveRuns` or any hook; make the test call the public dispatcher with the exact invalid rows above.

### P1 — `tooling/src/verify/lib/policy-validation.ts:188` — any integer is accepted as a `SyntaxKind`, so an impossible subscription clean-passes without a visit

`assertVisitors` checks only `Number.isInteger(kind)`. It accepts negative values and integers beyond `SyntaxKind.Count`. The kind index can never encounter either value, so a policy whose only subscriber is invalid receives zero callbacks but remains a successful, complete owner with clean authority.

Concrete failure: a migration typo or stale numeric kind lands as `-1` or `SyntaxKind.Count + N`; the gate reports success forever while its detector never runs.

Evidence:

```text
INVALID_KINDS kinds=[-1, SyntaxKind.Count + 100] -> visits=0, owner=success, passErrors=[], authorityErrors=[], blocking=0
WITHIN_DUPLICATE -> create-phase incomplete (the existing duplicate-in-one-array guard works)
```

Validate that every value is a real node kind in the supported `SyntaxKind` range. Retain the existing within-array uniqueness check and add lower-bound, upper-bound, and valid-edge controls.

### P1 — `tooling/src/verify/lib/policy-pass-context.ts:125` — malformed, empty, and unresolved semantic/resource receipts do not withhold a clean owner

The receipt sink permits zero members/resources and any nonnegative unresolved count. Its discriminant check is `if (kind === "population") ... else resource`, so an arbitrary runtime kind is silently normalized into a resource receipt. `evaluateRuns` then copies receipts into the owner result, but neither `ownerResult` nor `coordinateGateAuthority` evaluates them. A declared empty population, an unresolved population behind no findings, and a bogus-kind zero-resource receipt all produced owner success and clean authority.

Concrete failure: a coverage policy's subject reader resolves no members, or a resource provider resolves zero resources/unresolved inputs; the receipt faithfully records the blind denominator while the run still certifies success.

Evidence:

```text
RECEIPTS owner=success, passErrors=[], authorityErrors=[], blocking=0
  population "empty": members=0 unresolved=0
  population "unresolved": members=2 unresolved=3
  input kind="bogus": normalized to resource "bogus-kind", resources=0 unresolved=4
```

This directly contradicts missing/empty/unresolved refusal and per-gate semantic/resource receipts (`docs/design/gate-runtime-standardization.md:87-89`, `:134`) and the existing semantic-population rule (`GATE-AUTHORING.md` §1). Validate the exact discriminated union at the sink, then turn zero and clean+unresolved declared receipts into incomplete/tool-error owner outcomes before authority reconciliation.

### P2 — `tooling/src/verify/lib/policy-loader.ts:77` — singleton family identity is not enforced

The loader derives a unique string list from descriptor values but never groups gates by family. A single policy `id:"only", family:"unrelated-family"` loaded cleanly and advertised only the invented family.

Concrete failure: a one-policy family keeps a stale shared-family name after its sibling is retired or renamed. `--family only` will not select it, while `--family unrelated-family` presents a family whose reuse premise no longer exists.

Evidence:

```text
SINGLETON_FAMILY gates=[{id:"only",family:"unrelated-family"}], families=["unrelated-family"]
```

The destination requires a no-sibling policy to use its own id as family (`docs/design/gate-runtime-standardization.md:71`). Group loaded policies by family and reject every one-member group whose family differs from its sole id; add passing shared-family coverage with at least two members.

### P2 — `tooling/src/verify/lib/policy-pass-context.ts:157` — a node finding can supply `offset` without `token`, and the runtime silently ignores it

The TypeScript union bans offset-only details at compile time, but the runtime accepts `offset` in `NODE_DETAIL_KEYS` and validates it only inside `if (details.token !== undefined)`. An offset-only call reported the variable declaration at its start column instead of rejecting the malformed location.

Concrete failure: a JS policy, cast, or migrated dynamic detail object supplies the intended token offset but omits the token. The finding is attached to the wrong coordinate, so exact-position waiver/diagnostic identity can bind incorrectly.

Evidence:

```text
OFFSET_ONLY details={offset:7} -> finding packages/client/src/a.ts:1:14, owner=success
```

Reject `offset` unless a nonempty token is present, and reject token without an integer in-range offset. Add runtime controls rather than relying on the compile-time union.

### P2 — `tooling/src/verify/lib/policy-pass-context.ts:191` — the advertised immutable context leaves the context and report sink mutable

The file/resource arrays are frozen, but the context object and its nested `report` object are not. A policy assigned a new property and replaced `ctx.report.node` during `create`; the owner still completed successfully.

Concrete failure: a JS/cast descriptor or accidental runtime mutation replaces a reporting/receipt capability for the rest of that policy invocation, allowing its later hooks to observe a different public context than the one the runtime constructed.

Evidence:

```text
MUTABLE_CONTEXT Object.isFrozen(ctx)=false Object.isFrozen(ctx.report)=false
                Object.isFrozen(ctx.files)=true Object.isFrozen(ctx.resourcePaths)=true
                mutation completed; owner=success
```

Freeze the report sink and the top-level context after construction, and add a runtime immutability assertion beside the existing key-surface test.

## Verified clean

- Read in full: all eight files added by `f070b24c35911578f8f04d8284472fac1fff6bfb`; `contract/population.ts`, `lib/population-resolver.ts`, `lib/population.ts`; the complete authority contract/validator/coordinator; `_shared/ts-workspace.ts`; `lib/symbol-reference.ts`; the destination design, unified-walk research, prior foundation stickler report, constitution, Core-0, Core-Tooling-Law, Spine-Testing, Spine-TypeScript-and-Patterns, D-ledger redirect, and GATE-AUTHORING law. No touched-file region was omitted.
- `pnpm test:scoped tests/tooling/verify/lib/policy-loader.test.ts tests/tooling/verify/lib/policy-pass.test.ts --maxWorkers=4` passed 2 files / 17 tests with no type errors. Those tests establish the stated happy paths; the probes above demonstrate their uncovered false-green paths.
- The native Node 26 dynamic-import control over a real relative-import gate module returned `branded:true`. The temporary `tooling/src/verify/gates/__stickler_brand_probe.ts` was deleted immediately and `git status --short` was empty afterward. A `pnpm tsx -e` CJS/ESM split returned false, but that is not the production native-Node verdict and is not a finding.
- The multi-file/multi-visitor control recorded `{"a.ts":1,"b.ts":1}` physical `forEachDescendant` calls. Two callbacks intentionally subscribing to the same kind both ran; a duplicate kind inside one visitor was rejected. VisitFile-before-visit-before-evaluate ordering and create-state re-entry also passed.
- Selected-file intersections ran; entire-population source and resource policies deferred on proper subsets and ran on the full set. An unrelated extra requested/deleted identity did not shrink a complete population. Source/resource identity overlap is rejected by code, and a Project source outside the supplied root failed closed.
- Findings or receipts emitted before a later hook throw remain visible in that owner's diagnostic row, while authority excludes them and withholds the incomplete policy. Pass-phase failures appear in top-level `toolErrors`; authority separately records `owner-incomplete`. This separation worked, though consumers must inspect both error channels rather than only `authority.verdict`.
- Whole-graph ast-grep call sweeps scanned 3,037 TS and 588 TSX files. `runPolicyPass` has only its test caller in this commit state; `makePolicyContext` and `collectByKinds` are called only by `policy-pass.ts`; `assertGatePolicyDescriptor` is called only by the loader. The new runtime is intentionally not wired to a CLI yet.
- All six new source files are below the tooling 450-line cap; the larger added test remains 375 lines. `git diff --check f070b24^..f070b24` passed. No whole-structure/check suite was run, per the review brief.

## Regions not reviewed line-by-line

None among the eight touched files or the population/reference/authority foundations named above. The 255 legacy gate modules, future CLI/conformance/resource providers, and unrelated active-gate catalog rows were outside this commit's intent and were not re-reviewed.

## Unconfirmed, low priority

None. Suspicions not reproduced or contradicted by the controls above were dropped.

## Durable lesson candidate

- `gate-runtime-boundaries-are-two-doors` — A brand-only loader does not make the dispatcher safe when callers can pass policy arrays directly; both corpus discovery and invocation input must fail closed before any hook, and semantic receipts must participate in owner completion rather than remain passive output.

## Issue summary

Gate runtime core stickler verdict: NOT MERGEABLE — 7 confirmed findings (4 P1, 3 P2), severity ceiling P1. The one-walk dispatcher and isolation controls work, but empty corpus discovery, an unvalidated dispatcher input, impossible visitor kinds, and passive/malformed semantic receipts can all produce clean owner/authority results; singleton family identity, runtime finding coordinates, and context immutability are also unenforced. Durable report: `docs/reviews/stickler/2026-09-05-gate-runtime-core.md`.
