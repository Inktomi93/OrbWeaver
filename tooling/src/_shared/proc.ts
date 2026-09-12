// The ONE subprocess home (policy `tooling-child-process-door`): every tooling spawn rides `nice -n 19`
// (owner-endorsed 2026-08-21 — the box co-hosts the homelab; an un-niced fleet starved it, and a direct
// child_process import silently bypasses the floor). `nice` execs the command in-process, so the child
// pid IS the command and timeout kills land on it directly. Three seams: spawnNiced (async, collected,
// timeout — the runCli shape), runNicedSync (sync, collect or stdio passthrough — the imperative-orchestration
// shape), execNicedSync (sync, THROWS on non-zero, returns stdout — the git-helper shape).
//
// THE AMBIENT-ENV DOOR MOVED OUT (#1848) to ./process-env.ts — same functions, same names, same behaviour
// — when the run-marker sweep was wired into the transcript door's kill path and this file reached its
// 450-line cap. Reading the environment is not a subprocess capability; spawning is, and that half is here.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import process from "node:process";
import { budget } from "./load-budget.ts";
import { inheritedProcessEnv } from "./process-env.ts";
import type { RunMarkerSweep } from "./run-marker.ts";
import { armRunMarkerTeardown, describeRunMarkerSweep, sweepRunMarker } from "./run-marker.ts";

function errnoIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** Signal a whole process GROUP by its pgid — THE ONE door. Both child doors share it: signalling only the
 *  direct child orphans the real tree (pnpm→node→server, setsid→vllm→EngineCore). Exported for the stage
 *  teardowns (#1254): never spell this as the external `kill -SIG -<pgid>` — procps-ng 4.0.4 parses that
 *  argument by its FIRST DIGIT (`kill -TERM -4570` → `kill(-4)`), so a seven-digit pgid starting in 1
 *  became `kill(-1)` and logged the owner out (2026-09-02). The syscall takes the real negative pgid. */
export function killPidGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (typeof pid !== "number") {
    return;
  }
  // @orb-waive caught-failure-ownership(error): ESRCH is the desired teardown end state; every other signal error is rethrown. Ends if callers require proof that the signal landed.
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!errnoIs(error, "ESRCH")) {
      throw error;
    }
  }
}

export interface SpawnNicedOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Wall-clock ceiling; on expiry the child gets SIGKILL and `timedOut` is true. */
  readonly timeoutMs?: number;
}

export interface SpawnNicedResult {
  /** null = killed by signal (incl. the timeout kill). */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** The default child ceiling, LOAD-SCALED through the one policy (#1232, docs/design/1208-instrument-substrate.md
 *  §7.1): 120s is the QUIET-BOX base, and a caller that names no ceiling gets it stretched by the box's
 *  contention rather than killed at a number written for an idle machine. Evaluated per CALL (not at module
 *  load) because a long-lived process spawns children across changing load. */
const DEFAULT_TIMEOUT_BASE_MS = 120_000;

export interface RunNicedSyncOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** "collect" (default) captures utf8 stdout/stderr; "inherit" streams to the operator's terminal
   *  (the stack-boot / rsync shape); "ignore" discards. */
  readonly stdio?: "collect" | "inherit" | "ignore";
  /** Raise node's ~1MiB capture ceiling. spawnSync does NOT truncate at the ceiling, it TERMINATES the
   *  child (SIGTERM + ENOBUFS) — so a caller whose payload is genuinely large (ts7 `--listFilesOnly` over
   *  the whole graph is ~5,400 paths / ~0.5MB) must raise it or its verdict silently becomes a kill. */
  readonly maxBuffer?: number;
  /** Wall-clock ceiling in ms; the child is killed past it (`status` comes back null). A caller whose
   *  child can hang — a planted mutant that turns a loop infinite is the standing case — MUST set this,
   *  or the run never returns a verdict at all. */
  readonly timeout?: number;
}

export interface RunNicedSyncResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Sync spawn under `nice -n 19` — never throws on a non-zero status (the caller judges). */
export function runNicedSync(cmd: string, args: readonly string[], opts: RunNicedSyncOptions = {}): RunNicedSyncResult {
  const stdio = opts.stdio === undefined || opts.stdio === "collect" ? undefined : opts.stdio;
  const res = spawnSync("nice", ["-n", "19", cmd, ...args], {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
    ...(opts.maxBuffer === undefined ? {} : { maxBuffer: opts.maxBuffer }),
    ...(opts.timeout === undefined ? {} : { timeout: opts.timeout }),
    ...(stdio === undefined ? { encoding: "utf8" as const } : { stdio }),
  });
  return { status: res.status, stdout: typeof res.stdout === "string" ? res.stdout : "", stderr: typeof res.stderr === "string" ? res.stderr : "" };
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
 *  `.stderr`/`.stdout` — is rethrown unchanged, so translating callers still see the raw text). */
