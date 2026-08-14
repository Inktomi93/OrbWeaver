# Lane report — docs-reviews-a-m

## Lane identity

- Lane: `docs-reviews-a-m`
- Semantic scope: 14 historical/miscellaneous review records, from the buried-knobs WIP through the global-agent proposal.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (assignment); rolling working-tree audit per `SNAPSHOT-POLICY.md`.
- Working-tree basis: 14/14 owned files match assignment SHA-256; no owned path was dirty at reconciliation.
- Assigned files/lines/bytes read: 14/14; 3,845/3,845 text lines; 334,387/334,387 bytes.
- Structural scan coverage: `pnpm ast ident custom_parameters_dropped`: 4,812 files (`ts:3769`, `tsx:1041`, `dts:2`), zero matches, complete.
- Tests examined: none owned by this documentation lane. `pnpm check:docs` passed (104 files formatted).
- Command failures: 0.

## Read receipt

`read-receipt.tsv` reconciles every OWNED assignment row exactly. The review set includes three frontmatter-bearing documents — archive rescue, export dispositions, and import fidelity — and eleven documents without a `kind`/`status`/`updated` provenance block.

## Architecture observed

This is an evidence-record corpus, not a live runtime subsystem. The documents point into independently-owned package and test surfaces; they are not registered, indexed, or lifecycle-controlled. `2026-08-03-export-rot-dispositions.md:1-11` is unusually legible: it declares itself an executed, deliberately stale one-shot record. The rest do not consistently make that distinction.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Historical review-record corpus (14 files) | 4 | 1 | 2 | 0 | 1 | high | `read-receipt.tsv`; `2026-08-03-export-rot-dispositions.md:1-33` |
| Import-fidelity findings that were checked today | 4 | 3 | 4 | 1 | 3 | high | `2026-08-08-import-fidelity-audit.md:241-480`; `packages/server/src/domain/import/substrate/chat-input.ts:23-158`; `packages/kit/src/time/index.ts:41-80` |

## Findings

### AM-01 — archive-rescue's active open CA-10 row is stale

- Severity: P2
- Class: law-drift
- Confidence: high — a full read of the referenced current one-line file would raise nothing further.
- Evidence rung: R2
- Scope denominator: 1 current referenced file; 1/1 read.
- Receipts: `docs/reviews/misc/2026-08-03-archive-rescue-audit.md:2,56-57,362-365`; `packages/contracts/src/index.ts:1`.
- Established fact: the archive report remains `status: active` and says the barrel still promises re-exports as modules land. Current source instead labels it an unused placeholder and says consumers import modules directly. The stale open row is neither corrected in place nor marked superseded.
- User or system impact: a planner treating active review status as current truth can schedule a no-longer-valid cleanup and amplify an obsolete premise into board work.
- What remains unverified: whether another board/lane recorded the correction; that is outside this lane's owned corpus.
- Suggested next check or fix: classify the archive record as historical or append a dated supersession note to CA-10 with the current source receipt.

### AM-02 — review provenance is not machine-legible for 11 of 14 records

- Severity: P2
- Class: law-drift
- Confidence: high — based on full owned-file reads and frontmatter inspection.
- Evidence rung: R1
- Scope denominator: 14 owned review documents; 11 lack a document provenance block.
- Receipts: `docs/reviews/misc/2026-07-25-buried-knobs-audit-wip.md:1`; `2026-08-01-st-impersonate-anatomy.md:1`; `2026-08-03-registry-map.md:1`; `2026-08-08-task-7-12-gap-rederivation.md:1`; `2026-08-09-api-surface-classification.md:1`; `2026-08-14-global-agents-proposed.md:1`; contrast `2026-08-03-export-rot-dispositions.md:1-11`.
- Established fact: most of the corpus has no `kind`, `status`, `updated`, snapshot, or historical/current declaration; some title themselves WIP, reference recon, proposal, audit, or worklist, but those labels are prose and cannot be queried safely. The three documents with frontmatter still mix `active` evidence reports with an expressly executed historical record.
- User or system impact: source-of-truth status cannot be determined mechanically; old open/clean claims look operationally equivalent to current audit findings.
- What remains unverified: a repository-wide document schema or index owner; only this assigned review set was audited.
- Suggested next check or fix: give every durable review a minimal provenance block and make historical/applied/superseded distinct from active findings.

