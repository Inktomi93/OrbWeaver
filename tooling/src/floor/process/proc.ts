// tooling-subprocess-import-owner confines direct runtime subprocess imports to this module, not its callers.
// Niced doors lower the child's priority, never this process's; full-priority doors retain the caller's priority.
// Environment reads and injected transcript teardown stay separate to avoid the platform/process import cycle.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import process from "node:process";
import crossSpawn from "cross-spawn";
import { budget } from "../host/load-budget.ts";
import { processGroup } from "../host/process-tree.ts";
import type {
  CaptureCeilingOption,
  ChildExit,
  FullPriorityChild,
  FullPriorityChildOptions,
  NicedChild,
  NicedChildOptions,
  ProcessGroup,
  ProcessGroupDeps,
  RunNicedSyncOptions,
  RunNicedSyncResult,
  SpawnNicedOptions,
  SpawnNicedResult,
  TranscriptOptions,
  TranscriptResult,
} from "./proc-contract.ts";
import { inheritedProcessEnv } from "./process-env.ts";
import { launcherCommand, lowerChildPriority, nicedCommand, supervisedEnv } from "./process-priority.ts";

/** The doors' option + result shapes live in ./proc-contract.ts (split at the 450-line cap, #2242) and
 *  are re-exported here for the same reason `PrunedRun` is re-exported from ../artifacts/artifacts.ts: this module is
 *  the subprocess door every instrument imports, and where a pure type is authored is not a fact its
 *  callers should have to track. Nothing that SPAWNS may leave this file — see that module's header. */
export type {
  CaptureCeilingOption,
  ChildExit,
  FullPriorityChild,
  FullPriorityChildOptions,
  NicedChild,
  NicedChildOptions,
  ProcessGroup,
  ProcessGroupDeps,
  RunNicedSyncOptions,
  RunNicedSyncResult,
  SpawnNicedOptions,
  SpawnNicedResult,
  StopSignalTarget,
  TranscriptOptions,
  TranscriptResult,
} from "./proc-contract.ts";

function errnoIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** `detached` makes a spawned child its own process-group leader — POSIX only, since on win32 it opens a
 *  visible console instead. */
const DETACHED_GROUP_LEADER = process.platform !== "win32";

/** The spawn functions every door uses. win32 ONLY: a bare command name (`biome`, not `biome.exe`) needs
 *  PATHEXT resolution a shell-less `spawn` cannot do, and a `.cmd`/`.bat` npm-bin shim needs a shell that
 *  cross-spawn adds and quotes correctly — POSIX never touches cross-spawn, since node's own `spawn` is
 *  already correct there. One seam for every door, so a test proves the choice per platform. */
export function platformSpawn(platform: NodeJS.Platform): { readonly spawn: typeof spawn; readonly spawnSync: typeof spawnSync } {
  return platform === "win32" ? { spawn: crossSpawn.spawn, spawnSync: crossSpawn.sync } : { spawn, spawnSync };
}

const DOORS = platformSpawn(process.platform);

/** Capture an already-owned process tree before its root exits. Windows uses identity-checked forced termination. */
export function captureProcessGroup(pid: number, deps: ProcessGroupDeps = {}): ProcessGroup {
  const tree = observeProcessGroup(pid, deps);
  if (tree === null) {
    throw new Error(`process-tree root ${String(pid)} cannot be identified before termination`);
  }
  return tree;
}

/** Null proves only a Windows root is absent; it does not establish that its unobserved descendants stopped. */
export function observeProcessGroup(pid: number, deps: ProcessGroupDeps = {}): ProcessGroup | null {
  return processGroup(
    pid,
    deps.platform ?? process.platform,
    deps.run ?? ((command, args): RunNicedSyncResult => runNicedSync(command, args, { timeout: 5000 })),
    deps.signal ?? process.kill,
  );
}

/** Signal an owned process group through the native platform edge. Retain {@link captureProcessGroup} across root exit. */
export function killPidGroup(pid: number | undefined, signal: NodeJS.Signals, deps: ProcessGroupDeps = {}): void {
  if (typeof pid !== "number") {
    return;
  }
  captureProcessGroup(pid, deps).signal(signal);
}

