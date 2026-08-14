# Gates I–P audit

## Lane identity

- Lane: `gates-i-p`
- Semantic scope: 91 active structural-gate descriptors plus `no-hardcoded-model-prose` and `no-test-fabrication` ratchet baselines.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: all owned files match the manifest hash; no owned paths were dirty.
- Assigned files/lines/bytes read: 93 / 93; 15,488 / 15,488; 764,749 / 764,749.
- Exclusions: runner and fixture-harness implementation are cross-lane; their official command receipts were used without a full read.

## Read receipt

`read-receipt.tsv` covers every `OWNED` row in `assignment.txt`, with matching SHA-256, line, and byte totals.

## Architecture observed

Each TypeScript artifact declares and exports `gate: GateDescriptor` (R2); discovery is glob-based and descriptor validation is fail-closed, rather than a manual registration list (`scripts/check/GATE-AUTHORING.md:17-47`). The descriptor contract requires `mustFlag` and `mustPass` (`scripts/check/GATE-AUTHORING.md:17-37`); the current conformance suite proved those examples for all contract-form descriptors, while the fixture suite proved every registered gate fires (R5; commands receipt). The live structural pass loaded 200 gates, including the 91 owned descriptor names, with no tool errors or findings (R5; `reports/check-structure.json`).

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Gates I–P (91 descriptor files + 2 ratchet baselines) | 4 | 5 | 5 | 5 | 4 | high | Descriptor exports at `scripts/check/gates/infra-auth-no-userid.ts:17` through `scripts/check/gates/providers-runner-seal.ts:11`; loader contract `scripts/check/GATE-AUTHORING.md:17-47`; current fixture/conformance pass and live report receipt. |

Implementation is 4, not 5: this lane verified descriptors and their current examples rather than independently reproducing every detector against each real-world syntactic variant. Operability is 4: the sanctioned runner and its current artifact work, but sandbox IPC/child-process restrictions require authorized execution.

## Findings

No defect finding met the audit bar. The current live pass is clean and its positive-control suite is green (R5), so this is a `proven-strength`, not an absence inferred from a green static run.

## Proven strengths

### GIP-01 — descriptor-to-live enforcement chain is currently proven

- Class: proven-strength
- Confidence: high
- Evidence rung: R5
- Scope denominator: 91 owned descriptors; live pass loaded 200 total registered gates.
- Receipts: `scripts/check/GATE-AUTHORING.md:17-47` (descriptor and glob-loader contract); `scripts/check/gates/no-inline-types.ts:67` (owned descriptor declaration; representative); `reports/check-structure.json` (200 gates, 0 violations, 0 toolErrors); `commands.md` (five current fixture/conformance tests).
- Established fact: all owned executable artifacts are registered by the runtime loader, each carries required proof fields, all fixture and conformance proofs passed, and the current live structural pass is clean.
- Exclusions/silent-zero risk: the live runner does not publish per-gate scanned-file counts, so a green result is accepted only with the current fixture positive control; detector blind spots outside declared fixtures remain the bounded uncertainty.

## Declared versus completed

- R2: each owned `.ts` gate declares `gate: GateDescriptor` (91 files); the two `.baseline.json` files are ratchet inputs.
- R3: glob discovery plus the current fixture assertion that every active gate is run reaches live registration.
- R4: `mustFlag`/`mustPass` assertions pass under the shared dispatcher.
- R5: the same current run also passed every registered-gate fixture and the live structural pass; no owned gate is credited from a declaration alone.

## Tests and gates

`check-gates.int` is the real-tree positive-control family: it asserts a non-empty registry, drives every registered structural gate on its fixture, and checks active files are run. `gate-conformance.int` drives every descriptor's required `mustFlag` and `mustPass` examples through the same dispatcher. The authorized current run passed all five tests in 181.88s. The ratchet baselines are included in the owned receipt and were not modified.

## Cross-lane edges

- The global runner/harness owns scan-count reporting. Its current artifact has zero tool errors but does not expose per-gate scanned/skipped denominators; the verification-harness lane should decide whether that observability gap merits a repository-level finding.
- `scripts/codemods/ast.ts` is shared and dirty; the bare command was successful, but its working-tree change belongs to its owner lane.

## Tool receipts

See `commands.md`. The direct sandbox failures were environment tool failures, rerun outside the sandbox, and not classified as gate failures. `reports/check-structure.json` is current and clean; `reports/verify.json` and `reports/test-report.json` are stale for these direct commands and excluded.

## Lane verdict

All 93 owned artifacts were fully read and hash-reconciled. The 91 descriptors are live-discovered, positive-controlled by fixtures and conformance examples, and clean in the current structural run. No source defect was proven in this lane. The remaining audit limitation is per-gate scan-denominator observability in the shared harness, not the existence or current execution of these gates.