### AM-03 — a formerly open OpenRouter warning is genuinely still absent

- Severity: P2
- Class: declared-not-wired
- Confidence: high — an identifier could be renamed, but the exact documented warning contract is absent.
- Evidence rung: R0 for the proposed warning implementation; R1 for its documented obligation.
- Scope denominator: workspace structural corpus, 4,812 scanned files; no exclusions.
- Receipts: `docs/reviews/misc/2026-08-03-archive-rescue-audit.md:41-42,370-374`; `pnpm ast ident custom_parameters_dropped` (commands log; 0 matches/4,812 scanned).
- Established fact: the archive report's `custom_parameters_dropped` warning remains absent under the exact documented warning-code name. This is a current unresolved feature gap, not a stale finding.
- User or system impact: an OpenRouter request carrying `customParameters` can still lose that blob without the promised warning.
- What remains unverified: adjacent warning wording or a differently named implementation; source ownership belongs to the providers lane.
- Suggested next check or fix: providers owner should trace the OpenRouter chat-completions and responses runners plus the warning-code registry, then add a behavioral assertion for both paths.

## Bounded historical observations (not proven strengths)

- `2026-08-03-export-rot-dispositions.md:1-11` reaches R4-quality provenance for its own purpose: it explicitly declares its one-shot, pre-apply historical basis and tells readers to rerun current lenses rather than edit the old table.
- The import-fidelity record's already-closed date/token/metadata claims match current implementation: `2026-08-08-import-fidelity-audit.md:241-360` maps both token axes and canonical metadata; `packages/server/src/domain/import/substrate/chat-input.ts:23-80` passes `tokensIn`, `tokensOut`, and metadata in both paths; `packages/kit/src/time/index.ts:41-80` implements the explicit zone boundary described by the review. R3.

## Declared versus completed

| Declared surface | Strongest current evidence | Status |
| - | - | - |
| Export-rot disposition table is historical | R1 prose declaration | legible, deliberately stale |
| Archive CA-10 barrel wording | R2 current source contradicts the open row | stale review claim |
| `custom_parameters_dropped` warning | R0 exact identifier absent over 4,812 files | remains unbuilt under documented name |
| Import wall-clock and token-axis repairs | R3 current importer/time code carries both mechanisms | current source agrees with closed review |

## Tests and gates

`pnpm check:docs` completed successfully, but it validates markdown formatting only; it cannot establish current truth, supersession, or referenced-code reachability. No review-status gate or provenance schema was found in this lane's documentation corpus. The report intentionally does not promote historic green test claims to R4/R5 without rerunning their owned behavioral suites.

## Cross-lane edges

- Providers/connection: AM-03 needs a current runner and warning-registry trace.
- Documentation/governance owner: AM-01 and AM-02 need a lifecycle/provenance convention rather than source-code changes.
- Import/export lane: current source agrees with the import-fidelity closed mechanisms, but attachment and residual-metadata scope decisions remain its ownership.

## Tool receipts

See `commands.md`. `pnpm ast` was used after reading the repository runner; the only negative finding uses its complete 4,812-file scan. Literal and full-file source reads were used only to verify exact cited current code. No tool failed.

## Lane verdict

All 14 assigned reviews were read and hash-reconciled. The corpus is rich evidence but not a reliable current-status system: eleven records lack machine-readable provenance, and an active archive report retains at least one contradicted open row. Its explicit one-shot disposition record is the model to preserve. The current import-fidelity fixes sampled here are real; the OpenRouter dropped-custom-parameters warning remains unimplemented under its documented contract. Largest uncertainty: how many other old open/clean claims have drifted, because no lifecycle index or status gate governs this corpus.