/** The default child ceiling, LOAD-SCALED through the one policy (#1232
 *  §7.1): 120s is the QUIET-BOX base, and a caller that names no ceiling gets it stretched by the box's
 *  contention rather than killed at a number written for an idle machine. Evaluated per CALL (not at module
 *  load) because a long-lived process spawns children across changing load. */
const DEFAULT_TIMEOUT_BASE_MS = 120_000;

/** Sync spawn at the lowered priority (`nicedCommand`, or the supervising launcher when `supervised`) — never
 *  throws on a non-zero status (the caller judges). IT ALSO NEVER THROWS ON A FAILED SPAWN, which is why
 *  `errorCode` exists (#2284): `spawnSync` puts that failure on `res.error` and leaves `status` null; see the
 *  field's own note in ./proc-contract.ts for the four causes it separates. */
export function runNicedSync(cmd: string, args: readonly string[], opts: RunNicedSyncOptions = {}): RunNicedSyncResult {
  const stdio = opts.stdio === undefined || opts.stdio === "collect" ? undefined : opts.stdio;
  const supervised = opts.supervised !== undefined;
  const scratch = typeof opts.supervised === "object" ? opts.supervised.scratch : undefined;
  const niced = supervised ? launcherCommand(cmd, args) : nicedCommand(cmd, args);
  const env = supervised ? supervisedEnv(opts.env, scratch) : opts.env;
  const res = DOORS.spawnSync(niced.command, niced.args, {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(env === undefined ? {} : { env }),
    ...(opts.input === undefined ? {} : { input: opts.input }),
    ...(opts.maxBuffer === undefined ? {} : { maxBuffer: opts.maxBuffer }),
    ...(opts.timeout === undefined ? {} : { timeout: opts.timeout }),
    ...(stdio === undefined ? { encoding: "utf8" as const } : { stdio }),
  });
  const errorCode = errnoCodeOf(res.error);
  return {
    status: res.status,
    ...(res.signal === null ? {} : { signal: res.signal }),
    stdout: typeof res.stdout === "string" ? res.stdout : "",
    stderr: typeof res.stderr === "string" ? res.stderr : "",
    ...(errorCode === undefined ? {} : { errorCode }),
  };
}

/** node types `SpawnSyncReturns.error` as a bare `Error`, but every spawn failure it carries is an
 *  `ErrnoException` whose `code` is the cause (`ENOBUFS` / `ETIMEDOUT` / `ENOENT`). Read narrowly rather
 *  than casting: a future cause-less error answers `undefined` here, not a throw in a "never throws" door. */
