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
