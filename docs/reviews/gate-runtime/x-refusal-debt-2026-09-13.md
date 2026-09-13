---
kind: review
status: active
updated: 2026-09-13
---

# `policy-refusal-coverage` warning-debt burn-down — lane `cb-x-refusal-debt` (#2327, #2330)

The derived-population consumers that carried no refusal proof, pinned per reader group, plus the
instrument defect the burn-down uncovered. Base `db6e5bbd6`; branch `wt/agent-a2b6ab8aec4cfb02f`.

## 1. The derived set BEFORE (re-derived, not inherited)

`pnpm check:structure --check policy-refusal-coverage` on `db6e5bbd6` — **17 accused**, matching the row's
dated lead by coincidence of number, not by inheritance:

`byte-check-cast` · `client-structure` · `db-enum-from-tuple` · `domain-freshness-plane` ·
`feature-owns-definition` · `feature-structure` · `fk-columns-indexed` · `fk-ondelete-stated` ·
`freeze-provenance-write-pairing-health` · `home-tile-registry-completeness` ·
`modal-body-not-placeholder` · `nullable-column-inequality` · `own-tables-only` · `ownerid-registry` ·
`schema-banned-shapes` · `table-explicit-primary-key` · `verify-registry-parity`

**Not a recognizer gap for sixteen of them.** Every accused module already had a family test that
IMPORTED it — but those tests call only `verifyPolicyProofs`, which the policy correctly does not credit.
The pins genuinely did not exist. The seventeenth was a false accusation; see §4.

## 2. The reader-grouped table

| Consumer | Reader | Reachable non-ready statuses | Pin per status | Healthy twin | Control for the control |
| - | - | - | - | - | - |
| `verify-registry-parity` | `package-metadata:root` → `ops/resource-config.ts#loadPackageMetadata` over `ops/resource-reader.ts#read` | `missing` · `empty` · `unresolved` (malformed JSON) · `unresolved` (non-string-map `scripts`) | 4 population-phase refusals, `refusalShape` asserted whole | manifest intact → verdict + `package:root` receipt, `unresolved: 0` | one unregistered verification-shaped script accuses |
| `feature-owns-definition` | `authored-tree:client-feature` → `ops/resource-reader.ts#tree` | `missing` · `empty` · `unresolved` | 3 | tree intact → 4-member receipt | an unowned feature dir accuses |
| `feature-structure` | `authored-tree:server-domain` → same | `missing` · `empty` · `unresolved` | 3 | 8-member receipt | drop `service.ts` → accuses |
| `client-structure` | `authored-tree:client-feature` **and** `authored-tree:server-domain` | ×2 declarations × 3 statuses | 6, each holding the other tree healthy | both receipts | rename the surface → accuses |
| `byte-check-cast`, `db-enum-from-tuple`, `domain-freshness-plane`, `fk-columns-indexed`, `fk-ondelete-stated`, `nullable-column-inequality`, `own-tables-only`, `ownerid-registry`, `schema-banned-shapes`, `table-explicit-primary-key` | `drizzleSchemaFact` → `lib/schema-fact.ts#buildSchema`, consumed through `recordReadySchemaFact` | `empty` · `unresolved` (+ the fact-population withhold; `missing` unconstructible, §3) | 2 per consumer + the withhold arm for the three with a disjoint population | census delivered → owner `success` + `drizzle-schema` receipt `members: 2` | the empty-arm message mutation reds exactly ten |
| `home-tile-registry-completeness`, `modal-body-not-placeholder` | `registryDefinitionFacts.<kind>` → the CONSUMER's own `members: definitions.length` receipt | ONE refusal state, TWO causes: registry TYPE renamed · no definition authored | 2 per consumer | census receipt (`HomeTileContribution` / `ModalDefinition`, `members: 1`) | the same single definition mis-homed / given a placeholder body accuses |
| `freeze-provenance-write-pairing-health` | `drizzleSchemaFact` | already pinned — FALSE ACCUSATION, §4 | — | — | — |

**Why the registry pins differ in shape from the resource pins, stated because copying the resource shape
here would have been wrong:** a registry fact publishes no status union. Since #1962 the provider receipts
the sources it WALKED and always succeeds, so the blindness door is the consumer's own zero-member
receipt — a receipt-phase tool error, not a population-phase one.

## 3. Unconstructible statuses, DECLARED with their receipt

