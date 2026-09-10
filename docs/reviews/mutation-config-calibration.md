---
kind: evidence
status: active
updated: 2026-09-10
---

# Mutation testing configuration and calibration evidence

This preserves the calibration evidence formerly embedded in the two JSON configs at commit 084991033. Historical measurements below are retained records, not fresh September 10 measurements. The executable configs contain
only the explicit exploratory or calibrated values and compose their shared mechanics through
`tooling/src/_shared/stryker-config.ts`. Moving this evidence does not recalibrate either profile.

## Configuration contract

- `stryker.config.js` is exploratory. Its `thresholds.break` is `null`, and its target set may be
  broadened on the command line.
- `stryker.gate.config.js` is the ratchet. Its exact mutate list and `thresholds.break: 82` form one
  calibrated unit. Changing the targets, checker, or ignorer changes the denominator and requires a new
  cold calibration before moving the threshold.
- Both profiles use pnpm, the Vitest runner through `vitest.stryker.config.ts`, the patched native
  TypeScript 7 checker, the structural ARID ignorer, `ignoreStatic: true`, concurrency 6, a 10-second
  mutant timeout, a 45-minute dry-run ceiling, incremental mode, and html/json/clear-text/progress
  reporters. Stryker's default sandbox mode remains active; neither profile sets `inPlace`.
- The Vitest runner ignores `coverageAnalysis` and uses per-test coverage. Stryker 10 also defaults
  `vitest.related` to true. Per-file NoCoverage must therefore be inspected after a score moves: an
  unreachable target can deflate a score for a tooling reason.

## Patched native TypeScript 7 checker

The checker imports `@typescript/native/unstable/sync`; the root aliases `@typescript/native` to the
pinned TypeScript 7 package. The local `@stryker-mutator/typescript-checker@10.0.0` patch fixes a filename
identity bug in the native preview: upstream registers the sanitized tsconfig under the raw relative
`options.tsconfigFile` string, while the compiler opens the resolved POSIX filename. The miss falls back
to the strict on-disk tsconfig and loses the mutation-required overrides for `allowUnreachableCode`,
`noUnusedLocals`, and `noUnusedParameters`. That incorrectly classifies reachable mutant families such
as `if (cond)` to `if (false)` as CompileError and removes them from the denominator.

Measured 2026-08-21 on `packages/kit/src/macro/engine.ts`, 47 mutants, concurrency 6, quiet box,
back-to-back:

| checker arm | killed | timeout | survived | compile error | score | duration |
| - | -: | -: | -: | -: | -: | -: |
| stock native + relative tsconfig | 11 | 0 | 6 | 28 | 57.89 | 9m41s |
| native + absolute tsconfig, falsification arm | 17 | 1 | 7 | 20 | 66.67 | 3m03s |
| native + root-relaxed tsconfig | 18 | 0 | 7 | 20 | 66.67 | 3m02s |
| classic checker | 18 | 0 | 7 | 20 | 66.67 | 3m17s |

The population difference and slowdown were the same bug: repeated disk fallback. The patched native
checker preserves the classic checker's verdict at classic-or-better speed. If this patch stops applying,
fall back to the classic checker configuration until the native path is re-proven; do not silently run
the stock native preview.

## Patched pnpm workspace sandbox

Stryker 10 still needs `patches/@stryker-mutator__core@10.0.0.patch`. Stock Stryker does not rewire pnpm
workspace symlinks inside `.stryker-tmp`, so `@orb/*` imports escape to the base checkout and yield no
executed tests or clean-looking zero coverage over unmutated code. The patch is version-keyed and
byte-specific. A Stryker dependency bump must re-derive the patch and plant a control whose workspace
mutants activate and die; config validation alone cannot prove sandbox correctness.

The 10.0.0 bump control mutated `packages/kit/src/macro/engine.ts`: 47 mutants, 17 killed, 1 timeout,
7 survived, 2 no-coverage, and 20 compile-error, score 66.67. A non-zero killed count through an
`@orb/kit/*` import is the evidence that sandbox rewiring is live.

Neither config sets `inPlace`. Sandbox pruning excludes dependency, cache, model, output, data/database,
agent, Playwright, reference, scratch, and foreign SillyTavern parity trees. The SillyTavern exclusions
reduced gate startup files from 7,358 to 5,162 and removed an irrelevant HTML parse warning. `.cache/**`
also excludes the 8.8-GiB vLLM environment whose `lib64` symlink previously failed copying with EISDIR;
`.models/**` excludes roughly 25 GiB of model weights.

## Runtime and host calibration

