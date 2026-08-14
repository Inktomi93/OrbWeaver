## Lane identity

- Lane: `gates-a-h`
- Semantic scope: 58 active static-gate descriptors plus three owned data artifacts (Base UI surface manifest and two shrink-only baselines).
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: current bytes; all owned bytes match the assignment snapshot. Shared `README.md` has the expected final-line hash drift recorded in `commands.md`.
- Assigned files read: 61 / 61 (100%).
- Assigned lines read: 17,895 / 17,895 (100%).
- Assigned bytes read: 871,889 / 871,889 (100%).
- Dirty assigned paths: 0.
- Exclusions: registration, loader, pass, report, and integration-harness sources are cross-lane edges; they were exercised, not full-read.

## Read receipt

`read-receipt.tsv` covers every OWNED row from `assignment.txt`: 61 paths, 17,895 lines, 871,889 bytes, and matching SHA-256 content. No partial conclusion is used.

## Architecture observed

Every assigned TypeScript gate declares an active `gate` descriptor (structural export receipt: `pnpm ast exports scripts/check/gates --max 200`; representative descriptor locations: [density-tier.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/density-tier.ts:328), [finding-overload-provenance.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/finding-overload-provenance.ts:317), and [gate-ignore-inventory.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/gate-ignore-inventory.ts:87)). Their predicates are either `scanRoot`-limited or whole-project `run`/`finalize` checks; 24 are declared `incremental-safe` and 34 `whole-project` (descriptor declarations were fully read; examples at [density-tier.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/density-tier.ts:331) and [gate-ignore-inventory.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/gate-ignore-inventory.ts:96)).

The Base UI manifest is a real-disk comparison input, not an inert file: the gate checks presence, reads it, diffs installed surface, and judges dispositions ([baseui-surface-manifest.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/baseui-surface-manifest.ts:141)). The two other JSON artifacts are consumed as baselines by their owning gates ([density-tier.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/density-tier.ts:314), [finding-overload-provenance.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/finding-overload-provenance.ts:292)).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Static gates A–H (58 descriptors) | 4 | 5 | 5 | 4 | 3 | high | R2 structural descriptor exports; R5 `check:structure` clean; R5 `check-gates` 3/3 and conformance 2/2. |
| Base UI surface manifest | 4 | 5 | 5 | 4 | 3 | high | R2/R3 real-disk reader and diff at [baseui-surface-manifest.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/baseui-surface-manifest.ts:141); R5 current clean run and fixture proof. |
| Density/provenance ratchets | 4 | 5 | 5 | 3 | 3 | high | R3 baseline readers; R5 stale/excess checks execute, but current baselines admit 278 pre-existing sites. |

## Findings

### GA-H-01 — Two active ratchets deliberately green-light 278 pre-existing sites

- Severity: P2
- Class: gate-blind-spot
- Confidence: high
- Evidence rung: R5
- Scope denominator: 46 density-baselined files / 226 sites plus 24 provenance-baselined gate files / 52 sites.
- Receipts: [density-tier.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/density-tier.ts:19), [density-tier.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/density-tier.ts:363), [finding-overload-provenance.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/finding-overload-provenance.ts:297); current `jq` baseline counts and final live structure pass in `commands.md`.
- Established fact: each gate reports only sites above its committed per-file budget. The current checked-in budgets are nonzero (226 + 52), so `pnpm check:structure` can be green while those 278 admitted sites remain.
- User or system impact: this is a controlled, shrinking exception, not a silent failure; it nevertheless means the affected rule is not R5 “violation impossible” for the existing population.
- What remains unverified: whether every budgeted site is still an intentional exception versus burn-down debt; that needs the owners of the affected UI/gate files.
- Suggested next check or fix: keep the ratchets, but expose the outstanding budget total in the normal structure report and burn it down deliberately.

### GA-H-02 — A clean structural run has no per-gate scan denominator receipt

- Severity: P2
- Class: instrument-defect
- Confidence: high
- Evidence rung: R5
- Scope denominator: 58 assigned TypeScript descriptors, 24 `incremental-safe` and 34 `whole-project`; their `scanRoot` predicates vary by gate.
- Receipts: current `pnpm check:structure` printed all assigned names clean; current `reports/check-structure.json` has only `ok`, `total`, `toolErrors`, and gate findings, with no scanned/skipped counters (`commands.md`). Predicate-dependent coverage is visible in [baseui-derives-not-respells.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/baseui-derives-not-respells.ts:279), [freeze-provenance-write-pairing.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/freeze-provenance-write-pairing.ts:550), and [gate-ignore-inventory.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/gate-ignore-inventory.ts:96).
- Established fact: the official current run proves registration and a zero-finding result, but it does not let an operator distinguish a healthy clean scan from a predicate that matched zero files or silently excluded an intended path.
- User or system impact: a future path/refactor can quietly reduce a narrow gate’s effective population while preserving a green whole-project result.
- What remains unverified: the harness may retain per-gate files internally; this lane did not full-read its cross-lane implementation.
- Suggested next check or fix: make the structure artifact record each active gate’s candidate/scanned/skipped counts and its declared scope class.

