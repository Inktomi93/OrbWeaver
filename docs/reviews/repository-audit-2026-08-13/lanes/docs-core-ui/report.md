## Lane identity

- Lane: `docs-core-ui`
- Semantic scope: current UI architecture, UI package, theming/content, motion, client-lockdown, and unified-verification law; consistency with current code/token/gate sources and tests where a present-tense claim required it.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Working-tree basis: eight owned documents are byte-identical to the assignment snapshot; findings are against current working-tree source and docs.
- Assigned files read: `8 / 8` (100%)
- Assigned lines read: `2,947 / 2,947` (100%)
- Assigned bytes read: `349,056 / 349,056` (100%)
- Dirty assigned paths: `0`
- Exclusions: source/tests outside the receipts needed to verify present-tense claims; no broad behavioral execution in this documentation lane.

## Read receipt

`read-receipt.tsv` covers every `OWNED` row in `assignment.txt`, with matching line count, byte count, and SHA-256. Coverage is 100%.

## Architecture observed

The UI law places `@orb/ui` below `@orb/client`; the package surface is explicit subpath exports and its satellites are sealed by package dependencies plus dependency-cruiser rules (R3: `docs/architecture/core/UI-Architecture-and-Layout.md:80-113`; `packages/ui/package.json:1-112`; `.dependency-cruiser.cjs:157-204`). The codegen path derives `theme.css`, typed tokens, and seed theme value sets from DTCG inputs (R4: `packages/ui/tokens.build.ts:1-7,211-232`; `tests/ui/tokens/index.test.ts:1-25`). Gate descriptors are runtime-discovered and fail closed (R3: `scripts/check/loader.ts:64-85`), with a parity gate that makes the Active-Gates catalogue disagreeing with descriptors red (R4: `scripts/check/gates/enforcement-registry-parity.ts:1-16,135-163`; `tests/tooling/check-gates.int.test.ts:925-962`).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| UI-law navigation and current-program pointers (8 owned docs) | 3 | 2 | 2 | 1 | 2 | high | `UI-Architecture-and-Layout.md:11-17`; `UI-Theming-and-Content.md:9,27,32`; `AGENTS.md:50,78-79,291,301` |
| Token/theme derivation (owned token claims) | 5 | 5 | 4 | 4 | 4 | high | `UI-Theming-and-Content.md:27,30`; `ui-package-design.md:174-185`; `tokens.build.ts:1-7,211-232`; `tests/ui/tokens/index.test.ts:1-25` |
| UI enforcement/verification law (owned claims) | 4 | 4 | 4 | 4 | 3 | high | `UI-Gates-and-Lessons.md:36-75`; `UNIFIED-VERIFICATION-DESIGN.md:81-184`; `loader.ts:64-85`; `enforcement-registry-parity.ts:1-16` |
| Client-lockdown gate status (G1–G23 section) | 4 | 4 | 4 | 3 | 3 | high | `client-architecture-lockdown.md:610-640`; `Core-Enforcement-Active-Gates.md:273-274`; `enforcement-registry-parity.ts:1-16` |

## Findings

### DOCS-CORE-UI-01 — Retired proposed UI program remains named as active law

- Severity: P2
- Class: law-drift
- Confidence: high — this would rise no further without a newer authority superseding the constitution.
- Evidence rung: R3
- Scope denominator: 8 assigned documents; 3 directly observed stale pointers in the owned UI law.
- Receipts: `docs/architecture/core/UI-Architecture-and-Layout.md:11,15,17`; `docs/architecture/core/UI-Theming-and-Content.md:9,27,32`; authoritative `docs/architecture/core/AGENTS.md:50,78-79,291,301`.
- Established fact: the owned UI docs direct feature work and current status to `../proposed/ui-cohesion-north-star.md`; the authoritative constitution says `docs/retro-workboard.md` superseded that parked proposal on 2026-07-25.
- User or system impact: a cold feature agent follows a retired program instead of the current queue and operating law, creating contradictory implementation direction.
- What remains unverified: every historical/proposed document that could repeat the obsolete pointer is outside this lane.
- Suggested next check or fix: replace the present-tense active-program pointers in the owned UI law with `docs/retro-workboard.md`; retain the proposal only as historical provenance where needed.

### DOCS-CORE-UI-02 — Client-lockdown calls the stale 133-gate total authoritative