function withCapturedStderr(error: unknown): never {
  const stderr = typeof error === "object" && error !== null ? (error as { readonly stderr?: unknown }).stderr : undefined;
  let text = "";
  if (typeof stderr === "string") {
    text = stderr.trim();
  } else if (Buffer.isBuffer(stderr)) {
    text = stderr.toString("utf8").trim();
  }
  if (error instanceof Error && text !== "") {
    error.message = `${error.message}\n${text}`;
  }
  throw error;
}

/** Sync exec under `nice -n 19` — THROWS on a non-zero status (execFileSync semantics), returns stdout.
 *  The git-helper shape: an unknown ref/failed command is an exception, not a verdict. */
export function execNicedSync(cmd: string, args: readonly string[], opts: { readonly cwd?: string; readonly maxBuffer?: number } = {}): string {
  try {
    return execFileSync("nice", ["-n", "19", cmd, ...args], {
      encoding: "utf8",
      stdio: capturedStdio(),
      ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
      // #2211: without this the child inherits node's ~1MiB ceiling, and execFileSync does NOT truncate at
      // it — it KILLS the child with ENOBUFS, so a large payload turns a verdict into a tool error. Its
      // sibling `runNicedSync` has carried this option (and the warning above it) all along; this door did
      // not, and `runEslint`'s discovery step outgrew 1MiB unnoticed.
      ...(opts.maxBuffer === undefined ? {} : { maxBuffer: opts.maxBuffer }),
    });
  } catch (error) {
    return withCapturedStderr(error);
  }
}

/** Sync exec under `nice -n 19` returning RAW BYTES — the same throw-on-non-zero semantics as
 *  execNicedSync. Exists because a caller that HASHES its output (doc-catalog's `git show <commit>:<path>`
 *  → sha256) must never round-trip through a utf8 decode: the receipt hash has to be over the blob's
 *  bytes, not over a re-encoding of them. */
export function execNicedSyncBuffer(cmd: string, args: readonly string[], opts: { readonly cwd?: string } = {}): Buffer {
  try {
    return execFileSync("nice", ["-n", "19", cmd, ...args], {
      stdio: capturedStdio(),
      ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    });
  } catch (error) {
    return withCapturedStderr(error);
  }
}

/** The ONE full-priority door — NO nice wrapper, loudly named so its callers ARE the exception census
 *  (policy `tooling-child-process-door`: one `full-priority-spawn` reviewed grant per caller). Reserved for a process a USER
 *  interactively waits on whose children serve requests (the snap stage's stack boot: a -19 staged app
 *  times out navigations under load, skewing the very receipts the stage exists to take). Everything
 *  else rides the niced doors above. */
export function spawnFullPrioritySync(
  cmd: string,
  args: readonly string[],
  opts: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv; readonly stdio?: "inherit" | "ignore" } = {},
): { readonly status: number | null } {
  const res = spawnSync(cmd, [...args], {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
    stdio: opts.stdio ?? "inherit",
  });
  return { status: res.status };
}

export interface FullPriorityChildOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Append the child's stdout+stderr here. The parent opens the fd and closes its own copy immediately —
   *  the child keeps its dups, so a detached child's logs keep flowing after the launcher exits, and the
   *  launcher never leaks one fd per spawn. */
  readonly logPath?: string;
  /** node-level `detached` (setsid before exec). Leave false when the ARGV itself starts with `setsid`. */
  readonly detached?: boolean;
  /** `"inherit"` gives the child THIS terminal (the foreground-run shape) — mutually exclusive with logPath. */
  readonly stdio?: "inherit";
}

export interface ChildExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  /** Set when the spawn itself failed (ENOENT on the binary); `code`/`signal` are then null. */
  readonly error: Error | undefined;
}

export interface FullPriorityChild {
  readonly pid: number | undefined;
  readonly hasExited: () => boolean;
  /** Drop the handle from the parent's event loop — without it an "exited" launcher lives exactly as long
   *  as its children (the 2026-08-03 immortal-launcher audit). */
  readonly unref: () => void;
  readonly kill: (signal: NodeJS.Signals) => void;
  readonly killGroup: (signal: NodeJS.Signals) => void;
  /** Resolve when the child exits (or fails to spawn) — the foreground shape, where the caller mirrors the
   *  child's status instead of detaching from it. */
  readonly wait: () => Promise<ChildExit>;
}

/** The DETACHED-child twin of spawnFullPrioritySync — NO nice wrapper, same census discipline (policy
 *  `tooling-child-process-door`, the same per-caller grants). Reserved for a long-lived child that IS the
 *  interactive workload a human is waiting on (vLLM inference or a stateful browser session); everything
 *  else rides spawnNicedChild. */
