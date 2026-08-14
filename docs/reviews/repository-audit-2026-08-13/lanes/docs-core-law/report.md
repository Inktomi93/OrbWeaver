# docs-core-law audit report

## Lane identity

- Lane: `docs-core-law`
- Semantic scope: Current core law, enforcement, status, architecture, and related registry documents.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (assignment).
- Working-tree basis: `41cc037359769f79f9eaef94f16a2ff8011d6d8a`; every owned path still matches its assigned SHA-256.
- Assigned files read: 17 / 17 (100%).
- Assigned lines read: 2,817 / 2,817 (100%).
- Assigned bytes read: 594,666 / 594,666 (100%).
- Dirty assigned paths: 0.
- Exclusions: shared prerequisites and source/tests outside this lane; no owned binary files.

## Read receipt

`read-receipt.tsv` covers all 17 `OWNED` rows in `assignment.txt`, with matching current lines, byte counts, and SHA-256 values.

## Architecture observed

The documents establish a hierarchy in which `Core-Path-Registry.md` is the winning ledger on any document conflict (`docs/architecture/core/Core-Laws-and-Precedents.md:9`; `docs/architecture/core/AGENTS.md:23`). `Documentation-Law.md` governs content/taxonomy and `Core-Docs-Formatting-Law.md` governs byte-level Markdown mechanics (`docs/architecture/core/Documentation-Law.md:126`; `docs/architecture/core/Core-Docs-Formatting-Law.md:7`).

`pnpm ast` establishes that the chat macro law's shared atom is not merely named: `resolveRowMacros` is declared in kit and imported by client and server call paths (R3; command receipt). The cast producer is likewise declared and called from server chat paths (R3; command receipt). This raises only those two reachability facts; source behavior and named test assertions were not audited by this lane.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| Core-law corpus (17 owned documents) | 3 | 3 | 2 | 2 | 3 | high | Full receipt; registry precedence at `docs/architecture/core/Core-Laws-and-Precedents.md:9`; stale canonical range at `:58-62`; formatting check current but no content/link/size gate. |

## Findings

### DCL-01 — Canonical ledger redirect omits the live D137 ruling

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R2
- Scope denominator: the sole canonical redirect in `Core-Laws-and-Precedents.md` §7.
- Receipts: `docs/architecture/core/Core-Laws-and-Precedents.md:58`, `docs/architecture/core/Core-Laws-and-Precedents.md:60`, `docs/architecture/core/Core-Path-Registry.md:7`, `docs/architecture/core/Core-Path-Registry.md:502`, `docs/architecture/core/Chat-Macro-Resolution.md:43`.
- Established fact: The master redirect declares the registry range as D1–D78, D86, D106–D136, while the winning registry declares and defines D137; another owned active law already relies on D137.
- User or system impact: A reader following the master law/index can conclude the registry ends at D136 and miss the current cast/card-face ruling.
- What remains unverified: Nothing material to the document contradiction.
- Suggested next check or fix: Update the two range statements in §7 and keep the redirect deliberately range-neutral if manual end-range updates are expected to recur.

### DCL-02 — The content-size law has two unlisted live exceptions

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R1
- Scope denominator: 17 owned documents; the rule names one sanctioned exception.
- Receipts: `docs/architecture/core/Documentation-Law.md:142`; `docs/architecture/core/Core-Audits-and-Debt.md` assignment receipt: 70,328 B; `docs/architecture/core/Core-Enforcement-Active-Gates.md` assignment receipt: 138,664 B; the named exception `docs/architecture/core/Core-Path-Registry.md`: 228,033 B.
- Established fact: The law sets a ~40 KB per-topic ceiling and names only `Core-Path-Registry.md` as the sanctioned exception. The active debt registry is 1.7× the ceiling and the active enforcement catalog is 3.4× it, without an exception or split decision in the governing law.
- User or system impact: The stated size constraint is not actionable for the two largest live law documents; readers pay the exact full-read and truncation cost the rule is meant to control.
- What remains unverified: Whether the owner intends these files as permanent exceptions or wants a different content partition.
- Suggested next check or fix: Either enumerate the intentional exceptions with their rationale or split the two documents into stable, navigable one-topic units.

