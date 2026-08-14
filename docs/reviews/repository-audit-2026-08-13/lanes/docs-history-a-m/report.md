# docs-history-a-m audit report

## Lane identity

- Lane: `docs-history-a-m`
- Semantic scope: Eight historical design and dogfood records A–M. They are provenance, not current law, except where current law adopts a specifically named fact.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (assignment).
- Working-tree basis: `dab3c8440f23ee23883897e446fe80e3838c9b29`; all owned paths still match their assigned SHA-256.
- Assigned files read: 8 / 8 (100%).
- Assigned lines read: 5,487 / 5,487 (100%).
- Assigned bytes read: 393,536 / 393,536 (100%).
- Dirty assigned paths: 0.
- Exclusions: Current law, source, tests, sibling lane files, fragments, and external links, except for shared prerequisites and exact current-code/law checks needed to bound a historical claim.

## Read receipt

`read-receipt.tsv` covers all eight `OWNED` rows in `assignment.txt`. Its line, byte, and SHA-256 values match the assignment at final reconciliation.

## Architecture observed

The historical corpus is deliberately mixed: the completed HOME, HUD, settings, and SSE records preserve design rationale and refer a reader to current code/gates; the RPG brief/game-plan pair preserves the ratified mode-axis provenance; the dogfood board retains both original diagnoses and later corrections. Current code confirms narrow live seams without promoting the records to law: the client door builds `home-tiles` and passes it to `makeHomeSection` (`packages/client/src/main.tsx:207-227,237`), while the mode union is contract-homed and drives the DB CHECK (`packages/contracts/src/rpg/enums.ts:10-15`; `packages/db/src/schema/rpg.ts:80-106`) (R3; commands receipt).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Historical design/provenance records (8 files) | 0 | 0 | 1 | 1 | 2 | high | Full receipt; formatter pass; local-link scan. Historical prose is not executable, so no implementation/wiring evidence is credited. |

## Findings

### DHA-01 — Base UI historical record has two broken active-law links

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R1
- Scope denominator: 8 owned Markdown documents; 2 local relative targets found; 2 broken.
- Receipts: `docs/history/design/baseui-crunch.md:45-50` labels the gate work landed then links `../architecture/core/Core-Enforcement-Active-Gates.md` and `../architecture/core/ui-package-design.md`; both resolve below `docs/history/architecture/` and do not exist. The intended files exist at `docs/architecture/core/Core-Enforcement-Active-Gates.md` and `docs/architecture/core/ui-package-design.md` (read-only target scan; commands receipt).
- Established fact: The record cannot navigate to either current authority it explicitly calls the home for gate-count and anatomy information.
- User or system impact: A reader validating the retained Base UI provenance lands on two missing paths rather than the active gate and design authorities.
- What remains unverified: Fragment validity inside the intended documents and all targets outside this lane.
- Suggested next check or fix: Change the two links to `../../architecture/core/...` and rerun a local-link check.

### DHA-02 — Archived dogfood board retains unbounded “live / dev halted” metadata after its close-out

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R1
- Scope denominator: One archived board and the current workboard's explicit classification of that same record.
- Receipts: `docs/history/dogfood-tracking-2026-08-08.md:1,3` calls the board “live” and says development is halted; `:7-18` says the campaign is closed and the halt is lifted; `:20-22` retains “CAMPAIGN LIVE.” The current workboard places this exact file in its history receipt trail as `(CLOSED)` (`docs/retro-workboard.md:1030-1037`).
- Established fact: The historical board contains retained active-state wording without a date-bound archive marker at the document entry, while current planning classifies the same board closed.
- User or system impact: A cold reader entering the historical document directly can misread it as an active development halt or priority rather than a completed campaign record.
- What remains unverified: Whether some external archival renderer intentionally interprets its title and blockquote as time-qualified chronology; no such convention was supplied in the reading set.
- Suggested next check or fix: Add a top-level archival status line such as “Historical record — campaign closed 2026-08-08; current queue is `docs/retro-workboard.md`,” preserving the dated live-state block as historical evidence.

## Bounded current observations (not proven strengths)

- The HOME completion record is supported by a current R3 composition path: the client door assembles six feature/home contributions plus the derived jump tile and passes the registry into `makeHomeSection` (`packages/client/src/main.tsx:207-227,237`; `packages/client/src/features/home/lib/home-section.tsx:19-33`).
- The lite/full provenance is still represented in current implementation at R3: `RPG_GAME_MODES` supplies the contract union and the `rpg_games.mode` database constraint (`packages/contracts/src/rpg/enums.ts:10-15`; `packages/db/src/schema/rpg.ts:80-106`).
- The current docs formatter completes successfully (`pnpm check:docs`, commands receipt); that confirms Markdown formatting, not historical truth or link reachability.

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| HOME section / door-assembled tiles | R3 current composition reads | Historical completion claim is narrowly supported; the current code is the governing implementation source. |
| Lite/full mode axis | R3 contract tuple + DB CHECK | Historical game-plan provenance is narrowly supported; it is not a claim that every planned future mode surface is complete. |
| SSE multiplex record | R2 exact current `StreamRoomRef` declarations and consumers | The vocabulary remains present; full transport behavior is outside this docs lane. |
| Base UI gate-authority navigation | R1 local relative targets | Incomplete: both explicit local links are broken. |
| Dogfood campaign state | R1 historical/current-workboard metadata | Incomplete: unbounded “live / halted” text conflicts with the current closed classification. |

## Tests and gates

Tests examined/run: unit 0, integration 0, contract 0, CT 0, e2e 0, type 0. `pnpm check:docs` passed for 104 files; it is a formatting result only. No history-content or local-link gate with a positive control was identified in this lane. The two defects are documentation navigation/status-boundary defects and have no runtime test tier.

## Cross-lane edges

- The docs-core-law/docs-current lanes should decide the canonical archival-status marker, if one is desired; this lane establishes only the dogfood record/current-workboard contradiction.
- The docs-core-law or Base UI source/gate owner can repair the two historical relative links; this lane verified target existence only and must not edit their active authorities.
- Source-owning lanes may use the R2/R3 spot checks as provenance only; this lane did not validate transport, home, or RPG behavior end-to-end.

## Tool receipts

See `commands.md`. Repository-native `pnpm ast` supplied the structural spot checks. The only negative documentation claim uses a read-only relative-target scan plus direct target existence checks. Final owned-file reconciliation remains 8 / 8, 5,487 lines, 393,536 bytes, with all assigned SHA-256 values unchanged.

## Lane verdict

All eight assigned historical documents were fully read and still match the frozen assignment. Their useful role is bounded provenance, with narrow current-code checks supporting the HOME and mode-axis records. Two P3 documentation defects remain: Base UI’s retained record links to two nonexistent relative targets, and the archived dogfood board retains entry-point wording that reads active/halting despite its own close-out and the current workboard’s CLOSED classification. The largest unverified area is complete behavioral parity of the historical completed programs, which belongs to their source/test lanes.
