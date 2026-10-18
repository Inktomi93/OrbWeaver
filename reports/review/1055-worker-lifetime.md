# 1055: native inventory worker lifetime

## Defect

`runInventoryPartitionWorker` (tooling/src/floor/compiler/semantic-inventory-worker-run.ts) spawned the
worker with `runNicedSync`, which ran `spawnSync("nice", …)`. `nice` execs in place, so the worker's parent
was the controller, and the controller was blocked inside `spawnSync`. While it is blocked it cannot run a
signal handler. A SIGTERM to the verify CLI took the default action (death), and the worker was reparented
and ran to completion with no owner.

## Fix

- `RunNicedSyncOptions.supervised` (proc-contract.ts) routes a sync spawn through the `niced-exec.ts`
  launcher (`launcherCommand`, process-priority.ts) on every OS.
- `niced-exec.ts` now watches its parent every 500 ms (a ppid change on POSIX, pid liveness on win32). On
  parent death, or on its own SIGTERM, it runs the shared `escalateStop` (TERM, load-scaled 15 s grace,
  KILL, 10 s grace) on its child, and exits only after the child exits. It also dies of the child's own
  signal on POSIX, so the sync door still reports `signal` and not a 128+N code (the existing worker-run
  `signal` case pins this).
- `lowerToolingPriority` no longer tries to raise a process that is already below the tooling priority.
  An unprivileged caller at nice 15 would otherwise crash the launcher with ERR_SYSTEM_ERROR (verified).
- The inventory worker spawn opts in with `supervised: true`.

The stage timeout path (verify/ops/run.ts `spawnNicedTranscript`, group SIGKILL) already reached the worker,
because the sync child is a non-detached member of the stage group. The second test case pins it.

## Red first (fix reverse-applied with `git apply -R`, test file unchanged)

```
 ❯ tests/tooling/floor/compiler/semantic-inventory-worker-lifetime.int.test.ts (2 tests | 1 failed) 76886ms
   × SIGTERM to the controller ends and joins a worker that ignores TERM 46667ms
   ✓ the verify stage timeout ends a controller mid-extraction with no surviving worker 30218ms
AssertionError: every process the stopped controller started: expected [ 299576 ] to deeply equal []
```

## Green

```
 ✓ tests/tooling/floor/compiler/semantic-inventory-worker-lifetime.int.test.ts (2 tests) 47820ms
   ✓ SIGTERM to the controller ends and joins a worker that ignores TERM 17647ms
   ✓ the verify stage timeout ends a controller mid-extraction with no surviving worker 30171ms
```

Existing suites: niced-exec.int, process-priority.int (+1 new case), proc, proc.int, proc-signals and
semantic-inventory-worker-run.int all passed, 6 files and 48 tests.

## Verifier corrections (second commit)

- Boot-window race: the launcher read `process.ppid` only after its module graph loaded, so a caller
  that died in that window left it reparented, and it guarded the subreaper forever. The supervised door
  now passes the caller's pid in `ORB_LAUNCHER_PARENT` (`supervisedEnv`, process-priority.ts). The launcher
  guards that pid, refuses to start the child if the pid is already gone, and strips the key from the
  child's environment.
- Escalation and the signal mirror apply only to supervised launches. Script mode (package.json scripts,
  win32 sync doors) relays TERM with no deadline, as before.
- The test polls with `settle` from stop-escalation.ts, so it adds no waiver markers.
- The priority test now calls `lowerToolingPriority` directly.

Red, race case (source at 408888259d, new test file):

```
   ✓ SIGTERM to the controller ends and joins a worker that ignores TERM 18082ms
   ✓ the verify stage timeout ends a controller mid-extraction with no surviving worker 30203ms
   × a supervised child never outlives a caller that dies while the launcher boots 49771ms
AssertionError: every process the dead caller started: expected [ 452975, 452982 ] to deeply equal []
```

Red, priority case (guard reverted to an unconditional `setPriority`):

```
   × lowerToolingPriority leaves a process already below the tooling priority where it is 68ms
SystemError [ERR_SYSTEM_ERROR]: A system error occurred: uv_os_setpriority returned EACCES (permission denied)
```

Green, 7 files and 51 tests:

```
 ✓ semantic-inventory-worker-lifetime.int.test.ts (3 tests) 50109ms
   ✓ SIGTERM to the controller ends and joins a worker that ignores TERM 18701ms
   ✓ the verify stage timeout ends a controller mid-extraction with no surviving worker 30691ms
   ✓ a supervised child never outlives a caller that dies while the launcher boots 716ms
 ✓ niced-exec.int (7), process-priority.int (5), proc (6), proc.int (14), proc-signals (6),
   semantic-inventory-worker-run.int (10)
```

`pnpm typecheck --config tooling/tsconfig.json`: PASS. Biome on the 6 changed files: clean.

Follow-up, not fixed here: when the controller dies, `runInventoryPartitionWorker` leaks its
`orb-native-inventory-worker-*` scratch directory (semantic-inventory-worker-run.ts:21,42), because its
`finally` never runs. This predates 1055.
