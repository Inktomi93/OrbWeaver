# 1063-1065: worker lifetime follow-ons

Shared test fixture: `tests/tooling/floor/process/stop-fixture.ts`. A caller module starts a worker thread
that reads `/proc` and freezes (SIGSTOP) the first descendant whose script argument ends with the target,
the instant it has exec'd. It then prints the pid. The fixture SIGTERMs the caller, waits through the
whole TERM-then-KILL escalation by poll count (`settle`), and returns every descendant still alive.
A frozen child cannot honor TERM, so it is gone only if something escalates to KILL.

## 1063: native ESLint worker

`eslint-profile.ts` launches `scripts/eslint.ts` with `supervised: true`. The exit status path is
unchanged: the supervised launcher dies of its child's signal, so `eslintScheme` still sees a null
status (a tool error), and a numeric 0/1/2 passes through as before.

Test: `tests/tooling/verify/ops/eslint-stop.int.test.ts` runs the real `runScopedEslint` on the untyped
`stylelint.config.js`.

Red (source unmodified):

```
   × SIGTERM to a scoped ESLint run ends and joins its native worker 64676ms
AssertionError: every process the stopped ESLint run started: expected [ 766467 ] to deeply equal []
```

Green:

```
   ✓ SIGTERM to a scoped ESLint run ends and joins its native worker 44659ms
```

Related: `eslint-hard.int.test.ts` runs 15 tests, and 4 fail on Vitest's fixed 5 s default timeout at load
average 22. The run without the change fails 4 the same way (3 shared tests plus a 30 s CLI case). That is
host contention, not this change: those tests use a fixed timeout that is not load-scaled. The 11 that
finish, which cover exit codes 0, 1 and 2 through the real runner, pass with the launcher in place.

`pnpm typecheck --config tooling/tsconfig.json`: PASS. Biome on the 3 changed files: clean.

## 1064: async compiler children

Design (recorded in the `tooling/src/verify/cli.ts` header): the CLI installs no SIGTERM handler. Async
children opt into the same supervised launcher as sync ones (`supervised: true` on `spawnNiced`). The
launcher leads the child's process group, so the timeout group kill still reaches the compiler.

Why not a CLI handler: while the CLI is blocked in a sync spawn, a JS handler cannot run until the spawn
returns. Installing one would also turn the CLI's default death into a deferred no-op, so the sync launcher
would never see its caller die. The launcher also covers SIGKILL of the CLI. Script mode is unchanged:
package.json launches relay TERM with no KILL deadline.

Stop tests, one per launch path:
- sync supervised: `semantic-inventory-worker-lifetime.int.test.ts` (1055) and `eslint-stop.int.test.ts` (1063);
- async: `tests/tooling/verify/ops/typecheck-stop.int.test.ts`, the real `executeTypecheckPrograms` on a
  one-file fixture, with the real `scripts/ts7.ts` frozen.

Red (source unmodified):

```
   × SIGTERM to a typecheck run ends and joins its async compiler child 56673ms
AssertionError: every process the stopped typecheck run started: expected [ 825844 ] to deeply equal []
```

Green:

```
   ✓ SIGTERM to a typecheck run ends and joins its async compiler child 19660ms
```

Related:
- proc (6), proc.int (14), niced-exec.int (7): pass.
- typecheck.int: 19 of 20 pass, including "a signaled native child stays a tool error through the real
  wrapper", which checks exit semantics through the launcher. One cold-start case timed out at 32 s at load
  average 20 and passed alone at 23 s once load dropped.
- `pnpm typecheck --config tooling/tsconfig.json`: PASS. Biome: clean.

## 1064 corrections (verifier round)

I swept every `spawnNiced` and `runNicedSync` call: ast-grep `ts` found 6 and 44, `tsx` found 0.

Supervised, inside the verify CLI:
- `ops/boot-chunk-ratchet.ts:374` client build (async);
- `ops/dev-instrument-absence.ts:64` depcruise (async);
- `ops/typecheck.ts:317,344`;
- `ops/eslint-profile.ts:257`;
- `ops/application-knip.ts:228`;
- `ops/application-static.ts:28,47`;
- `ops/scoped-test.ts:102,188,218,286`;
- `ops/ratchet-gate.ts:200`;
- `ops/tests-execution-membership.ts:112,150`;
- `ops/instrument-affected.ts:332`;
- `lib/tests-type-native.ts:19`;
- `lib/application-programs.ts:24`;
- `lib/program-routing.ts:110`;
- `lib/config-snapshot.ts:143`;
- `floor/artifacts/showcase-artifacts.ts:7`;
- `floor/compiler/semantic-inventory-worker-run.ts:31`.

