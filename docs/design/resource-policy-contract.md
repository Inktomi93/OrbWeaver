---
kind: design
status: active
updated: 2026-09-12
---

# The resource-policy contract — what a closed-ResourceHost policy OWES (#2011, guide §3's resource plane)

The one written answer to the question the gate-runtime program (#1584) had answered in pieces and never
synthesized: **given that the runtime refuses a non-ready declared resource one phase before a policy runs,
what does a resource policy owe?** The pieces are on the tree (`lib/resource-declaration.ts`,
`lib/resource-policy.ts`, `lib/policy-pass.ts`, guide §11 ruling 3 and §12.3); this document is the synthesis,
the alternatives it rejected, and the measured proof rules a conversion lane copies. It binds every
`analysis: "resource"` policy. Where it disagrees with a module, the module is wrong; where it disagrees with
[`gate-runtime-standardization.md`](gate-runtime-standardization.md) §12, the guide wins and this document is
stale — say so on the row.

Lessons consulted from the shared memory store before designing: `gate-migration-1584-lessons-hub.md`,
`gate-authoring-lessons-hub.md`, `instruments-lie-verify-the-verifier.md`, `gate-blind-spots-are-spelling-shaped.md`,
`new-doc-catalog-two-commit-stack.md`, `ledger-and-doc-catalog-hub.md`.

## 1. The answer in one paragraph

A resource policy owes **seven things**, and none of them is a not-ready branch. It (1) declares every resource
it reads and reads every resource it declares; (2) narrows each fact through the ONE shared reader
`readyResourceValue`, whose throw is an assertion that the runtime's own population-phase refusal held; (3)
anchors every finding inside its own resource population; (4) declares the resource-plane contract shape
(`population: { of: "none", why }`, `analysis: "resource"`, `execution: "entire-population"`, `facts: []`
unless it consumes a provider); (5) carries `mode: "resource"` proof rows that each supply EVERY declared
resource, isolate ONE arm, name an exact `count`, and use only discriminators that survive the transplant
test; (6) pins the refusals a proof row cannot express through `runPolicyPass` in its family test — one pin
per declared resource per non-ready status, plus the complete-run receipt pair; and (7) records in its header
the family, the population port with the legacy SHA, where the refusal lives (not here), and every declared
limit with the row that holds it. **A broken resource is a TOOL ERROR, never a finding and never a silent
zero — and the designated accuser for it is the runtime, not a sibling policy.**

## 2. The runtime facts the contract rests on (receipts)

| Fact | Where |
| - | - |
| `ResourceLoad<T>` is a discriminated union: `value` exists only on `ready`; the other four arms carry `reason` | `tooling/src/verify/contract/resource.ts:2-5` |
| Population resolution acquires every declared (populated-kind) resource and THROWS on any non-ready status, on an empty fact, and on a cross-root path | `tooling/src/verify/lib/resource-declaration.ts:193-213` |
| That throw is caught PER OWNER: the run is marked `incomplete` at phase `population`, the owner is withheld, every other policy in the invocation continues | `tooling/src/verify/lib/policy-pass.ts:405-421` (`resolveRuns`) |
| The binding fence: an UNDECLARED door read throws; a fact whose paths leave the effective population throws; one `kind: "resource"` receipt per source, `unresolved: 1` on a non-ready fact | `tooling/src/verify/lib/resource-policy.ts:19-46` |
| An UNCONSUMED declaration is a receipt-phase refusal | `tooling/src/verify/lib/policy-pass.ts:736-743` |
| `readyResourceValue` — the one narrowing, beside the refusal it asserts | `tooling/src/verify/lib/resource-declaration.ts:21-35` |
| A finding anchored outside the resource population is an `[evaluate]` tool error (`finding file is outside the effective population`) — measured by cutting `ui-exports-map-complete`'s A2 `continue` | `tooling/src/verify/lib/policy-pass.ts` report sink; cut receipt in §7 |
| A demand kind (`authored-path`, `authored-text`) and `installed-package` contribute no path and are partitioned out of the empty-fact refusal BY NAME | `tooling/src/verify/lib/resource-declaration.ts:187-195` |

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
   does not exist on the union) — but the CHOICE of throw-vs-return is PROSE today. No `policy-soundness`
   meta-policy reads `ctx.resources`, and `gate:contract` is blind to it (measured 2026-09-12: zero mentions of
   `ctx.resources` / `readyResourceValue` across the four `policy-soundness` modules). **That is the one
   prose-only boundary in this contract; §5 alt C and §8 fork 1 price the fix.** The guard is unreachable
   (fact 2 above), so `if (fact.status !== "ready") return;` is dead code that teaches a silent clean; `throw`
   re-spelled per module is one-home rot. Ten of ten resource policies read through the helper today (16
   sites), closed by `0fab76771` (four) and `2bacd5ef9` (five); `depcruise-grant-liveness` was already loud.
