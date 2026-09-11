// THE ONE TEARDOWN PATH every arm that ends a stage goes through — `--stage-down`, `--stage-sweep`, the
// allocator's lazy reap-on-acquire, the stale-stage rebuild, and (since #1163) the stage's OWN idle timer.
// Split out of ops/stage.ts so the keeper can share it without a cycle: ops/stage.ts ARMS the keeper, so
// the keeper must not import back from it.
//
// FOUR ARMS, ONE PATH, AND THAT IS THE POINT. The owner's #1163 ask is that a stage tear ITSELF down, and
// the only way a fifth teardown spelling does not become a fifth teardown BUG is for the timer to run the
// exact sequence the operator's `--stage-down` runs: the staged tree's own launcher first, the band's
// process group second, the dir third, the row last.
//
// THE TWO BEATS OF `stopStage`, because the first one is not guaranteed to happen:
//  1. the STAGED TREE's own launcher (`stack.sh stop`), which reaps its pidfiles properly — resolved, not
//     hardcoded, since the #393 P5 move (#447). That launcher is also where the #1162 honesty fix lives:
//     it verifies GROUP DEATH by pgid (`kill -0` on the pgid plus the `pgrep -g` question) before running
//     `dev_identity clear-absent`, and prints that verb's own verdict rather than asserting one;
//  2. the band check. Whatever the launcher did or could not do, a stage-rooted process still holding a
//     band port after it is killed BY PROCESS GROUP.
//
// Beat 2 is the whole point. `stopStage` used to be a single `if (existsSync(scripts/dev/stack.sh))`
// around beat 1 — and after the launcher moved, that guard was permanently false, so every teardown path
// SILENTLY did nothing and then removed the dir out from under a still-running stack. That is the
// mechanism behind #324's orphaned process groups, and it is why a launcher that cannot be found is now a
// printed problem rather than a quiet return.
//
// The group kill is fenced exactly like the sweep's: a band port held by something that is NOT
// stage-rooted is somebody else's server and is never touched.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { activeRunSlot } from "../../_shared/artifact-out.ts";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { StagePorts, StageReapArm, StageRow } from "../contract/stage.ts";
import { missingLauncherRefusal, stageLauncherPath } from "../lib/stage-plan.ts";
import { takeBootDeadStage } from "../lib/stage-run-binding.ts";
import { sweepStrandedBrowsers } from "./browser-sweep.ts";
import { clearRow } from "./stage-marker.ts";
import { killProcessGroup, pidIsStageRooted, stageBandPortPid } from "./stage-probe.ts";
import { recordStageReap } from "./stage-reap-log.ts";
import { removeStageDir } from "./stage-source.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --stage-down");

/** Stop a stage's stack, and MEAN IT — the two beats of the module header. */
export function stopStage(dir: string, ports: StagePorts): void {
  const stackSh = existsSync(dir) ? stageLauncherPath(dir, existsSync) : null;
  if (stackSh !== null) {
    runNicedSync("bash", [stackSh, "stop"], { cwd: dir, stdio: "inherit" });
  } else if (existsSync(dir)) {
    print(`[snap-stage] no launcher to stop ${dir} with — falling back to the band's process group. ${missingLauncherRefusal(dir)}`);
  }
  for (const port of [ports.server, ports.vite]) {
    const pid = stageBandPortPid(port);
    if (pid !== null && pidIsStageRooted(pid) && killProcessGroup(pid)) {
      print(`[snap-stage] killed the process group still holding :${port} (pid ${pid}) after the launcher stop`);
    }
  }
}

/** Stop it, remove its dir, clear its row, and RECORD WHICH ARM did it (#1163). Ports come from the ROW,
 *  because the stage being removed may sit on a different band than the one a caller is about to boot on;
 *  the dir is removed against the row's OWN checkout, so a sibling's stranded worktree is removable from
 *  here (`git worktree remove` is repo-wide — the #108 rule). */
export function tearDownStageRow(home: string, row: StageRow, arm: StageReapArm, nowMs: number = Date.now()): void {
  stopStage(row.dir, { server: row.serverPort, vite: row.vitePort });
  // The stage's stack dies by process group; a BROWSER never does (#1848 — playwright sessions it). Every
  // arm that ends a stage therefore also reaps browsers whose own run is gone, which is the state a lane
  // torn down mid-drive leaves behind.
  for (const line of sweepStrandedBrowsers()) {
    print(`[snap-stage] ${line}`);
  }
  removeStageDir(row.checkout, row);
  clearRow(home, row.band);
  recordStageReap(home, row, arm, nowMs);
}

/** THE FIFTH ARM, AND THE ONE THAT FIRES INSIDE A RUN (#1837). A stage whose app never settled — warm-up
 *  re-navigation included (ops/drive.ts) — is not the warm asset #324's ruling protects. It never served an
 *  app, so leaving it up holds a band, a port pair and a ~7-process group for the full 60 min TTL and hands
 *  the same dead app to every later reuse; two lanes in one afternoon killed those groups by hand. #324's
 *  RULE is untouched (no teardown at run completion, warmth across runs is the feature); its INPUT changed.
 *
 *  THE LOGS OUTLIVE THE DIR, because the refusal text tells the reader to go read them and `removeStageDir`
 *  is about to delete them. They are copied into THIS run's slot first (`<slot>/stage-logs/`), and the
 *  printed line names where they landed — a teardown that silently ate its own evidence would just move the
 *  lie one hop. No open run slot (a library caller, a test) ⇒ nothing to copy into, and the teardown still
 *  runs: killing the process group is the part that must not be optional. */
export function tearDownBootDeadStage(): void {
  const dead = takeBootDeadStage();
  if (dead === null) {
    return;
  }
  const { row, home } = dead.binding;
  const kept = preserveStageLogs(row.dir);
  print(
    `[snap-stage] BOOT-DEAD band ${row.band} — ${dead.reason}; tearing the stage down (dir ${row.dir}, :${String(row.serverPort)}/:${String(row.vitePort)}). ` +
      (kept === null ? "No stack log was found to preserve." : `Its stack log is preserved at ${kept}.`),
  );
  tearDownStageRow(home, row, "boot-dead");
}

/** Copy the staged stack's own logs into this run's slot before the dir goes. Best-effort by design: a
 *  missing log dir, or no run slot open, costs the reader context but must never block the process-group
 *  kill this function exists to reach. Returns where they landed, or null. */
function preserveStageLogs(dir: string): string | null {
  const source = join(dir, ".cache", "stack");
  const slot = activeRunSlot();
  if (slot === null || !existsSync(source)) {
    return null;
  }
  const target = join(slot.dir, "stage-logs");
  // @orb-waive caught-failure-ownership(catch): documented best-effort evidence copy — the doc comment above states the teardown must proceed regardless of it, and the OWNER of the failure is the printed teardown line, which says "No stack log was found to preserve" rather than naming a path it does not have. Ends if a caller starts requiring the copy to have happened.
  try {
    cpSync(source, target, { recursive: true });
    return target;
  } catch {
    return null;
  }
}
