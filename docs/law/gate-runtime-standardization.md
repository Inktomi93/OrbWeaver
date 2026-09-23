---
kind: law
status: active
updated: 2026-09-23
---

# Gate-runtime standardization law

This file owns the standing contract and proof law for #1584. Procedure lives in
[`gate-runtime-orchestrator-playbook.md`](gate-runtime-orchestrator-playbook.md); the bounded onboarding index lives in
[`gate-runtime-read-first.md`](gate-runtime-read-first.md); dated measurements and incidents live in
[`../history/gate-runtime-worked-cases-2026-09.md`](../history/gate-runtime-worked-cases-2026-09.md). The D-ledger wins
every conflict. Code, types, tests, and file headers are evidence of current behavior; an implementation that violates
the intended guarantee is a defect and does not weaken this law by existing.

## 1. Transition model

The migration is a mixed-runtime transition. One production front door loads legacy `GateDescriptor` modules and final
`GatePolicy` modules, dispatches each by exact contract identity, and reports one result. A malformed or unbranded
lookalike is a tool error; every module is classified exactly once. Final policies contain no compatibility adapter.

Every Orb-specific policy converges on the final ts-morph runtime. Native Biome, ESLint, and community rules retain
generic ecosystem lint. Legacy retirement follows conversion of the last owner and its successor evidence; zero legacy
descriptors is an end-state cleanup condition, not a prerequisite for useful conversions. [GATE-AUTHORING.md](../../tooling/src/verify/gates/GATE-AUTHORING.md) is the final authoring guide, subordinate to this
contract. Its verbatim legacy archive explains the removed descriptor and is not a final-policy template.

Mutable row state belongs on GitHub Project 1. Conversion landings are comments on #1584; defects, prerequisites, and
owner decisions receive rows. Runtime rosters and proof counts come from `pnpm check:policy-conformance`; descriptor
shape findings come from `pnpm gate:contract`. Neither prose nor a `defineGate` grep is a roster.

## 2. Final policy contract

Every final module exports one direct `defineGate({...})` object literal. `id` equals the filename. Required fields are
`id`, `family`, `authority`, `severity`, `population`, `analysis`, `execution`, `facts`, `resources`, `message`, `create`,
at least one `mustFlag`, and at least one `mustPass`. `facts` and `resources` are explicit empty arrays when unused.
`workItem` is required and positive for `warning`, and forbidden for `error`; `fix` is required for ordinary policy
usability; `mustRefuse` is optional and may not be empty.

The vocabulary is data in `contract/policy.ts`: `POLICY_FIELD_TABLE`, `POLICY_FIELDS`, `POLICY_OPTIONAL_FIELDS`,
`POLICY_PROOF_ARMS`, `POLICY_PROOF_KEYS`, `POLICY_EXPECTATION_KEYS`, and `POLICY_HOOK_KEYS`. Validators, generators,
runners, stages, and family sweeps derive from it. A prose or template list that differs is stale.

Use the smallest complete contract for the evidence plane:

| Capability | Required use |
| - | - |
| `visitors` | kind-indexed AST judgments; this is the only walk |
| `visitFile` | a true file-level callback such as a line or comment posture |
| `evaluate` | post-walk, cross-file, resource, fact, or grant judgment |
| `facts: [provider]` | consume a shared `defineFact` provider through `ctx.fact()` in `evaluate` |
| `resources: [{kind,id}]` | consume a declared ResourceHost input through `ctx.resources` |
| `ctx.checker()` | compiler-resolved identity or type semantics |
| `execution: "entire-population"` | the verdict cannot compose over a subset; it must provide `evaluate` |
| `-health` sibling | an arm requires different authority or severity; retain the same `family` |

`population` is declared manifest algebra used by every selection mode. `execution` declares whether a subset is
sound; a narrowed request defers an entire-population policy or refuses under strict scope. `create` runs once per
invocation and may close over pass-local state. Hooks run as `visitors`, `visitFile`, then `evaluate`; central
post-processing then owns waivers, grants, severity, sorting, completeness, and reporting.

