---
kind: review
status: active
updated: 2026-09-13
---

# Original ten-wave “did not cover” accounting

## Scope and method

I read all ten original audit reports in the ledger's closed manifest in full:

- `v-exemplar-audit-2026-09-12.md` (wave 1, 568 lines)
- `v-audit-wave2-2026-09-12.md` (719)
- `v-audit-wave3-2026-09-12.md` (901)
- `v-audit-wave4-2026-09-12.md` (746)
- `v-audit-wave5-2026-09-12.md` (466)
- `v-audit-wave6-2026-09-12.md` (417)
- `v-audit-wave7-2026-09-12.md` (548)
- `v-audit-wave8-2026-09-12.md` (464)
- `v-audit-wave9-2026-09-12.md` (553)
- `v-audit-wave10-2026-09-12.md` (609)

I reconciled each report's declared omissions against the current ledger, current source/test existence,
GitHub issue state, and the later report evidence already folded into the ledger. An omitted test or probe is
an audit boundary, not a defect. I propose a ledger defect row only where current evidence establishes a
concrete unowned failure. None of the omissions below meets that bar without already having a ledger row and
issue.

Current issue ownership relevant to this accounting: #1584 remains open; #2319 is an open separately tracked
replay backlog, not a confirmed active B lane; B currently owns #2070, #2273, and #2320. The board remains the
authority for mutable ownership.

## Cross-wave conclusions

### Conversion differentials — tracked, not missing from the queue

Waves 1, 2, 3, 5, 6, 7, 8, 9, and 10 all disclosed that they did not replay the legacy implementation.
That repeated omission is now accounted by the bounded #2000 ruling and its residual work:

- \#2000 is closed by `c97de9d2f` / `ef044b12e`; the ledger correctly says this is bounded Tier 2/3 machinery,
  not whole-corpus parity.
- \#2319 remains open for the explicitly recorded 237-of-248 replay debt. It is a separate backlog row and is
  not currently an active B lane.
- \#2273 remains open and B-owned for the four named conversion-record gaps. The mirror trio and its anchor
  movement are already closed within that issue by `183e49714`; the config-liveness pair and
  `no-color-literals` remain.
- \#1970 remains open for `caught-failure-ownership`, the largest specifically named conversion differential.
- \#2033 remains open for the `pd-citation-integrity` differential's missing population-fence credibility.

No new omnibus row should be added. A second “all nine waves omitted §4.6” row would duplicate #2319 and the
specific #2273/#1970/#2033 work. The ledger's final prose should link these owners.

### Whole-tree and orchestrator-only runs — later barriers supersede the audit boundary

