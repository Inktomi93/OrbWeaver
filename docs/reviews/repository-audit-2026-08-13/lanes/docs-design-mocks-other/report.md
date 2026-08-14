## Lane identity

- Lane: `docs-design-mocks-other`
- Semantic scope: 26 frozen design/mock artifacts outside the separately owned `panel-redesign/` set.
- Snapshot commit: assignment `41e18afe74afa570b67a3e670a1a38863c486a00`; bytes audited on working tree `dab3c8440f23ee23883897e446fe80e3838c9b29`.
- Working-tree basis: all 26 assigned hashes equal `assignment.txt`; no assigned path differs from `HEAD` (receipt and command log).
- Assigned files read: 26 / 26 (100%).
- Assigned lines read: 9,610 / 9,610 logical text lines (100%).
- Assigned bytes read: 679,597 / 679,597 (100%).
- Dirty assigned paths: 0.
- Exclusions: `docs/design/mocks/panel-redesign/**` is sibling-owned; mock markup is design evidence, never evidence that UI is bundled, wired, or accessible.

## Read receipt

`read-receipt.tsv` covers every `OWNED` row in `assignment.txt`, with current SHA-256 equality. The two SVG newline-count discrepancy is presentation-only: each has nine logical lines but no trailing newline, so `wc -l` reports eight; bytes and hashes match the frozen assignment.

## Architecture observed