Every policy supports the common command contract: tier plus file, folder, package, project, changed, and whole scopes;
explicit `--check` and `--family`; strict-scope refusal; list and explain; JSON reporting; stable exit classes; requested
and effective population manifests including deleted and renamed semantic paths; compiler-derived program membership;
one lazy checker per workspace; and per-owner file/member/resource/timing receipts. These are explicit acceptance
dimensions, not implied by a generic “all capabilities” claim. The canonical live shapes are the contract files and
their headers under `tooling/src/verify/contract/`.

One descriptor has one authority, severity, and execution mode. Split a multi-arm legacy module when any axis differs.
Siblings share a meaningful production dependency in `lib/` and one family: a callable reader or canonical
subject/vocabulary declaration, never a theme, filename prefix, or topic. Each multi-member policy shares a canonical
declaration with at least one sibling; one declaration common to the whole family is not required. The dependency graph
starts at `create` and follows possible source reach, including method-form hooks and stable derived values; unused
imports, proof-only use and erased type references do not establish sharing. Source reach does not prove execution on
every input or semantic fitness. A singleton names why no meaningful shared dependency exists.

A ruled split arity is a claim about the current predicates, not permission to force code into an old mapping. Before
conversion, count the independent authority, severity, execution, and semantic predicate arms in the actual module.
Escalate and amend the ruling with source and proof receipts when the old arity would double-report one predicate or
would require a policy to read grants or exception state forbidden by the final contract. An empty exemption table or
baseline remains evidence about the arm's shape; it is not evidence that the arm is absent.

### 2.1 Proof rows, reporting, and population ports

Every `mustFlag`, `mustPass`, and `mustRefuse` row explicitly declares `mode`, a `files` map, and `why`; no default path
is inferred from population. `why` states the mechanism the row distinguishes, not only its expected cardinality.

`report.node` separates the waiver carrier from the source coordinate. The carrier is the AST node
whose trivia can hold a waiver; the position token is an exact authored slice at the reported line and column. When a
policy omits the token, the sink derives a waivable identifier, literal, or keyword from the carrier through `lib/policy-pass-context.ts`. A policy may not synthesize a
token, include presentation text or parentheses that do not occur at the coordinate, or treat a legacy discriminator
label as a final position.

An absence verdict cannot anchor on the missing subject. `ctx.report.file` accepts only an admitted path. Use the
shared `subjectAnchor(ctx.files, preferredPaths)` fallback to choose a deterministic admitted source, or use the
declared resource anchor when the contract exposes one. A missing token does not justify returning clean: report through the admitted carrier and let the sink derive the
token. A missing admitted file is a different condition; never invent an outside-population anchor, and preserve the
empty-population refusal.

Any converting policy needing an exact-slice position consumes the canonical anchors in `lib/caught-failure.ts`:
`anchorWithin`, `calleeAnchorCandidates`, and `firstAnchor`. Expression anchors unwrap parentheses before choosing the
authored subject. A conversion does not clone or reinterpret these helpers locally.

Legacy gate-ignore positions were optional discriminator strings compared to the legacy finding token. Final ordinary
positions are exact source coordinates. Conversion therefore re-derives every position from the final report call and
proves the new door; it never copies a legacy label by spelling. When the legacy subject exists only in comment trivia,
the final AST policy cannot preserve that suppression door: convert the rule to `hard`, retain the catch, and record the
door loss honestly in the differential. Do not manufacture a nearby code coordinate or silently delete the subject.

Every population port is a bidirectional set comparison over the legacy and final admitted paths: record
`legacy − final` and `final − legacy` separately and classify every member. Plant an inside control and an outside
control so equality cannot pass because both sides admitted nothing. A header saying “byte-identical population”
without the two differences and controls is not evidence.

## 3. Query and resource boundary