export function spawnFullPriorityChild(cmd: string, args: readonly string[], opts: FullPriorityChildOptions = {}): FullPriorityChild {
  const logFd = opts.logPath === undefined ? undefined : openSync(opts.logPath, "a");
  const child = spawn(cmd, [...args], {
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
    hasExited: (): boolean => child.exitCode !== null || child.signalCode !== null,
    unref: (): void => child.unref(),
    kill: (signal): void => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      // @orb-waive caught-failure-ownership(error): ESRCH or an observed child exit makes kill idempotent; every still-live signal failure rethrows. Ends if child exit fields stop being authoritative.
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

function childStdio(stdio: "inherit" | undefined, logFd: number | undefined): "inherit" | ["ignore", number, number] | ["ignore", "pipe", "pipe"] {
  if (stdio === "inherit") {
    return "inherit";
  }
  return logFd === undefined ? ["ignore", "pipe", "pipe"] : ["ignore", logFd, logFd];
}

export interface NicedChildOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Receives every stdout/stderr chunk (probe-fire forwards the child server's output to ITS stderr
   *  so boot failures stay visible while the parseable payload owns stdout). */
  readonly onOutput?: (chunk: Buffer) => void;
  /** Append the child's stdout+stderr here instead of piping them to THIS process — the DAEMON shape
   *  (snap's session daemon): a detached child that outlives its launcher must never hold a pipe to it,
   *  because its first write after the launcher exits is EPIPE. Mutually exclusive with `onOutput`; the
   *  parent's fd copy is closed at once (the `spawnFullPriorityChild` discipline). */
  readonly logPath?: string;
}

export interface NicedChild {
  readonly pid: number | undefined;
  /** Has the child already exited? A supervisor polling an endpoint must be able to tell "not up YET" from
   *  "died during boot" — without it, a crashed child burns the caller's whole boot timeout. */
  readonly hasExited: () => boolean;
  /** Signal the WHOLE process group — `detached:true` gives the child its own pgid, so this reaps the
   *  full tree (pnpm→node→server); signalling only the direct child orphans the real process. */
  readonly killGroup: (signal: NodeJS.Signals) => void;
  /** Drop the handle from the parent's event loop — node waits on a detached child until the parent
   *  `unref`s it, so a launcher that must EXIT before its daemon calls this. */
  readonly unref: () => void;
}

/** Long-lived detached child under `nice -n 19` (the ephemeral-server / supervisor / daemon shape): own
 *  process group, output piped via `onOutput` OR appended to `logPath`, reaped by `killGroup`. The caller
 *  owns lifecycle; nothing here waits for exit. */
export function spawnNicedChild(cmd: string, args: readonly string[], opts: NicedChildOptions = {}): NicedChild {
  if (opts.logPath !== undefined && opts.onOutput !== undefined) {
    throw new Error("spawnNicedChild: logPath and onOutput are mutually exclusive — a child logs to a file or pipes to its parent, never both");
  }
  const logFd = opts.logPath === undefined ? undefined : openSync(opts.logPath, "a");
  const child = spawn("nice", ["-n", "19", cmd, ...args], {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
    detached: true,
    stdio: childStdio(undefined, logFd),
  });
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

export interface TranscriptOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** REQUIRED wall-clock ceiling (#1508). This door had NO timeout at all — the promise settled only on
   *  `error`/`close`, so one wedged child hung the whole `pnpm verify` run forever with no verdict and no
   *  artifact. Required rather than defaulted: how long a stage may legitimately take is the CALLER's
   *  policy, and a default here would silently pick one for a caller that never considered it. */
  readonly timeoutMs: number;
  /** Called with every stdout/stderr chunk AS IT ARRIVES, tagged by stream, so a caller can mirror the
   *  child live (the verify runner's `--verbose`) without giving up the captured transcript. */
  readonly onChunk?: (chunk: string, stream: "stdout" | "stderr") => void;
  /** THE RUN MARKER this child (and every descendant) carries in its environment — `_shared/run-marker.ts`.
   *  With it set, the kill paths below stop being blind to a process that LEFT THE GROUP: after the group
   *  kill they sweep every live pid whose `/proc/<pid>/environ` names this marker. Playwright starts each
   *  browser in its own session, so without this a timed-out CT stage leaves its whole Chromium fleet
   *  running (72 of them, up to 40 h old, on 2026-09-06 — #1848). The CALLER passes the value it also put
   *  in `env`; a caller that sets neither keeps the old group-only behaviour. */
  readonly runMarker?: string;
}

export interface TranscriptResult {
  /** null = killed by signal — ALWAYS a tool error, never a verdict. */
  readonly code: number | null;
  /** stdout+stderr as ONE transcript in ARRIVAL order — so the TAIL of the transcript is the tail of the
   *  RUN. Whole-stream CONCATENATION (`stdout + stderr`) put the tail of STDERR last, which for a compound
   *  stage (vitest && playwright-ct) meant pnpm's banner and node warnings, while the real verdict sat
   *  mid-file — a CT failure read as a silent death for three diagnoses (#259, 2026-08-18). */
  readonly transcript: string;
}

/** Long-running child under `nice -n 19` whose OUTPUT ORDER is load-bearing: stdout and stderr are captured
 *  INTERLEAVED in arrival order, with no maxBuffer ceiling (spawnSync's ~1MiB does not truncate — it KILLS
 *  the child). The caller names the ceiling; past it the child's whole GROUP dies and the transcript says
 *  so, so a hang becomes a reported tool error instead of an unbounded wait. The verify runner's stage door. */
export function spawnNicedTranscript(cmd: string, args: readonly string[], opts: TranscriptOptions): Promise<TranscriptResult> {
  return new Promise<TranscriptResult>((resolvePromise) => {
    const chunks: string[] = [];
    // EXIT HONESTY vs the nice wrapper: `nice` EXECS the target, so a MISSING target is nice's own exit
    // 127 — a number a classifier would read as a VERDICT — where a direct spawn raises `error` and yields
    // status null (always a tool error). A path-shaped command is therefore existence-checked first, so a
    // vanished bin stays "the checker is broken", never "your code has violations".
    if (cmd.includes("/") && !existsSync(cmd)) {
      resolvePromise({ code: null, transcript: `\n[proc] spawn failed: ${cmd} does not exist\n` });
      return;
    }
    // `detached` so the child leads its own group: a stage is `pnpm → node → the tool`, and killing only
    // the direct child leaves the tool running with the pipes open — the promise would never settle.
    const child = spawn("nice", ["-n", "19", cmd, ...args], { cwd: opts.cwd, shell: false, env: opts.env, detached: true });
    // THE GROUP KILL IS NOT THE WHOLE TEARDOWN (#1848). Playwright's browsers and vite's service children
    // leave the group, so the marker sweep runs AFTER it and the promise waits for that sweep to finish —
    // otherwise the transcript would resolve before the line saying what it reaped.
    let sweeping: Promise<RunMarkerSweep> | null = null;
    const timer = setTimeout(() => {
      chunks.push(`\n[proc] TIMED OUT after ${opts.timeoutMs}ms — killed the process group of pid ${child.pid ?? "?"}\n`);
      killPidGroup(child.pid, "SIGKILL");
      sweeping = opts.runMarker === undefined ? null : sweepRunMarker(opts.runMarker);
    }, opts.timeoutMs);
    // THE OPERATOR'S Ctrl-C is the other kill path, and it used to reach nothing: the runner died, the
    // stage child died with the terminal, and the browsers stayed. run-marker.ts owns that policy.
    const guard = armRunMarkerTeardown(opts.runMarker, () => killPidGroup(child.pid, "SIGKILL"));
    const settle = async (code: number | null): Promise<void> => {
      clearTimeout(timer);
      guard.dispose();
      const line = sweeping === null ? null : describeRunMarkerSweep(await sweeping);
      resolvePromise({ code, transcript: `${chunks.join("")}${line === null ? "" : `${line}\n`}` });
    };
    /** Settle, and NAME a teardown that itself failed — the promise must resolve on every path, or the one
     *  door written to end a hang becomes the hang. A failed teardown is `code: null` (a tool error). */
    const finish = (code: number | null): void => {
      // @orb-waive caught-failure-ownership(settle): the handler OWNS the failure by putting it in the transcript this door returns (`[proc] teardown failed: …`) and settling the run as a TOOL ERROR (code null) — nothing is dropped, and the promise MUST settle here or the door written to end a hang becomes one. Ends if the handler stops resolving or stops naming the error.
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

/** Spawn `cmd args…` under `nice -n 19`, collect utf8 output, resolve on exit (never rejects on a
 *  non-zero code — the CALLER judges codes against the exit contract). */
export function spawnNiced(cmd: string, args: readonly string[], opts: SpawnNicedOptions = {}): Promise<SpawnNicedResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("nice", ["-n", "19", cmd, ...args], {
      cwd: opts.cwd,
      env: inheritedProcessEnv(opts.env),
      stdio: ["ignore", "pipe", "pipe"],
      // Its own process group, the `spawnNicedChild`/`spawnFullPriorityChild` shape — see the timeout below.
      detached: true,
    });
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
      killPidGroup(child.pid, "SIGKILL");
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