The corpus itself sets the boundary: standalone HTML drawings are neither built, bundled, nor served, and mock-only inline styles/SVG are exempt from build a11y/token obligations; design rulings override drawings ([docs/design/mocks/README.md:3-6](../../../../design/mocks/README.md#L3-L6), [docs/design/mocks/README.md:30](../../../../design/mocks/README.md#L30), R2). This audit therefore treats only explicit provenance/status claims and source references as auditable assertions. `CompareBlocks` is a real UI primitive and is reached by a real refinery component ([packages/client/src/features/refinery/components/accept-review.tsx:14](../../../../../packages/client/src/features/refinery/components/accept-review.tsx#L14), [packages/client/src/features/refinery/components/accept-review.tsx:107](../../../../../packages/client/src/features/refinery/components/accept-review.tsx#L107), `pnpm ast refs CompareBlocks`, R3); that does not make the drawing in [docs/design/mocks/refinery/surface.html:467](../../../../design/mocks/refinery/surface.html#L467) shipped UI.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Frozen mock corpus (26 files) | 5 | 0 | 2 | 2 | 2 | high | Complete/hash-matched receipt; standalone/not-served boundary at `docs/design/mocks/README.md:3-6`; `pnpm check:docs` exit 0. |
| Explicit mock-to-source claims examined (CompareBlocks/RPG context) | 3 | 3 | 2 | 1 | 1 | high | `pnpm ast refs CompareBlocks` (11 complete hits); `pnpm ast refs RpgTurnContext` (20 complete hits); source and CT test reads recorded in `commands.md`. |

## Findings

### DOCS-DESIGN-MOCKS-OTHER-01 — README links HOME drawing to a removed spec path

- Severity: P3
- Class: law-drift
- Confidence: high — it would be raised further only by a maintained redirect at the old path.
- Evidence rung: R1
- Scope denominator: 1 explicit README relative specification link; all 26 assigned paths were read.
- Receipts: [docs/design/mocks/README.md:17](../../../../design/mocks/README.md#L17); exact `test -e` target check; `rg --files docs/design` scanned 146 files and found no `home-section-spec.md`; literal `rg` instead finds the historical target in `docs/history/design/home-section-spec.md`.
- Established fact: the README names `../home-section-spec.md`, resolving to absent `docs/design/home-section-spec.md`; the documented HOME drawing cannot reach its stated spec.
- User or system impact: a builder/auditor following the drawing's stated provenance lands on a dead path and loses the status context that was moved into history.
- What remains unverified: whether an intentional redirect is planned outside the current tree.
- Suggested next check or fix: update the README to the historical spec path (and label it historical) or replace it with the current law/implementation pointer.

### DOCS-DESIGN-MOCKS-OTHER-02 — Refinery drawing preserves a now-false consumer census

- Severity: P3
- Class: law-drift
- Confidence: high — a fresh `pnpm ast` source-aware lookup, rather than the drawing's historical ast-grep count, proves the current production consumer.
- Evidence rung: R3
- Scope denominator: 1 explicit source-status assertion in the 6 assigned refinery drawings; 4,908 TypeScript/TSX corpus files scanned by `pnpm ast`.
- Receipts: [docs/design/mocks/refinery/accept-ergonomics.html:501](../../../../design/mocks/refinery/accept-ergonomics.html#L501) says `CompareBlocks` has “no production consumer”; [packages/client/src/features/refinery/components/accept-review.tsx:14](../../../../../packages/client/src/features/refinery/components/accept-review.tsx#L14) imports it and [packages/client/src/features/refinery/components/accept-review.tsx:107](../../../../../packages/client/src/features/refinery/components/accept-review.tsx#L107) renders it; `pnpm ast refs CompareBlocks --max 100` completed with 11 hits/4,908 scanned (R3).
- Established fact: the mock's source-backed census is stale. Current code has a non-test consumer; the primitive also has CT test coverage, but no test execution is claimed here.
- User or system impact: the drawing can falsely present an already-integrated primitive as unwired, encouraging duplicate implementation or an incorrect R3 completion assessment.
- What remains unverified: whether every refinery surface proposed by the drawings is implemented; that conclusion is explicitly outside this mock-only lane.
- Suggested next check or fix: change the sentence to an as-of-dated historical claim or reconcile it with the current `AcceptReview` consumer.

## Bounded document observations (not proven strengths)

- The README clearly fences drawings from runtime evidence and directs conflicts to rulings, so their inline code cannot be mistaken for shipped UI ([docs/design/mocks/README.md:3-6](../../../../design/mocks/README.md#L3-L6), [docs/design/mocks/README.md:30](../../../../design/mocks/README.md#L30), R2).
- The login/loading artifacts carry a narrow, checkable provenance statement to the shipped favicon rather than claiming their standalone HTML is served ([docs/design/mocks/README.md:23](../../../../design/mocks/README.md#L23), R2). No stronger runtime claim was made because this lane did not trace the favicon build surface.

## Declared versus completed

| Declared surface | Strongest current evidence | Classification |
| - | - | - |
| Configuration rail and refinery mock phases | R2 design declarations only; the README explicitly calls them mock phase ([docs/design/mocks/README.md:20-21](../../../../design/mocks/README.md#L20-L21)) | Design evidence, not shipped UI. |
| Login/loading web-weave | R2 documentation declaration at [README:23](../../../../design/mocks/README.md#L23); no runtime tracing in this lane | Claimed built, outside-source verification deferred. |
| Rpg extraction-context proposal | R3 for its named `RpgTurnContext` successor: 20 complete structural refs including chat and rpg (`commands.md`) | The historical design has current code correspondence, but this is not end-to-end proof of the whole 951-line plan. |
| CompareBlocks availability | R3 current client import and JSX rendering; R4 test files examined but not executed | Primitive is consumed; its surrounding drawings remain non-runtime references. |

## Tests and gates

Two relevant Playwright CT files were read: `tests/ui/primitives/compare-blocks/compare-blocks.ct.tsx` and `tests/client/features/refinery/components/accept-review.ct.tsx`; they contain meaningful interaction assertions, but were not run, so they provide no current R5 receipt. No tests are assigned to the mock artifacts, which are unserved drawings. `pnpm check:docs` passed (`104 file(s) formatted`); this only verifies Markdown format and is not behavioral proof. Mock HTML is deliberately excluded from Biome/a11y/token obligations by [docs/design/mocks/README.md:3-6](../../../../design/mocks/README.md#L3-L6).

## Cross-lane edges

- `docs-current` / relevant client UI lane: reconcile the broken HOME-spec pointer and decide the canonical status pointer for the built HOME program.
- `client-content-features` / `ui-primitives-*`: the stale `CompareBlocks` “no production consumer” statement conflicts with current `AcceptReview` source reach; this lane makes no broader claim about refinery surface completion.
- `server-rpg` / `client-rpg-settings`: `RpgTurnContext` is currently structurally live, but the crunchy document's many dated design assertions require a code/domain owner to assess behavior and test coverage.

## Tool receipts

`pnpm ast` was read and invoked bare before structural lookup. `refs CompareBlocks`, `refs RpgTurnConnection`, and `refs RpgTurnContext` all completed with 4,908 scanned TS/TSX files; only the first and third are positive evidence. The HOME negative path claim has both exact filesystem resolution and a 146-file `docs/design` literal-path inventory. No tool failures occurred. Complete commands/results are in `commands.md`.

## Lane verdict

All 26 assigned mock/design artifacts were read and hash-match the lane snapshot. The corpus correctly states that mock markup is not product code and therefore cannot prove UI implementation. Two provenance assertions need cleanup: the HOME spec link is dead, and the refinery drawing's no-consumer census is stale against a current production `AcceptReview` consumer. The biggest remaining uncertainty is intentional: only the owning client/server lanes can prove the designs' proposed flows are actually implemented and behaviorally verified.