function errnoCodeOf(error: Error | undefined): string | undefined {
  const code = (error as { readonly code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

/** execFileSync's DEFAULT forwards the child's stderr to the parent's stderr even though it also captures
 *  it — so a handled failure prints its raw diagnostic anyway, ahead of (and duplicating) the operator
 *  message the catch builds. Every door here captures instead: the thrown error carries `.stderr`, and
 *  the CALLER decides what the operator reads. */
const CAPTURED_STDIO: readonly ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];

/** node's stdio option is a MUTABLE array type; the shared constant stays readonly, so each call site
 *  spreads a fresh copy. */
function capturedStdio(): ["ignore", "pipe", "pipe"] {
  return [...CAPTURED_STDIO];
}

/** Capturing stderr means a caller that does NOT inspect `.stderr` would otherwise see only node's bare
 *  "Command failed: …". Fold the captured diagnostic into the message (the error object — and its
 *  `.stderr`/`.stdout` — is rethrown unchanged, so translating callers still see the raw text).
 *
 *  IT APPENDS ONLY WHERE NODE HAS NOT (#2272). Node's own `checkExecSyncError` already builds
 *  `Command failed: <argv>\n<stderr>` for any COMPLETED non-zero exit — Buffer stderr included — so an
 *  unconditional append DOUBLED the diagnosis on every ordinary failure in the repo. Measured, occurrences
 *  of the child's stderr text in the thrown message:
 *
 *    shape                                  helper deleted   unconditional append   this
 *    execNicedSync,       plain exit 2            1                   2               1
 *    execNicedSyncBuffer, plain exit 2            1                   2               1
 *    execNicedSync,       ENOBUFS kill            0                   1               1
 *
 *  THE LAST ROW IS WHY THE HELPER EXISTS AT ALL and why the guard is a containment test rather than a
 *  deletion. On an ENOBUFS kill node throws a DIFFERENT error — the child was TERMINATED at the ceiling
 *  rather than completing — whose message carries the argv and nothing else, and this append is the entire
 *  repair. That is the #2211/#2212 incident shape (the buffer ceiling that made the whole-repo lint tier
 *  unobtainable and whose diagnosis was unreadable until this function existed).
 *
 *  THE GUARD IS `includes`, NOT A SHAPE MATCH ON NODE'S TEMPLATE. Matching `Command failed:` would key on
 *  a private message format; asking whether the DIAGNOSIS IS ALREADY IN THE MESSAGE is the property the
 *  caller cares about, and it stays correct if node reformats. */
function withCapturedStderr(error: unknown): never {
  const stderr = typeof error === "object" && error !== null ? (error as { readonly stderr?: unknown }).stderr : undefined;
  let text = "";
  if (typeof stderr === "string") {
    text = stderr.trim();
  } else if (Buffer.isBuffer(stderr)) {
    text = stderr.toString("utf8").trim();
  }
  if (error instanceof Error && text !== "" && !error.message.includes(text)) {
    error.message = `${error.message}\n${text}`;
  }
  throw error;
}

/** Sync exec at the lowered priority (`nicedCommand`) — THROWS on a non-zero status (execFileSync
 *  semantics), returns stdout. The git-helper shape: an unknown ref/failed command is an exception. */
export function execNicedSync(cmd: string, args: readonly string[], opts: CaptureCeilingOption & { readonly cwd?: string } = {}): string {
  try {
    const niced = nicedCommand(cmd, args);
    return execFileSync(niced.command, niced.args, {
      encoding: "utf8",
      stdio: capturedStdio(),
      ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
      // #2211/#2212: the hazard is declared once on `CaptureCeilingOption` above — unset means node's ~1MiB,
      // and `execFileSync` KILLS the child at that ceiling rather than truncating.
      ...(opts.maxBuffer === undefined ? {} : { maxBuffer: opts.maxBuffer }),
    });
  } catch (error) {
    return withCapturedStderr(error);
  }
}

/** Sync exec at the lowered priority (`nicedCommand`) returning RAW BYTES — the same throw-on-non-zero
 *  semantics as execNicedSync. Exists because a caller that HASHES its output (`git show <commit>:<path>`
 *  → sha256) must never round-trip through a utf8 decode: the hash is over the blob's bytes, not a re-encoding. */
export function execNicedSyncBuffer(
  cmd: string,
  args: readonly string[],
  opts: CaptureCeilingOption & { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv } = {},
): Buffer {
  try {
    const niced = nicedCommand(cmd, args);
    return execFileSync(niced.command, niced.args, {
      stdio: capturedStdio(),
      ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
      ...(opts.env === undefined ? {} : { env: opts.env }),
      ...(opts.maxBuffer === undefined ? {} : { maxBuffer: opts.maxBuffer }),
    });
  } catch (error) {
    return withCapturedStderr(error);
  }
}

/** Retains full priority for interactive request-serving workloads; background tools use the niced doors. */
export function spawnFullPrioritySync(
  cmd: string,
  args: readonly string[],
  opts: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly stdio?: "inherit" | "ignore" } = {},
): { readonly status: number | null } {
  const res = DOORS.spawnSync(cmd, [...args], {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
    stdio: opts.stdio ?? "inherit",
  });
  return { status: res.status };
}

/** Retains full priority for long-lived interactive workloads; background children use {@link spawnNicedChild}. */
export function spawnFullPriorityChild(cmd: string, args: readonly string[], opts: FullPriorityChildOptions = {}): FullPriorityChild {
  const logFd = opts.logPath === undefined ? undefined : openSync(opts.logPath, "a");
  const child = DOORS.spawn(cmd, [...args], {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
    detached: opts.detached ?? false,
    stdio: childStdio(opts.stdio, logFd),
  });
  if (logFd !== undefined) {
    // The child holds its own dups; the parent copy would leak one fd per spawn (engines audit, 08-03).
    closeSync(logFd);
  }
  return {
    pid: child.pid,
    stdout: child.stdout,
    hasExited: (): boolean => child.exitCode !== null || child.signalCode !== null,
    unref: (): void => child.unref(),
    kill: (signal): void => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      try {
        child.kill(signal);
      } catch (error) {
        if (!errnoIs(error, "ESRCH")) {
          throw error;
        }
      }
    },
    killGroup: (signal): void => killPidGroup(child.pid, signal),
    wait: (): Promise<ChildExit> =>
      new Promise<ChildExit>((resolve) => {
        child.on("error", (error) => resolve({ code: null, signal: null, error }));
        child.on("exit", (code, signal) => resolve({ code, signal, error: undefined }));
      }),
  };
}

