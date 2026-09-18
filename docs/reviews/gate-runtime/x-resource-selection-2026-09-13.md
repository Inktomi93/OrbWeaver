---
kind: review
status: active
updated: 2026-09-13
---

# #2309 — changed resource-only selection skipped every dependent source visitor (lane `cb-resource-selection`)

Repair of the gate runtime's scoped-selection semantics. Base `028e278ee` (a descendant of `765dcdd71`).
Repair only: no conversion, no other gate, no push.

## 1. THE RE-DERIVED FALSE CLEAN — and the twin the board row did not name

Driven through the PRODUCTION planner and dispatcher (`planPolicyCommand` → `executePolicyPlan`) over the two
live `baseui-read` siblings, with an in-memory overlay of one `@ui` seal plus the declared
`json:baseui-manifest` ledger. The seal re-spells `items` (the ordinary DATA arm) and `onValueChange` (the
hard HANDLER arm); ledger **v1** exposes neither on `Select.Root`, **v2** exposes both. Only the LEDGER text
differs between the arms — the seal bytes are identical in all five probes.

| probe | requested | ledger | plan mode | owner | `effectiveSourcePaths` | findings | tool errors |
| - | - | - | - | - | -: | -: | - |
| A | (whole) | v1 | run | success | 1 | 0 | 0 |
| B | (whole) | v2 | run | success | 1 | **2** | 0 |
| C | `[the ledger]` | v2 | **run** | **success** | **0** | **0** | **0** |
| D | `[the seal]` | v2 | run | **incomplete** | 1 | 0 | **2** |
| E | `[docs/x.md]` | v2 | skipped | not-applicable | 0 | 0 | 0 |

**C is the board row's defect, exactly as filed:** both policies were SCHEDULED, both reported
`owner: { status: "success", population: "complete" }`, both visited ZERO source files, and both rendered a
clean verdict — over the same tree that produces one finding each at whole scope (B). A manifest edit can
invalidate every seal, and a changed-mode run naming only the manifest said everything was fine.

**D is a second defect in the same mechanism, found while re-deriving and not in the row:**

```
baseui-derives-not-respells[create] resource request json:baseui-manifest is undeclared
baseui-derives-not-respells-health[create] resource request json:baseui-manifest is undeclared
```

owner `incomplete`, both WITHHELD, exit-2 class. A `--changed` run naming ONE `@ui` seal — the single most
common scoped invocation there is — could not run either policy at all. Cause: `resolveRun` intersected the
RESOURCE population with the requested set too, so `effectiveResourcePaths` was `[]`, and
`requestStaysDeclared` then dropped the declaration whose door the policy opens in `create`. The refusal
names the DESCRIPTOR (`is undeclared`), which is why this had never been read as a selection bug.

Both C and D are re-captured as the red-first receipt in §4.

## 2. THE MECHANISM, as measured rather than as the brief described it

The brief's mechanism claim was correct and is confirmed source-pinned:

- `lib/policy-plan.ts` `planOne` and `lib/policy-pass.ts` `resolveRun` each computed the source/resource
  split themselves, with different inputs and different reason strings.
- Resource identity alone made `effectiveCount`/`effectiveTotal` positive, so `planMode`/`resolveRun`
  answered `run`, while `run.files` is built from `effectiveSourcePaths` only and `walkRuns` visits exactly
  those.

Three further facts the brief did not state, each re-derived on the tree:

1. **The production `--changed` door is the DISPATCHER, not the planner.** `ops/scoped.ts:279`
   (`runScopedPolicyPass`) and `ops/structure.ts:217` call `runPolicyPass` directly and supply no
   `ownerPlansByPolicy`; the planner is the cutover front door and is exercised by `executePolicyPlan`. A fix
   in only one of them fixes nothing today or nothing tomorrow.
2. **The two doors already disagreed, and the disagreement THROWS.** The planner counted a consumed fact's
   population in both halves of its completeness test; the dispatcher counted neither. An
   entire-population consumer whose own population is fully covered but whose fact population is not was
   planned `deferred` and resolved `success` — and `applyOwnerPlan` refuses that pair
   (`planned deferred policy disagrees with dispatcher applicability`). The pre-existing planner test
   `policy-plan.test.ts` "plans and reconciles a provider's independent population" pinned the planner half of
   that pair and never executed it.
