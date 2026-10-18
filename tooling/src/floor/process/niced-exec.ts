// The portable `nice`: lowers its own priority, then runs argv as its child. Package.json scripts, win32 sync
// doors and supervised sync doors (`LAUNCHER_PARENT_ENV` set) launch it. A supervised launcher guards its
// caller's pid and stops and joins the child if that caller dies, since a caller blocked in spawnSync cannot.
import process from "node:process";
import { pidAlive } from "../artifacts/run-retention.ts";
import { EXIT } from "../cli/exit-contract.ts";
import { spawnFullPriorityChild } from "./proc.ts";
import { childExitCode } from "./proc-signals.ts";
import { inheritedProcessEnv, processEnvValue } from "./process-env.ts";
import { LAUNCHER_PARENT_ENV, lowerToolingPriority } from "./process-priority.ts";
import { escalateStop } from "./stop-escalation.ts";

const PARENT_POLL_MS = 500;
const IGNORED_SIGNALS = ["SIGINT", "SIGQUIT", "SIGHUP"] as const;

lowerToolingPriority();

// The caller names its own pid: a caller that died before this module loaded has already reparented us,
// so `process.ppid` read here could name the subreaper. POSIX reparents an orphan; win32 never does.
function parentGone(parent: number): boolean {
  return process.ppid !== parent || (process.platform === "win32" && !pidAlive(parent));
}

// Die of the child's own signal so a supervised sync door reads `signal`, not a 128+N code. win32 has no
// such death; the exit code mirror stands there.
function mirrorSignal(signal: NodeJS.Signals | null): void {
  if (signal === null || process.platform === "win32") {
    return;
  }
  for (const name of [...IGNORED_SIGNALS, "SIGTERM"] as const) {
    process.removeAllListeners(name);
  }
  process.kill(process.pid, signal);
}

function supervisedParent(): number | undefined {
  const value = processEnvValue(LAUNCHER_PARENT_ENV);
  return value === undefined ? undefined : Number(value);
}

function run(argv: readonly string[]): void {
  const [cmd, ...args] = argv;
  if (cmd === undefined) {
    process.stderr.write("niced-exec: no command given\n");
    process.exitCode = EXIT.misuse;
    return;
  }
  const parent = supervisedParent();
  if (parent !== undefined && parentGone(parent)) {
    process.stderr.write(`niced-exec: caller ${String(parent)} exited before ${cmd} started\n`);
    process.exitCode = EXIT.toolError;
    return;
  }

  // A nested launcher in the child's tree must not guard this launcher's caller.
  const env = inheritedProcessEnv();
  delete env[LAUNCHER_PARENT_ENV];
  // Not detached: a group kill aimed at this launcher (Ctrl-C, a stage timeout) must reach the child too.
  const child = spawnFullPriorityChild(cmd, args, { stdio: "inherit", env });

  // The terminal and group kills deliver these to the child directly; dying first would orphan it.
  const ignore = (): void => undefined;
  for (const signal of IGNORED_SIGNALS) {
    process.on(signal, ignore);
  }
  let watch: ReturnType<typeof setInterval> | undefined;
  if (parent === undefined) {
    // Script mode relays a TERM aimed at this pid and leaves the child's own shutdown unbounded.
    process.on("SIGTERM", () => child.kill("SIGTERM"));
  } else {
    let stopping = false;
    const stop = (): void => {
      if (stopping) {
        return;
      }
      stopping = true;
      escalateStop({ signal: (signal) => child.kill(signal), gone: child.hasExited })
        .then((gone) => {
          if (!gone) {
            process.stderr.write(`niced-exec: ${cmd} outlived TERM and KILL\n`);
          }
        })
        .catch((error: unknown) => {
          process.stderr.write(`niced-exec: stopping ${cmd} failed: ${String(error)}\n`);
          process.exitCode = EXIT.toolError;
        });
    };
    process.on("SIGTERM", stop);
    watch = setInterval(() => {
      if (parentGone(parent)) {
        stop();
      }
    }, PARENT_POLL_MS);
    watch.unref();
  }

  child
    .wait()
    .then((exit) => {
      clearInterval(watch);
      if (exit.error !== undefined) {
        process.stderr.write(`niced-exec: spawn failed: ${cmd}: ${exit.error.message}\n`);
        process.exitCode = EXIT.toolError;
        return;
      }
      process.exitCode = childExitCode(exit);
      if (parent !== undefined) {
        mirrorSignal(exit.signal);
      }
    })
    .catch((error: unknown) => {
      // `wait()` never rejects (a spawn failure resolves as `exit.error`, above) — this is a pure
      // exhaustiveness backstop the `no-floating-promises` rule requires, never a real branch.
      process.stderr.write(`niced-exec: unreachable: ${String(error)}\n`);
      process.exitCode = EXIT.toolError;
    });
}

run(process.argv.slice(2));