3. **Anchor inside your own resource population.** Enforcer: RUNTIME (`[evaluate]` tool error). This is why a
   missing-TIER finding reports at the server manifest (declared, read, inside the population) and not at the
   gate's own source file as the legacy descriptor did.
4. **Declare the resource-plane shape.** `population: { of: "none", why }` · `analysis: "resource"` ·
   `execution: "entire-population"` (a whole-tree/whole-manifest verdict cannot compose over a subset) ·
   `facts: []` unless a provider is consumed · `resources: [...]` with the SMALLEST CLOSED ids that keep every
   arm honest. Enforcer: `lib/policy-validation.ts` for the shape; `gate:contract` for legacy fields; the
   population port line (obligation 7) for the id choice. Worked case: `ui-exports-map-complete` declares
   `authored-tree:packages`, not `ui-source`, because the real manifest exports
   `"./token-contract": "./token-contract.ts"` — a file at `packages/ui/`, outside `src` — and the dead-target arm
   would false-RED it under `ui-source`. There is no `ui-package` id and the vocabulary is frozen (guide §12.4).
5. **Proof rows supply EVERY declared resource and isolate ONE arm.** Enforcer: `structure:policy-conformance`
   for execution; the `count: 99` plant for exactness (a row whose count is not exact dies when planted). Rules
   measured on this family: a row missing a declared resource is a `[population]` tool error, not a finding (so
   `depcruise-grant-liveness` spreads `PACKAGE_FIXTURE_FILES` into every row); a `messageIncludes` is
   admissible only if TRANSPLANTING it onto every sibling row reds that row; two rows sharing one report call
   cannot be message-discriminated and must either be one row or split the message (§7, `mustFlag[3]`/`[4]`).
6. **Pin the refusals in the family test.** There is NO "must refuse" arm (guide §4.5b); `toolFailure` runs
   before the arm verdict. So the family test drives `runPolicyPass` with the SAME overlay minus one resource
   and asserts: `toolErrors[0].phase === "population"`, the message names `<kind>:<id> is <status>`, the owner is
   `incomplete`, the policy is in `withheldPolicyIds`, and `effectiveFindings` is empty. One pin per declared
   resource per reachable status (`missing` for both kinds; `empty` for a tree; `unresolved` for a malformed or
   contract-violating manifest), plus the complete run asserting the receipt pair with `unresolved: 0`, plus any
   READY-degenerate value as the FINDING it produces. The `scratch` fixture is a real `mkdtemp` directory, so an
   `empty` tree is reachable by `mkdirSync` beside the overlay.
