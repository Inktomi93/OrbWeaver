# docs-architecture-history-a-m audit report

## Lane identity

- Lane: `docs-architecture-history-a-m`
- Semantic scope: Architecture-history documents A–M. These are provenance/past-intent records, not current law unless a current document explicitly adopts a narrow fact.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (assignment).
- Working-tree basis: `875ec3b087b3775876093bc6cc0e08a3e973eacd`; all owned paths matched their assigned SHA-256.
- Assigned files read: 32 / 32 (100%).
- Assigned lines read: 8,810 / 8,810 (100%).
- Assigned bytes read: 869,357 / 869,357 (100%).
- Dirty assigned paths: 0.
- Exclusions: current law, proposed designs, source, tests, and sibling audit lanes except shared prerequisites/current-code spot checks needed to test a precise historical claim.

## Read receipt

`read-receipt.tsv` covers all 32 `OWNED` rows in `assignment.txt`; lines, bytes, and SHA-256 matched before analysis. A final reconciliation is recorded below under Tool receipts.

## Architecture observed

The corpus is intentionally archival: most documents carry `kind: history`/`status: superseded`, preserve build plans, archaeology, decisions, and design rationale, and frequently state that current code or a named active document wins on drift. The current UI program explicitly says its predecessor records, including `DESIGN-REVIEW-2026-07-01.md`, are archived history rather than law (`docs/architecture/proposed/ui-cohesion-north-star.md:18-19`). Current core law likewise routes resolved archaeology to `history/` rather than treating it as an implementation contract (`docs/architecture/core/Core-Audits-and-Debt.md:11`).

Spot checks support retaining useful provenance without promoting it: the assets history's `reapIfOrphan` call path is currently composed (R3; command receipt), while portability's contract has 22 current server importers (R3; command receipt). Those checks do not validate each historical as-built claim.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Architecture-history A–M (32 documents) | 3 | 2 | 1 | 1 | 2 | high | Full receipt; 11 real stale local links; no history-content/link gate or positive control. |

## Findings

### DAHM-01 — Buddy observer record claims a shipped, wired subsystem absent from current server code

- Severity: P3
- Class: architecture-drift
- Confidence: high
- Evidence rung: R0
- Scope denominator: 1,307 current `packages/server/src/**/*.ts` files; the exact `domain/buddy/` path named by the record.
- Receipts: `docs/architecture/history/buddy-observer-reaction-engine.md:9` claims `domain/buddy/observer/`; `docs/architecture/history/buddy-observer-reaction-engine.md:13` claims entry-wired `startBuddyObserver`; `pnpm ast callers startBuddyObserver --in packages/server/src` returned no results; `pnpm ast refs startBuddyObserver --in packages/server/src` found no declaration; literal scan found zero matches and `packages/server/src/domain/buddy` is absent (command receipt).
- Established fact: The historical record's asserted current implementation/wiring cannot be found at its explicit symbols or paths in the current server tree. This does not establish why it was removed or whether a renamed successor exists.
- User or system impact: A future reader following the record's “built as designed” header can start from a deleted subsystem and mistake past design detail for live architecture.
- What remains unverified: Any replacement under a different domain/name and the removal decision; this lane did not audit sibling-owned server history or code.
- Suggested next check or fix: Mark the record as superseded/purged with the successor or removal decision, or add a top-level archival note that its as-built path is no longer current.

### DAHM-02 — Historical design-review metadata marks an archived predecessor as active

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R1
- Scope denominator: the one frontmatter status claim and the current UI program's named predecessor-record list.
- Receipts: `docs/architecture/history/DESIGN-REVIEW-2026-07-01.md:3` declares `status: active`; `docs/architecture/proposed/ui-cohesion-north-star.md:18` names that exact file among predecessor records; `docs/architecture/proposed/ui-cohesion-north-star.md:19` says they are history, not law.
- Established fact: The historical file's active status is contradictory metadata for a document the current program explicitly identifies as archived/non-authoritative.
- User or system impact: Cold readers can elevate a resolved 2026-07-01 review over current program/law despite the archive boundary.
- What remains unverified: Whether `status: active` has an internal metadata meaning distinct from authoritative/current. No definition supplying that distinction was found in the read set.
- Suggested next check or fix: Use an archive-appropriate status (`superseded` or `reference`) or explain the non-authoritative meaning of `active` in the document header.