- **`drizzleSchemaFact` status `missing`** (`buildSchema`, `options.files.length === 0`) is unreachable at
  the consumer: a fact whose population admits zero authored paths is refused one phase earlier by the
  provider's own population resolution, which withholds every dependent before `evaluate`. The consumer is
  handed nothing, never a `missing` status. The real-world route IS pinned — as the fact-population
  withhold arm, on the three consumers whose population is disjoint from `packages/db/src/schema/**`
  (`domain-freshness-plane`, `nullable-column-inequality`, `own-tables-only`). For the other seven the same
  corpus empties their OWN population first, so a fixture would prove itself (#2274).
- **`ResourceReader#snapshot`'s arm** is not reachable for an `authored-tree` declaration: `authoredTree`
  never calls it.
- **A symlink traversal** is a second CAUSE of `authored-tree`'s `unresolved`, not a second status; the
  file-where-a-directory-belongs cause is pinned instead, because it reproduces without link semantics.

## 4. THE INSTRUMENT DEFECT (#2330) — a false accusation of #2274's family

`freeze-provenance-write-pairing-health` was accused while carrying a real §4.5 refusal pin at
`tests/tooling/verify/gates/freeze-provenance-conversion.test.ts:110`, whose own header advertises it as
item 4. Cause, source-read: `descriptorValue` correctly returns a SHORTHAND property's name node, but
`hopParameter` gates on `bindsParameter` (`lib/policy-descriptor-read.ts:127`), which asks
`getSymbol()?.getDeclarations()` for a `ParameterDeclaration` — on a shorthand's name TypeScript resolves
the PROPERTY symbol, never the value binding. So `{ knownPolicies: policies, policies }` credited nothing.

**Receipt:** the one-token probe `policies` → `policies: policies` at that line moved
`--check policy-refusal-coverage` 11 → 10 with nothing else touched; restored, 11.

**Blast radius — ten live family tests spell the driven set this way:**
`bus-payload-family.test.ts:87` · `client-query-pair-conversion.test.ts:209` ·
`disclosure-reservation-family.test.ts:83` · `freeze-provenance-conversion.test.ts:110` ·
`session-channel-family.test.ts:63` · `testid-variant-split-family.test.ts:82` ·
`tier-home-health-family.int.test.ts:182` · `tooling-front-door-family.test.ts:95` ·
`tooling-plumbing-family.test.ts:139`, plus the THIRD binding shape at
`split-arm-parity.test.ts:207` (`function runScenarios({ legacy, policies, … })`, an object pattern).
Only one subject was accused today, so the debt count was inflated by one — but the channel was live.

**Why the family's own two-sided second opinion did not catch it:** the "NOT DEAD" arm
(`policy-soundness-family.repo.int.test.ts`) only asserts discharge for a module whose family test imports
EXACTLY ONE gate module, and `freeze-provenance-conversion.test.ts` imports two.

**The fix** (orchestrator-approved arm (a), commit `b5f2c7f9d`): a `bindsShorthandValue` branch local to
`policy-refusal-coverage.ts`, feeding the existing `declaringFunction` hop — which still demands an
ancestor parameter of that name, so the guard stays fail-closed. Shared `bindsParameter` untouched
(`policy-soundness` ARM E4 reads it for a different question). Rows: a `mustPass` on the shorthand fixture,
and a `mustFlag` landing the object-pattern shape as a declared limit that ACCUSES (§4.1 — it goes red the
day the walk learns object patterns).

**Red-first receipt:** with both rows added and the reader UNMODIFIED, `verifyPolicyProofs([gate])` fails
on exactly `mustPass[4]` ("expected zero effective findings but got 1") while the destructured `mustFlag`
passes; with the hop, 1/1 green.

## 5. Per-group after-counts, by name

| # | Commit | Group | Discharged | Count |
| - | - | - | - | - |
| — | `db6e5bbd6` | base | — | **17** |
| 1 | `f341b9955` | `package-metadata` | `verify-registry-parity` | **16** |
| 2 | `977210277` | `authored-tree` | `feature-owns-definition`, `feature-structure`, `client-structure` | **13** |
| 3 | `c1febfd30` | registry facts | `home-tile-registry-completeness`, `modal-body-not-placeholder` | **11** |
| 4 | `669f9f15d` | `drizzleSchemaFact` ×10 | `byte-check-cast`, `db-enum-from-tuple`, `domain-freshness-plane`, `fk-columns-indexed`, `fk-ondelete-stated`, `nullable-column-inequality`, `own-tables-only`, `ownerid-registry`, `schema-banned-shapes`, `table-explicit-primary-key` | **1** |
| 5 | `b5f2c7f9d` | #2330 recognizer | `freeze-provenance-write-pairing-health` (false accusation retired) | **0** |

## 6. THE SEVERITY FLIP IS NOT TAKEN — deliberately

The module's own law: *"flip to `hard` + `error` (and drop `workItem`) in the commit that takes THIS
POLICY'S OWN EFFECTIVE COUNT TO ZERO."* The count is zero as of `b5f2c7f9d` and the flip is **not** in it:
the lane brief reserves that decision to the orchestrator, a zero one hour old is not evidence the corpus
stays at zero, and the flip also closes the `@orb-waive` door the header describes as watched-while-
draining. The module header states this explicitly so the next reader does not read a violated flip rule.

**And the row keeps its `workItem` while it stays `warning` — checked, not assumed.** A correction reached
this lane claiming the zeroing commit had left `severity: "warning"` with the `workItem` DELETED. Both
halves are refuted on the tree:

1. **The key was never touched.** It stands at `policy-refusal-coverage.ts:469` as `workItem: 2184`, and
   `git diff db6e5bbd6 HEAD -- <the module>` filtered to `workItem|authority|severity` returns only ADDED
   comment/fixture lines — no `-` line on any of the three.
2. **The shape is unrepresentable anyway.** Deleting the key and running
   `pnpm check:structure --check policy-refusal-coverage` exits **2** at load —
   *"gate module …: Invalid gate policy: descriptor.workItem must be an own enumerable property when
   severity is warning"* (`lib/policy-module.ts:51` via `loader.ts:130`), and the corpus never loads. So
   **there is no validator gap** and no second ledger row: every green floor in §5 is itself proof the key
   was present, because none of those runs could have loaded the corpus without it. Probe planted with
   `cp`/`sed -i`, restored by `cp` back, `git status --short` empty.

**The pointer's VALUE is a sibling's hunk, deliberately left alone.** `c40752560` on
`wt/agent-a413f153774cb57e9` (NOT yet an ancestor of `main` — `git merge-base --is-ancestor` says
`NOT-on-main`) repoints `2184 → 2327` under #2070. This lane did not make that edit and must not: an
unmodified line takes the sibling's change cleanly at integration, whereas making the same edit here would
put two branches on one line whose surrounding hunk both lanes have touched. **Integrator note:** that
sibling's other hunk rewrites the `THE FLIP CONDITION IS AN EVENT` paragraph at old lines 24-31, three
lines above this lane's inserted paragraph — adjacent, resolvable by union, and worth reading rather than
auto-merging. This lane's paragraph deliberately owns the STATE (`warning` and its `workItem` move together
or not at all) and never restates the id.