A gate may inspect its delivered node, iterate resolved `ctx.files`, request a canonical source file or lazy checker,
and call shared readers. It may not call project-wide or descendant traversal APIs, create a Project, keep a workspace
cache, import another registered gate module, or implement binding/origin resolution locally. Shared predicates live in
`lib/`; recognition of a registered gate is by contract registration, not directory name. A corpus-wide
reference-resolution primitive consumed by more than one TOOL (not only `verify`) lives in
`tooling/src/_shared/` instead — the `reference-fact` family moved there (#2358) because `tooling/src/ast/`
also reads it, and `verify` importing `ast` (`ops/orphan-export-ratchet.ts`) made the reverse import a
direction reversal, not a placement choice. This does not widen the family fence: `policy-family-readers`
still requires each family's shared canonical declaration to resolve inside `tooling/src/verify/lib/`, so a
family whose only shared production dependency is a `_shared/` primitive needs a `verify/lib/`-declared
sibling dependency too, or its own singleton reason.

`ctx.relativePath` is partial and throws outside the effective population. Use the declaration's normalized source-file
path for home questions about a resolved declaration. Membership in `ctx.files` is not a substitute because scoped
runs narrow that collection.

Every `ctx.resources` acquisition is immediately consumed through the import-origin-verified
`readyResourceValue(...)`. A top-level `missing`, `empty`, `unresolved`, or `malformed` resource is a tool failure and
withholds its owner; it is never a finding or a silent zero. A health policy may report a semantic domain condition
inside a ready value, but does not report acquisition failure.

A fact provider runs once over the union required by its consumers and withholds dependents on failure. Its receipts
are per dependency granularity and state what the provider measured, not what it found. `members` is the admitted
denominator; `unresolved` is unreadable syntax. Domain emptiness or holes belong in delivered fact data when a health
consumer must judge them. A consumer asking the home of a fact-delivered declaration uses `declarationHome`, because a
provider population may be wider than the consumer population.

A health consumer receipts constant `members: 1` to attest that it consumed the ready fact, never the domain census it
is judging; otherwise a zero domain census becomes a receipt failure and cannot reach its accuser. Unsupported syntax
becomes an unresolved fact or tool error and never collapses to absence. Shared binding/origin resolution follows the
canonical chain without a gate-local hop cap.

The runtime refuses early or undeclared fact reads, duplicate provider ids, a selected-file consumer of a fact that
requires its full declared population, unused declared dependencies, missing semantic receipts, and acquired resources
that remain unconsumed. These are contract failures, not optional review advice.

Provider semantic receipts and receipt-shaped fields inside a fact value are distinct. A policy cannot read provider
semantic receipts. A final policy declaring any fact or resource must prove refusal through a `mustRefuse` row or a
family test that imports the policy and asserts the stronger condition a row cannot express.

## 4. Resource vocabulary

The ResourceHost vocabulary is closed. The tuple and contract files own its current members; prose never hand-counts
them. Reopening requires an orchestrator ruling and a conversion blocked by a read no existing kind serves; trace
the remaining legacy consumers at least one shared-reader hop deep before claiming independence. A new kind requires two or more independent consumers, a capability matrix proving no existing kind can serve
them, runtime and fixture implementations, discriminated status/receipt handling, validator and planner wiring, and
positive, negative, empty, malformed, unresolved, overlay, and isolation controls. A one-consumer kind is a private
reader in contract clothing and is refused.

`installed-package` has the closed `ast | metadata | text` modes. Authored-path identity must distinguish missing,
file, directory, and a symlink resolving outside the tree, including absolute-selector normalization. `biome.json` is
strict JSON; tsconfig is JSONC plus extends folding; neither gains a native snapshot runner. Resource declarations do
not imply the carrier-demand hazard: that depends on a kind's population and ordinary authority.

Installed traversal is available only through `installed-package`, resolved by Node from a declared base with a closed
request id and mode. A policy does not glob or walk `node_modules`, choose an arbitrary caller id, or resolve from an
undeclared base. A new request id may name a new consumer under an existing mode. A fourth installed-package mode or
any other new reading shape reopens the closed vocabulary and must satisfy the full reopening condition; similarity to
an existing evidence contract does not authorize it. A different status, value, or receipt contract is a new kind and
pays the same full admission cost.

The contract distinguishes unpopulated requests (no authored path) from demand requests (subject supplied at the call).
Consume those named classifications from `contract/resource-declaration.ts`, never silently skip an empty declaration.
A demand door still enforces its declaration fence. `exact-file` requires one declaration per id even when its read
accepts several ids; `cssInventory` rides an authored/product CSS declaration rather than minting another census kind.
Read resource-specific identity versus corpus refusal semantics in their contract headers before extending a kind.

Population named roots are only independently selectable packages or top-level trees. A nested `under`/`notUnder`
constraint refines a declared root and does not mint an alias. Authored source populations admit `.ts` and `.tsx`;
other module extensions remain cleanup rather than silent expansion. A resource policy declares why ordinary source
dispatch is `of: none`. Generic policies include tooling and test-tooling unless an explicit, proven population rule
excludes them.

Any ResourceHost successor for staged-index or candidate-index reading preserves the existing staged/worktree
divergence guarantee and its discriminating controls. The complete historical proof-owner row remains in the archived
§12.7 table; conversion re-reads the current implementation before retiring that harness.

## 5. Authority and exceptions

`hard` rejects every suppression. `ordinary` consumes exact `@orb-waive <policy-id>(<position>): <reason>` occurrences.
`reviewed-grant` consumes exact typed `(policy-id, subject, operation)` rows. One grant matching more than one candidate finding suppresses
none of those findings and raises an over-broad authority alarm. Duplicate grant identities are refused separately. A class-level exemption migrated from a broader mechanism must still aggregate
to one finding if a single exact grant is meant to consume it. A policy may use only one authority. Gate-local
allowlists, path subtractions, custom markers, baselines, and exemption tables do not survive conversion; classify and
migrate their meaning to the central authority before conversion.

Central waiver/grant reconciliation runs only after every selected owner completes. A failed, incomplete, empty, or
unresolved owner withholds its findings and its waiver/grant liveness result; no partial owner may make an exception
look live or stale.

Authority and severity are independent. `hard` + `warning` is valid only for an owner-authorized,
time-bounded transition whose findings must remain unsuppressible; `ordinary` + `warning` is valid only
when an actual waiver door is intended. Every warning carries a positive live `workItem`. Hard warning
findings remain effective and cannot be waived or granted. Warning findings contribute zero to the shipped
default blocking count and become blocking when `--fail-on-warnings` is selected; ordinary and
reviewed-grant findings retain the suppression door their authority declares.

A newly policed large class may transition at warning severity over its whole declared population while
its findings are retired in bounded chunks. Authority stays truthful to the allowed disposition: `hard`
when no suppression is permitted, `ordinary` only when the central marker door is intended. At the final
chunk it becomes `hard` + `error` and removes `workItem`. The transition never narrows population to
manufacture a clean result, adds no grant or marker merely to clean the run, and does not authorize a
permanent warning.

Numeric ratchets are forbidden when the value is derivable from source, generated output, a tuple, registry, or native
tool result. Hold derivable relationships directly. **LANDED 2026-09-13 (`284dedcee`, #2230 ARM B):** `ledgers:fresh`
and `baseline theme-css --check` compare the complete committed `theme.css` bytes with `deriveThemeCss` → canonical
`generateArtifacts`. The former `EXPECTED_DIRECT_THEME_DECLARATIONS` constant and parity fixtures are retired;
no policy or fixture maintains an expected declaration count. Canonical validation remains required for this baseline,
including required token history: inability to derive is exit 2; successfully derived but missing or different output
is exit 1. The coordinating primary's whole-stage controls on integrated main `1ef220c20` observed same-count drift,
loss of the theme verdict when its stage edge was cut, and malformed-token refusal. These are primary-run receipts,
not final integration acceptance; the dated evidence and code/data limitation are in
[the theme-freshness disposition](../reviews/gate-runtime/theme-freshness-doc-disposition-2026-09-13.md).

The only sanctioned non-derivable cardinality guard is `depcruise-grant-liveness-health.BACKREF_BUDGET`. It covers the
`$1` backreference dependency-cruiser rules whose bound member set exists only at cruise time and cannot be
derived by a static reader. This named exception guards silent growth of an unreviewable population; it is not a
generic ratchet license. A new numeric exception requires an owner ruling and proof that no source-derived equality is
possible.

THE RULING SURVIVES; TWO OF ITS INPUTS CHANGED, and both are recorded here because a reader who finds a different
number owes the reason rather than an edit. (1) The VALUE was `16` and is `14` since the 2026-09-20 `@orb/inference`
extraction, which deleted `vllm-surface-isolation`'s `surfaces/$1` with its rule and collapsed
`infra-strategy-isolation`'s paired captures onto a single `backends/$1/` — the shrink direction the guard's own
message names, committed rather than left as a budget nobody trusts. This paragraph therefore names no count: the
constant is the number's one home, and a prose copy of a machine's answer rots the moment the answer changes (§7).
(2) The HOME moved with the arm at #2485. The budget lived in the `reviewed-grant` policy
`depcruise-grant-liveness`, where every finding owes a `(subject, operation)` a central row could name; this one has
none and must not acquire one, since a grantable budget is a central door to move the number without touching it —
the precise failure this exception exists to prevent. Reporting it therefore requires `hard` authority, and one
policy carries one authority, so the arm is now the sibling `depcruise-grant-liveness-health` under the same family.

## 6. Proof law

### 6.1 Preserve behavior

Before acting on an inherited audit cell, re-read and re-cut it against current source. Historical counts are upper
bounds on remaining work. When waves disagree, read both and resolve the cell through the current mechanism and its
discriminating control; a later date alone does not settle the verdict.

Carry every legacy `mustFlag` and `mustPass` example one-to-one into explicit `GatePolicyProof` fixtures. Preserve
founding positives, near misses, aliases and identity variants, declared limits, and world-program guarantees. Add a
row only for changed behavior or missing proof. A retired or merged arm receives a successor proof.

Every invented row asserting a new property owes a scratch-copy break of that property: demonstrate that the row fails,
then restore exactly. This obligation does not require re-inventing one-to-one carried legacy rows.

Every `mustFlag` has an `expect` with `count` or `countFrom`, plus `token`, `line`, or `messageIncludes` when identity
matters. `countFrom` is restricted to an exact module-scope registry driver, is mutually exclusive with `count`, and
still requires an identity field. A count-only row cannot prove a branch distinguished only by message.

A narrowing owes a row that goes red when the narrowing is opened. Assert a cut anchor occurs exactly once, import the
specific sibling being exercised, write each cut to a unique sibling scratch module so imports resolve and caches do
not alias, state the cut direction, and restore in `finally`. For a tripwire, fences acquit subjects: opening a fence
can make a `mustFlag` go green. Jointly cut interacting clauses before classifying an individually clean cut.

A clean cut is classified as unenforced, mutually redundant, wrong-direction, performance-only, unreachable, or
structurally unfalsifiable. `UNFALSIFIABLE` requires a constructed fixture attempt. A joint cut that tool-errors may
identify an unreachable clause and a surviving type obligation; delete the unreachable clause. A declared limit also
requires a run row. Ask per arm whether unreadable input reports or passes; a fail-open result is not a declared limit.

Every fail-open-to-fail-closed identity repair has a name prefilter. Check the polarity per arm: accusing direct
verdict use, accusing decision use, acquitting sealed-only use, and identity-acquittal arms are distinct. An unreadable
branch needs a discriminator unique to its message. Opaque `any` reaches member-origin unreadability; an unresolvable
import reaches package-callee unreadability. Drive the gate's actual walk over its full fileset when enumerating what it
sees.

### 6.2 Authority proof

Every ordinary policy has one positive identity arm proving zero effective findings, one waived finding, and zero
authority alarms at the exact reported position. The fixture produces exactly one finding. Central negative marker
cases remain in the ordinary-waiver engine suite; do not copy them into gate rows. Finding granularity must match
waiver granularity: identical carrier and token positions are not independently waivable. Once per family, change the
positive marker position, require the authority alarm that it names a dead position, and restore it exactly. The green
positive counts alone do not prove that the authored position controls consumption.

Every warning policy retains its warning and positive `workItem` in both fixture evidence and a production-dispatched
real run; schema-valid metadata alone does not prove the emitted pair.

Every reviewed-grant policy annotates at least one existing `mustFlag` row with `grant: { subject, operation }`, using
authored identity strings. The loader requires that witness unconditionally; additional witnessed rows are legal.
The baseline must flag without a grant, then the production runner injects the exact synthetic grant over the same
materialized fixture. That second pass must consume exactly one grant, leave zero effective findings and zero authority
alarms, complete the owner receipt, and produce no errors. It runs only after the baseline expectation succeeds.
Own-property presence controls annotation admission: even `grant: undefined` is refused on the wrong authority or arm,
and is not a valid witness on a reviewed `mustFlag` row. `POLICY_PROOF_GRANT_KEYS` owns the exact witness key vocabulary.

P7 and its own-property follow-up are integrated on main through `177d72e0a` (2026-09-13). The coordinator also
passed the whole declared-proof conformance stage on main `141c1f73b`. These scoped, native-program and declared-proof
receipts do not establish full program acceptance; consolidated structure/delta and the remaining barrier stay owed. Central wrong-identity, duplicate, stale, and real-grant-table controls remain family-owned; the synthetic
witness does not replace them. Hard policies have no waiver arm. Real-tree authority receipts pass the complete final
roster as `knownPolicies`; a partial roster manufactures unknown-policy alarms. Expected authority alarms belong in an
importing test driven through `runPolicyPass`, never in a `mustFlag` or `mustPass` row.

### 6.3 Refusal and receipts

`mustRefuse` is optional, never empty, and reverses the other arms' verdict: it succeeds only when the pass refuses and
the text contains `expect.messageIncludes`. Its expectation contains exactly `messageIncludes`; every other key, including `countFrom`, is forbidden. The substring names the
policy's own refusal and may not be part of the generic refusal envelope. When a refusal requires a real grant table,
retain it in an importing family test.

Every final policy owes one real-corpus liveness pin: a virtual overlay on the loaded Project driven through
`runPolicyPass` and asserting a report. It is never a working-tree plant, a health-only subset, or a ratchet. Until the
corresponding enforcement manifest and discriminating controls land, this is a review obligation rather than a claim
that every policy is mechanically rejected for omission.

### 6.4 Differential

Every conversion compares the pre-conversion descriptor and final policy over the same bytes, recording findings,
populations, and tool errors. Convert the legacy predicate, not a weaker message. Classify each difference as a split,
retired arm, marker vocabulary move, stronger reader, exemption-mechanism move, or anchor move. Evidence is either a
committed test or a commit-message receipt stating what ran and what it found.

Use fixture-level replay for catch parity. Apply each side's declared population, use a real tmpdir for a
filesystem-reading legacy gate, line-anchor rewritten imports, and assert no relative import survived. A real-corpus
zero is a population/outcome receipt unless a planted positive control proves liveness. A nonzero result is not
self-validating when it equals embedded fixture rows or comes from an excluded self-home.

A split differential states coverage per moved example. If legacy rows never exercised the moved arm, construct a
successor fixture from its trigger conditions and record the zero-coverage fact in the test. An exemption-mechanism
move proves every formerly hidden site becomes exactly one live consumed grant. An anchor move proves existing markers
still bind.

### 6.5 Fixture substrate

`source` and `types` rows use an isolated in-memory Project; `resource` rows use an auto-cleaned OS tmpdir. `files` map
paths are population coordinates. Real-corpus controls use virtual overlays. Final policies never plant in the checkout.

Every family floor includes a control proving its fixture import specifiers resolve as intended; fail-closure on an
unresolved import must not impersonate a tested identity branch. Each installed package-door identity claim also owes
one measurement through the real program, in addition to its declaration plant.

Plant package declarations with the real installed declaration shape. A convenience stub can exercise a different
branch while producing the same verdict. The in-memory project includes TypeScript lib files but not `@types/node`;
plant Node globals in the package's real augmentation shape and retain a separate undeclared fail-closed row. Any
claimed reader branch requires a control that dies when that branch is removed.

### 6.6 Proof ownership

Declared rows run through `policyProofRows` on the static `structure:policy-conformance` stage. A family test may
cover several siblings. Family tests carry properties beyond an individual declared row, including production-envelope,
baseline/corpus, integration, shared-family, central grant-table, and conversion-differential controls. Use declared rows
for fixture-expressible verdicts; retain family controls when they establish additional behavior or evidence. Synthetic
reviewed-grant witnesses do not replace proof of the actual central grant table and its authority boundaries.
Never hand-roll `[...mustFlag, ...mustPass]`; it omits the refusal arm.

Green conformance proves declared rows only. It does not prove the correct row set, truthful message, smallest contract,
real family, package-door behavior, symlink/absolute-path behavior, or real-tree non-withholding. Read whole-tree owner
status, tool errors, and withheld counts through coordinated structure evidence.

## 7. Pristine conversion contract

A final module is reusable as an exemplar only when all conditions hold:

1. It declares the smallest complete contract.
2. Its `message` describes the actual population, carrier, predicate, and report site.
3. An ordinary `fix` gives the exact waiver spelling and reported position.
4. Its family names the meaningful shared `lib/` callable or canonical subject/vocabulary declaration reached from
   production hooks, or gives a valid singleton reason.
5. Its header records family/reader, population port or intentional correction, and retired private-marker census.
6. Its proofs satisfy §6, including each narrowing, identity, refusal/receipt, liveness, and differential obligation.
7. No private reader, walk, cache, exemption table, scope predicate, filesystem read, or single-consumer helper survives.

Header verification is a hand read with planted controls. Whole-file word or SHA greps can overcount prose and
under-count rev-spec spellings. Gaps are defects; do not transmit them as migration debt.

## 8. Ordering constraints

- The mixed front door precedes conversions.
- Check converted siblings for the same rule before adding a detector. If a stronger existing detector owns it, merge
  into that owner with a successor proof rather than adding a second gate.
- A resource-backed gate waits for its required kind, but the program builds a capability needed by multiple consumers.
- A gate's markers translate only in the same commit after its owner becomes final. Each private grammar is a separate
  parser, consumption map, and stale sweep; a census of one grammar proves nothing about another.
- A gate-local authority artifact receives a central home before conversion. A name does not classify a table; read its
  rows and rationale.
- A filesystem test and `gate:contract` are not convertibility tests. Shared-reader and authority-migration blockers
  are invisible to both. Route work from the current conversion census, and keep a row blocked while its required
  shared reader or ResourceHost fact does not exist.
- A ruling that another tier supersedes a gate requires reading that tier's live predicate and planting a control that
  goes red before retiring the gate.
- World-program guarantees in the prior §12.7 table survive through their current implementation and successor proofs.
  The authoritative worked mapping is retained in the dated history file; re-read current source before conversion.

## 9. Program acceptance

Every current policy has one live owner or explicit retirement. Final gate modules contain no legacy `scanRoot`,
`scopeSafety`, `begin`, `finalize`, free-form `run`, direct walk, Project ownership, mutable module state, gate-owned
glob/path/comment/binding/static/resource reader, workspace cache, baseline JSON, or parallel registry. Every declared
capability works through all selected command, scope, severity, report, and authority paths.

Every source, helper, test, and exemption is read before conversion; every inherited world-program guarantee has a
successor proof. Identity-sensitive policies plant alias, namespace, re-export, destructure, computed, wrapper, shadow,
write, cycle, and dynamic variants as applicable. Acceptance includes focused behavior, differential, failure/re-entry,
whole-structure and structure-delta evidence, plus performance/RSS evidence when the change touches those properties.