function childStdio(
  stdio: FullPriorityChildOptions["stdio"],
  logFd: number | undefined,
): "inherit" | "ignore" | ["ignore", "pipe", "inherit"] | ["ignore", number, number] | ["ignore", "pipe", "pipe"] {
  if (stdio === "inherit" || stdio === "ignore") {
    return stdio;
  }
  if (stdio === "pipe-stdout") {
    return ["ignore", "pipe", "inherit"];
  }
  return logFd === undefined ? ["ignore", "pipe", "pipe"] : ["ignore", logFd, logFd];
}

/** Long-lived detached child, priority lowered directly after spawn (own process group, reaped by
 *  `killGroup`) — the ASYNC-door half of the niced-exec.ts pair, see `lowerChildPriority`'s header. */
export function spawnNicedChild(cmd: string, args: readonly string[], opts: NicedChildOptions = {}): NicedChild {
  if (opts.logPath !== undefined && opts.onOutput !== undefined) {
    throw new Error("spawnNicedChild: logPath and onOutput are mutually exclusive — a child logs to a file or pipes to its parent, never both");
  }
  const logFd = opts.logPath === undefined ? undefined : openSync(opts.logPath, "a");
  const child = DOORS.spawn(cmd, [...args], {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
    // win32 `detached` opens a new console window; the launcher below stays foreground there instead.
    detached: DETACHED_GROUP_LEADER,
    stdio: childStdio(undefined, logFd),
  });
  lowerChildPriority(child.pid);
  if (logFd !== undefined) {
    // The child holds its own dups; the parent copy would leak one fd per spawn (engines audit, 08-03).
    closeSync(logFd);
  }
  if (opts.onOutput !== undefined && child.stdout !== null && child.stderr !== null) {
    child.stdout.on("data", opts.onOutput);
    child.stderr.on("data", opts.onOutput);
  }
  return {
    pid: child.pid,
    hasExited: (): boolean => child.exitCode !== null || child.signalCode !== null,
    killGroup: (signal): void => killPidGroup(child.pid, signal),
    unref: (): void => child.unref(),
  };
}

/** Long-running child, priority lowered directly after spawn, whose OUTPUT ORDER is load-bearing: stdout
 *  and stderr are captured INTERLEAVED in arrival order, with no maxBuffer ceiling (`CaptureCeilingOption`
 *  above is the one home for why: the ceiling kills, it does not clip — so this door declines to have one).
 *  The caller names the TIME ceiling instead; past it the child's whole GROUP dies and the transcript says
 *  so. The verify runner's stage door. */
