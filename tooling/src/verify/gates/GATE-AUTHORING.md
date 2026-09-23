---
kind: law
status: active
updated: 2026-09-13
---

# Authoring a final structural policy

This is the mechanism-first guide for `defineGate`. Start with the
[reading router](../../../../docs/design/gate-runtime-read-first.md), then the standing contract in
[gate-runtime-standardization.md](../../../../docs/design/gate-runtime-standardization.md) and the relevant source
headers. The standing contract governs; this guide connects authoring decisions to their implementation and proof.

The [legacy guide](../../../../docs/history/gate-authoring-legacy-2026-09-13.md) is preserved verbatim for remaining
legacy maintenance and conversion archaeology. Its descriptor fields, private exemptions, fixture ritual and exemplar
recommendations are not final-policy templates. The 2026-09-11 exemplar report is refuted history: never copy a module on its authority.
Numbered references below retain the relevant subject; explicitly legacy rules route to that archive.

## 0. Start from the mechanism

| Decision | Authoring action |
| - | - |
| existing enforcement | Read the live resolver, compiler, native lint or policy owner before adding a detector; §10. |
| scaffold | `pnpm gate:new <kebab-name> --singleton-reason "<reason>"`, or the existing-family form below; replace the placeholder predicate and proofs. |
| subject | Choose the smallest complete population, analysis tier, shared facts and declared resources; §3. |
| family | Name the shared `lib/` callable or canonical subject/vocabulary declaration reached from production hooks, or document a valid singleton reason. |
| authority | Choose exactly one of `hard`, `ordinary`, `reviewed-grant`; §4. Split differing authorities into siblings. |
| proof | Preserve every old guarantee; declare catch, near-miss and applicable refusal rows, plus family evidence; §5. |
| landing | Fix introduced violations, reconcile coupled sites and read the coordinated production result; §§2 and 8. |

Choose family input explicitly; the command never waits for interactive input:

```text
pnpm gate:new <name> --singleton-reason "why no meaningful shared dependency exists"
pnpm gate:new <name> --family-of <existing-gate-id> --dependency <canonical-lib-path>#<declaration-name>
```

The singleton's family equals its id and its header records your reason. The shared form derives the family from a
canonical existing final policy and requires the named `tooling/src/verify/lib/` declaration to be reachable from that
policy's production hooks. An unused import, proof-only reference, erased type or different same-file declaration does
not establish that dependency. This checks identity and source reach; semantic fitness still needs review.

A singleton placeholder starts structurally green. A shared-family scaffold is explicitly an unfinished draft: its
chosen dependency must drive the actual new predicate before Q08 can accept sharing. The generator adds no dummy call,
unused import or nominal wrapper to disguise that missing implementation. Complete the predicate and its proofs, then
exercise the family; a clean placeholder conformance result alone is not that evidence.

## 1. The final contract and reporting

Read [contract/policy.ts](../contract/policy.ts) in full. Its field tables and proof vocabularies are the authoritative
key sets; consumers derive from them. Export one direct `defineGate({...})` object as `gate`. The loader owns discovery,
branding, duplicate identity and filename agreement. A malformed module is a tool error, never an inactive policy.
There is no final `status`, registration-count edit, `scanRoot`, `scopeSafety`, `fsBacked`, `begin`, `run` or `finalize`.

| Fields | Derive them from |
| - | - |
| `id`, `family` | Filename identity; a meaningful shared production dependency or a reasoned singleton whose family equals its id. |
| `authority`, `severity`, `workItem` | The rule's permitted exception and debt posture. A warning needs the id of a `docs/work` item that is not done; error forbids `workItem`; hard plus warning is invalid. |
| `population`, `analysis`, `execution` | The actual evidence plane and dependency closure; §3. |
| `facts`, `resources` | Only capabilities consumed by this policy; explicit `[]` when unused. |
| `message`, `fix` | The actual population, carrier, predicate and report site. An ordinary fix spells the exact waiver door and reported position. |
| `create` | One invocation's state and hooks; §12. |
| `mustFlag`, `mustPass`, optional `mustRefuse` | The distinguishable behaviors, not a minimum row count as a substitute for coverage; §5. |

Use `ctx.report.node` for a source node and `ctx.report.file` for an admitted file/resource anchor. A node must belong to
the effective source population; a file anchor must belong to the combined effective population. Node coordinates are
source-derived. An explicit token and offset are a pair and must name the exact authored slice. A display label is not
an ordinary waiver position. If omitted, the sink derives a position from the carrier where possible.