### DCL-03 — Documentation taxonomy still assigns the active program to `proposed/`

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R2
- Scope denominator: the taxonomy declaration and the constitution's active-program routing.
- Receipts: `docs/architecture/core/Documentation-Law.md:128`, `docs/architecture/core/AGENTS.md:78`, `docs/architecture/core/AGENTS.md:301`, `docs/Mission.md:1`.
- Established fact: `Documentation-Law.md` says `proposed/` has the one active program and that nothing lives at the root, while the constitution states the one active program is `docs/retro-workboard.md` and `docs/Mission.md` is a tracked foundational document at the docs root.
- User or system impact: The content-law taxonomy can send a cold reader to a parked/proposed document rather than the declared live program and makes the root-level foundational exceptions look illicit.
- What remains unverified: The phrase “repo root” may have intended the repository root rather than `docs/`; that ambiguity does not resolve the explicit active-program location conflict.
- Suggested next check or fix: Amend the taxonomy to name `docs/retro-workboard.md` and `docs/Mission.md` as the sanctioned current/root-level documents, or relocate them and update all routes in one sweep.

### DCL-04 — The live debt registry contains a contradicted “Confirmed CLEAN” directive

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R2
- Scope denominator: the active debt registry's introductory/current-status section.
- Receipts: `docs/architecture/core/Core-Audits-and-Debt.md:7`, `docs/architecture/core/Core-Audits-and-Debt.md:9`, `docs/architecture/core/Core-Audits-and-Debt.md:15`, `docs/architecture/core/Core-Audits-and-Debt.md:17`, `docs/architecture/core/Documentation-Law.md:175`.
- Established fact: The file calls itself the live debt registry, directs readers to re-sweep rows because build-state claims about `domain/buddy` are historical, then retains a “Confirmed CLEAN (do not manufacture findings here)” statement that lists `domain/buddy`. That directive is both internally contradicted and retained in a current document instead of being quarantined as history.
- User or system impact: A reader can be told both to revalidate and not to report a result for a purged surface, suppressing legitimate current audit findings.
- What remains unverified: Whether any of the other “Confirmed CLEAN” entries also drifted; this lane did not audit their sibling-owned sources.
- Suggested next check or fix: Move the frozen clean-list to history or delete it, leaving only current debt rows and a precise scope statement in the live registry.

## Proven strengths

None claimed. `pnpm check:docs` passed, but this lane did not run a positive control and the formatter alone does not prove content, link, or law consistency.

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Registry precedence | R2: explicit winning-rule declarations | Declared consistently in the constitution and master law. |
| Shared chat macro resolver | R3: kit declaration plus server/client imports and calls | Reachability demonstrated; semantics/tests outside this lane. |
| Shared chat cast producer | R3: declaration plus chat-engine/read call paths | Reachability demonstrated; semantics/tests outside this lane. |
| Exact current ledger range | R2: registry D137 contradicts master redirect D136 cap | Incomplete/stale redirect. |
| Docs size and taxonomy law | R1/R2: direct content and receipt comparison | Contradicted by owned current docs. |

## Tests and gates

Tests examined: unit 0, integration 0, contract 0, CT 0, e2e 0, type 0. The documentation lane did not need source-test ownership to establish the four document contradictions. `pnpm check:docs` passed against 104 formatted files, proving current formatter conformance only. No current content/link/ledger-range/size positive-controlled gate was found in this lane; `docs:format` is registered in the verify registry (`scripts/verify/registry.ts:294`).

## Cross-lane edges

- The source/test lanes named by D137 own verification of its detailed cast-producer behavior; this report establishes the master-index mismatch only.
- The verification-harness/gates lanes may assess whether an automated rule should keep the ledger redirect, document size ceilings, and debt registry status from drifting.

## Tool receipts

See `commands.md`. Structural questions used repository-native `pnpm ast`; the instrument reported 19 `loadChatCastProducer` identifiers in eight server files and eight `resolveRowMacros` identifiers in five package files. The relative file-target scan checked 48 targets in 35 core documents; two code-example placeholders were excluded and anchors were not assessed. No tool failures contributed to a finding.

## Lane verdict

All 17 assigned current-law documents were read and their bytes match the frozen lane assignment. The corpus has working hierarchy and demonstrated R3 reachability for the chat macro atom/producer, but four current-law drift defects remain: the master ledger index omits D137, the content-size law has two unlisted live exceptions, the taxonomy misstates the active program location, and the live debt registry retains a contradicted clean-list directive. The largest uncertainty is content/behavior accuracy of the many source claims in the registry; that work belongs to the corresponding source and test lanes.
