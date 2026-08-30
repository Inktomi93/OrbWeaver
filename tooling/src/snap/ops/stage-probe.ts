// WHAT IS RUNNING, AND WHOSE IS IT — the observation half of the isolated stage, split out of ops/stage.ts
// when that file crossed the tooling line cap (docs/architecture/core/Core-Tooling-Law.md §4.3). One command family:
// read the band's port owners, decide whether a bound port belongs to a STAGE, age a process, kill a
// process group, and list the stage dirs on disk. Nothing here boots, tears down or judges — ops/stage.ts
// orchestrates and lib/stage-plan.ts rules; these are the raw signals both of them read.
//
// Every negative here is "I could not measure", never "it is not there": `ss`/`ps`/`readlink` failing to
// answer returns null or false, and the callers are written to treat that as unknown rather than as
// permission to act. That is what keeps the #324 sweep from ever reaping something it merely failed to
// identify (the #310 liveness-gate lesson).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { StagePorts } from "../contract/stage.ts";
import { STAGE_ROOT_REL } from "../lib/stage-plan.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const SS_PID_RE = /pid=(\d+)/u;

/** The pid bound to a stage-band port (via `ss -tlnp`), or null — the marker-less teardown's index. */
export function stageBandPortPid(port: number): number | null {
  const out = runNicedSync("ss", ["-tlnp"]);
  if (out.status !== 0) {
    return null;
  }
  for (const line of out.stdout.split("\n")) {
    if (line.includes(`:${port} `)) {
      const m = SS_PID_RE.exec(line);
      if (m !== null) {
        return Number(m[1]);
      }
    }
  }
  return null;
}

/** Is EITHER half of the fixed band bound right now? The liveness half of the #108 ownership question —
 *  a foreign marker over an unbound band is a corpse to reclaim, over a bound one it is a live sibling.
 *  The #324 sweep asks the same question before judging anything. */
export function bandIsBound(ports: StagePorts): boolean {
  return stageBandPortPid(ports.server) !== null || stageBandPortPid(ports.vite) !== null;
}

/** Is the process holding a band port actually a SNAP STAGE? The sweep's one hard fence (#324): a stage
 *  runs out of `.cache/snap-stage/<key>/`, so both its cwd and its argv name that path, and anything else
 *  on a band port — the dev stack on a mis-set PORT, an unrelated server — is never ours to kill. Both
 *  signals are read because either alone can be missing (a `/proc` we cannot readlink; a `stack.sh` child
 *  re-exec'd with a bare argv). No signal at all ⇒ FALSE: "I could not identify it" is not "it is a stage". */
export function pidIsStageRooted(pid: number): boolean {
  const cwd = runNicedSync("readlink", ["-f", `/proc/${pid}/cwd`]);
  if (cwd.status === 0 && cwd.stdout.includes(STAGE_ROOT_REL)) {
    return true;
  }
  const args = runNicedSync("ps", ["-o", "args=", "-p", String(pid)]);
  return args.status === 0 && args.stdout.includes(STAGE_ROOT_REL);
}

/** Elapsed seconds of a process, or null when `ps` cannot say (a dead/unreadable pid). The AGE signal for
 *  a marker-less stage — the sweep treats a null as "unknown", never as "old" (see stageSweepVerdict). */
export function pidElapsedSeconds(pid: number): number | null {
  const res = runNicedSync("ps", ["-o", "etimes=", "-p", String(pid)]);
  if (res.status !== 0) {
    return null;
  }
  const seconds = Number(res.stdout.trim());
  return Number.isFinite(seconds) ? seconds : null;
}

/** Kill a pid's whole PROCESS GROUP — a stage leader is `stack.sh` with dev.sh/node/vite children, and
 *  killing the leader alone leaves exactly the orphans #324 is about. Returns whether a group was named. */
export function killProcessGroup(pid: number): boolean {
  const pgid = runNicedSync("ps", ["-o", "pgid=", "-p", String(pid)]).stdout.trim();
  if (pgid.length === 0) {
    return false;
  }
  runNicedSync("kill", ["-TERM", `-${pgid}`], { stdio: "ignore" });
  return true;
}

/** Stage worktree/dir names present under `.cache/snap-stage/` (excludes active.json). Stage dirs are
 *  per-checkout by design — each is a worktree of its own checkout — so this can only ever see ours. */
export function stageDirs(root: string): string[] {
  const dir = join(root, STAGE_ROOT_REL);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
