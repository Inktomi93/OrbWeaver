## Lane identity

- Lane: `client-content-features`
- Semantic scope: client databank, discovery/corpus, workloads/backup, world-info, and their assigned tests.
- Snapshot commit: formal rolling assignment `41e18afe74afa570b67a3e670a1a38863c486a00`; its 133 rows/counts match the previously used manifest-owned denominator.
- Working-tree basis: current working-tree bytes; all 133 manifest SHA-256 values reconciled at receipt time.
- Assigned files read: 133 / 133 (100%).
- Assigned lines read: 13,804 / 13,804 (100%).
- Assigned bytes read: 666,239 / 666,239 (100%).
- Dirty assigned paths: 0 at final reconciliation.
- Exclusions: cross-feature shell/data/state implementation, server procedures/contracts, test harness, and enforcement implementations belong to other lanes.

## Read receipt

`read-receipt.tsv` covers every assigned path. The formal rolling `assignment.txt` was staged after the original lane run; its 133-file, 13,804-line, 666,239-byte denominator matches the receipt and is the lane authority.

## Architecture observed

The four feature doors expose local definitions rather than importing sibling features: corpus exports its section and panels at `packages/client/src/features/discovery/index.ts:7`; workloads exports its settings panes and contributions at `packages/client/src/features/workloads/index.ts:6`; world-info exports its collection/settings contributions at `packages/client/src/features/world-info/index.ts:7`; databank exports its rail section, modal, and home tile at `packages/client/src/features/databank/index.ts:13`.

The client composition root imports each feature through those doors at `packages/client/src/main.tsx:61` and `packages/client/src/main.tsx:92`, registers corpus and databank in the closed section registry at `packages/client/src/main.tsx:244` and `packages/client/src/main.tsx:246`, registers world-info in Configuration at `packages/client/src/main.tsx:233`, and registers workloads/backup settings contributions and panes at `packages/client/src/main.tsx:322` and `packages/client/src/main.tsx:351`. Native structural importer scans independently show 58 discovery, 78 workloads, and 28 world-info import edges under `packages/client/src`, each including `main.tsx` (commands receipt).

## Subsystem scorecards

| Subsystem (assigned denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| Databank (27 source, 8 tests) | 4 | 4 | 5 | 3 | 3 | high | Feature door/composition; 26 model assertions plus current assigned CT scope in the 115/115 pass. |
| Discovery / Corpus (25 source, 9 tests) | 4 | 4 | 5 | 3 | 3 | high | Door exports and section registration; 4 chart assertions plus current assigned CT scope in the 115/115 pass. |
| Workloads / Backup (38 source, 14 tests) | 4 | 4 | 5 | 3 | 3 | high | Door/composition; 28 focused unit assertions plus current assigned CT scope in the 115/115 pass. |
| World Info (18 source, 7 tests) | 4 | 4 | 5 | 3 | 3 | high | Door and collection/settings registration; current assigned CT scope in the 115/115 pass. |

## Findings

No product or instrument defect met the evidence threshold. The earlier in-flight component-test state is resolved by the coordinator's exact 22-file run: 115/115 passed with zero failures, flakes, or skips.

## Proven strengths

### CCF-01 — Databank derives and tests stalled-ingest behavior

- Class: proven-strength
- Confidence: high
- Evidence rung: R4
- Scope denominator: databank model (1 source file, 1 unit file).
- Receipts: `packages/client/src/features/databank/lib/databank-model.ts:86`; `packages/client/src/features/databank/lib/databank-model.ts:125`; `tests/client/features/databank/lib/databank-model.test.ts:68`; `tests/client/features/databank/lib/databank-model.test.ts:111`; current scoped Vitest result: 26 passing assertions.
- Established fact: phase, poll-stop, and remediation-hint boundaries are unit-tested instead of inferred from UI text.
- User or system impact: a frozen ingest is presented as an actionable stalled state rather than an indefinite queued state.
- What remains unverified: live server/e2e evidence for the whole browser flow.
- Suggested next check or fix: none within this lane.

## Declared versus completed

| Declared surface | Strongest current evidence |
| - | - |
| Databank rail, modal, and home tile | R3 composition; R4 model suite; R5 current CT. |
| Corpus rail section | R3 composition; R4 chart model; R5 current CT. |
| Workloads and backup panes | R3 composition; R4 pure models; R5 current CT. |
| World-info collection and settings section | R3 composition; R5 current CT. |

## Tests and gates

The exact assigned unit subset passed 7 files / 58 assertions (R4 for directly tested pure models). The current exact 22-file CT command passed 115/115 with zero failures, flakes, or skips (R5). Neither establishes live server semantics. Closed registry composition supplies type-level enforcement for registration sets, but the implementation of that gate/registry contract is outside this lane; score 3 is intentionally limited.

## Cross-lane edges

- Server-domain lanes own whether each tRPC procedure invoked by these clients fulfills its semantic contract; this lane established only client call/composition reach.
- Live server/e2e behavior remains a cross-lane boundary despite the current component proof.
- The gates lanes own the front-door and closed-registry enforcement mechanisms; this lane observed their consumers only.

## Tool receipts

Native `pnpm ast importers` scans are in `commands.md`; no direct ast-grep negative was used. The first AST command was a usage error and is explicitly excluded from evidence. The coordinator exact-scope CT result is current and terminal.

## Lane verdict

The current client root composes all four assigned feature families through their front doors, with corpus/databank rail registration and world-info/workloads contribution registration proven at R3. Databank/workloads/discovery have focused current unit proof, and all 22 assigned CT files pass 115/115 at R5. No product or instrument defect was established. Live server/e2e behavior remains outside this lane.
