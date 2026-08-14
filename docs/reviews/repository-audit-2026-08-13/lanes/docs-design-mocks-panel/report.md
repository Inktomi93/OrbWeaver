## Lane identity

- Lane: `docs-design-mocks-panel`
- Semantic scope: the 2026-07-27 panel-redesign mock gallery and its rationale; design evidence, not a claim of visual implementation.
- Snapshot commit: assignment `41e18afe74afa570b67a3e670a1a38863c486a00`; working-tree read basis `dab3c8440f23ee23883897e446fe80e3838c9b29`.
- Assigned files read: 18 / 18 (100%).
- Assigned lines read: 14,314 / 14,314 logical lines (100%; see receipt convention note below).
- Assigned bytes read: 1,369,215 / 1,369,215 (100%).
- Dirty assigned paths: 0.
- Exclusions: all source/test implementation and non-panel documentation are outside this lane; focused reads below only test mock claims against the current implementation.

## Read receipt

`read-receipt.tsv` covers every owned assignment path and all SHA-256 values match `assignment.txt`. `wc -l` is 14,298, not the assignment's 14,314, solely because 16 HTML files have an unterminated final line while the assignment counts logical lines; byte and hash totals reconcile exactly.

## Architecture observed

The mock set intends a contributor-registered RPG context panel with game and meta rails (`docs/design/mocks/panel-redesign/DESIGN.md:9-20`, R1 design intent). Current code supplies the contributor definitions through `makeRpgContextTabs`, with Status, Inventory, Scene, Quests, Journal, Map, and host-only Game; it explicitly makes Sheet a Status state rather than a tab (`packages/client/src/features/rpg/lib/rpg-context-section.tsx:1-16,74-169`, R3). The current Map remains a visible coming-soon surface that opens its honest empty state (`packages/client/src/features/rpg/lib/rpg-context-section.tsx:119-133`, `packages/client/src/features/rpg/components/rpg-map-tab.tsx:1-33`, R3). This is implementation evidence for these precise comparisons, not proof that the mock visual design shipped.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| Panel-redesign documentation/mocks (18 artifacts) | 3 | 1 | 2 | 1 | 3 | high | `DESIGN.md:1-20,311-331`; all owned artifact hashes; `pnpm check:docs` |

Scores describe the documentation deliverable only. It has a coherent, openable gallery and documented intent, but stale mock semantics prevent a higher implementation/truth score; there is no gallery behavioral/visual test in this lane's evidence.

## Findings

### `docs-design-mocks-panel-01` — Gallery still makes Sheet a top-strip tab after its current replacement

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R3
- Scope denominator: 18 owned mock artifacts; the outdated top strip is present in the gallery aggregate and the individual Map mock checked here.
- Receipts: `docs/design/mocks/panel-redesign/DESIGN.md:92-98,117-127`; `docs/design/mocks/panel-redesign/all-tabs.html:270,1250`; `docs/design/mocks/panel-redesign/map.html:387`; `packages/client/src/features/rpg/lib/rpg-context-section.tsx:1-16,74-134`.
- Established fact: the mock bracket and gallery include `Sheet` as a peer game tab; current contributor code deliberately omits it and states that expanding Status is the sheet state.
- User or system impact: a reader using the gallery as a build spec can reintroduce a rejected navigation shape or file an implementation gap that does not exist.
- What remains unverified: no visual regression or product analytics were run; this does not prove all Sheet behavior is complete.
- Suggested next check or fix: label the gallery as superseded for navigation, or refresh the shared strip fixture and Sheet page to describe Status expansion.

### `docs-design-mocks-panel-02` — Locked Map mock contradicts current interactive coming-soon behavior

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R3
- Scope denominator: 18 owned mock artifacts; Map-specific claim and its aggregate reproductions.
- Receipts: `docs/design/mocks/panel-redesign/DESIGN.md:173-178,300-302`; `docs/design/mocks/panel-redesign/map.html:315-316,387,684-688`; `packages/client/src/features/rpg/lib/rpg-context-section.tsx:119-133`; `packages/client/src/features/rpg/components/rpg-map-tab.tsx:1-33`.
- Established fact: the mocks prescribe `aria-disabled` and frame Map as unavailable until MA-3. Current code intentionally allows click/Enter to open an honest locked-state body and explains that `aria-disabled` would tell a second, contradictory story.
- User or system impact: the design evidence now recommends accessibility semantics that conflict with the implemented interaction model; an implementer can regress keyboard/activation behavior by following it literally.
- What remains unverified: whether the current component's rendered ARIA attributes and interaction pass a browser accessibility audit.
- Suggested next check or fix: update the mock rationale and gallery copy to distinguish a visible locked destination from a disabled tab; do not claim the mock is a current accessibility specification.