7. **The §5b.5 header.** FAMILY (the shared `lib/` reader by module + function, or `singleton` with its reason)
   · POPULATION PORT (the legacy SHA, the read it replaced, byte-identical or each intentional delta) · WHERE
   THE REFUSAL LIVES (the runtime, with the pin that proves it) · DECLARED LIMITS, each naming the row that
   holds it · UNFALSIFIABLE fences documented rather than faked (guide §4.1's fourth outcome).

## 4. Where the refusal lives — and why a resource `-health` sibling is structurally impossible today

The fact-provider accuser pattern works because a provider's non-ready state is DELIVERED to its consumers: a
provider must not receipt its own census (guide §12.3), so `bus-fact-health` receives `status !== "ready"` and
reports it as ONE finding instead of crashing every bus policy. That asymmetry is designed and is not touched
by this contract — `bus-fact-health` is `analysis: "types"`, `facts: [busProducerFact]`, `resources: []`; it is
not a resource policy, and the `2bacd5ef9` lane was right to leave its branch alone.

A RESOURCE's non-ready state is not delivered to anyone. `resolveRuns` acquires every declared resource per
owner at the population phase and withholds the owner on the first non-ready fact — so a would-be accuser that
declared the same resource would be withheld by the same throw, one phase before its `create`. **Nothing a
policy can write observes a broken resource.** The runtime is the accuser: exit 2, "this run is not a verdict",
the `N tool error(s)` tail of `check:structure`, and the per-owner `WITHHELD` line. That is louder than a finding
and honest in a way a finding is not (a finding says "the tree is wrong"; a tool error says "I could not judge").

If a future policy genuinely needs to report a broken resource as a PRODUCT finding (a malformed committed
JSON ledger, say), that is a contract change — a declaration-level tolerance that delivers the union to that
one owner — and it is a guide §12.4-class reopening with a two-consumer bar, not a lane's call. None of the ten
resource policies needs it: every one of their subjects is a file another tool already refuses to load.

## 5. Alternatives weighed and rejected

| Arm | Verdict | Why |
| - | - | - |
| **A** — in-module `if (fact.status !== "ready") return;` | REJECTED (was live in 9 of 10; closed) | Unreachable (fact 2) AND it teaches the next lane that a silent return answers a broken resource — the #1979 class. Proven dead by deleting a fixture's manifest: `PASS TOOL ERROR [population] … is missing`, never a green zero |
| **B** — in-module `throw` re-spelled per policy | REJECTED | Same semantics as the helper with 16 copies of the refusal law; the first copy someone writes as `return` is the defect back. One home, beside the refusal it asserts |
| **C** — compile-time narrowing: type `ctx.resources` as a READY-ONLY host (`ResourceFact<T>` → `T`), throw inside `bindPolicyResources` | REJECTED for THIS lane; RECORDED as fork 1 | The strongest ladder tier (§2.2) and it makes the silent return unrepresentable. Cost: `contract/policy.ts` (`GatePolicyContext.resources`), a mapped host type, the binding, all ten modules, the conformance runner's types — a contract edit mid-program with five lanes live, against a shape guide §12.3 RULED on 2026-09-12. The union on the policy-visible surface is dead information for policies, but the same `ResourceHost` type is what `resolveResourceDeclarations` reads. Default: keep the ruled helper; land a `policy-soundness` arm that REDs a `ctx.resources.<door>(…)` result not passed straight to `readyResourceValue` (lint-tier, cheap, catches the return shape and the re-spelled throw) |
| **D** — declare `ui-source` instead of `packages` for `ui-exports-map-complete` (§5b.1 smallest contract) | REJECTED with receipt | `"./token-contract": "./token-contract.ts"` lives outside `src`; the A3 arm would false-RED the real manifest. `packages` is the smallest CLOSED id (frozen vocabulary). The header records this so the next reader does not "fix" it |
| **E** — a `mustFlag` row for a refusal | REJECTED (guide §4.5b) | `toolFailure` precedes the arm verdict; a refusal is neither `mustFlag` nor `mustPass`. Refusals are `runPolicyPass` pins |
| **F** — repair one incumbent and declare the plane covered | REJECTED (owner framing correction 2026-09-12) | The deliverable is fixing refuted modules, not filling a cell. Both incumbents are repaired to the same bar; the one with the weaker pin set (`ui-exports-map-complete`, no §4.5 pin) gets the fuller pin set |

## 6. Coupled-site inventory for this lane

| Site | Action |
| - | - |
| `tooling/src/verify/gates/server-layout.ts` | header: POPULATION PORT + legacy SHA + declared limits with rows; one new `mustFlag` (six missing tiers, `count: 6`) |
| `tooling/src/verify/gates/ui-exports-map-complete.ts` | delete the dead `path.length > 0` fence (mutually redundant with the `startsWith(prefix)` filter — cut clean); SPLIT the dead-target message so a non-`./` specifier and a vanished target are message-discriminable; one new `mustFlag` (absent `exports` key → per-module A1, `count: 2`); header as above |
| `tests/tooling/verify/gates/resource-layout-wave-1.test.ts` | §4.5 pins for `ui-exports-map-complete` (complete + receipts, manifest missing, manifest malformed, `exports` non-string) and the two tree-side pins for `server-layout` (missing, empty) plus its receipt pair |
| `docs/architecture/core/Core-Enforcement-Active-Gates.md:111` | the A3 split and the absent-vs-non-string `exports` verdicts, as mechanisms |
| guide §3 plane table, `exemplars-2026-09-11.md` §3, playbook #1979 row | NOT this lane's: CONFIRMED is the verifier's word and the cell is the orchestrator's write; proposed text in the report |
| `lib/resource-declaration.ts`, `contract/resource.ts`, `lib/reviewed-grants.ts`, any `fix:` string | untouched (fence) |

## 7. The measured proof tables (2026-09-12, worktree at `831576613`, every variant minted from the LIVE module with exact-count anchors and run through `verifyPolicyProofs`)

**Instrument control.** Planting `count: 99` on each of the seven `mustFlag` rows fails every one with
`but got 1` — every count is exact, and the instrument can fail. Planting `throw` on `relative === ""` inside
`server-layout.topEntry` leaves all rows green: the tree walk never emits the root (`ops/resource-reader.ts`
`walk` emits `childPath` only), which is the header's "children only" claim, proven rather than read.

### §4.1 cuts — direction is always "flag MORE"; a clean cut is classified, never counted

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
   known-red list (guide §2). Default: land the doc in the lane's one commit, report the owed receipt, let the
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
