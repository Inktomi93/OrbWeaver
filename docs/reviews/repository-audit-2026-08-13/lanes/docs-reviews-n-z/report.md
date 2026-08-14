## Lane identity

- Lane: `docs-reviews-n-z`
- Semantic scope: 30 historical security, side-eye, and stickler reviews dated 2026-07-25 through 2026-08-14.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (assignment).
- Working-tree basis: current bytes recorded in `read-receipt.tsv`; no owned path was dirty. One shared tool prerequisite changed after dispatch.
- Assigned files read: 39 / 39 (30 owned + 9 shared), 100%.
- Assigned lines read: 16,759 / 16,363 snapshot text lines plus 396 lines of current `ast.ts` drift; owned: 11,129 / 11,129, 100%.
- Assigned bytes read: 1,226,418 / 1,203,354 snapshot bytes plus 23,064 bytes of current `ast.ts` drift; owned: 884,502 / 884,502, 100%.
- Dirty assigned paths: 0.
- Exclusions: no production source or test ownership; current source was read only where a review’s claim named it.

## Read receipt

`read-receipt.tsv` covers every path in `assignment.txt`. The receipt intentionally records the current `scripts/codemods/ast.ts` checksum rather than falsely retaining its dispatched checksum; see `commands.md` for the exact drift.

## Architecture observed

The assigned corpus is an evidence archive, not an executable subsystem: its reviews record dated investigations across security, UI, chat, identity, refinery, and operability. The audit protocol explicitly says prior audits are leads until current source and tests verify them (`docs/reviews/repository-audit-2026-08-13/RUBRIC.md:83-89`). One checked lead has already changed: the 2026-08-14 diagnosis describes a bare redirect and uncoordinated recovery as live defects (`docs/reviews/stickler/2026-08-14-staleness-diagnosis.md:33-54`), while current recovery is a cross-tab, three-rung ladder (`packages/client/src/data/stale-session.ts:1-29`) called from both query and mutation error caches (`packages/client/src/data/query-client.ts:56-71`) [R3].

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Historical-review provenance and disposition (30 documents) | 4 | 0 | 1 | 0 | 1 | high | The docs retain detailed dated claims, but no corpus-wide current/historical disposition mechanism; the current recovery implementation contradicts an active-looking diagnosis. `docs/reviews/stickler/2026-08-14-staleness-diagnosis.md:11-76`; `packages/client/src/data/stale-session.ts:1-29` [R3] |

`N/A` applies to wiring because review documents are not runtime components. The scorecard does not score the sibling-owned systems discussed by the reviews.

## Findings

### DOCREV-NZ-01 — historical review verdicts can read as current operational truth

- Severity: P3
- Class: law-drift
- Confidence: high — a current source check already contradicts three “live” status statements; a disposition field or archive policy would raise it from one proven instance to a corpus-wide resolution.
- Evidence rung: R3
- Scope denominator: 30 owned review documents, 11,129 lines / 884,502 bytes; current-code verification was intentionally limited to the named stale-session seam.
- Receipts: `docs/reviews/stickler/2026-08-14-staleness-diagnosis.md:11-14,33-54`; `packages/client/src/data/stale-session.ts:1-29,130-213`; `packages/client/src/data/query-client.ts:56-71`; `pnpm ast ident recoverIfStaleSession --in packages` (5 hits / 3 files, 2,748 scanned); `docs/reviews/repository-audit-2026-08-13/RUBRIC.md:83-89`.
- Established fact: The diagnosis says the recovery is a bare `location.assign("/login")` arrangement, per-tab, without logout propagation. Current code explicitly documents and implements a probe/re-auth/sign-out ladder, Web-Lock single-flight, and broadcast sibling handling; both query and mutation caches invoke it [R3].
- User or system impact: A reader who treats the review corpus as a current status board can prioritize already-addressed defects or repeat investigations, obscuring unresolved work.
- What remains unverified: Whether every listed W1–W10 outcome has tests and whether every older review finding is resolved; those checks belong to their semantic source/test lanes.
- Suggested next check or fix: Give review documents a machine-legible disposition (`historical`, `superseded-by`, or `current-as-of`) and make the workboard link the current authority; do not mass-edit conclusions without a source-lane revalidation.

## Proven strengths

None. `pnpm check:docs` was green, but it is a formatting result and is not R4/R5 behavioral proof of any review conclusion.

## Declared versus completed

| Declared surface | Strongest current evidence | Disposition |
| - | - | - |
| R0/R1 refinery security belts described as landed/green | `refineryGuidanceSchema` is declared and consumed by five current source files (`packages/contracts/src/refinery/index.ts:227`; `packages/server/src/domain/refinery/verbs/iterate.ts:11,35`; 11 structural hits) [R3] | Some named wiring remains, but the historical “GO” verdict itself was not rerun. |
| Macro parser P1 diagnosis | `spanAt` has no current identifier occurrence in the package corpus (2,748 files scanned) [R0 for equivalence, not proof of resolution] | Historical lead only; its replacement semantics were not traced. |
| Stale-session P1/P2 claims | Current ladder + two cache callers [R3] | The cited claims are stale; behavior still needs sibling-owned tests for R4+. |

## Tests and gates

No tests are assigned: unit 0, integration 0, contract 0, CT 0, e2e 0, type 0. `pnpm check:docs` passed for 104 files; it proves formatting only and had no positive control, so it earns no behavioral rung. The historical test-pass counts and green-gate assertions in the corpus remain historical under the rubric.

## Cross-lane edges

- Client-data/client-state or integration-test owners: validate the current stale-session ladder’s probe, local/OIDC, broadcast, and cache-resume arms; this lane established only current wiring [R3].
- Server refinery owners: the former R0/R1 security reports name current `refineryGuidanceSchema` consumers, but no current behavioral rerun was in scope.
- Documentation/core-law owner: reconcile review-document status/provenance with the rubric’s “prior audits are leads” rule.

## Tool receipts

`pnpm ast` usage was read from current `scripts/codemods/ast.ts`. Four targeted `ident` lenses completed over the package corpus; each recorded `ts:2139`, `tsx:607`, `dts:2`, 2,748 scanned and 2,064 `--in` exclusions. The only absence (`spanAt`) is not promoted to a resolution claim. Full command details and the zero tool-failure record are in `commands.md`.

## Lane verdict

All 30 historical-review documents were read and current-byte receipted; no owned document was dirty. The corpus contains useful dated evidence but lacks a reliable visible disposition boundary. One diagnosis already conflicts with current wired source, so its live-sounding claims are stale. No claim that the underlying security, UI, refinery, or chat systems are clean follows from this lane. The largest uncertainty is the status of the many historical findings not revalidated by their owning source/test lanes.
