## Lane identity

- Lane: `root-config`
- Semantic scope: root build/package/policy/configuration and the config-owned verification composition.
- Snapshot commit: assignment `41e18afe74afa570b67a3e670a1a38863c486a00`; working-tree read basis began at `2215f8d32703c3b0cb787a8faeedd991d4fb8fdc`.
- Assigned files read: `31 / 31` (100%).
- Assigned lines read: `4276 / 4276` working-tree lines (100%); assignment stated `4272`, with the four-line drift below.
- Assigned bytes read: `241976 / 241976` working-tree bytes (100%); assignment stated `241623`, with the 353-byte drift below.
- Dirty assigned paths: `0` in `git status --short`; dispatch-to-receipt drift: `vitest.config.ts` changed from `211` lines / `13845` bytes / `bbf462…` to `215` / `14198` / `b87759…` before the final full read and receipt. The remaining `30` current hashes equal the assignment. This is a rolling working-tree audit, not a single immutable commit claim.
- Exclusions: binary assets; all sibling-owned source/tests except direct config harnesses; generated/untracked artifacts; and the gitignored ST runtime except the Stryker reach documented below.

## Read receipt

`read-receipt.tsv` covers all 31 assigned paths at 100%. The complete current-byte authority is that receipt.

## Architecture observed

The root manifest exposes the verification entry (`package.json:85-86`); the registry dispatches full-tier mutation testing through the official script (`scripts/verify/registry.ts:379-383` → `package.json:83-84`) \[R3]. The mutation runner loads its dedicated Vitest transform (`stryker.gate.config.json:5-13` → `vitest.stryker.config.ts:1-45`) and constrains each worker to one test file (`vitest.stryker.config.ts:47-54`) \[R3]. `.dependency-cruiser.cjs:1-35` supplies the package/tier graph backstop; its native invocation traversed 2,967 modules and 16,659 dependency edges with no violation \[R5].

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Import-boundary configuration (655-line `.dependency-cruiser.cjs`; 2,967 modules / 16,659 edges) | 4 | 4 | 4 | 4 | 4 | high | `.dependency-cruiser.cjs:1-35`; `pnpm depcruise`, exit 0, 11.367s \[R5]; `tests/tooling/dependency-cruiser.int.test.ts`, 54 passed rows observed \[R4]. |
| Type/test runner routing (type/execution membership: 1,866 / 1,697 files) | 4 | 4 | 5 | 4 | 4 | high | `tsconfig.json:1-143`; `tsconfig.tests-dom.json:1-72`; `vitest.config.ts:1-215`; `pnpm check:tests-membership`, exit 0 \[R5]; `pnpm check:tests-execution-membership`, exit 0 \[R5]. |
| Mutation quality gate (4 targets / 1,115 generated mutants) | 3 | 3 | 0 | 0 | 1 | high | `stryker.gate.config.json:19-24,59-60`; `scripts/verify/registry.ts:379-383`; live `pnpm test:mutation:gate` probe \[R3/R5 as specified per finding]. |
| Container/runtime composition (Dockerfile + docker-compose, 422 assigned lines) | 3 | 3 | 0 | 2 | 2 | medium | `Dockerfile:1-205`; `docker-compose.yaml:1-217` full-read basis \[R2]. No image/compose behavioral run was authorized by this lane’s scoped audit; no clean claim follows. |

## Findings

### `RC-01` — registered mutation gate cannot fail on score

- Severity: P2
- Class: gate-blind-spot
- Confidence: high — only setting a non-null calibrated `thresholds.break` and rerunning the official command can change the conclusion.
- Evidence rung: R3
- Scope denominator: 4 declared target files / 1,115 mutants created by the official command; full-tier registry has 1 mutation-gate row.
- Receipts: `stryker.gate.config.json:59-60` explicitly sets `break: null` and says that a null break never fails; `scripts/verify/registry.ts:379-383` wires this command only into `full`; `package.json:83-86` binds the invocation; `lefthook.yml:111-114` independently confirms it cannot fail; `pnpm verify --list`, exit 0, listed `quality:mutation-gate` only under `full` \[R3].
- Established fact: the configured gate has no failing score threshold, so a completed mutation run can report any aggregate score without producing a score-based nonzero exit \[R3].
- User or system impact: `pnpm verify --full` and manual CI present a named mutation gate while it supplies no mutation-quality rejection; surviving mutants in its four high-stakes files are not enforced \[R3].
- What remains unverified: the live official run had created 1,115 mutants but had not completed at report close, so its score and final process exit are deliberately not claimed \[R0 for score].
- Suggested next check or fix: let one uninterrupted official run finish, record the aggregate score, then set `thresholds.break` roughly six points lower as its own config prescribes (`stryker.gate.config.json:59`) and rerun with a deliberately low threshold positive-control workflow.

