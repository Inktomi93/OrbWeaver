---
kind: design
status: active
updated: 2026-09-13
---

# The resource-policy contract — what a closed-ResourceHost policy OWES (#2011, [gate-runtime-standardization.md](gate-runtime-standardization.md) §2 resource plane)

The one written answer to the question the gate-runtime program (#1584) had answered in pieces and never
synthesized: **given that the runtime refuses a non-ready populated-kind declaration before policy creation, while
demand-owned and installed-package declarations acquire through bound policy doors, what does a resource policy owe?** The pieces are on the tree (`lib/resource-declaration.ts`,
`lib/resource-policy.ts`, `lib/policy-pass.ts`, [gate-runtime-standardization.md](gate-runtime-standardization.md) §3); this document is the synthesis,
the alternatives it rejected, and the measured proof rules a conversion lane copies. It binds every
`analysis: "resource"` policy. Where it disagrees with a module, the module is wrong; where it disagrees with
[gate-runtime-standardization.md](gate-runtime-standardization.md) in full, the guide wins and this document is
stale — say so on the row.

Lessons consulted from the shared memory store before designing: `gate-migration-1584-lessons-hub.md`,
`gate-authoring-lessons-hub.md`, `instruments-lie-verify-the-verifier.md`, `gate-blind-spots-are-spelling-shaped.md`,
`new-doc-catalog-two-commit-stack.md`, `ledger-and-doc-catalog-hub.md`.

## 1. The answer in one paragraph

A resource policy owes **seven things**, and none permits domain logic to consume a non-ready value. It (1)
declares every resource it reads and reads every resource it declares; (2) narrows each acquired fact through
the ONE shared reader `readyResourceValue` — populated kinds are acquired before policy creation, while
demand-owned and installed-package kinds acquire at their bound door; (3) anchors every finding inside its
effective source/resource population; (4) declares the truthful resource-plane shape: `analysis: "resource"`,
a source-free or hybrid population, and an execution mode matching whether selected source members compose;
(5) carries `mode: "resource"` proof rows that satisfy every declaration used by the fixture, isolate ONE arm,
name an exact `count`, and use only discriminators that survive the transplant test; (6) uses the optional
`mustRefuse` proof arm when the proof grammar can express the bad state and retains `runPolicyPass` family pins
for runtime states it cannot; and (7) records in its header the family, the population port with the legacy
SHA, where each refusal lives, and every declared limit with the row that holds it.

A broken populated resource is a population tool error that withholds its owner before `create`. A broken
demand-owned or installed-package fact is receipted at its door and must be narrowed immediately, refusing in
the phase where it is read. Neither path may become a finding or a silent zero. A semantic health sibling may
judge a **ready but degenerate** resource value; if its own declared resource is non-ready, it is withheld too.

## 2. The runtime facts the contract rests on (receipts)

| Fact | Where |
| - | - |
| `ResourceLoad<T>` is a discriminated union: `value` exists only on `ready`; the other four arms carry `reason` | `tooling/src/verify/contract/resource.ts:2-5` |
| Population resolution pre-acquires every declared **populated-kind** resource and throws on any non-ready status, empty fact, or cross-root path; demand-owned and installed-package declarations are partitioned out | `tooling/src/verify/lib/resource-declaration.ts:190-211` |
| That throw is caught PER OWNER: the run is marked `incomplete` at phase `population`, the owner is withheld, every other policy in the invocation continues | `tooling/src/verify/lib/policy-pass.ts:405-421` (`resolveRuns`) |
| The binding fence: an undeclared door read throws; populated paths must remain inside the effective resource population; demand and installed-package doors enforce their kind-specific inputs; each consumed populated/installed resource source produces one per-owner receipt, including cache hits; demand acquisitions produce individually sequenced receipts. Non-ready pre-create declaration resolution produces no policy receipt | `tooling/src/verify/lib/resource-policy.ts` (`accept`, `acceptDemand`, `fencedText`, `fencedExactFiles`) |
| An UNCONSUMED declaration is a receipt-phase refusal | `tooling/src/verify/lib/policy-pass.ts:736-743` |
| `readyResourceValue` — the one narrowing after acquisition; acquisition timing differs by kind | `tooling/src/verify/lib/resource-declaration.ts:21-35` |
| A finding anchored outside the resource population is an `[evaluate]` tool error (`finding file is outside the effective population`) — measured by cutting `ui-exports-map-complete`'s A2 `continue` | `tooling/src/verify/lib/policy-pass.ts` report sink; cut receipt in §7 |
| A resource policy may be hybrid: `resolvePopulation()` independently resolves source and resource populations and combines them; resource analysis does not imply `population: { of: "none" }` | `tooling/src/verify/lib/policy-pass.ts:307-341`; `lib/policy-validation.ts:320-335` |
| Demand kinds (`authored-path`, `authored-text`) and `installed-package` contribute no population path and acquire through their bound doors | `tooling/src/verify/lib/resource-declaration.ts:187-195` |

**Measured refusal wording (2026-09-12, this worktree at `831576613`, driven through `runPolicyPass`):**

```
tree missing      resource declaration authored-tree:server is missing: resource tree has no members: packages/server/src
tree empty        resource declaration authored-tree:server is empty: resource tree has no members: packages/server/src
manifest missing  resource declaration package-metadata:ui is missing: resource is absent from the invocation inventory: packages/ui/package.json
manifest malformed resource declaration package-metadata:ui is unresolved: malformed package metadata: Unexpected end of JSON input
exports non-string resource declaration package-metadata:ui is unresolved: package metadata does not match the closed ui package contract
```

Every one: `toolErrors: [{ phase: "population" }]`, owner `{ status: "incomplete", population: "incomplete" }`,
`withheldPolicyIds` names the policy, zero receipts, zero findings. A complete run files exactly one
`kind: "resource"` receipt per declaration — source `authored-tree:<id>` / `package:<id>` — with `unresolved: 0`.

**And one READY-but-degenerate case that is a VERDICT, not a refusal:** a `package.json` whose `exports` key is
ABSENT resolves to `exports: {}` (`ops/resource-config.ts:31-34`, `stringMap(undefined) → {}`), so
`ui-exports-map-complete` reports every derived module as "no entry at all". That is the honest successor of the
legacy A4 blindness arm: the map names nothing, and the finding says so per module. A NON-string-map `exports`
(conditional exports, an array) is the other half — `unresolved`, a refusal.

**This normalization GENERALISES, so it is a contract note and not one module's row:** `stringMap(undefined)`
returns `{}` for every optional map key the package-metadata provider reads — `scripts`, `dependencies`,
`devDependencies`, `peerDependencies`, `optionalDependencies`, `exports` (`ops/resource-config.ts:31-52`). Every
`packageMetadata` consumer therefore inherits "an absent key reads as an authored empty map" and owes a pin for
what its arm does with an empty map (`verify-registry-parity` reads `scripts` on the same terms;
`depcruise-grant-liveness` reads all four dependency maps). Only a key that is PRESENT and not a string map
refuses. A policy cannot tell the two apart and must not try — the distinction belongs to the provider.

## 3. The seven obligations, each with its enforcer

Constitution §2.3: a placement names its enforcer. Each obligation below names the tier that makes a violation
RED, and the one that is prose-only is called out as the gap.

1. **Declare what you read; read what you declare.** Enforcer: RUNTIME — an undeclared read throws at the
   binding (`resource-policy.ts:25-28`); an unconsumed declaration refuses at the receipt phase
   (`policy-pass.ts:736-743`). Consequence for a policy that reads a resource only for its PATH (an anchor):
   the read still happens, and the header says why (`server-layout`'s manifest).
2. **Narrow through `readyResourceValue`, never a branch.** Enforcer: TYPE for the narrowing itself (`.value`
   does not exist on the union) AND, since #2019, LINT — `policy-soundness` ARM E4 reds a
   `ctx.resources.<door>(…)` result that is not the direct argument of `readyResourceValue`, plus the alias
   escape (`ctx.resources` bound to a name), with the guard resolved by IMPORT ORIGIN so a local lookalike
   cannot acquit. **There is NO hand-off exception** (#2148): a carve admitting the host handed whole to an
   imported `lib/` reader shipped in `bf9beb617` and was removed, because E4's population is the gates tree —
   the instant the host crossed into `lib/`, nothing policed what the reader did with it, so the guard stopped
   exactly where the escape began. The stricter shape is that a shared reader takes the NARROWED VALUE and the
   caller reads its own door; this contract's own `readTsconfigRoster`/`readAcquiredConfigText` were inverted
   into `tsconfigRosterPaths` + `tsconfigRosterFrom` and `acquiredConfigText` to match. The retired carve is
   pinned as a `mustFlag` on the bytes it used to admit, so the removal is an assertion rather than an absence. **This clause is no longer prose-only**; the earlier text here ("no `policy-soundness`
   meta-policy reads `ctx.resources`") described the tree before that arm landed. §5 alt C remains the
   stronger ladder tier and remains a recorded fork. For populated kinds a non-ready guard is unreachable
   after run resolution. Demand-owned and installed-package reads can receive a non-ready value and therefore
   narrow directly at the call site; returning from that reachable branch is a forbidden silent-clean path.
   In both cases the policy must use the shared helper rather than re-spell a `throw` per module. **Every resource policy reads through the helper today, and NO
   resource policy carries an executable not-ready branch** — closed by `0fab76771` (four sites) and
   `2bacd5ef9` (five); `depcruise-grant-liveness` was already loud.

   **Re-derive that census, never quote it** — `ast-grep -p 'readyResourceValue($$$)'` for the sites, against
   the `analysis: "resource"` module list, with a planted negative control (`readyResourceValueNOPE` → 0) so a
   zero means *measured* rather than *could not search*. This sentence originally read *"ten of ten … 16
   sites"* and was **stale on the day it was written**: `runner-config-path-liveness` converted five minutes
   earlier in the same merge train and carries four more, making it 11 of 11 / 20. The number rots at every
   merge; the derivation does not. **A census-shaped sentence in a doc lanes copy names its derivation, not
   its result** — the direction of this claim only ever strengthens as the corpus converts, and quoting the
   number is how a reader concludes the opposite.
3. **Anchor inside your effective source/resource population.** Enforcer: RUNTIME (`[evaluate]` tool error). This is why a
   missing-TIER finding reports at the server manifest (declared, read, inside the population) and not at the
   gate's own source file as the legacy descriptor did.
4. **Declare the truthful resource-plane shape.** `analysis: "resource"` is fixed. A source-free resource
   policy uses `population: { of: "none", why }`; a hybrid declares its actual source population as well as
   resources. `execution: "entire-population"` is required for an indivisible whole-population answer;
   `selected-files` is valid when selected source members compose. Enforcer: `lib/policy-validation.ts` for
   the legal shape and `gate:contract` for legacy fields. The resource ids remain the SMALLEST CLOSED ids that
   keep every arm honest.

   **Selection keeps applicability separate from available inputs.** For a narrowed request, applicability is
   computed from the raw intersection with the owner's own declared source and populated-resource paths. A
   consumed fact's declared paths can touch the owner, but do not enter the entire-population completeness
   denominator because fact runs resolve their complete population independently. Thus `entire-population`
   deferral remains based on whether the request covers the owner's whole declared population; completing a
   running owner's inputs must not turn a partial request into a runnable whole-population verdict.

   Once an owner is runnable, every declared resource remains available. If the request touched a declared
   resource or consumed-fact path, every declared source subject is reselected; if it touched source paths
   only, a `selected-files` owner visits exactly that source subset. Resource and fact identities can therefore
   select what must be judged without becoming source visitor inputs. The planner filters deleted request
   identities through its current-path inventory; the dispatcher resolves declarations from its live Project
   and ResourceHost. Both call the same `resolveEffectivePopulation` calculation and the dispatcher refuses a
   supplied plan whose population disagrees. This preserves §3.4's whole-population deferral while preventing
   a resource-only change from producing a successful clean over zero source subjects.
5. **Proof rows satisfy EVERY declaration used by the fixture and isolate ONE arm.** Enforcer: `structure:policy-conformance`
   for execution; the `count: 99` plant for exactness (a row whose count is not exact dies when planted). Rules
   measured on this family: a row missing a declared resource is a `[population]` tool error, not a finding (so
   `depcruise-grant-liveness` spreads `PACKAGE_FIXTURE_FILES` into every row); a `messageIncludes` is
   admissible only if TRANSPLANTING it onto every sibling row reds that row; two rows sharing one report call
   cannot be message-discriminated and must either be one row or split the message (§7, `mustFlag[3]`/`[4]`).
6. **Prove every reachable acquisition refusal at the narrowest truthful tier.** For EACH declared resource,
   derive the non-ready statuses its actual reader can emit and pin EACH reachable status; do not copy a
   generic status roster or infer coverage from another kind. Also pin the complete run's resource-receipt
   pairing with `unresolved: 0`. `mustRefuse` is the optional third proof arm (`contract/policy.ts`;
   `policy-validation.ts`): use it when resource fixture data can express the bad acquisition state, where it
   asserts refusal text and forbids findings. Keep family `runPolicyPass` pins for planner/dispatcher selection,
   receipt pairing, filesystem states, or other conditions outside the proof grammar. The optional arm changes
   the proof carrier, not the coverage owed.

   A `missing`, `empty`, `unresolved`, or other non-ready acquisition status is a refusal or population tool
   error, never a finding or silent zero. That does not classify domain-invalid content inside a **ready**
   resource: a policy may legitimately report such semantic invalidity as a finding when that is the verdict it
   owns. The provider/reader decides whether bytes are non-ready; the policy judges the ready value it receives.
7. **The [gate-runtime-standardization.md](gate-runtime-standardization.md) §7 item 5 header.** FAMILY (the shared `lib/` reader by module + function, or `singleton` with its reason)
   · POPULATION PORT (the legacy SHA, the read it replaced, byte-identical or each intentional delta) · WHERE
   THE REFUSAL LIVES (the runtime, with the pin that proves it) · DECLARED LIMITS, each naming the row that
   holds it · structurally unfalsifiable fences documented rather than faked ([gate-runtime-standardization.md](gate-runtime-standardization.md) §6.1).

## 4. Where the refusal lives — and what resource health may accuse

The fact-provider accuser pattern works because a provider's non-ready state is DELIVERED to its consumers: a
provider must not receipt its own census ([gate-runtime-standardization.md](gate-runtime-standardization.md) §3), so `bus-fact-health` receives `status !== "ready"` and
reports it as ONE finding instead of crashing every bus policy. That asymmetry is designed and is not touched
by this contract — `bus-fact-health` is `analysis: "types"`, `facts: [busProducerFact]`, `resources: []`; it is
not a resource policy, and the `2bacd5ef9` lane was right to leave its branch alone.

The runtime separates readiness from semantic health. A non-ready **populated** declaration is recorded as a
population tool error and withholds each owner before `create`. A non-ready **demand-owned or
installed-package** value is delivered only by its bound acquisition door; the caller must immediately apply
`readyResourceValue`, which refuses before domain logic consumes it.

A **ready** resource may still be semantically degenerate. A resource `-health` sibling may validly flag that
state, provided it uses the same declaration/binding contract and anchors inside its effective population.
It cannot convert provider failure into a product finding: if its populated resource is non-ready, the runtime
withholds that sibling too; if a later-acquired value is non-ready, reader-side narrowing refuses. The health
policy owns semantic judgments over ready values, not a second provider-failure channel.

## 5. Alternatives weighed and rejected

| Arm | Verdict | Why |
| - | - | - |
| **A** — in-module `if (fact.status !== "ready") return;` | REJECTED (was live in 9 of 10; closed) | Unreachable (fact 2) AND it teaches the next lane that a silent return answers a broken resource — the #1979 class. Proven dead by deleting a fixture's manifest: `PASS TOOL ERROR [population] … is missing`, never a green zero |
| **B** — in-module `throw` re-spelled per policy | REJECTED | Same semantics as the helper with 16 copies of the refusal law; the first copy someone writes as `return` is the defect back. One home, beside the refusal it asserts |
| **C** — compile-time narrowing: type `ctx.resources` as a READY-ONLY host (`ResourceFact<T>` → `T`), throw inside `bindPolicyResources` | REJECTED for THIS lane; RECORDED as fork 1 | The strongest ladder tier (§2.2) and it makes the silent return unrepresentable. Cost: `contract/policy.ts` (`GatePolicyContext.resources`), a mapped host type, the binding, all ten modules, the conformance runner's types — a contract edit mid-program with five lanes live, against a shape [gate-runtime-standardization.md](gate-runtime-standardization.md) §3 RULED on 2026-09-12. The union on the policy-visible surface is dead information for policies, but the same `ResourceHost` type is what `resolveResourceDeclarations` reads. Default: keep the ruled helper; land a `policy-soundness` arm that REDs a `ctx.resources.<door>(…)` result not passed straight to `readyResourceValue` (lint-tier, cheap, catches the return shape and the re-spelled throw) |
| **D** — declare `ui-source` instead of `packages` for `ui-exports-map-complete` ([gate-runtime-standardization.md](gate-runtime-standardization.md) §7 item 1 smallest contract) | REJECTED with receipt | `"./token-contract": "./token-contract.ts"` lives outside `src`; the A3 arm would false-RED the real manifest. `packages` is the smallest CLOSED id (frozen vocabulary). The header records this so the next reader does not "fix" it |
| **E** — a `mustFlag` row for a refusal | REJECTED | A refusal is neither `mustFlag` nor `mustPass`. Use optional `mustRefuse` when the proof grammar can express the bad state; retain `runPolicyPass` pins for states it cannot |
| **F** — repair one incumbent and declare the plane covered | REJECTED (owner framing correction 2026-09-12) | The deliverable is fixing refuted modules, not filling a cell. Both incumbents are repaired to the same bar; the one with the weaker pin set (`ui-exports-map-complete`, no [gate-runtime-standardization.md](gate-runtime-standardization.md) §6.3 pin) gets the fuller pin set |

## 6. Coupled-site inventory for this lane

| Site | Action |
| - | - |
| `tooling/src/verify/gates/server-layout.ts` | header: POPULATION PORT + legacy SHA + declared limits with rows; one new `mustFlag` (six missing tiers, `count: 6`) |
| `tooling/src/verify/gates/ui-exports-map-complete.ts` | delete the dead `path.length > 0` fence (mutually redundant with the `startsWith(prefix)` filter — cut clean); SPLIT the dead-target message so a non-`./` specifier and a vanished target are message-discriminable; one new `mustFlag` (absent `exports` key → per-module A1, `count: 2`); header as above |
| `tests/tooling/verify/gates/resource-layout-wave-1.suite.test.ts` | [gate-runtime-standardization.md](gate-runtime-standardization.md) §6.3 pins for `ui-exports-map-complete` (complete + receipts, manifest missing, manifest malformed, `exports` non-string) and the two tree-side pins for `server-layout` (missing, empty) plus its receipt pair |
| `docs/architecture/core/Core-Enforcement-Active-Gates.md:111` | the A3 split and the absent-vs-non-string `exports` verdicts, as mechanisms |
| [gate-runtime-standardization.md](gate-runtime-standardization.md) §2 plane table, `exemplars-2026-09-11.md` §3, playbook #1979 row | NOT this lane's: CONFIRMED is the verifier's word and the cell is the orchestrator's write; proposed text in the report |
| `lib/resource-declaration.ts`, `contract/resource.ts`, `lib/reviewed-grants.ts`, any `fix:` string | untouched (fence) |

## 7. The measured proof tables (2026-09-12, worktree at `831576613`, every variant minted from the LIVE module with exact-count anchors and run through `verifyPolicyProofs`)

**Instrument control.** Planting `count: 99` on each of the seven `mustFlag` rows fails every one with
`but got 1` — every count is exact, and the instrument can fail. Planting `throw` on `relative === ""` inside
`server-layout.topEntry` leaves all rows green: the tree walk never emits the root (`ops/resource-reader.ts`
`walk` emits `childPath` only), which is the header's "children only" claim, proven rather than read.

### §6.1 cuts — direction is always "flag MORE"; a clean cut is classified, never counted

| Module | Narrowing | Replaced with | Rows that died | Bucket |
| - | - | - | - | - |
| `server-layout` | `relative.includes("/") ? undefined : relative` | `relative` | `mustFlag[0]` (got 7) · `mustFlag[1]` (6) · `mustPass[0]` (6) | ENFORCED |
| `server-layout` | `!LEGAL_ENTRIES.has(entry)` (the A1 rule) | `true` | all three | the rule, not a fence |
| `server-layout` | `!present.has(entry)` (the A2 rule) | `true` | all three | the rule, not a fence |
| `server-layout` | `startsWith(SERVER_SOURCE/)` · `relative.length > 0` | (deleted at `0fab76771`) | — | MUTUALLY REDUNDANT, deleted; root-emission control above proves no fixture can reach them |
| `ui-exports-map-complete` | `entry.kind === "directory"` in `childDirectories` | dropped | `mustPass[1]` (`styles/globals.css` became a "module" with no index) | ENFORCED at the FAMILY-CHILD position; the DEPTH-1 position is UNFALSIFIABLE (a depth-1 file's "children" are the empty set, so an unfenced file produces no finding) — documented, not faked |
| `ui-exports-map-complete` | `entry.kind === "file"` in `modules()` | dropped | none | UNFALSIFIABLE by construction: it would matter only for a DIRECTORY named `index.ts` |
| `ui-exports-map-complete` | `path.length > 0` | dropped | none | DEAD DECORATION — mutually redundant with `startsWith(prefix)` (an entry equal to the parent fails the prefix test, so the remainder is never empty). DELETED this lane, per the `server-layout` precedent |
| `ui-exports-map-complete` | `!path.includes("/")` | dropped | `mustFlag[0..4]` · `mustPass[0,1]` | ENFORCED |
| `ui-exports-map-complete` | `files.has(topIndex)` short-circuit | `false` | `mustPass[2]` | ENFORCED |
| `ui-exports-map-complete` | `target.startsWith("./")` | always resolve | `mustFlag[4]` went GREEN (got 0) | ENFORCED — WRONG-DIRECTION class: the row the cut turns green, not one asserting a bogus input is reported |
| `ui-exports-map-complete` | the A2 `continue` (A2 precedes A1) | dropped | `mustFlag[2]` — as an `[evaluate]` TOOL ERROR, the A1 anchor (`…/meter/index.ts`) does not exist in the fixture | ENFORCED (and the death is itself the population-anchor fence firing) |
| `ui-exports-map-complete` | A1 / A3 rules | `true` | all eight | the rules |

### Transplants — every `messageIncludes` moved onto every sibling row

All 13 transplants RED the receiving row **except one**: `mustFlag[3]`'s `"does not exist"` onto `mustFlag[4]`
stays green, because both rows fire the same `reportDeadTargets` call and the message did not distinguish "the
specifier is not `./`-relative" from "the file is gone". `mustFlag[4]`'s own discriminator onto `mustFlag[3]`
reds. **Fix: split the message** so an unparseable specifier says so; then both directions red (re-measured
after the build, receipt in the report). `server-layout`'s two discriminators red each other's row.

## 8. Forks escalated (ask-and-continue; defaults stated)

1. **Helper vs compile-time narrowing (alt C).** Default: keep the ruled `readyResourceValue`; file a row for a
   `policy-soundness` arm over `ctx.resources.<door>(…)` results. Not built here (outside the fence: the
   soundness family belongs to #1971).
2. **This document's catalog receipt.** A new `docs/**` file owes a receipt commit citing the doc's sha
   (memory: `new-doc-catalog-two-commit-stack`), against a one-commit lane law. Precedent on the tree:
   `v-exemplar-audit-2026-09-12.md` landed uncatalogued at `8929f53fb` while `check:doc-catalog` sits on the
   known-red list (then-current known-red inventory). Default: land the doc in the lane's one commit, report the owed receipt, let the
   orchestrator's batch receipt pass adopt it (the `c5a6733e4` shape).
3. **The absent-`exports`-key verdict.** `{}` → per-module A1 findings is the PROVIDER's normalization
   (`stringMap(undefined) → {}`), shared with `scripts` and the dependency maps; a policy cannot and should not
   tell an absent key from an empty map. Default: pin it as the finding it is; do not touch the provider.

## 9. #1979 disposition (re-derived on this tree, not remembered)

CLOSED at `2bacd5ef9` (2026-09-11 19:21): `client-structure`, `feature-structure`, `verify-registry-parity`,
`eslint-grant-liveness`, `no-raw-color-in-css` converted to `readyResourceValue`; the four exemplar-family
modules had converted at `0fab76771` (17:19); `depcruise-grant-liveness` was already loud. Census 2026-09-12:
ten `analysis: "resource"` modules (literal grep, count 10), sixteen `readyResourceValue(...)` call sites across
exactly those ten (`ast-grep -l ts`, 171 `defineGate` modules scanned; `-l tsx` scanned 0 because no gate is
`.tsx`), and ONE `$F.status !== "ready"` in `gates/` — `bus-fact-health.ts:25`, the fact-family accuser
(§4), which is not a #1979 site and must not be "fixed". The playbook's "six sites remain" row is stale by that
commit.