### `docs-design-mocks-panel-03` — Plot rail is labeled P5/no-plane although it is wired to the snapshot plane

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R3
- Scope denominator: 18 owned mock artifacts; the Quests mock and rationale state the obsolete P5/no-data condition.
- Receipts: `docs/design/mocks/panel-redesign/DESIGN.md:417-420,457-460,611`; `docs/design/mocks/panel-redesign/quests.html:316,390-391,585-591`; `packages/client/src/features/rpg/components/rpg-act-rail.tsx:1-20,59-119`; `packages/client/src/features/rpg/components/rpg-quests-tab.tsx:35,297` (native AST `refs RpgActRail`, R3).
- Established fact: the mock calls the act rail a P5 future target because no plot plane exists. Current `RpgActRail` consumes `RpgPlot`, and the Quests tab renders it when `tracker.plot` is non-null.
- User or system impact: the gallery underreports a now-wired design surface and is unsafe as a completion/status artifact.
- What remains unverified: full server-to-client population of every plot variant and browser-level rendering; this is not an R4/R5 claim.
- Suggested next check or fix: annotate the mock's snapshot date/status or update its P5 notes to the current nullable-plane behavior.

### `docs-design-mocks-panel-04` — Assignment line denominator uses a different line-count convention without stating it

- Severity: P3
- Class: instrument-defect
- Confidence: high
- Evidence rung: R2
- Scope denominator: all 18 owned assigned artifacts.
- Receipts: `docs/reviews/repository-audit-2026-08-13/lanes/docs-design-mocks-panel/assignment.txt:1-22`; current receipt hashes in `read-receipt.tsv`; `wc -l -c` result recorded in `commands.md`.
- Established fact: the assignment says 14,314 lines, while POSIX newline counts total 14,298; all hashes and all 1,369,215 bytes exactly match. The 16 HTML final lines lack an LF, so this is an undocumented logical-lines versus newline-count mismatch rather than content drift.
- User or system impact: a receipt validator using `wc -l` will falsely mark a complete lane under-covered.
- What remains unverified: which audit manifest generator selected the logical-line convention; it is outside this lane.
- Suggested next check or fix: have the audit harness label its convention or emit both logical and LF-terminated line counts.

## Proven strengths

- `pnpm check:docs` currently accepts the Markdown corpus (R5 check receipt limited to formatting, not implementation truth).

## Declared versus completed

| Declared surface | Strongest current evidence | Status |
| - | - | - |
| Contributor-registered game panel | R3: `makeRpgContextTabs` has live game/meta definitions | wired, but mock topology is stale (Sheet) |
| Map locked destination | R3: live context definition renders `RpgMapTab` | implemented as interactive coming-soon, not mock-disabled |
| Host veiled ledger | R3: header/ledger use `rpg.revealHidden` | wired source evidence only; no behavioral run in this lane |
| Plot act rail | R3: Quests consumes `tracker.plot` and renders `RpgActRail` | wired source evidence; mock status is stale |
| Waystone/gallery visuals | R1: static mock HTML and rationale | design evidence only; no implementation claim |

## Tests and gates

No assigned test files exist. `pnpm check:docs` passed, but it is a formatting check and does not validate mock-to-source freshness, HTML semantics, or visual behavior. The focused `pnpm ast` receipts establish named source relationships only; no R4/R5 product behavior is claimed.

## Cross-lane edges

- `client-content-features` / `ui-content`: reconcile current browser/a11y behavior for the interactive Map tab; this lane only establishes documentation drift.
- Audit coordinator/tooling lane: preserve the logical-line convention or document it, because a literal `wc -l` receipt differs by 16 despite complete byte/hash agreement.

## Tool receipts

Native AST results and scan counts, the two over-yield partial-command exclusions, hash reconciliation, and the documentation-check result are recorded in `commands.md`. No structural absence claim relies on a timed-out command.

## Lane verdict

All 18 assigned artifacts match the lane snapshot bytes and form a coherent, openable design gallery. The gallery is not current implementation evidence. Three high-confidence P3 documentation/provenance defects make it unsafe as a literal build/status specification: Sheet remains a peer tab in mocks, Map remains `aria-disabled`, and the plot rail remains P5/no-plane. The main uncertainty is behavioral: no browser or integration receipt was authorized in this documentation lane.