### GA-H-03 — `bounded-list-limit` deliberately misses semantically equivalent non-`limit` and named-schema inputs

- Severity: P3
- Class: gate-blind-spot
- Confidence: high
- Evidence rung: R4
- Scope denominator: property assignments named exactly `limit` within the gate’s declared router/contracts scan root ([bounded-list-limit.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/bounded-list-limit.ts:61)).
- Receipts: the rule targets `node.getName() !== "limit"` ([bounded-list-limit.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/bounded-list-limit.ts:64)); its own passing controls document that a named schema and `topN` bypass it ([bounded-list-limit.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/bounded-list-limit.ts:110)).
- Established fact: the name-only syntactic rule cannot enforce a ceiling for equivalent `topN` or identifier-backed schemas; its tests intentionally preserve that limit.
- User or system impact: a new unbounded list field can evade this gate by naming/indirection, relying on review and another gate instead.
- What remains unverified: whether current `search.*` hand-bounded `topN` consumers are all bounded; that semantic area is outside this lane.
- Suggested next check or fix: only expand if the repeated name/indirection bypass becomes real debt; otherwise keep the declared limit visible in the gate catalog.

## Proven strengths

- All 58 assigned descriptors are active, each declares both a `mustFlag` and a `mustPass` control, and the current conformance suite passed its “every contract-form gate” proof (R5; descriptor examples at [baseui-surface-manifest.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/baseui-surface-manifest.ts:188), [density-tier.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/density-tier.ts:399), [gate-ignore-inventory.ts](/home/inktomi/inktomi-stack/development/orbweaver/scripts/check/gates/gate-ignore-inventory.ts:145)).
- Registration and invocation are live, not merely declared: the official integration test passed all three anti-drift checks, including that every active gate file is run by the report entry point (R5; `commands.md`).
- The live working tree passed the official structure entry point with zero tool errors and all assigned descriptors printed clean (R5; `commands.md`). This is a current clean result, bounded by GA-H-02’s missing scan-count receipt.

## Declared versus completed

- `asset-refs-fk-coverage` through `home-tile-registry-completeness` (the 58 TypeScript entries in `read-receipt.tsv`): R2 descriptor declaration; R3 discovered/registered by the live integration receipt; R4 synthetic must-flag/must-pass proof; R5 current official execution plus live fixture registration proof.
- `baseui-surface.manifest.json`: R3 read as an on-disk input to installed-surface reconciliation; R5 current clean and fixture-proven gate execution.
- `density-tier.baseline.json` and `finding-overload-provenance.baseline.json`: R3 loaded by their owners; R5 current stale/excess enforcement, with the bounded admitted populations in GA-H-01.

## Tests and gates

The current real-tree static run is not the only evidence: the descriptor conformance suite exercised every contract-form `mustFlag` and `mustPass`, and the registry integration suite exercised all active gates through the report entry point. That supplies positive controls for current executable enforcement, not just green absence. The descriptor corpus records scope predicates and documented limits, but the emitted report lacks candidate/scanned/skipped counts, so no gate is credited with a presently observable complete denominator.

## Cross-lane edges

- The loader/pass/report/harness and the two tooling test files are owned by the verification-harness lane. Their behavior is established only by the official integration runs; reconcile GA-H-02 there.
- The owners of density and finding-provenance debt must decide the burn-down schedule for GA-H-01; this lane did not inspect the baseline-target source files.

## Tool receipts

`pnpm ast` completed in 1.5s and its `exports` lens completed in 8.9s. The official structure run completed clean in 68.7s. The conformance suite passed in 8.9s; the integration test required an approved rerun because sandboxed child-process cleanup failed with `spawnSync find EPERM`, then passed in 145.3s. No broad AST command timed out. Exact commands and limitations are in `commands.md`.

## Lane verdict

All 61 owned bytes were read and match the assignment snapshot. The 58 executable gates are declared, registered, current-run clean, and positive-controlled through both conformance and live report-path tests. The system’s strong point is that a descriptor cannot merely exist and call itself enforced. The remaining enforcement gap is explicit rather than hidden: two shrink-only baselines currently admit 278 old sites. The biggest operational uncertainty is not whether the gates ran, but whether each narrow predicate scanned its intended live denominator; current output does not say.
