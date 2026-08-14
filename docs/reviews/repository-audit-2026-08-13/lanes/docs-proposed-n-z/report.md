## Lane identity

- Lane: `docs-proposed-n-z`
- Semantic scope: 32 proposed/parked design documents from `INDEX.md` through `world-state-clips-trackers-spec.md`.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: every assigned byte matched that snapshot at receipt time.
- Assigned files read: 32 / 32 (100%).
- Assigned lines read: 7,374 / 7,374 (100%).
- Assigned bytes read: 541,210 / 541,210 (100%).
- Dirty assigned paths: 0.
- Exclusions: source code, tests, and unassigned proposed documents; the current board and core law were read solely as authority controls for status claims.

## Read receipt

`read-receipt.tsv` covers every OWNED row in `assignment.txt`: 32/32 files, 7,374/7,374 lines, and 541,210/541,210 bytes. Every SHA-256 matches its assignment row.

## Architecture observed

This corpus is a proposal/reference layer, not a production composition root. Its own index says that program dispositions are historical/reference classifications and directs readers to re-verify set-internal status lines (`docs/architecture/proposed/INDEX.md:3-7`, R1). Current authority supersedes the corpus: core law identifies `docs/retro-workboard.md` as the active program and says it supersedes the UI-cohesion proposal (`docs/architecture/core/AGENTS.md:77-79`, R3 as a law-routing fact), while the board says proposed documents are pre-rollback rebuild reference and must never supply current status (`docs/retro-workboard.md:3-10`, R3 as the current-state routing fact).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Proposed-program status routing (32 files) | 0 | 0 | 0 | 0 | 0 | high | `docs/architecture/proposed/README.md:9-20`; `docs/architecture/core/AGENTS.md:77-79`; `docs/retro-workboard.md:3-10` |

Scores describe whether this corpus is a current executable/program authority, not the historical design quality or implementation of its proposed features. The receipt proves the documents exist and were read (R1); no current source/test/e2e evidence was collected for their historical implementation statements.

## Findings

### DOCS-PROPOSED-N-Z-01 — proposed README names a superseded active program

- Severity: P2
- Class: law-drift
- Confidence: high — current core law and current workboard agree, and both expressly supersede/forbid the conflicting status source.
- Evidence rung: R3
- Scope denominator: 32 assigned documents; the direct contradiction is the corpus entry point, `docs/architecture/proposed/README.md`.
- Receipts: `docs/architecture/proposed/README.md:9-18` says one program is active and names `ui-cohesion-north-star.md`; `docs/architecture/core/AGENTS.md:77-79` says all design sets are parked and the workboard supersedes that file; `docs/retro-workboard.md:3-10` says proposed docs are pre-rollback rebuild reference and must never be cited as current.
- Established fact: opening the proposed corpus directs a cold reader to treat the UI-cohesion document as the active build authority, but the controlling law and current-state board say the active program is the workboard and proposed status is non-current.
- User or system impact: a reader following the README can schedule or implement against a superseded plan, bypassing the current queue and owner rulings. This is an authority-routing defect, not evidence that the underlying UI work is absent.
- What remains unverified: the audit did not establish whether every UI-cohesion task is represented on the board; that is outside this lane.
- Suggested next check or fix: replace the active-program claim with an explicit redirect to `docs/retro-workboard.md`; preserve the proposed document as a historical/rebuild reference only.

### DOCS-PROPOSED-N-Z-02 — `status: active` metadata contradicts the parked/reference posture

- Severity: P3
- Class: law-drift
- Confidence: medium — the field could mean document-maintenance status rather than program activity, but nothing in the corpus defines that alternate meaning and it appears on all proposal files.
- Evidence rung: R1
- Scope denominator: 30/32 assigned files carry exact `status: active` frontmatter, including all plugin, RPG, tool-use, saved-roster, UI-cohesion, and world-state proposal documents; the assigned-only scan receipt is in `commands.md`.
- Receipts: `docs/architecture/proposed/plugin-design/README.md:3`; `docs/architecture/proposed/rpg-design/README.md:3`; `docs/architecture/proposed/tool-use-design/README.md:3`; `docs/architecture/proposed/ui-cohesion-north-star.md:3`; contrasted with `docs/architecture/proposed/README.md:9-20` and `docs/retro-workboard.md:3-10`.
- Established fact: the corpus-wide metadata advertises `active` while its entry point describes all but one program as parked, and current authority demotes the entire corpus to non-current reference.
- User or system impact: status-aware tooling or cold readers can treat a parked design as live work. The ambiguity defeats the index's own warning that internal status lines rot (`docs/architecture/proposed/INDEX.md:6-7`).
- What remains unverified: whether any external parser consumes this frontmatter. No such use was claimed.
- Suggested next check or fix: define the metadata vocabulary, then change proposal documents to a non-current/reference state (or rename the field if it intentionally means document maintenance rather than program authority).

## Proven strengths

None claimed. `pnpm check:docs` passed, but no positive control was run and formatting is not evidence of current proposal authority or feature behavior.

## Declared versus completed

| Declared surface | Strongest current evidence | Classification |
| - | - | - |
| Plugin design set | R1: proposal files and a `FUTURE`/paper disposition in the proposal index | Design reference only; no implementation claim promoted. |
| RPG design set | R1: proposal files and an index `FUTURE` disposition | Design reference only; no implementation claim promoted. |
| Tool-use design set | R1: proposal files and an index `PARTIAL` historical disposition | Historical lead only; current implementation was not re-verified. |
| Saved rosters / spatial maps / world-state | R1: proposal artifacts | Design/reference only; no implementation claim promoted. |
| UI cohesion north star | R1: proposal artifact; its former active status is contradicted by R3 authority controls | Superseded as active authority; historical/rebuild reference. |

## Tests and gates

No assigned test files exist. `pnpm check:docs` passed as a current formatter check, and 39 assigned local-file links resolve; neither proves proposal truth, implementation, wiring, or behavior. No registered gate was found in the assigned corpus that enforces the correct active/parked authority routing.

## Cross-lane edges

- The synthesis lane should reconcile this P2/P3 documentation authority drift with the `docs/retro-workboard.md` and core-law lanes. The recommendation is intentionally not an assertion that proposal content should be deleted or that its described features are unimplemented.
- No source/test lane is asked to action an implementation defect from this report.

## Tool receipts

`pnpm ast` completed successfully and established the repository-native structural instrument; no code-specific claim required another AST lens. `pnpm check:docs` exited 0. The assigned-only link scan checked 39 local links with zero broken. The command log records the one discarded scope-escape and the corrected rerun.

## Lane verdict

All 32 assigned proposal documents were read against the assignment snapshot with exact hash agreement. Their local Markdown formatting and relative-file links are currently clean. The corpus is not a current execution authority: its README still names a UI-cohesion active program that core law and the workboard explicitly supersede, and 30 files retain ambiguous `status: active` metadata. No historical feature-completion claim was accepted as current implementation evidence.
