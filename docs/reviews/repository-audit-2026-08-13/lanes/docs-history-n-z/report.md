# docs-history-n-z audit report

## Lane identity

- Lane: `docs-history-n-z`
- Semantic scope: `docs/history` records N–Z: archived workboard snapshots and dated review/audit provenance. Per [docs/history/README.md:7-12](../../../../../docs/history/README.md), these are reference-only records, never live law.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (assignment).
- Working-tree basis: `dab3c8440f23ee23883897e446fe80e3838c9b29`; all owned paths matched their assigned SHA-256 before and after analysis.
- Assigned files read: 45 / 45 (100%).
- Assigned lines read: 17,237 / 17,237 (100%).
- Assigned bytes read: 1,513,652 / 1,513,652 (100%).
- Dirty assigned paths: 0.
- Exclusions: current source, tests, active law, parked proposals, and sibling audit lanes, except the active history boundary and current documentation formatter used to test archive navigation/metadata claims.

## Read receipt

`read-receipt.tsv` contains every `OWNED` assignment row. Final byte, line, and SHA-256 reconciliation found 0 / 45 drifted paths.

## Architecture observed

The corpus is deliberately provenance, not a specification surface: [docs/history/README.md:7-12](../../../../../docs/history/README.md) permits a document to move here only after every stage/finding is landed or explicitly superseded, and the active workboard points readers to the dated workboard snapshots as archeology ([docs/retro-workboard.md:13-15](../../../../../docs/retro-workboard.md)). The archived workboards themselves retain their former “live board” framing inside explicit archive headers ([docs/history/retro-workboard-2026-08-08.md:1-15](../../../../../docs/history/retro-workboard-2026-08-08.md); [docs/history/retro-workboard-2026-08-09.md:1-20](../../../../../docs/history/retro-workboard-2026-08-09.md)); that is correctly bounded by their paths/headers, not current implementation law.

## Subsystem scorecards

\| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
\| - | -: | -: | -: | -: | -: | - |
\| History N–Z corpus (45 documents) | 3 | 1 | 1 | 1 | 1 | high | 45/45 full-read + hash receipt; 10 failed relative targets; 41/45 formatter failures; archive boundary at [docs/history/README.md:7-12](../../../../../docs/history/README.md). |

## Findings

### DHNZ-01 — Two archived workboards retain ten broken intra-history links

- Severity: P3
- Class: operability-gap
- Confidence: high
- Evidence rung: R1
- Scope denominator: 45 owned Markdown files; every local Markdown target was resolved relative to its owning file. External URLs and fragment-only targets were excluded.
- Receipts: [docs/history/retro-workboard-2026-08-08.md:14](../../../../../docs/history/retro-workboard-2026-08-08.md:14), [docs/history/retro-workboard-2026-08-08.md:122](../../../../../docs/history/retro-workboard-2026-08-08.md:122), [docs/history/retro-workboard-2026-08-08.md:1688](../../../../../docs/history/retro-workboard-2026-08-08.md:1688), and [docs/history/retro-workboard-2026-08-08.md:2297](../../../../../docs/history/retro-workboard-2026-08-08.md:2297) contain four misses; [docs/history/retro-workboard-2026-08-09.md:17-19](../../../../../docs/history/retro-workboard-2026-08-09.md:17), [docs/history/retro-workboard-2026-08-09.md:1093](../../../../../docs/history/retro-workboard-2026-08-09.md:1093), [docs/history/retro-workboard-2026-08-09.md:1095-1096](../../../../../docs/history/retro-workboard-2026-08-09.md:1095), and [docs/history/retro-workboard-2026-08-09.md:1098](../../../../../docs/history/retro-workboard-2026-08-09.md:1098) contain six. The resolver and direct `test -e` check both find the intended four files under `docs/history/` and none under `docs/history/history/` (commands receipt).
- Established fact: The documents use `history/<file>.md` from within `docs/history/`, so Markdown resolves each to a nonexistent nested directory. The intended sibling files exist.
- User or system impact: Readers following retained receipt/archeology links land on missing targets, breaking provenance navigation but not runtime behavior.
- What remains unverified: Anchor validity and local links outside this assigned corpus.
- Suggested next check or fix: Change only the ten relative targets to sibling paths (for example, `retro-workboard-2026-08-08.md`); then run a local-link check. Preserve the surrounding historical content.