The 45-minute dry-run ceiling replaces Stryker's five-minute default. The initial gate dry run timed out
at 5m02s. On 2026-08-21, `--dryRunOnly` ran 12,060 related tests in 17m26s because the four gate targets
sit deep in the composition graph and the Vitest runner pins one thread worker. This is a wedge ceiling,
not an expected duration.

Concurrency 6 matches every recorded calibration. The shared 24-logical-core / 125-GiB host also runs
homelab services; higher defaults previously drove load average to 103 and affected Authentik. Concurrency
changes duration and timeout risk, not the target/checker/ignorer denominator, so retaining 6 does not
trigger recalibration.

The `progress` reporter is operationally required. The mutant phase can otherwise emit nothing for more
than 56 minutes after a successful dry run, making a slow run indistinguishable from a wedge.

## ARID denominator policy

`tooling/src/mutation-arid/` removes two structurally unreachable-by-honest-test families:

1. string-literal mutants whose only destination is an observability sink; and
2. mutants inside a compile-time-unreachable `never`-typed exhaustive-dispatch arm.

There is no source annotation opt-out. Adding or removing the ignorer changes the scored denominator and
requires gate recalibration. `pnpm mutation:arid <report.json>` reports the ignored count per reason.

## Gate calibration history

Cold run on 2026-08-21, quiet box at load approximately 8, concurrency 6, no incremental file, 90m21s,
Stryker 10.0.0 with both patches and ARID family 1:

- 1,129 instrumented; 343 killed; 0 timeout; 254 survived; 25 no-coverage; 502 compile-error; 5 ignored.
- Scored denominator: 622. Total score 55.14; covered score 57.45.
- Per file, total / covered: `guard.ts` 66.67 / 88.89, `round.ts` 82.26 / 82.26,
  `resolve.ts` 66.67 / 75.00, `assemble.ts` 50.97 / 52.69.
- `assemble.ts` contributed 520 of 622 scored mutants. Every file killed mutants, proving related mode
  reached covering tests for all four targets.
- The threshold moved from 50 to 52, about three points or 19 mutants below measurement.

Cold re-ratchet on 2026-08-22 after the #404 kill-test campaign, concurrency 6, 105m17s, identical
configuration and identical 1,129/622 population:

- 533 killed; 0 timeout; 72 survived; 17 no-coverage; 502 compile-error.
- Total score 85.69; covered score 88.10.
- Per file, total / covered: `assemble.ts` 87.64 / 89.19; the other three were unchanged.
- The threshold moved from 52 to 82 with the same approximately three-point / 19-mutant headroom.

The calibration is stale but conservative since 2026-08-26, when ARID gained the unreachable-`never`
family. Removing only unkillable survived/no-coverage mutants shrinks the denominator without removing
kills, so 82 cannot become an optimistic false-pass threshold from that change. It is no longer the
measured value. Re-run `pnpm test:mutation:gate` cold on a quiet box and re-ratchet to roughly three points
below the new measurement when recalibrating the mutation gate; this configuration migration does not claim a new
score or authorize changing the threshold.

## Exploratory target rationale

The exploratory profile retains the high-stakes pure-module baseline plus four sentinel classes:

- Runtime-key arithmetic: chat `stats-delta.ts` and stats `rebuild-from-canon.ts`.
- Shipped inversion: chat `canon-write.ts` and memory recall `recall.ts`.
- Coverage-scouted branch gaps: lifecycle, PCA, k-means, and EPUB extraction.
- Serde round-trip symmetry: chat export and import bundle verbs as a pair.

Transport wiring and observability tracing were deliberately rejected as low-signal mutation targets.
Untested recovery/search modules were also rejected because related mode would produce NoCoverage until a
real test mirror exists. Promotion into the gate requires a fresh calibrated run over the new exact set.

## Configuration migration verification (2026-09-10)

The JSON-to-JavaScript migration preserves all 19 non-comment authored options for each profile.
`tests/tooling/_shared/stryker-config.test.ts` pins both option sets and verifies that mutations to one
import's nested options cannot affect another import. The fresh scoped run passed both tests:
`reports/runs/test/codex-world-gate-integration-3880914-2026-09-10T11-14-55-363Z/test-report.json`.

Bounded native dry runs use `packages/kit/src/macro/engine.ts` and
`tests/kit/macro/index.test.ts`, with concurrency 1. These exercise config loading, the patched native
checker and the runner; they are not mutation-score measurements or full gate calibration.

Both commands exited 0, loaded the native TypeScript 7 checker, instrumented 54 mutants and passed
110 tests. No mutations executed. The exploratory config was discovered automatically by
`pnpm exec stryker run`; `pnpm test:mutation:gate` selected the explicit gate config. Captured command
output is `/tmp/codex-stryker-native-dry-runs-2026-09-10.log`; Stryker generated no report in dry-run mode.
