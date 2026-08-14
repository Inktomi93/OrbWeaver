## Lane identity

- Lane: `lower-contracts`
- Semantic scope: `@orb/contracts` schemas, types, tuples, prose data, and the 78 assigned mirrored contract/type/property tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`
- Working-tree basis: current bytes; no assigned source/test path was dirty. This lane's three new audit artifacts are untracked.
- Assigned files read: 175 / 175 (100%)
- Assigned lines read: 33,797 / 33,797 (100%)
- Assigned bytes read: 1,949,074 / 1,949,074 (100%)
- Dirty assigned paths: 0
- Exclusions: server/client/db consumers, gates, composition roots, and test harnesses are outside this lane; no repository-global conclusion follows.

## Read receipt

`read-receipt.tsv` covers 175 owned and 9 shared assignment rows, all `READ_FULL`; every current SHA-256 equals the assignment manifest.

## Architecture observed

The audited package is the lower cross-boundary wire layer: `packages/contracts/package.json` and the package-law receipt establish its place below `db`, `server`, and `client` (R2 for the declared public surface; full-read basis). Its source exports zod-backed schemas and derived string-union types, for example the RPG game-mode tuple, type, and schema at `packages/contracts/src/rpg/enums.ts:13-15` (R2). The source directory exposes 1,442 exports in 94 files according to `pnpm ast exports contracts --files`; a completed boundary lens separately resolved 1,392 own exports across 4,903 workspace source files as 1,015 public, 315 internal, 30 test-only, and 32 unused (5 star-suppressed) (R3 candidate classification; `commands.md`).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Package-wide contracts public surface (94 source files / 1,442 exports) | 3 | 3 | 3 | 0 | 1 | medium | Export inventory (R2); completed resolution lens classifies 1,015 own exports as cross-package public (R3 candidate boundary evidence); 69 current contract files / 807 tests passed (R4); 7 type tests and 2 property suites were read but not executed. Gates remain out of lane. |
| RPG enum wire surface (`rpg/enums.ts`, 107 lines; mirrored 68-line contract test) | 3 | 2 | 4 | 3 | 1 | high | Derived tuple/type/zod schema at `packages/contracts/src/rpg/enums.ts:13-15` and `:54-67` (R2); exact accepted/rejected values and schema-to-tuple identity at `tests/contracts/rpg/enums.contract.test.ts:26-31`, `:57-67`, plus its current successful contract run (R4; `commands.md`). Law identifies the tuple + exhaustive-dispatch discipline as gate-protected (`docs/architecture/core/Spine-TypeScript-and-Patterns.md:14-15`, `:126-135`). |

`N/A` is used only for package-wide enforcement because gate implementation files are intentionally excluded; the shared law declares gates but this lane did not inspect or run them.

## Findings

### LC-01 — resolution liveness leaves 27 contracts exports as candidates, not proven dead code

- Severity: P3
- Class: declared-not-wired
- Confidence: medium
- Evidence rung: R2
- Scope denominator: 1,392 own exports across 4,903 workspace source files resolved by the package-boundary lens; the orphan lens reported 27 candidates in 15 contracts files and separately suppressed 5 candidates in 2 star-re-export files. A distinct test-only lens reported 30 candidates in 19 contracts files.
- Receipts: `pnpm ast orphans contracts --files`, `pnpm ast apisurface contracts --files`, and `pnpm ast testonly contracts --files` in `commands.md`; the source itself documents intentionally shipped future vocabulary at `packages/contracts/src/rpg/enums.ts:17-18`, `:63-75`, and `:103-107`.
- Established fact: resolution-based import analysis found candidate exports with no resolved consumer; this is weaker than a dead-code verdict, especially where the source declares a future/public vocabulary surface.
- User or system impact: an unconsumed public wire member adds API surface and test/gate burden; deleting it from this result alone would risk removing intentionally pre-shipped contract vocabulary.
- What remains unverified: named consumers through all composition mechanisms, and whether each candidate is intentionally retained. Five refinery candidates are explicitly star-suppressed by the tool and therefore excluded from the 27 count.
- Suggested next check or fix: triage each named candidate with `pnpm ast refs <symbol>` and its full module comment; add or validate a `@public` rationale where the contracts ratchet expects one.

## Proven strengths

- The RPG enum surface has a one-home tuple, derived union, and zod schema (`packages/contracts/src/rpg/enums.ts:13-15`, `:54-67`, R2), while the mirrored contract test asserts exact membership, derived-schema identity, accepted values, and rejected values (`tests/contracts/rpg/enums.contract.test.ts:26-31`, `:44-49`, `:57-67`, R4).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| RPG game/quest/tracker enum schemas | R4 | Source declaration plus meaningful mirrored contract assertions. |
| Remaining contracts package export surface | R2 | 1,442 declared exports in the structural inventory; no package-wide consumer or execution proof claimed. |
| 27 orphan and 30 test-only candidates | R3 candidate | Resolution-based consumer classification; not a deletion recommendation. |

## Tests and gates

The lane read 69 `.contract.test.ts`, 7 `.test-d.ts`, and 2 `.suite.test.ts` files under `tests/contracts/`. The enum test demonstrates non-vacuous accept/reject assertions rather than existence-only checks (`tests/contracts/rpg/enums.contract.test.ts:26-31`, `:44-49`, R4). The correctly scoped direct run passed all 69 contract files and 807 tests against current working-tree bytes in 3.90s (R4; `commands.md`); type and suite files were deliberately not included in that command. Enforcement scores do not claim a current gate run because gate implementation and configuration are outside scope.

## Cross-lane edges

- Consumer/composition lanes should triage the 27 resolution-liveness candidates before any removal. The lower-contracts lane establishes candidates only; server/client/DB consumers own the R3/R5 proof.
- The full suite emitted one failure before the incorrect broad test command was interrupted; it was outside this lane's selected contracts files and must be diagnosed by the owning lane from the harness report, not attributed here.

## Tool receipts

`pnpm ast` was read and used after 100% file coverage. Export inventory: 1,442 R2 declarations across 94 contracts source files. The completed boundary lens took 141s, scanned 4,903 workspace source files, and classified 1,392 contracts own exports; the orphan lens completed after ~100s and reported 27 candidates in 15 files plus 5 star-suppressed candidates; the test-only lens took 82s and reported 30 candidates in 19 files. The scoped contract runtime receipt passed 69 files and 807 tests in 3.90s. No absence claim is based on an incomplete lens. Exact commands, outputs, exclusions, and the aborted root test are retained in `commands.md`.

## Lane verdict

The owned package has a broad, real declared schema/type surface; all 69 assigned runtime contract files (807 tests) currently pass. The audit does not prove package-wide runtime consumption, gate execution, type-test execution, property-suite execution, or operational readiness. Resolution liveness identifies 27 orphan and 30 test-only export candidates but source comments show that future vocabulary is deliberately pre-shipped in at least this subsystem, so these are triage lists—not dead code. The largest uncertainty is consumer reachability across the excluded server/client/DB composition roots.
