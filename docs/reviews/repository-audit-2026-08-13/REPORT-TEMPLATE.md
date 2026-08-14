---
kind: reference
status: active
updated: 2026-08-13
---

# Lane report template

## Lane identity

- Lane:
- Semantic scope:
- Snapshot commit:
- Working-tree basis:
- Assigned files read:
- Assigned lines read:
- Assigned bytes read:
- Dirty assigned paths:
- Exclusions:

## Read receipt

State whether `read-receipt.tsv` covers 100% of `assignment.txt`. If not, stop the report here and list every unread file.

## Architecture observed

Describe only boundaries established from full reads. Include package direction, composition roots, registrations, runtime entry points, and non-import reach mechanisms with receipts.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |

## Findings

One subsection per finding:

### `<LANE>-<NN>` — title

- Severity:
- Class:
- Confidence:
- Evidence rung:
- Scope denominator:
- Receipts:
- Established fact:
- User or system impact:
- What remains unverified:
- Suggested next check or fix:

## Proven strengths

List only positive findings that reached R4 or R5.

## Declared versus completed

Map declared surfaces to their strongest evidence rung. Name scaffolds, unwired code, and tested live paths separately.

## Tests and gates

Assess assertion quality, error-path coverage, integration depth, gate registration, positive controls, and blind spots. A green static gate is not behavioral proof.

## Cross-lane edges

List dependencies or contradictions another lane must reconcile. Do not inspect sibling-owned files beyond shared prerequisites; cite the edge and hand it off.

## Tool receipts

Summarize `pnpm ast` lenses used, structural scan counts, literal cross-checks, excluded paths, and failures. Full command output belongs in `commands.md`.

## Lane verdict

Maximum ten lines. State what is demonstrably complete, what is demonstrably incomplete, and the largest remaining uncertainty without assigning a single overall grade.