### DAHM-03 — Eleven relocated-proposal links are broken in retained provenance records

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R1
- Scope denominator: 32 owned Markdown files; all relative Markdown targets checked (anchors/external targets excluded).
- Receipts: `docs/architecture/history/Marinara-Residue-Non-RPG.md:10,14-15,33-40` contains 10 links resolved relative to `history/` but their existing targets are under `docs/architecture/proposed/`; `docs/architecture/history/gallery-design.md:401` similarly links `hub-browse-design/01-network-guard.md` relative to `history/`; the read-only target scan reports 11 real misses (command receipt).
- Established fact: The source records were moved to `history/` without updating these local relative references. The intended proposal targets exist, including `docs/architecture/proposed/rpg-design/README.md` and `docs/architecture/proposed/hub-browse-design/01-network-guard.md`.
- User or system impact: Provenance cannot be followed from the archived records, weakening the precise “where the decision/design lives” handoff without affecting runtime behavior.
- What remains unverified: Fragment-anchor validity and links outside these 32 files.
- Suggested next check or fix: Prefix the affected targets with `../proposed/` and run a local-link check; do not change the documents' archival status while repairing navigation.

## Bounded current observations (not proven strengths)

- `assets-maintenance.md` accurately identifies a live `reapIfOrphan` integration path at R3: the repository AST reports calls in `packages/server/src/entry/compose/assets-character.ts:223` and `packages/server/src/entry/compose/automation-plugin.ts:389` (command receipt). This validates only that precise reachability fact.
- `export-import-portability.md` remains useful provenance for a current portability seam: `pnpm ast importers @orb/contracts/portability --in packages/server/src` reports 22 imports in 20 server files (R3; command receipt).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Historical build plans/queues and archaeology | R1: retained documents and explicit `history`/`superseded` headers | Useful past-intent/provenance; not current implementation law. |
| Assets maintenance targeted cleanup | R3: current compose call paths | Specific as-built claim reached by current composition. |
| Portability contract seam | R3: 22 current server importers | Specific contract is integrated; full feature behavior is outside this lane. |
| Buddy observer current subsystem | R0: exact declaration/call/path absent across current server scope | Historical “shipped” claim is not current evidence. |
| UI design review authority | R1: direct metadata/current-program contradiction | Archive status needs clarification. |

## Tests and gates

Tests examined: unit 0, integration 0, contract 0, CT 0, e2e 0, type 0. `pnpm check:docs` passed for 104 formatted files, proving Markdown formatting only. This lane found no current content/link/archival-boundary gate with a positive control; `d-citation-integrity` explicitly scopes history out (`docs/architecture/core/Core-Enforcement-Active-Gates.md:103`), which is appropriate for dead D-citations but does not check link reachability or stale as-built metadata.

## Cross-lane edges

- The server foundation/domain lanes should reconcile the buddy observer's removal/replacement decision if current behavior is needed; this lane establishes only the historical-record mismatch.
- The docs-proposed and docs-core-law lanes may decide the canonical archive-status vocabulary and whether a history-link integrity check is warranted.
- The docs-proposed lane owns the target content; this lane verified only that the intended proposal files exist and the history-relative routes do not.

## Tool receipts

See `commands.md`. Structural checks used repository-native `pnpm ast`, with literal scans only as the second method for the `startBuddyObserver` absence claim. The read-only local-link scan checked every owned document and separated three code-example false positives from 11 real target misses. Final SHA/line/byte reconciliation: 32/32 assignment rows match.

## Lane verdict

All 32 assigned history documents were read and still match the frozen assignment. Their broad value is provenance, not current law, and two spot checks demonstrate that some as-built records still point at live seams. Three P3 documentation defects remain: one historical shipped claim points to a missing buddy subsystem, one archived review is marked active, and 11 proposal references broke when records moved under `history/`. The largest uncertainty is the current successor/removal rationale for buddy; that requires its source-owning lane, not an inference from historical prose.