### `RC-02` — mutation sandbox still reaches the excluded ST runtime

- Severity: P3
- Class: operability-gap
- Confidence: high — repeating `pnpm test:mutation:gate` reproduced a Stryker `DisableTypeChecksPreprocessor` parse warning naming `scripts/probes/st-goldens/sillytavern-runtime/public/scripts/extensions/connection-manager/edit.html` after the four declared files were instrumented \[R5].
- Evidence rung: R5
- Scope denominator: Stryker reported 7,707 project files, 4 mutation targets, and 1,115 mutants; `stryker.gate.config.json:28-46` lists 19 ignore patterns but no `scripts/probes/st-goldens/sillytavern-runtime/**` exclusion.
- Receipts: `stryker.gate.config.json:27-46`; official live command output at 02:31:12 MDT; the command emitted the HTML parse warning before runner startup \[R5].
- Established fact: the mutation preprocessor processes a gitignored foreign HTML artifact even though the config’s ignore comment says the sandbox is pruned (`stryker.gate.config.json:27`) \[R5].
- User or system impact: mutation runs emit irrelevant parse noise and couple their setup to a local captured runtime outside the four-file quality scope; this degrades a long, expensive gate’s diagnosability \[R5].
- What remains unverified: whether this warning can become fatal with another captured artifact; the current command had not reached final exit at report close \[R0 for failure impact].
- Suggested next check or fix: add the same ST-runtime exclusion used by the root type/Knip configurations, then rerun the official command and require no preprocessor warning before treating its result as a calibration baseline.

## Proven strengths

- The configured dependency graph was actually exercised successfully: `pnpm depcruise` completed with `2967` modules and `16659` edges, no violations \[R5; `.dependency-cruiser.cjs:1-35`].
- Test routing has current executable reconciliation rather than config-only claims: `pnpm check:tests-membership` proved 1,866 files reach at least one of four type programs, and `pnpm check:tests-execution-membership` proved all 1,697 runner-suffixed files reach one of three runner views \[R5; `tsconfig.json:1-143`, `tsconfig.tests-dom.json:1-72`, `vitest.config.ts:1-215`].

## Declared versus completed

| Surface | Strongest evidence | State |
| - | - | - |
| Package/tier import rules | R5 | Native dep-cruiser run passed over 2,967 modules; this does not prove rules outside that instrument. |
| Type/test membership routing | R5 | Both canonical membership commands passed on current working-tree files. |
| Full-tier mutation quality gate | R3 | Declared and registered, but score enforcement is absent because `break` is null. |
| Mutation target execution | R5 (startup only) | Official command instrumented all four targets and 1,115 mutants; final run/score remains unverified. |
| Docker production path | R2 | Container configurations exist and were fully read; no build/run evidence in this lane. |

## Tests and gates

The 54 observed `dependency-cruiser` integration assertions support configuration behavior \[R4], but the combined test process exceeded this terminal bridge and its final result is not promoted to a lane-green claim. The two membership commands are clean current behavioral R5 receipts. `pnpm ast` was run bare (0.56s) and read in full; no AST lens was used to manufacture a root-config absence claim because its documented corpus does not make root config files candidates (`scripts/codemods/ast.ts:42-120`). Full command outputs, timing, scope counts, and incomplete long-process states are in `commands.md`.

## Cross-lane edges

- The verification-harness lane should reconcile RC-01 with its registry/full-tier contract: the registry calls a registered quality gate that has no enforced score (`scripts/verify/registry.ts:379-383`; `stryker.gate.config.json:59-60`).
- The probes/runtime lane owns the captured ST runtime; it should decide whether the Stryker parser warning is expected foreign-input exposure or an exclusion defect. This lane established only the root-config wiring edge.

## Tool receipts

See `commands.md`. Structural tool total: bare `pnpm ast` 1 invocation, 0 scan lenses; its actual corpus/denominator rules were read from `scripts/codemods/ast.ts:42-120`. Native graph scan: 2,967 modules / 16,659 edges. Literal config reconciliation denominator: 5,711 tracked files / 4,935 tracked code files; no negative config conclusion depends on that corpus. Long command total: 3 (tooling Vitest, structure gate, mutation gate), all polled; none is claimed clean without a final receipt.

## Lane verdict

All 31 root-config files were read and checksummed on current working-tree bytes; only `vitest.config.ts` drifted from dispatch. Dependency and test-routing enforcement have current R5 evidence. The full-tier mutation surface is wired but materially incomplete as a gate: `break:null` prevents score enforcement. Its official probe also reaches a foreign ST runtime and emits a parse warning. The largest uncertainty is the unfinished 1,115-mutant run; its score and final exit are not inferred.