export function spawnNicedTranscript(cmd: string, args: readonly string[], opts: TranscriptOptions): Promise<TranscriptResult> {
  return new Promise<TranscriptResult>((resolvePromise) => {
    const chunks: string[] = [];
    // `detached` so the child leads its own group: a stage is `pnpm → node → the tool`, and killing only
    // the direct child leaves the tool running with the pipes open — the promise would never settle.
    const child = DOORS.spawn(cmd, [...args], { cwd: opts.cwd, shell: false, env: opts.env, detached: DETACHED_GROUP_LEADER });
    lowerChildPriority(child.pid);
    // THE GROUP KILL IS NOT THE WHOLE TEARDOWN (#1848). Playwright's browsers and vite's service children
    // leave the group, so the caller's teardown runs AFTER it and the promise waits for it to finish —
    // otherwise the transcript would resolve before the line saying what it reaped.
    let sweeping: Promise<string | null> | null = null;
    let timedOut = false;
    const teardown = opts.teardown;
    const killGroup = (): void => {
      killPidGroup(child.pid, "SIGKILL");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      chunks.push(`\n[proc] TIMED OUT after ${opts.timeoutMs}ms — stopping the process group of pid ${child.pid ?? "?"}\n`);
      try {
        killGroup();
        sweeping = teardown === undefined ? null : teardown.afterTimeoutKill();
      } catch (error) {
        chunks.push(`\n[proc] process termination failed: ${String(error)}\n`);
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        finish(null);
      }
    }, opts.timeoutMs);
    // THE OPERATOR'S Ctrl-C is the other kill path: without the guard the runner dies, the stage child
    // dies with the terminal, and the browsers stay. The caller's teardown owns that policy.
    const guard = teardown === undefined ? null : teardown.arm(killGroup);
    const settle = async (code: number | null): Promise<void> => {
      clearTimeout(timer);
      guard?.dispose();
      const line = sweeping === null ? null : await sweeping;
      resolvePromise({ code: timedOut ? null : code, transcript: `${chunks.join("")}${line === null ? "" : `${line}\n`}` });
    };
    /** Settle, and NAME a teardown that itself failed — the promise must resolve on every path, or the one
     *  door written to end a hang becomes the hang. A failed teardown is `code: null` (a tool error). */
    const finish = (code: number | null): void => {
      // the handler puts "[proc] teardown failed: …" in the transcript this door returns and settles with code null, which every stage classifier maps to a tool error (runOneStage writes the transcript to the stage log); the promise must settle here or the door that ends a hang becomes one. Ends if the handler stops resolving or stops naming the error.
      settle(code).catch((error: unknown) => {
        resolvePromise({ code: null, transcript: `${chunks.join("")}\n[proc] teardown failed: ${String(error)}\n` });
      });
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      chunks.push(chunk);
      opts.onChunk?.(chunk, "stdout");
    });
    child.stderr.on("data", (chunk: string) => {
      chunks.push(chunk);
      opts.onChunk?.(chunk, "stderr");
    });
    // A spawn failure (ENOENT on the bin) never emits `close` with a status — surface it AS a tool error
    // (status null ⇒ every classifier returns 2) with the reason in the transcript, never a silent 0.
    child.on("error", (err: Error) => {
      chunks.push(`\n[proc] spawn failed: ${err.message}\n`);
      finish(null);
    });
    // `close` (not `exit`) — it fires after BOTH pipes are drained, so no tail chunk is lost.
    child.on("close", (code: number | null) => {
      finish(code);
    });
  });
}

/** Spawn `cmd args…`, priority lowered directly after spawn, collect utf8 output, resolve on exit
 *  (never rejects on a non-zero code — the CALLER judges codes against the exit contract). */
export function spawnNiced(cmd: string, args: readonly string[], opts: SpawnNicedOptions = {}): Promise<SpawnNicedResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const spawned = opts.supervised === true ? launcherCommand(cmd, args) : { command: cmd, args };
    const child = DOORS.spawn(spawned.command, [...spawned.args], {
      cwd: opts.cwd,
      env: opts.supervised === true ? supervisedEnv(inheritedProcessEnv(opts.env)) : inheritedProcessEnv(opts.env),
      stdio: ["ignore", "pipe", "pipe"],
      // Its own process group, the `spawnNicedChild`/`spawnFullPriorityChild` shape — see the timeout below.
      detached: DETACHED_GROUP_LEADER,
    });
    lowerChildPriority(child.pid);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      // The GROUP, not the direct child (#1508): a command that forks descendants left them RUNNING after
      // the caller had already seen `timedOut: true`, and those orphans pollute a later run's measurements.
      try {
        killPidGroup(child.pid, "SIGKILL");
      } catch (error) {
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        rejectPromise(error);
      }
    }, opts.timeoutMs ?? budget(DEFAULT_TIMEOUT_BASE_MS));
    child.on("error", (e) => {
      clearTimeout(timer);
      rejectPromise(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr, timedOut });
    });
  });
}