Not supervised on purpose, inside the verify CLI. Each is a short probe that finishes on its own, and each
supervised call costs a node start:
- `floor/git/git.ts:28` git, called many times per run;
- `floor/host/platform.ts:86` process-table and socket reads;
- `lib/policy-repo-inventory.ts:219` `pnpm list`;
- `lib/application-build-roots.ts:26` vite config read;
- `lib/biome-verdict.ts:51` one-file control check;
- `lib/ci-qualification.ts:103` `gh api`;
- `lib/tests-type-native.ts:55` `--showConfig`;
- `floor/compiler/semantic-inventory-runtime-replay.ts:33` resolution replay, run several times per check;
- `floor/http/http-probe.ts:44` bounded HTTP probe;
- `floor/instrument/ffmpeg.ts:11` `-version`.

Outside the verify CLI (other front doors): `ast/ops/antipatterns.ts:185`, `doc/ops/tree.ts:237`,
`mutation-probe/ops/probe.ts:38`, `stack/ops/*`, `snap/ops/*`. Snap and stack own daemons and
stage-lifetime children by design.

Exit status through the launcher: a code or a signal death is mirrored, as before. A command that cannot
start now exits the way `nice` does (127, or 126), so the supervised and plain sync doors agree. New case
in `niced-exec.int.test.ts`; red before (`expected 2 to be 127`). No call site reads `errorCode`
(rg over the swept files).

`supervisedEnv` now deletes any inherited `ORB_LAUNCHER_SCRATCH` and sets the key only from the caller's
own `scratch`. New lifetime case: an ambient key, a caller killed during launcher boot, and the victim
directory must survive. It was red before (`expected false to be true`).

`stop-fixture.ts`:
- The watcher yields 1 ms per poll (`Atomics.wait`) and stops after a bounded number of polls.
- The fixture waits for the freeze through `settle`, so its cleanup always runs.
- Cleanup kills the caller's own process group.

Green: 9 files and 55 tests pass. They are the lifetime test (4), eslint-stop, typecheck-stop, niced-exec.int (8),
process-priority.int, proc, proc.int, proc-signals and worker-run.int. That run went through the newly
supervised `scoped-test.ts`. `pnpm typecheck --config tooling/tsconfig.json`: PASS. Biome on the 19 changed
files: clean.

## 1065: scratch left by a killed caller

The supervised launcher owns the cleanup. `runNicedSync`'s `supervised` option now also takes
`{ scratch }`, and the path travels in `ORB_LAUNCHER_SCRATCH` next to the guarded pid. The launcher
removes that directory only if the caller is dead: after joining the child, or at boot when the caller is
already gone. A live caller's own `finally` still owns the removal. The launcher strips the key from its
child's environment. Two callers use it:
- the inventory request directory (`semantic-inventory-worker-run.ts`);
- the ESLint arguments directory under `.cache/eslint/argv-*` (`eslint-profile.ts`), the same leak in
  the 1063 path.

The window left uncovered is a caller killed between `mkdtemp` and the spawn, which takes microseconds.

Tests: the 1055 lifetime SIGTERM case and the 1063 ESLint stop case now also assert the directory is gone.

Red (fix reverse-applied):

```
   × SIGTERM to a scoped ESLint run ends and joins its native worker and removes its arguments 38477ms
   × SIGTERM to the controller ends and joins a worker that ignores TERM and removes its scratch 20205ms
AssertionError: the stopped controller's worker scratch directory: expected true to be false
AssertionError: the stopped run's arguments directory: expected true to be false
```

Green: 9 files and 53 tests pass. They are the lifetime test (3), eslint-stop, typecheck-stop,
niced-exec.int, process-priority.int, proc, proc.int, proc-signals and semantic-inventory-worker-run.int.
`pnpm typecheck --config tooling/tsconfig.json`: PASS. Biome on the 10 changed files: clean.

Not cleaned: 37 older `/tmp/orb-native-inventory-worker-*` directories on this host from earlier killed
runs. Their owners can't be attributed, so they were left in place.