### DHNZ-02 — Four archived reviews still declare themselves active

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R1
- Scope denominator: 45 owned documents; 4 review frontmatter status fields matched `active`.
- Receipts: [docs/history/reviews/misc/2026-08-03-archive-rescue-audit-final.md:1-3](../../../../../docs/history/reviews/misc/2026-08-03-archive-rescue-audit-final.md:1), [docs/history/reviews/misc/2026-08-03-archive-rescue-audit-tail.md:1-3](../../../../../docs/history/reviews/misc/2026-08-03-archive-rescue-audit-tail.md:1), [docs/history/reviews/misc/2026-08-07-narrator-live-drive.md:1-3](../../../../../docs/history/reviews/misc/2026-08-07-narrator-live-drive.md:1), and [docs/history/reviews/stickler/2026-08-03-state-anchor-rows.md:1-3](../../../../../docs/history/reviews/stickler/2026-08-03-state-anchor-rows.md:1) say `status: active`; [docs/history/README.md:7-12](../../../../../docs/history/README.md:7) declares this directory reference-only and never live law.
- Established fact: These four historical files carry metadata that conflicts with the archive directory’s current authority boundary. Their in-file date-specific claims remain historical; the defect is the current-looking metadata.
- User or system impact: A cold reader or metadata consumer can mistake a dated review for an active governing record.
- What remains unverified: Whether another consumer intentionally assigns a special non-authority meaning to `status: active`; no such definition was in this lane’s read set.
- Suggested next check or fix: Use an archive-appropriate status or add a header note explaining that the preserved frontmatter is historical and non-authoritative.

### DHNZ-03 — The current Markdown formatter rejects 41 archived documents

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R1
- Scope denominator: 45 owned Markdown documents; `pnpm check:docs` accepted 4 and rejected 41.
- Receipts: `pnpm check:docs <all 45 owned paths>` exited 1 and named 41 files, including all four dated workboards; its script declares the check advisory in [scripts/docs/format-md.ts:10-12](../../../../../scripts/docs/format-md.ts:10). The archive rule says moved records remain intact ([docs/history/README.md:9-12](../../../../../docs/history/README.md:9)).
- Established fact: The corpus does not meet the repository’s current Markdown-format check. Because the archive also preserves past records intact, blindly applying the formatter would alter historical evidence; the two rules need an explicit reconciliation.
- User or system impact: A scoped documentation-format check cannot pass over this corpus, while bulk formatting risks changing preserved provenance.
- What remains unverified: Whether these files are intentionally excluded from any whole-repository documentation gate; this lane did not own verification-harness configuration.
- Suggested next check or fix: Decide whether history is formatter-exempt or should be normalized once with an explicit archival-preservation ruling; do not bulk-format as an incidental repair.

## Proven strengths

None reached R4/R5. The full receipt establishes corpus integrity against the frozen lane snapshot, but checksum agreement is not behavioral proof.

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Archive-only authority boundary | R1: [docs/history/README.md:7-12](../../../../../docs/history/README.md:7) | Clearly declared; no behavioral enforcement was checked in this lane. |
| Archived workboard provenance navigation | R1: 10 local target misses | Incomplete: links cannot reach their intended siblings. |
| Archived review metadata | R1: four `status: active` headers | Misleading against the archive boundary. |
| Current Markdown-format compatibility | R1: scoped `pnpm check:docs` rejects 41/45 | Incomplete; preservation tradeoff remains unresolved. |

## Tests and gates

Tests examined: unit 0, integration 0, contract 0, CT 0, e2e 0, type 0. `pnpm check:docs` is a safe, advisory formatting check, not a content/link or behavioral gate; it failed for 41/45 files. No local-link integrity check or archive-status positive-controlled gate was found in the lane’s assigned scope. The repository-native `pnpm ast` instrument was read and run bare before current-tree checks; no source-code conclusion is made from historical text alone.

## Cross-lane edges

- The docs-core-law/docs-current or verification-harness lanes should decide the archive metadata vocabulary and whether history must be formatter-clean or explicitly exempt.
- A docs-maintenance owner can repair the ten sibling links without changing the substantive historical record.
- This lane intentionally does not assess whether any dated “built” claim remains true in current source; history is provenance, and such verification belongs to the owning executable-code lane.

## Tool receipts

See `commands.md`. The local-link resolver covered all 45 owned files and direct file-existence checks independently verified its four intended targets versus four nonexistent nested targets. Literal `rg` provided the second receipt for all ten link occurrences and all four active-status headers. `pnpm ast` completed normally and printed its supported lens contract. Final line/byte/hash reconciliation: 45/45 exact, with 0 drifted paths.

## Lane verdict

All 45 owned history documents match the frozen assignment and are correctly treated as provenance, not current law. Three P3 documentation-hygiene defects remain: ten broken sibling links across two archived workboards, four archived reviews marked active, and 41 formatter-rejected files. No runtime, security, or current implementation defect is established by this historical lane. The central policy uncertainty is whether archival byte preservation should trump current Markdown normalization; that needs a documentation-law decision.