Every wave disclosed some combination of no CT/e2e/typecheck/biome, no `check-gates.repo.int`, no
`gate-ignore-grammar.repo.int`, or no broad `check`/`verify`. Those statements accurately bound each historical
audit. They do not create independent current defects. Later ledger receipts record production structure runs,
the repaired planter, conformance runs, and the gate-ignore repairs (#1969, #1974, #2200, #2215, #2296).
They should remain historical limits and must not be converted into one row per suite that was not run.

### Real-tree truth — no blanket attestation

The waves consistently distinguish proof-row execution from whether every reported live finding is true.
Later structure receipts establish population, refusal, and tool-error health; they still do not attest every
live finding's domain truth. That is a standing limit on the review corpus, not a single repairable defect. No
ledger row is justified without a concrete false positive/negative, several of which were later found and are
already individually tracked.

## Per-wave accounting

### Wave 1 — exemplars

| declared omission | current classification | evidence / owner |
| - | - | - |
| No `check:structure`; `no-raw-matchmedia` real-tree unreadable behavior unmeasured | **Covered for the identified defect** | #1972/#1973 established the real-tree/refusal floor; #1998 and the later wave-7 re-audit repaired and confirmed `no-raw-matchmedia`. Historical audit still did not measure it. |
| Three narrowing cells not cut | **Covered or superseded** | `no-raw-matchmedia` was repaired/re-audited; `no-inline-types`' cell is included in the ledger's closed narrowing aggregate; the raw CSS health twins were subsequently converted/reworked. The wave's naive aggregate is explicitly superseded. |
| No legacy replay | **Tracked** | #2319 general remainder; #2273 for `no-color-literals` and other named survivors. |
| Shared readers not audited for §5b.7 | **No defect established by omission** | Later authority/policing work found concrete table-placement defects under #1922/#2147/#2320. Those issues own actual failures. A generic “read every shared reader” row would be a review assignment, not a defect. |
| CT/e2e/biome/typecheck and planter suites not run | **Historical floor only** | Later barrier receipts and dedicated planter repairs supersede it. No new row. |

### Wave 2 — registry/completeness

| declared omission | current classification | evidence / owner |
| - | - | - |
| Legacy `home-tile-registry-completeness` not audited under §5b | **Correct exclusion** | Legacy modules were outside the final-policy §5b audit; conversion status is owned by #1584, not a defect in wave 2. |
| No §4.6 replay for eight conversions | **Tracked** | #2319 residual replay accounting. Add no duplicate family row absent a current per-module differential finding. |
| Two fail-closed guards and one two-sided alias walk not cut | **Explicitly bounded, no defect shown** | The report gives the reason: the first two are runtime guards pinned by §4.5; the alias walk already has both directions. An omitted redundant cut is not work. |
| Shared-reader consumer census not run | **Superseded as a census method; concrete residue separately owned** | Shared-reader/family identity is now handled by policy/source review and later collector controls. #2320 owns the proven one-hop authority escape; #2163 owns remaining private binding/origin migrations. |
| D1 real-tree future escape and later-tree modules unmeasured | **Concrete D1 repaired; generic future claim is not a row** | #1972 closed the reproduced `ctx.relativePath` escape. The wave's “future tree” caveat is not independently falsifiable work. |
| No UI/compiler suites or planter | **Historical floor only** | No row. |

### Wave 3 — Drizzle schema facts

| declared omission | current classification | evidence / owner |
| - | - | - |
| Three ordinary-policy §4.2 dead-position controls not run | **Covered by later authority controls** | The ledger records the live citations and policy-waiver-identity machinery; subsequent family work planted identity controls. No current contrary source evidence was found. |
| Eight `analysis: "types"` declarations not counterfactually reduced | **Explicit verifier judgment, not implementation work** | `policing-surface-audit-2026-09-12.md` A18 records that direct-call census is insufficient because readers carry compiler use, and its disposition says not to build a prose arm. The omission needs no ledger defect row unless a named policy is proven over-declared. #2256 is the converse problem (syntax policies using types) and does not own this question. |
| No §4.6 replay | **Tracked** | #2319; no duplicate nine-module row without a current differential. |
| `db-enum-from-tuple` `named &&` falsifier reasoned, not built | **Superseded by classification** | The report identifies mutual redundancy, not an enforcement hole. No later evidence refutes it. No row. |
| `schema-branding` discriminated-union clause not cut | **Unfalsifiable by the stated mutation** | This is a type-shape correctness obligation, not an omitted runnable control as framed. No row. |
| `fk-ondelete-stated` spread-options claim not evaluated | **Needs a targeted check before copying, but no defect is established** | The omission names a plausible test. I found no current issue proving the claim false. Do not add a defect row until the fixture is driven. |
| First structure run contaminated / box contended | **Replaced by the report's second clean-tree run for correctness; timing remains unusable** | The report expressly rejects the first receipt. No row. |
| No UI/compiler/planter floors | **Historical floor only** | No row. |

### Wave 4 — raw CSS/token surface

| declared omission | current classification | evidence / owner |
| - | - | - |
| `gate-ignore-grammar` and `check-gates` not run | **Covered by later repairs and planter receipts** | #1969/#1974 repaired stale carriers; #2200/#2215 repaired cleanup/vacuity; #2296 repaired the later stale final-gate entry and passed the integrated planter. |
| No broad verify tiers | **Historical floor only** | No row. |
| Remaining final `ExemptionTable` modules not audited | **Concrete migration is already tracked** | #1922/#2147 own authority migration; #2320, B-owned, owns the proven relocation escape. #2324 separately owns `depcruise-grant-liveness`'s count ratchet. No duplicate census row. |
| Real-tree finding deltas for proposed fixes not measured | **Later fixes require their own receipts; omission itself is not a defect** | The CSS repair train now carries targeted source/differential and production receipts. Remaining CSS work is tracked separately, not by this omission. |
| `gate-ignore-inventory` consequence unverified | **Superseded by the repointed grammar suite and later inventory controls** | #1974 closed the dead premise and the current suite has legacy-carrier tripwires. No current conflicting evidence. |
| `no-color-literals` regex cross-product reasoned only | **Still a proof limit, not a demonstrated defect** | #2273 owns its actual missing §4.6 record. A regex cross-product row needs a failing/ambiguous case before filing. |

### Wave 5 — ordinary visitors

| declared omission | current classification | evidence / owner |
| - | - | - |
| No full verify/node/CT/gate-contract | **Historical floor only** | Later family, structure, conformance and barrier receipts exist. |
| `persisted-store-registry` population unclassified | **Covered by later focused repair/review** | #2022 repaired the actual unreadable arm; the ledger's narrowing aggregate records the population cell closure. |
| `no-inline-types` root population row not built | **Covered** | The ledger records all nine `no-inline-types` narrowing cells closed; later #1988 and contract-home work handled real-tree diagnostics separately. |
| Which four live findings were new was not classified | **Superseded by current-source ownership work** | #1988's contract-home migration and later no-inline-types production receipts replaced the stale count question. No historical-age row remains useful. |
| Five reviewed-grant `why`/`endsWhen` texts not semantically audited | **Still an honest review limit; no defect established** | Current liveness checks enforce existence/identity/staleness, not universal truth of prose. #2070, B-owned, covers issue-openness validation in warning debt; it is not a blanket prose audit. Add rows only for a specific false citation or rationale. |
| Redundant clusters not decomposed | **Explicitly bounded proof, no defect** | Joint cuts prove the cluster. The report correctly avoids claiming independent clauses. |
| Virtual conformance cannot isolate symlink/absolute/node_modules defects | **Covered by real-tree resource/refusal families where relevant; general limitation remains** | Current resource-policy contract and family tests distinguish real-resource statuses. This is a harness capability boundary, not evidence of a policy defect. |

### Wave 6 — origin-client

| declared omission | current classification | evidence / owner |
| - | - | - |
| No before/after real-tree delta | **Historical limitation** | The artifact proves non-empty execution and zero tool errors/withheld, not change causality. Correctly retained as a limit. |
| Orchestrator suites not run | **Later covered** | Same #1969/#1974/#2200/#2215/#2296 chain above. |
| No gate-contract | **Not owed for an unchanged read-only audit** | No row. |
| No §4.6 replay | **Tracked** | #2319. |
| Falsifier rows were temporary probes | **Expected audit method** | Their results support ledger rows; absence as committed tests was separately repaired where a lasting pin was justified. No blanket “commit all probes” requirement. |

### Wave 7 — home-client

| declared omission | current classification | evidence / owner |
| - | - | - |
| Nine of seventeen unenforced cuts had shapes but no built row | **Covered by later residue lane** | The ledger records the wave-7 narrowing cells closed by `p-ledger-client-residue`, with control-green/armed-red receipts. |
| No §4.6 replay | **Tracked** | #2319. |
| Reviewed-grants 105-row prose quality not audited | **Still a bounded review limit, not a defect** | Sorting/identity/liveness were separately controlled (#2298/#2306 and grant-liveness suites). Semantic truth of all prose remains reviewer-owned; file only concrete false rows. |
| Orchestrator suites not run / structure only once | **Later covered; timing caveat historical** | No row. |
| Real-tree truth not re-derived | **Standing review limit** | No blanket row. |
| `no-raw-zustand-persist` ARM C not checked against live `durable-local.ts` | **Covered** | Current `home-client-family.test.ts` has a real-file absence/refusal control and the gate carries durable-local fixtures; the ledger records all three cells closed. |

### Wave 8 — server plane

| declared omission | current classification | evidence / owner |
| - | - | - |
| All origin-server §4.1/§4.5 probes and per-module verdicts omitted | **Covered by wave 9 and repair lanes** | Wave 9 was explicitly the missing half; #2046/#2057 and the ledger's origin-server rows record the fixes. |
| §5b.7 not audited in either family | **No generic defect established; actual authority residue tracked** | #1922/#2147/#2320 own proven table-authority failures. Do not create a “review all helpers” defect row. |
| No §4.6 replay | **Tracked** | #2319. |
| Real-tree behavior not established by row proofs | **Standing limit** | Later production runs establish execution health, not universal domain truth. |
| `byte-check-cast` receipt routing not re-derived | **Covered by wave 3 evidence and subsequent schema-fact work** | No conflicting current evidence. |
| `two-class-role-authority` “all three zero-instance” not counted | **Needs explicit re-measurement before the header is used as current census; no defect yet** | Current header still says all three are zero-instance. The family test pins malformed/empty vocabulary refusal, not that live-tree count. A ledger row would be premature until a current census contradicts the sentence. |
| Orchestrator suites not run | **Later covered** | No row. |

### Wave 9 — origin-server completion

| declared omission | current classification | evidence / owner |
| - | - | - |
| §4.2 discrimination inherited from wave 8 | **Covered by the cited earlier receipt** | Not every verifier must repeat a valid independent arm. No row. |
| No §4.6 replay | **Tracked** | #2319. |
| D1 live false-positive count not measured | **Defect repaired without needing a live instance** | #2006 closed the false-positive mechanism and controls. The ledger records the real corpus as latent; no count row owed. |
| `untrusted-regex-safe-exec` outside subject set | **Correctly preserved as opposite polarity** | Current ledger explicitly warns it is acquitting shape 3 and must not receive the #2006 fix. No omission row. |
| `byte-check-cast` D2 falsifier reasoned, not built | **Covered by #2046** | The ledger records resolving counterfactuals and armed controls for module/name clauses. |
| Schema-fact routing not re-derived | **Covered by wave 3** | No contradictory evidence. |
| Orchestrator suites not run | **Later covered** | No row. |

### Wave 10 — bus and id-brand

| declared omission | current classification | evidence / owner |
| - | - | - |
| Tenancy, CT/story, contract-shape and resource-layout families not audited | **Subsequent waves/reports cover them; not defects by omission** | The ledger contains later tenancy, mirror/CT, contract/resource and CSS sections with their own issues. #2319 tracks replay debt where applicable. |
| No §4.6 replay for twelve | **Tracked** | #2319. |
| Reviewed-grant identity not owed | **Correct exclusion** | None of the twelve used reviewed-grant authority at that point. |
| No shared-reader internal cuts | **Later concrete reader defects were individually repaired; generic sweep remains review scope** | Examples already in the ledger include `origin-verdict`, `reference-fact-writes`, and policy-soundness repairs. #2163 owns remaining private binding/origin migrations. No blanket row. |
| Orchestrator suites not run | **Later covered** | No row. |
| `no-fake-disabled-id` static scalar alias depth and `no-loose-id-cast` `satisfies`/`as const` chains unprobed | **Unadjudicated hypotheses; needs a targeted drive before filing** | Current source still uses `readStaticAuthoredScalar`; searches show no committed focused chain controls clearly answering both named shapes. This is the strongest remaining unmeasured candidate, but the report itself labels it plausible rather than broken. Do not add a defect row until a meaningful positive/negative fixture demonstrates wrong behavior. |
| Structure not rerun after restored probes | **Byte restoration plus earlier floor bounds that audit; later barriers supersede it** | No row. |

## Proposed ledger change

Add **no new defect rows** from the omissions alone. The only justified queue items are already represented by
existing rows/issues (#2319, #2273, #1970, #2033, #1922/#2147/#2320, and #2163). Adding duplicates would make
the ledger less authoritative.

Replace the final generic sentence that says a second pass “would add rows” with an accounting statement:

> **The original waves' declared omissions were reconciled on 2026-09-13.** Most are historical verification
> boundaries or were covered by later waves and barriers. The remaining conversion-replay debt is tracked by
> \#2319, #2273, #1970 and #2033; proven authority/shared-reader work is tracked by #1922/#2147/#2320 and #2163.
> Three candidate groups remain deliberately unfiled until driven: `fk-ondelete-stated` spread options,
> `two-class-role-authority`'s dated zero-instance assertion, and wave 10's static-scalar/cast-chain cases. An omitted probe is not a defect row.

This preserves the omissions without pretending they were all work, prevents duplicate dispatch, and names the
three places where an explicit future measurement can still turn uncertainty into a finding.

## Limits

This was source/report/issue reconciliation. I did not run a gate, repeat any historical cut, attest every
ledger row, or inspect mutable Project fields beyond issue lifecycle/assignee data and the ownership supplied
by the coordinator. For the unfiled hypotheses I verified only that no existing focused control was obvious
from current literal/source searches; that is not a negative proof that no test exists anywhere.

## Subsequent targeted measurement

The accounting above did not justify new rows from omissions alone. The subsequent
[targeted probe report](adj-audit-gap-probes-2026-09-13.md) reproduced a concrete cast-anchor tool error
and filed #2325. This is new measured evidence, not a reclassification of every omitted probe as a defect.

## Authorization census follow-up

The separately routed security review completed the previously omitted measurement. Across the real policy population of 1,148 files at `83215b816`, all three header-defined omitted shapes have zero instances. Each recognizer detected its planted positive control. The named production gate reported three raw findings, all three granted, with no effective findings, alarms, tool errors, or withheld policies. This clears the census question within those exact shapes; it does not claim every possible enforcement encoding is measured. The [full census report](adj-role-authority-census-2026-09-13.md) preserves the source scope, controls, production artifact and limits.