## 7. Deviations, with receipts

- The `authored-tree` pins live in `resource-layout-wave-1/2`, the drizzle pins in `schema-fact-wave-1`,
  and the registry pins in `registry-family` — i.e. by FAMILY, not by the wave a module converted in.
  `byte-check-cast`, `domain-freshness-plane` and `schema-banned-shapes` therefore join a file they did not
  convert in; all three declare `family: "drizzle-schema"` and consume that provider, and the shared fact's
  health has one home.
- `freeze-provenance-write-pairing-health` keeps its pin in its own conversion test rather than joining
  that file: it belongs to the `freeze-provenance` family and its `empty` arm REPORTS by design instead of
  refusing (module header, blindness mode B).
- No `mustRefuse` row was added anywhere. Every refusal in this set is a phase the proof grammar cannot
  express — a population-phase throw, a receipt-phase zero-member refusal, or an `evaluate` throw — and
  `toolFailure` precedes any arm verdict.

## LEDGER ROWS (1 row)

| Row | Class | Statement |
| - | - | - |
| #2330 | INSTRUMENT — false accusation (#2274 family) | `policy-refusal-coverage`'s driven-set walk gated the parameter hop on `bindsParameter`, which cannot see a SHORTHAND property's value binding, so `runPolicyPass({ knownPolicies: policies, policies })` — the spelling of ten live family tests — credited nothing and `freeze-provenance-write-pairing-health` was falsely accused for the module's whole life while carrying a real §4.5 pin. Receipt: the one-token probe at `freeze-provenance-conversion.test.ts:110` moved the real-tree count 11 → 10 and back. The proof set only ever spelled the driven set one way, which is exactly why its own fixtures could not see it. FIXED at `b5f2c7f9d` with a red-first receipt, a `mustPass` on the shorthand shape and a `mustFlag` landing the object-pattern shape as a fail-closed declared limit. The family's two-sided second opinion missed it because its "NOT DEAD" arm only binds modules whose family test imports exactly one gate module. |

ledger rows OWED: 1