- Severity: P3
- Class: law-drift
- Confidence: high — the number is directly contradicted by the current enforcement catalogue whose descriptor parity is itself gated.
- Evidence rung: R4
- Scope denominator: one owned live-count assertion.
- Receipts: `docs/architecture/core/client-architecture-lockdown.md:639`; `docs/architecture/core/Core-Enforcement-Active-Gates.md:273-274`; `scripts/check/loader.ts:64-85`; `scripts/check/gates/enforcement-registry-parity.ts:1-16`.
- Established fact: the lockdown declares 133 registered gates as the authoritative live count, while the current active-gate catalogue reports 200 discovered active descriptors and its parity gate makes a descriptor/catalogue count mismatch fail.
- User or system impact: gate-count statements in the lockdown are demonstrably stale, so readers cannot use this document as an accurate status snapshot.
- What remains unverified: the entire 200-row catalogue was not re-audited for semantic correctness; only its count authority and enforcement mechanism were verified.
- Suggested next check or fix: remove the volatile count from the lockdown or update it to defer exclusively to the Active-Gates catalogue.

### DOCS-CORE-UI-03 — UI package law contradicts the generated seed-theme CSS mechanism

- Severity: P3
- Class: law-drift
- Confidence: high — source, generated artifact, test, and another owned law document agree on the opposite mechanism.
- Evidence rung: R4
- Scope denominator: two owned statements about seed-theme output.
- Receipts: `docs/architecture/core/ui-package-design.md:181-185`; `docs/architecture/core/UI-Theming-and-Content.md:30`; `packages/ui/tokens.build.ts:1-7,211-232`; `packages/ui/src/styles/theme.css:221-250`; `tests/ui/tokens/index.test.ts:1-25`.
- Established fact: `ui-package-design.md` says Mocha/Light seed rows are “NOT as extra `theme.css` value-sets,” while the theming law, generator, generated CSS, and freshness test establish that `themes/*.json` emit `[data-theme]` blocks into `theme.css`.
- User or system impact: an agent following the package law can make the wrong edit location or wrongly treat generated seed CSS as an unexpected artifact.
- What remains unverified: no browser rendering run was performed; output generation and its byte-freshness test establish the artifact mechanism, not visual appearance.
- Suggested next check or fix: correct the package-law sentence to state that seed rows and generated `[data-theme]` CSS blocks are parallel outputs from the same DTCG seed value sets.

## Proven strengths

- The DTCG pipeline has a meaningful byte-freshness test: source documents the three generated artifacts, and `tests/ui/tokens/index.test.ts:1-25` regenerates and compares all three (R4).
- Gate discovery is fail-closed and gate-catalogue drift has a two-way parity gate (R4: `scripts/check/loader.ts:64-85`; `scripts/check/gates/enforcement-registry-parity.ts:1-16`).
- Documentation formatting passed currently: `pnpm check:docs` exited 0 for 104 Markdown files (R5 for formatter operability only; command receipt in `commands.md`).

## Declared versus completed

| Declared surface | Strongest evidence | Current conclusion |
| - | - | - |
| UI package, primitive, and client foundation are built | R3/R4 | Source package exports/dependencies and token freshness test substantiate the package/token portion; feature behavior was not re-tested here. |
| DTCG theme output is derived and guarded | R4 | Implemented and test-asserted; one package-law sentence describes the output incorrectly. |
| Active UI program is the proposal document | R3 | Contradicted by the authoritative constitution; stale law pointer. |
| Client-lockdown gate total is 133 | R4 | Contradicted by the current parity-protected catalogue total of 200. |

## Tests and gates

`pnpm check:docs` passed, but it is a formatter check only and cannot prove law correctness. The token freshness test and tooling gate tests were inspected for assertions but not executed. The source establishes descriptor discovery and parity enforcement; no completed native-AST structural result is credited because the repository AST command exceeded the executor ceiling twice. The native `pnpm ast` instrument was read and invoked before fallback source-location checks.

## Cross-lane edges

- `docs-core-law`: reconcile whether any D-ledger entry changes the current-program or seed-theme source of truth; this lane’s conclusions use `AGENTS.md` and current source as the authority.
- `gates-*` / `verification-harness`: the 200-gate count is a catalogue-status receipt, not a semantic audit of each gate.
- `client-*` / `ui-*`: the “BUILT” claims were sampled only where needed to adjudicate documentation contradictions; their behavioral completeness remains with implementation lanes.

## Tool receipts

Full command log: `commands.md`. `pnpm check:docs` passed. Bare `pnpm ast` completed and established available lenses; two intended `loadGates` structural queries exceeded the executor’s 30.4-second ceiling, so they supply no negative evidence. Literal fallback was location-only after that tool failure. No structural absence conclusion appears in this report.

## Lane verdict

All eight assigned files were read and hash-reconciled to the lane snapshot. The UI law accurately describes several real, test-backed mechanisms, notably DTCG token generation and fail-closed gate discovery. Three present-tense law facts have drifted: the active program target, a claimed gate count, and seed-theme CSS output. No production behavior defect was established in this documentation-only lane. The largest uncertainty is broad UI behavioral completeness, which this lane intentionally did not execute or infer from prose.