An absence finding cannot point to the missing subject. Use the shared `subjectAnchor` with admitted sources, or an
admitted resource anchor. Never return clean merely because the preferred anchor or token is absent. Do not invent an
outside-population anchor. The empty-population refusal still applies. The sink and authority contracts own the final
reporting semantics; legacy `report(node)`/`report(finding)`, line-adjacent ignore resolution and
`@finding-overload-ok` remain historical mechanisms in the archive's §1.

## 2. Coupled authoring and conversion sites

A final policy needs its module, declared proofs, applicable family tests and accurate
[active catalog row](../../../../docs/law/Core-Enforcement-Active-Gates.md). The loader is the registry;
do not add a hand-maintained registration list or count. New scripts or tiers are separate registry changes only when
there is a real new entry point. The legacy fixture-planting anti-drift ritual a final policy never joined is gone
entirely (#2176 Phase F): a policy's bite is its declared rows on `structure:policy-conformance`.

For a conversion, preserve the old source at its commit, account for every legacy example and arm, port the population
in both directions, and translate that owner's live markers in the same commit. Classify exemptions before moving them
into central authority. Retarget coupled tests and remove a legacy fixture or harness only when successor evidence owns
its guarantee. Search all test assertions of the legacy roster, including ledger equality, rather than only named
membership matchers. Renames also sweep document citations, literal paths and escaped regex paths; §9.

`gate-modernization` still audits legacy descriptors and cites this path. Its legacy field and stale-arm advice belongs
to the archived §§1–4, not to `defineGate`. Keep the original path live: `eslint-grant-liveness` and
`depcruise-grant-liveness` also use it as reviewed fixture-ignore authority; §6.

## 3. Population, analysis and resources

Read [contract/population.ts](../contract/population.ts) for the named roots, derived sets and algebra. Use named refs,
composition and supported selectors; do not rebuild a private path predicate. `under` is a glob such as `x/**`.
`all` and `none` require reasons. Do not assume `@authored` and `@packages` contain every workspace member: use their
current classifications. A population port records `legacy − final` and `final − legacy` and explains each difference.
An outside-only fixture can refuse for emptiness; a fence proof also plants an admitted anchor.

Choose `syntax` for syntax, `types` when the predicate needs semantic resolution, and `resource` for a resource-only
policy. `selected-files` is valid only when selected files contain the whole verdict; cross-file relationships need
`entire-population`. A convenient local green cannot justify a smaller execution scope. Shared providers in `facts`
are read through `ctx.fact()` only in `evaluate`, after the shared walk. A declaration that is never consumed is not a
capability reservation. Never acquire a private Project, checker shortcut, recursive walk or filesystem reader.

[contract/resource-declaration.ts](../contract/resource-declaration.ts) owns the closed resource vocabulary; read the
owning resource contract/header for its exact request, result and refusal behavior. Do not duplicate a count of kinds.
Source populations and resource facts are different inputs. In particular, an installed-package fact has no authored
path, while demand facts receive their subject at the call. Declare every read; missing capability is an explicit
build-or-disposition question under standing law §4, not permission for a local filesystem escape.

Read [TS-MORPH-CAPABILITIES.md](TS-MORPH-CAPABILITIES.md) before choosing a raw API, and
[NODE-26-FILESYSTEM-CAPABILITIES.md](NODE-26-FILESYSTEM-CAPABILITIES.md) before changing a filesystem-owning instrument.
Final policy authors use the admitted shared surface. World/config ownership and generated TypeScript program selection
remain in [.claude/rules/tooling.md](../../../../.claude/rules/tooling.md) and
[Core-Tooling-Law.md](../../../../docs/law/Core-Tooling-Law.md); a root-tsconfig check cannot replace them.

## 4. Authority, liveness and completeness

[contract/gate-authority.ts](../contract/gate-authority.ts) and standing law §5 own the three doors:

| Authority | Meaning |
| - | - |
| `hard` | No waiver or reviewed-grant suppression. |
| `ordinary` | Exact `@orb-waive <policy-id>(<position>): <reason>` at the authored report position. |
| `reviewed-grant` | Exact central `(policy-id, subject, operation)` permission with `why` and `endsWhen`. |

There is no final gate-local exemption table, custom marker, baseline or path exclusion used as permission. Split
arms with different authority. A legitimate population boundary is not an exception ledger in disguise. Fix live
violations at landing; a new allowance cannot park current debt. Follow the standing law's explicit warning transition
when authorized, retaining the live issue and full population.

### 4.3 Position and carrier

An ordinary waiver binds the reported source slice and carrier. Legacy discriminator labels do not port by spelling.
Re-derive the final position and exercise its binding. Identical carrier/position pairs cannot promise independently
waivable findings. Legacy stacked-block, line-adjacent and optional-position rules remain in archived §4.3; do not
implement a second resolver in a policy.

### 4.4 Two-sided authority

Central reconciliation occurs after all selected owners complete. It judges missing, stale and over-broad permission;
a grant matching more than one candidate consumes none. Failed or incomplete owners withhold both findings and
liveness judgments. Partial evidence must not declare an exception live or stale.

### 4.4a Legacy liveness modes

Existing legacy citations distinguish mode A (the allowlisted file vanished) from mode B (the file remains but its
exempted construct disappeared). Both cases need successor evidence; deleting a path-only stale sweep does not prove
mode B. The original algorithm and scope guard live in archived §4.4a. Final policies delegate permission consumption
and stale judgment to central authority rather than copying either gate-local sweep.

### 4.5 Complete evidence before a verdict

Do not sweep liveness against a scoped fragment as though it were the whole corpus. Legacy real-anchor guards remain
explained in archived §4.5; final execution scope, owner completion and withholding carry that obligation. A family
proof must distinguish complete evidence from a legitimate scoped or fixture absence.

### 4.6 Blindness and semantic population

File counts do not prove that a reader resolved all semantic members. Use `ctx.receipt` for member/resource counts
where the verdict depends on them; preserve refusal on empty or unresolved derivation. Never silently skip an unreadable
declaration. Separate independently shrinking populations rather than summing them. Counts do not prove correctness:
plant controls for each supported import, spread, inheritance or builder shape and the unresolved branch.

### 4.8 Single writers and retired budgets

The archive retains the original shrink-only baseline rule, including deleting its reader and generator at terminal
zero and classifying ratified rows separately from debt. Those procedures do not authorize final-policy ratchets.
Standing law §5 owns source-derived equality, the named non-derivable exception and central grant migration. Preserve
both dead-file and dead-construct evidence when retiring a table. A generator must never turn a current violation into
its own permission; native configuration grants remain hand-authored and liveness-gated by their owning instruments.

## 5. Proofs and shared readers

Every row has explicit `mode`, `files` and a mechanism-specific `why`. Use `source`, `types` or `resource` for the actual
substrate. `mustFlag` pins exact `count`, or `countFrom` naming the exact module-scope registry driver that actually
determines this fixture’s cardinality, and an identity discriminator where required; using both count and identity is the ordinary authoring pattern. `mustPass` has no `expect` object.
Optional `mustRefuse` is nonempty and requires only `expect.messageIncludes` naming the policy's own refusal, never the
generic refusal envelope. Iterate rows through the shared `policyProofRows` vocabulary so refusal rows cannot disappear.

A reviewed-grant policy annotates at least one `mustFlag` with authored `grant: { subject, operation }`. Conformance first
checks the ungranted catch, then reruns the same fixture with that exact synthetic grant. The rerun must consume exactly
one, leave zero effective findings and alarms, and complete without errors. Deriving the witness from the just-emitted
finding is tautological. The actual central grant table and its wrong-identity, duplicate and stale boundaries retain
family controls.

Every ordinary policy owes a production-dispatched positive identity test: exactly one raw finding becomes one waived
finding, zero effective findings and zero authority alarms. Once per family, corrupt the marker position and require
the dead-position alarm. Central malformed/stale/over-broad marker cases stay in the engine suite. Hard policies have no
waiver arm. Expected authority alarms belong in importing tests, not catch/pass rows. Warning tests and a real run retain
both warning severity and the issue identity. Standing law §§6.2–6.3 owns these boundaries.

Retain legacy per-shape proofs, each declared limit and every newly introduced narrowing. A narrowing control must die
when that fence is cut. A new-property proof needs a planted break. Syntax variants include aliases, imports, computed
members, destructuring, wrappers, paired/self-closing JSX and the actual runtime string shape where relevant. Use the
shared symbol/expression readers (`lib/symbol-reference.ts`, `lib/ast-read.ts`) instead of repeating narrow node guards.
A fixture must resolve its imports and reach the claimed branch; a refusal on a convenient stub proves no identity.

For text predicates, declare comment posture: AST-safe, comment-blind through the shared `comment-spans` reader, or
comments-intended because comments are the subject. Never strip comments with a regex that eats strings. Preserve
coordinates when blanking, use the sound candidate fence before expensive blanking, and do not cache overwritten scratch
SourceFiles by identity. Exercise both comment-caused accusation and comment-caused false permission. The fixture must
contain a shape the raw matcher would catch, and removing the comment fence must kill its control. A carrier fence also
owes evidence: a value passed through a variable remains a carrier; do not inherit a JSX ancestry restriction blindly.

A real-corpus virtual-overlay liveness control and the conversion differential are separate from declared conformance.
The differential compares old and new findings, populations and tool errors over the same bytes, classifies each change,
and records per-arm coverage after a split. An empty real-corpus result alone proves no bite. See standing law §6 and the
[playbook](../../../../docs/design/gate-runtime-orchestrator-playbook.md) for the complete proof ownership and sequence.

## 6. Harness and fixture boundaries

The shared runtime owns discovery, walk dispatch, hook failures, deterministic findings and authority ordering. Policy
hooks receive only admitted capabilities. Final proof files are isolated: in-memory sources/types and temporary resource
fixtures; real-corpus controls use virtual overlays. Final policies never plant checkout fixtures. Refer to standing law
§6.5 and current conformance headers before changing substrate mechanics.

No suite plants a transient fixture into the checkout any more. The reserved `__g_*` namespace belonged to the legacy
gate self-test, which retired with the legacy runtime at #2176 Phase F (2026-09-14); its native-tool fixture ignores went
with it — the ESLint `**/__g_*` ignore, the dependency-cruiser `(^|/)__g_` exclude, the `vitest.config.ts` entry and the
two generated-tsconfig excludes are all gone, and so are the four reviewed-grant rows that carried them. Two `__g_*`
entries deliberately survive and belong to ONE owner that is not a fixture: `tooling/src/verify/lib/biome-rule-liveness.ts`
writes a repo-root `__g_biome-rule-liveness.<pid>.json` probe, which is why `.gitignore` still ignores the prefix and
`biome.json` still negates it. `__dc_*` remains the dependency-cruiser self-test's own live planter. A final policy proves
real-corpus liveness through a VIRTUAL overlay (`tests/support/real-corpus-liveness.ts`) and plants nothing — none of the
surviving entries is permission to change that.

## 7. Header and style

Use the smallest complete header: rule and arms/limits; actual family module/declaration or singleton reason; population
port or intentional correction; retired private-marker census. Standing law §7 owns exemplar fitness. A five-line budget
is not permission to omit a load-bearing constraint; source headers carry the detailed domain law. The scaffold is a
starting point and must be checked against these obligations.

A comment that asserts a GUARANTEE is a claim, wherever it sits: a header, a JSDoc block or an ordinary line comment
beside the code. It owes a row or family control that fails when the stated property is removed, or it states plainly
that nothing enforces the property. A comment that is right about what the code does can still be wrong about what is
guaranteed, and the next editor treats it as a verified invariant. Choose the cheapest owner that can reach the
property: a declared row for a fixture-expressible verdict — including a reviewed-grant consumption claim, which a
`mustFlag` row proves by carrying a `grant: { subject, operation }` witness that conformance re-runs with that exact
synthetic grant (§5) — and an importing family test driving `runPolicyPass` only when the claim concerns the actual
central grant table, its wrong-identity, duplicate or stale boundaries, or anything else a single synthetic grant cannot
express (#1997).

A comment may quote a count of a set only when something derives that count at read time, or when the comment carries
the command that re-derives it and the date it was taken. Otherwise it names the deriving reader, registry or pin and
leaves the number out. A two-sided ratchet polices the set, not a prose count of it, so a literal describing a machine's
answer rots whenever that answer changes (#2179). A dated one-time measurement is legitimate when it says it is a
snapshot, with its date and method.

Follow house dispatch/type style and native lint. Use a mapped `Record` where a single-arm switch creates an unreachable
branch; use the appropriate multi-arm form when naming rules require it. Suppress only a genuine native-rule false
positive at the exact line with its reason. Never run a tree-wide fix-all; the lane rules own permitted scoped formatting.

## 8. Verification and its limits

Use the [playbook's verification section](../../../../docs/design/gate-runtime-orchestrator-playbook.md#6-coordinated-verification-and-serialization)
and lane-standing facts for command selection and shared-host serialization. Preserve declared conformance, family
controls, per-policy structure delta, population counts, authority consumption and withholding evidence. Run the affected
native programs selected by generated world/config intent. Read completed results, including errors and withheld owners;
a zero exit from an uninvoked library is not evidence. Use the verifier CLI, never execute an `ops/*.ts` library as a command.

Whole-corpus conformance and integrated structure belong to the coordinated quiescent boundary. A scoped green cannot
close that obligation. Do not launch duplicate heavy suites from a docs lane. Fixture work must clean up exactly its own
changes; never use stash, checkout/restore or git-revert probes to erase concurrent work.

## 9. Coupled refactors

| Change | Required evidence |
| - | - |
| path move or deletion | Sweep literal and escaped paths, populations, anchors and citations; re-prove the affected bite. |
| declaring module becomes a barrel | Resolve to the declaration; a re-export is not a local variable declaration. |
| predicate/authoring shape changes | Rewrite the control in the real new shape; preserve all old obligations or classify their successor. |
| tuple or union widens | Sweep derived types and consumers, including `Extract` branches that can collapse to `never`. |
| final importer disappears | Check whether a promised shared reader was bypassed before de-exporting it to silence unused-code checks. |
| export gains a brand | Sweep `typeof` consumers and use the real library type where it represents any member. |

## 10. When not to write a gate

Never mirror an enabled native lint rule. Generic ecosystem rules remain with their native owner; the retired GritQL
layer is not an authoring home. Do not ossify an unsettled shape. Prefer a live registry, tuple, schema or resolved owner
over a copied path list. Every structural review identifies the actual enforcement rung, an unenforced obligation or an
explicitly unrepresentable check; a one-site hand fix is not class prevention.

## 11. Enforcers and review obligations

The current source owns each predicate. The dated policing audit is a checklist, not a claim that every surface is
mechanically sealed. The following table distinguishes load/runtime guarantees from source policing and hand review.

| Mechanism | Current enforcer and limit |
| - | - |
| descriptor keys, enums, authority/severity, proof-row shape | [`lib/policy-validation.ts`](../lib/policy-validation.ts) — `assertGatePolicyDescriptor`; exact keys and branded facts, not semantic fitness of the chosen contract. |
| warning work-item liveness | [`warning-workitem-liveness`](./warning-workitem-liveness.ts) holds every warning descriptor's `workItem` against the `docs/work` item it names, offline on every structure run; a missing or done item is a finding. Positive-integer schema validation alone does not establish liveness. |
| branded export, filename/id, duplicate id, singleton identity | [`lib/policy-module.ts`](../lib/policy-module.ts) assertions through [`lib/loader.ts`](../lib/loader.ts); a cast or cloned object cannot counterfeit `defineGate` registration. |
| direct descriptor, private walk and module state | [`policy-soundness`](./policy-soundness.ts) delegates to [`lib/gate-contract.ts`](../lib/gate-contract.ts) `inspectGateContract`; its closed walk-method set is not proof against every possible external traversal library. |
| inert population extension, missing ordinary fix, raw resource result, forbidden I/O and retired grammar | [`policy-soundness`](./policy-soundness.ts); resource calls use canonical `readyResourceValue`, and I/O/grammar checks cover their declared shapes, not every possible wrapper or private permission implementation. |
| private authority/legacy imports and sibling-gate imports | [`policy-legacy-imports`](./policy-legacy-imports.ts); resolved forbidden homes, not a generic ban on all TypeScript casts. |
| local binding/origin resolution | [`policy-binding-resolution`](./policy-binding-resolution.ts) judges a closed set of type-resolved ts-morph members; `getSymbol()` alone, out-of-vocabulary members and receivers typed `any` are outside that detector. |
| checkout-writing family fixtures | [`policy-fixture-substrate`](./policy-fixture-substrate.ts) requires every write-affecting operand of a governed filesystem call to PROVE an invocation-owned scratch root; checkout and unreadable are both findings. A helper parameter is resolved at its complete authored call sites, so the fence now reaches through the dominant `plant(root, rel)` shape (#2332). Its limit: a mutation authored in a module OUTSIDE `tests/tooling/verify/gates/**` is not visited, and the proof is lexical/static rather than a filesystem sandbox. |
| syntax-tier type/compiler reads | [`gate-modernization`](./gate-modernization.ts) ARM E covers a closed member vocabulary and one relative-import hop, resolved through a named import's local binding or through the members read off an `import * as` binding (#2459). Default imports, further hops, unresolved targets and computed subscripts remain limits. |
| actual shared family | [`policy-family-readers`](./policy-family-readers.ts) uses `policyProductionDependencies` from [`lib/policy-descriptor-read.ts`](../lib/policy-descriptor-read.ts): each multi-member policy must share a canonical `lib/` declaration with a sibling through possible source reach from `create`, including method-form roots, callbacks, callable helpers and stable derived values. Callable/fact identities and canonical subject/vocabulary data qualify; unused imports, proof-only use and erased type references do not. Declaration identity matters, not sharing a file. This proves source reach, not runtime branch/callback execution or semantic fitness; meaningful dependency and singleton justification remain review-owned. |
| analysis, execution, declared providers/resources | Validator plus [`lib/policy-plan.ts`](../lib/policy-plan.ts), [`lib/policy-pass.ts`](../lib/policy-pass.ts) and [`lib/policy-pass-context.ts`](../lib/policy-pass-context.ts); capability, readiness, consumption and completion checks do not prove the semantically smallest contract. Runtime sequencing refuses early fact reads through absent/pending provider state; facts become ready before policy evaluation. Review still checks semantic fitness. |
| catch count and finding identity | [`policy-proof-expectations`](./policy-proof-expectations.ts) plus [`ops/policy-conformance.ts`](../ops/policy-conformance.ts); readable rows require cardinality and the applicable discriminator. `countFrom` validates a named module binding, not its runtime cardinality; review must prove that binding actually drives the row’s count. Unreadable source and bounded message expansion retain review limits. |
| refusal expectation | Validator plus conformance require the distinctive substring and an actual refused pass. [`policy-refusal-coverage`](./policy-refusal-coverage.ts) recognizes direct nonempty array literals in `facts`/`resources` and checks for a refusal row or recognized family proof; alias/non-literal declarations are outside that recognizer; behavioral adequacy still needs review; not every policy requires this arm. |
| reviewed-grant witness | Validator requires an authored witness; conformance reruns the production pass; [`lib/gate-authority.ts`](../lib/gate-authority.ts) judges exact single consumption. This does not prove the actual central table. |
| ordinary waiver spelling | [`policy-waiver-spelling`](./policy-waiver-spelling.ts) checks readable fix text for the policy's own exact opener; it does not validate every possible fix string or prove the promised position. |
| ordinary identity proof presence | [`policy-waiver-identity`](./policy-waiver-identity.ts) recognizes marker evidence and direct `waivedFindings` access. It does not prove assertion semantics; the zero-effective/one-waived/zero-alarm behavioral control remains required. |
| coordinates and authority integrity | [`lib/policy-pass-context.ts`](../lib/policy-pass-context.ts), [`lib/gate-authority.ts`](../lib/gate-authority.ts) and [`lib/ordinary-waiver.ts`](../lib/ordinary-waiver.ts) own admission, authored slices, metadata and exact consumption. |
| truthful message/header, complete population, narrowing and real-corpus liveness | Standing law §§6–7 and independent review with discriminating controls. Do not claim a corpus-wide mechanical manifest where it has not landed. |

## 12. Invocation state, caches and world guarantees

Allocate mutable state inside `create`; it lasts one invocation. Shared readers/providers own shared derivation. Never
cache policy answers on Project identity or import another gate for its state. A reused Project can serve multiple
fixtures or passes. The legacy archive's §12 preserves the paid-for substrate rules: unique virtual roots on reuse,
no recreation of stale virtual paths, and comparison of actual findings across substrates with corruption controls,
rather than comparison of pass/fail alone. Preserve those controls when changing their runtime owner.

Likewise, do not collapse native worlds/configs into a synthetic root program or generate permission from violations.
The [world/config law](../../../../.claude/rules/tooling.md) distinguishes generated TypeScript intent from
hand-authored, liveness-gated native configuration. This guide changes the authoring route; it retires none of those
world, config, fixture-isolation or conservation guarantees.
