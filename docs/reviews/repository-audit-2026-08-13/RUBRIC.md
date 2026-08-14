---
kind: reference
status: active
updated: 2026-08-13
---

# Repository audit rubric

## Coverage metrics

Every report begins with exact denominators:

| Metric | Required value |
| - | - |
| Assigned files read | `read / assigned`, must be 100% |
| Assigned bytes read | `bytes / assigned bytes`, must be 100% |
| Assigned lines read | `lines / assigned text lines`, must be 100%; binary lines are `N/A` |
| Dirty assigned files | count + paths |
| Structural scan coverage | scanned-file count per language and excluded-file count |
| Tests examined | count by unit, integration, contract, CT, e2e, and type test |
| Commands with tool failure | count + exact failure |
| Long-running AST commands | elapsed time + completion or final timeout |

## Evidence rung

Every implementation claim carries one rung and `path:line` receipts:

| Rung | Evidence established |
| - | - |
| R0 | No evidence or search could not be completed |
| R1 | Path or matching name exists |
| R2 | Symbol is declared or exported |
| R3 | A resolved import, registration, or live call path reaches it |
| R4 | A meaningful test asserts the behavior or failure path |
| R5 | A current integration, CT, e2e, live-runtime, or positive-controlled gate receipt proves it |

Reports never describe a higher rung than they proved. Historical green claims remain historical until reproduced or explicitly labeled historical.

## Subsystem scorecard

Each audited subsystem receives five independent scores. Do not average them into a single grade.

| Score | Implementation | Wiring | Verification | Enforcement | Operability |
| - | - | - | - | - | - |
| 0 | absent or contradicted | unreachable | no meaningful tests | prose only or absent | cannot identify a runnable path |
| 1 | named scaffold or placeholder | export only | existence or tautology tests | convention only | manual/undocumented path |
| 2 | local happy path implemented | referenced but composition unclear | focused happy-path unit tests | lint or review rule | runnable with unverified assumptions |
| 3 | main and error paths implemented | live composition or dispatch path | meaningful unit/contract coverage | types or package boundaries reject a class | documented run path with health checks |
| 4 | boundary and lifecycle behavior complete in audited scope | all declared variants registered and consumed | integration/CT covers boundaries and failures | registered gate with a proven positive control | current integration or e2e receipt |
| 5 | no identified implementation remainder in scope | live reachability proven end-to-end | current behavioral and regression proof across coupled sites | violation is impossible at the earliest practical tier and backstopped | current live-runtime evidence, recovery path, and observability |

`N/A` is allowed only with a reason. A score requires at least one receipt; scores 4–5 require at least two independent receipts.

## Finding severity

| Severity | Meaning |
| - | - |
| P0 | active data loss, auth bypass, secret exposure, destructive operation, or unusable core path |
| P1 | major correctness failure, silently incomplete feature, broken architectural boundary, or release blocker |
| P2 | real defect or proof gap with bounded impact or workaround |
| P3 | maintainability, legibility, stale-law, or tooling-quality defect without current behavior impact |

Severity measures impact, not confidence. Every finding separately states confidence as `high`, `medium`, or `low` and explains what would raise it.

## Required classifications

Each finding is exactly one primary class:

- `behavior-defect`
- `declared-not-wired`
- `declared-not-tested`
- `gate-blind-spot`
- `test-quality`
- `architecture-drift`
- `law-drift`
- `operability-gap`
- `instrument-defect`
- `proven-strength`

`proven-strength` entries use the same evidence rules as defects. A clean result is a finding only when the instrument had a positive control and non-zero coverage.

## Report discipline

- Every load-bearing sentence includes `path:line`, the command or full-read basis, and its evidence rung.
- Every absence states scanned counts, exclusions, and the second method.
- Every score names the subsystem denominator and does not silently generalize beyond assigned files.
- Existing TODOs, board rows, and prior audits are leads until the current source and tests verify them.
- Contradictions between code, tests, gates, law, and the workboard are first-class findings.
- Proposed fixes are optional and must be separated from factual findings.