3. **Only THREE policies in the whole corpus can reach the C shape** — `baseui-derives-not-respells`, its
   `-health` sibling and `baseui-state-data-attributes` are the only `analysis: "resource"` modules declaring
   `execution: "selected-files"` (census: all 43 resource modules, `population`/`execution`/`resources` read
   per file). Every other resource policy is `entire-population`. That census is what made the design safe to
   pick; see §3.

## 3. THE DESIGN — one pure shared calculation, and the line it does not cross

New module `tooling/src/verify/lib/policy-effective-population.ts`, `resolveEffectivePopulation`, pure and
TOTAL (it raises nothing, so it is not a `POLICY_REFUSAL_EMITTERS` member and does not touch the refusal
envelope). Both doors call it and neither re-decides it.

**Rule 1 — an INPUT is never narrowed.** A declared resource, and a consumed fact's census, are DATA the
verdict reads, not subjects it judges. A RUNNING owner receives its COMPLETE declared resource population.
This closes D and is what obligation 1 of `resource-policy-contract.md` ("declare what you read; read what
you declare") already required of every resource policy.

**Rule 2 — a changed INPUT reselects every SUBJECT.** When the request names any declared resource or
dependency path, the owner's FULL declared source population is reselected. This closes C.

**What deliberately did NOT change — the applicability arithmetic.** `deferred` and `empty-intersection` are
SCOPE verdicts, still computed on the raw intersection of the owner's OWN declaration
(source ∪ resource), bit-identically to before. This is the load-bearing restraint the brief demanded and it
is not free: had a touched resource been allowed to complete the deferral denominator, every `of: "none"`
entire-population policy would run on every changed request — `biome-grant-liveness` declares
`tracked-files`, whose population is the whole corpus, so its deferral would never fire again. Availability
and applicability are two questions; conflating them is what produced both defects. The arm that would have
gone green under the looser design is pinned
(`policy-effective-population.test.ts`, "an entire-population owner defers when only its RESOURCE was
named").

**Dependency paths are asymmetric, and the asymmetry is forced.** A consumed fact's population counts in the
TOUCH set (applicability, reselection) and NOT in the completeness denominator, because `resolveFactRuns`
resolves every fact over its FULL declared population and ignores `requestedPaths` — a consumer's census is
never partial and can never be its reason to defer. Counting it in the denominator is precisely the
disagreement in §2.2. Note that `policy-validation.ts:390` refuses `facts` on anything but
`entire-population`, so the RESELECTION half of the dependency rule is unreachable through today's
descriptor contract; it is in the calculation because the calculation must be total and because the TOUCH
half is what makes the two doors agree.

**`identity` vs `current`.** `PolicyRequestedSelection` carries the request twice: `identity` (verbatim into
the receipt) and `current` (the subset that exists). The planner passes `scope.currentPaths` because its
declared source paths come from the scope manifest's program membership, which still lists a DELETED file;
the dispatcher passes the identity set, because its declared populations come from the Project's own source
files and the ResourceHost, where a deleted identity is already absent. Collapsing the two would plan a run
over a deleted file and fail to find its `SourceFile` one phase later (`policy-plan.test.ts`'s
"deleted scope identity remains requested" arm is the pin, still green).

**Wording stays with each caller.** The planner's plan reason and `POLICY_PASS_REFUSALS` spell the same two
dispositions differently today (`requested scope has an empty policy intersection` vs
`requested selection has an empty policy intersection`). The helper returns a discriminant, not a sentence;
unifying those strings is a refusal-envelope change this lane's fence excludes. **Flagged for the policing
lane / orchestrator.**

## 4. THE FIVE PROOFS

### (1) RED-FIRST, production-driven, both siblings

`tests/tooling/verify/gates/baseui-and-surface-family.suite.repo.int.test.ts` §2309 (6 arms, 3 per sibling), run
against the UNMODIFIED sources (`git show HEAD:` for both `lib/` files, the new helper moved out of the tree,
restored after; `git status --short` verified clean):

```
Tests  4 failed | 41 passed (45)
FAIL … baseui-derives-not-respells: a request naming ONLY the ledger re-judges the whole declared seal population
FAIL … baseui-derives-not-respells-health: a request naming ONLY the ledger re-judges the whole declared seal population
  AssertionError: expected [] to deeply equal [ 'packages/ui/src/primitives/select/probe-select.tsx' ]
FAIL … baseui-derives-not-respells: a request naming ONLY the seal keeps the ledger readable and the selection exact
FAIL … baseui-derives-not-respells-health: (same)
  AssertionError: expected [ { policyId: …, phase: 'create', message: 'resource request json:baseui-manifest is undeclared' } ] to deeply equal []
```

After the fix: `45 passed`. Each ledger arm carries its own CONTROL first — the same request against ledger
v1 must be a clean that JUDGED (`effectiveSourcePaths: [the seal]`, `findings: []`), because a run over zero
subjects is clean whatever the ledger says, which is exactly what made the defect invisible. **No empty
selection is credited: the resource-changed arm asserts the selected source set by value, not by count.**

### (2) Converse — a source-only request stays exact and keeps its data

Same file, "a request naming ONLY the seal keeps the ledger readable and the selection exact":
`effectiveSourcePaths: [the seal]`, `effectiveResourcePaths: [the ledger]`, one
`{ kind: "resource", source: "json:baseui-manifest", unresolved: 0 }` receipt, zero tool errors, the finding
reported. Unit twin: `policy-effective-population.test.ts`, "a SOURCE-only request stays EXACT" plus the
runtime `disjointPolicy` arm, which READS its declared door under a source-only request.

### (3) Planner/dispatcher agreement

`policy-effective-population.test.ts`, `test.each` over four request shapes (resource-only · source-only ·
both · neither): the same request is planned and then executed, and `executePolicyPlan`'s own
`assertExecutedPopulations` + `applyOwnerPlan` throw on any disagreement, so `ok: true` IS the agreement
assertion — the explicit `toEqual` on the two populations states the selected set rather than trusting the
reconciler. The previously-latent disagreement of §2.2 is additionally pinned by executing the narrowed arm
of `policy-plan.test.ts`'s fact fixture, which that test never did.

### (4) Source/resource separation

`policy-effective-population.test.ts`, "a resource identity is never a source-visitor input, in either
direction": a hybrid declaring an authored tree that contains a non-TypeScript member (`notes.md`) receipts
and reads it while `notes.md` never reaches `visitFile` — under a resource-only request AND a source-only
one. The `SyntaxKind` half is separate ("a visitor is indexed for every reselected file"), because a
`visitFile` tally cannot see whether the node walk was indexed.

### (5) Entire-population deferral and shared-fact rules unchanged

Three discriminating arms in the new file (proper subset defers · resource-only touch defers · whole
declaration runs), plus every pre-existing pin green:

```
pnpm test:scoped  (12 files)  →  220 passed
  policy-plan · policy-pass · policy-effective-population · policy-refusal-envelope · policy-scope ·
  policy-pass-context · resource-policy · resource-declaration · render.int ·
  ops/structure-delta.int · ops/structure-mixed.suite.int · gates/baseui-and-surface-family.repo.int
```

## 5. THE FORK — a recorded ruling whose INPUT changed, plus one deletion

`lib/policy-pass.ts` carried this ruling in `requestStaysDeclared`'s own header:

> *"A populated request survives only if at least one of its paths is still in the effective population: a
> narrowed scope that excludes a resource must also withdraw permission to read it."*

Today's finding says that withdrawal IS the defect (probe D). **What I did: satisfied the new symptom,
preserved the old mechanism.** The fence `bindPolicyResources` applies — the declaration fence and the
per-path `allowedPaths` fence — is untouched, and what a run may read is still exactly its effective resource
population. What changed is the INPUT: a running owner's effective resource population is now its complete
declaration.

**What I did NOT do, and it is a deletion the orchestrator should see:** with rule 1 in place
`requestStaysDeclared` became a TAUTOLOGY at both call sites — `resolveResourceDeclarations` throws at the
population phase on any non-ready or empty populated fact, so a surviving owner's every populated request
resolved at least one path and every such path is in the set the filter tested against; an unpopulated kind
was already admitted by name; and the FACT side (`resolveFactRuns`, effective = declared) had been running the
same tautology since it was written. It is deleted rather than left as decoration (the `server-layout` /
`ui-exports-map-complete` precedent for a mutually-redundant fence), and its position now carries the ruling,
the reason, and the `028e278ee` measurement so the next reader does not restore it.

## 6. COUNTEREXAMPLES CONSIDERED

| shape | verdict |
| - | - |
| **A resource-only policy (`population: { of: "none" }`)** | rule 2 is vacuous (no subjects) and rule 1 is what it needs. All 40 such modules are `entire-population`; their deferral is unchanged. |
| **An entire-population policy** | applicability arithmetic untouched, so the "changed resource reselects" rule can never make one runnable under a partial scope. Pinned three ways. |
| **A resource that CONTAINS its own subjects** (an authored tree over the policy's own population) | THE REAL COUNTEREXAMPLE to exactness: editing one source touches an input, so every subject is reselected and a `selected-files` run degrades to whole-population per changed file. **Taken deliberately** — narrowing here would render a stale sibling verdict against a tree that moved — and pinned as a named arm rather than hidden. It costs nothing today: all three live `selected-files` resource policies declare a resource DISJOINT from their population (`json:baseui-manifest` is a `tooling/` file, never a `@ui` source). A future self-overlapping hybrid should declare `entire-population`. |
| **`--changed` cost** | unchanged for the corpus. The only owners whose selected set grows are the three `selected-files` resource policies, and only when the manifest itself changed. |
| **Making the two doors' reason STRINGS one home** | refused: `POLICY_PASS_REFUSALS` text is the policing lane's fence. Flagged in §3. |

## 7. DEVIATIONS FROM THE BRIEF, with receipts

1. **`policy-plan.test.ts:314-342` was rewritten, as the brief permitted.** Its `.mts` hybrid `.each` block
   pinned `effectiveSourcePaths: []` with `mode: "run"` for the three narrowed scope kinds — the defect
   itself. Intent preserved (a compiler-member `.mts` is a resource identity and never a source one, in every
   scope kind); all four kinds now agree on both fields, and the comment says why it changed.
2. **Two more pre-existing tests pinned the defect and were rewritten, not deleted.**
   `policy-pass.test.ts` "resource identities join requested selection" asserted the narrowed availability
   (its fixture read only the ONE resource that survived the narrowing); it now reads both declared
   resources, as obligation 1 requires, and gained the untouched-request arm so "join requested selection"
   is still asserted from the applicability side. `policy-plan.test.ts`'s fact fixture asserted the
   `deferred` half of the §2.2 crash pair.
3. **Scope extension beyond the row's letter:** probe D (the source-only tool error) and the
   planner/dispatcher fact divergence are the same mechanism and the same two files; fixing C alone would
   have left a lane's `--changed` run withholding both policies. Reported here rather than filed.
4. **No doc touched.** `resource-policy-contract.md` §3.4 is unweakened (entire-population deferral is
   bit-identical); the selection law is stated in the new module's header. Root owns the prose.

## LEDGER ROWS (3 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `baseui-derives-not-respells` · `baseui-derives-not-respells-health` · `baseui-state-data-attributes` | #2309 `lib/policy-plan.ts:262` · `lib/policy-pass.ts:326` | a changed-mode request naming ONLY a declared resource scheduled the policy, visited ZERO source files and reported a SUCCESSFUL CLEAN — a manifest edit could invalidate every seal silently | runtime selection (false clean) | **CLOSED** | one shared `lib/policy-effective-population.ts` read by both doors; production control in `baseui-and-surface-family.suite.repo.int.test.ts` §2309, red-first 4 failed / 41 passed at `028e278ee`, 45 passed after |
| `baseui-derives-not-respells` · `baseui-derives-not-respells-health` · `baseui-state-data-attributes` | #2309 `lib/policy-pass.ts:252` (the deleted `requestStaysDeclared`) | a changed-mode request naming ONLY a `@ui` source WITHDREW the declared `json:baseui-manifest` and refused the owner `[create] … is undeclared` — exit-2 on the commonest scoped invocation | runtime selection (tool error) | **CLOSED** | resources are never narrowed for a running owner; the tautological filter is deleted with its ruling recorded at its position; pinned by the same §2309 block, both siblings |
| `lib/policy-plan.ts` · `lib/policy-pass.ts` | #2309 `policy-plan.ts:238` vs `policy-pass.ts:318` | planner and dispatcher computed the split independently and disagreed: a consumed fact's population counted in the planner's completeness denominator only, so an entire-population consumer was planned `deferred` and resolved `success`, which `applyOwnerPlan` throws on | runtime selection (planner/dispatcher divergence) | **CLOSED** | one calculation, both callers; agreement pinned over four request shapes by planning AND executing each (`policy-effective-population.test.ts`), and the previously plan-only fact fixture in `policy-plan.test.ts` now executes |

ledger rows OWED: 0

## Proposed memory lessons (report text — the orchestrator owns the write)

- **`selection-narrows-subjects-never-inputs`** — *A gate policy's RESOURCES and FACTS are inputs, not
  subjects: a scoped run gives an owner its complete declaration and narrows only the source population.*
  Body: intersecting the resource population with `--changed` produced BOTH failure modes at once — a
  successful clean over zero subjects when only the resource was named, and `resource request … is
  undeclared` when only a source was named. The second refusal names the DESCRIPTOR, so it reads as a
  descriptor bug. The other half of the rule: a changed input reselects every subject, but availability
  (what you may read) and applicability (whether you run) must stay separate questions — widening the
  deferral denominator to the completed resource set would have made every `of: "none"` entire-population
  policy run on every changed request.
- **`two-doors-one-calculation-or-a-throw`** — *When a planner and a dispatcher both compute the same
  selection and a reconciler compares them, a second spelling is a CRASH, not a drift.* Body: `applyOwnerPlan`
  throws when a plan says `deferred` and the dispatcher resolves `success`; that pair was reachable at
  `028e278ee` for any entire-population policy with a fact whose population the scope did not cover, and it
  was invisible because the planner is not yet the production door and the one test covering it planned
  without executing. A pin that only PLANS is half a pin.

## Receipts

- base: `028e278ee` (descendant of `765dcdd71`), lane worktree `.claude/worktrees/agent-ae026c897f4363636`
- `pnpm check:structure --check baseui-derives-not-respells --check baseui-derives-not-respells-health`:
  **before** and **after** identical — `single-pass: clean`, `2 ran · raw 7 = waived 7 + granted 0 +
  effective 0 · 0 alarm(s) · 0 tool error(s) · 0 withheld`, population `366 source · 1 resource`, exit 0
- `pnpm test:scoped` over the 12 affected files: `220 passed`, exit 0
- `pnpm exec biome check <7 touched files> --diagnostic-level=error`: clean
- `pnpm exec eslint <7 touched files>`: exit 0
- `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json`: `PASS` / `PASS` (the root program
  owns `tests/**/*.ts`, so both new/edited suites are covered)

---

## Integration appendix — current main receipt (2026-09-13)

This appendix is additive. Everything above it is the builder report preserved byte-for-byte from
`.claude/worktrees/agent-ae026c897f4363636/docs/reviews/gate-runtime/x-resource-selection-2026-09-13.md`.
Its branch-base, red-first, and branch-run statements remain historical receipts and are not rewritten as
current-main evidence.

- Integrated main commit: `57f7affdc`, including resource-selection implementation `202e5342d` and the
  independently accepted contract-home relocation.
- Current-main focused floor: 12 affected suites, **220/220 passed**. Artifact:
  `reports/runs/test/main-190157-2026-09-13T06-23-39-779Z/test-report.json`.
- Native type ownership: tooling and root programs passed. Scoped Biome and ESLint passed.
- Current-main `no-inline-types`: `raw 6 = waived 5 + effective 1`; the sole effective finding is the
  product-owned `BugReportSubmission`. There were no tool errors and no withheld result.
- Review/lifecycle boundary: #2309 and #2297 remain pending final review. Integration and green focused
  checks do not establish their lifecycle closure.
- Documentation boundary: this integration reconciles the resource-policy contract and shared narrowing
  comment with the implemented selection law, distinct acquisition phases and per-owner receipt semantics.
  Independent source review accepted the documentation; entire-population applicability/deferral and each
  declared resource/reader-reachable refusal proof obligation remain intact.

The original report declares three defect ledger rows. Its five proof obligations are verification evidence, not five additional defects; only the original three rows are folded into the refutation ledger.
