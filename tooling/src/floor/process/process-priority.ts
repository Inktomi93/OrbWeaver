// The tooling priority and how a child reaches it on every OS: `nice` on POSIX, the `niced-exec.ts` launcher
// on win32 or when supervised. Nothing here lowers the CALLER's own priority — a full-priority child spawned by the same
// process must stay at that process's real priority, not a niced door's leftover.
import { constants, getPriority, setPriority } from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { NicedCommand } from "./proc-contract.ts";
import { inheritedProcessEnv } from "./process-env.ts";

/** Below-normal, not `PRIORITY_LOW` (19): on Windows 19 maps to the IDLE priority class, which can starve
 *  a run behind a busy desktop. `PRIORITY_BELOW_NORMAL` (10) is below-normal on every OS. */
export const TOOLING_PRIORITY: number = constants.priority.PRIORITY_BELOW_NORMAL;

let lowered = false;

/** Lower THIS process's own priority once; idempotent so `niced-exec.ts` can call it unconditionally at
 *  startup. A child spawned after this call inherits the lowered priority. A process already below the
 *  target stays there, as under `nice`: an unprivileged process cannot raise its priority back. */
export function lowerToolingPriority(): void {
  if (lowered) {
    return;
  }
  lowered = true;
  if (getPriority() < TOOLING_PRIORITY) {
    setPriority(TOOLING_PRIORITY);
  }
}

const NICED_EXEC_ENTRY = fileURLToPath(new URL("./niced-exec.ts", import.meta.url));

/** The `niced-exec.ts` launcher form: it lowers its own priority, then runs `cmd` as its child. */
export function launcherCommand(cmd: string, args: readonly string[]): NicedCommand {
  return { command: process.execPath, args: [NICED_EXEC_ENTRY, cmd, ...args] };
}

/** Names the pid a supervised launcher guards; set only by {@link supervisedEnv}. */
export const LAUNCHER_PARENT_ENV = "ORB_LAUNCHER_PARENT";

/** The environment for a supervised launcher: `env` (or the ambient one) plus this caller's pid. */
export function supervisedEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  return { ...(env ?? inheritedProcessEnv()), [LAUNCHER_PARENT_ENV]: String(process.pid) };
}

/** The command a SYNC door spawns to run `cmd args…` at {@link TOOLING_PRIORITY}: a sync spawn returns no pid
 *  to lower before the child runs. POSIX uses `nice`, which execs `cmd` in place; win32 has no `nice`, so it
 *  boots the `niced-exec.ts` launcher, which costs a node start per call. `nice` adds to the caller's own
 *  niceness, so it gets the distance to the target, never below zero. An ASYNC door spawns `cmd` directly and
 *  calls {@link lowerChildPriority} instead. */
export function nicedCommand(cmd: string, args: readonly string[], platform: NodeJS.Platform = process.platform): NicedCommand {
  return platform === "win32"
    ? launcherCommand(cmd, args)
    : { command: "nice", args: ["-n", String(Math.max(0, TOOLING_PRIORITY - getPriority())), cmd, ...args] };
}

/** Lower an already-spawned child's OS priority directly — the async-door half of the pair above. Never
 *  throws: the child may have already exited (a fast `true`/`echo`) by the time this runs, which is not a
 *  caller-visible failure. */
export function lowerChildPriority(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }
  // @orb-waive caught-failure-ownership(error): the child racing to exit before this call lands is expected and harmless — the priority hint is advisory, not a correctness requirement, and the caller's own exit/error handlers own the child's real outcome. Ends if a caller starts depending on this call's success.
  try {
    setPriority(pid, TOOLING_PRIORITY);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as { readonly code?: unknown }).code : undefined;
    if (code !== "ESRCH") {
      throw error;
    }
  }
}
