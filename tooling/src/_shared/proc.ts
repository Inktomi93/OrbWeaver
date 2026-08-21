// The ONE subprocess home (gate: tooling-shared-plumbing arm F): every tooling spawn rides `nice -n 19`
// (owner-endorsed 2026-08-21 — the box co-hosts the homelab; an un-niced fleet starved it, and a direct
// child_process import silently bypasses the floor). `nice` execs the command in-process, so the child
// pid IS the command and timeout kills land on it directly. Three seams: spawnNiced (async, collected,
// timeout — the runCli shape), runNicedSync (sync, collect or stdio passthrough — the imperative-orchestration
// shape), execNicedSync (sync, THROWS on non-zero, returns stdout — the git-helper shape).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import process from "node:process";

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

const DEFAULT_TIMEOUT_MS = 120_000;

export interface RunNicedSyncOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** "collect" (default) captures utf8 stdout/stderr; "inherit" streams to the operator's terminal
   *  (the stack-boot / rsync shape); "ignore" discards. */
  readonly stdio?: "collect" | "inherit" | "ignore";
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
    ...(stdio === undefined ? { encoding: "utf8" as const } : { stdio }),
  });
  return { status: res.status, stdout: typeof res.stdout === "string" ? res.stdout : "", stderr: typeof res.stderr === "string" ? res.stderr : "" };
}

/** Sync exec under `nice -n 19` — THROWS on a non-zero status (execFileSync semantics), returns stdout.
 *  The git-helper shape: an unknown ref/failed command is an exception, not a verdict. */
export function execNicedSync(cmd: string, args: readonly string[], opts: { readonly cwd?: string } = {}): string {
  return execFileSync("nice", ["-n", "19", cmd, ...args], {
    encoding: "utf8",
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
  });
}

/** The ONE full-priority door — NO nice wrapper, loudly named so its callers ARE the exception census
 *  (gate: tooling-shared-plumbing's FULL_PRIORITY_CALLERS allowlist). Reserved for a process a USER
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

export interface NicedChildOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Receives every stdout/stderr chunk (probe-fire forwards the child server's output to ITS stderr
   *  so boot failures stay visible while the parseable payload owns stdout). */
  readonly onOutput?: (chunk: Buffer) => void;
}

export interface NicedChild {
  readonly pid: number | undefined;
  /** Signal the WHOLE process group — `detached:true` gives the child its own pgid, so this reaps the
   *  full tree (pnpm→node→server); signalling only the direct child orphans the real process. */
  readonly killGroup: (signal: NodeJS.Signals) => void;
}

/** Long-lived detached child under `nice -n 19` (the ephemeral-server / supervisor shape): own process
 *  group, piped output via `onOutput`, reaped by `killGroup`. The caller owns lifecycle; nothing here
 *  waits for exit. */
export function spawnNicedChild(cmd: string, args: readonly string[], opts: NicedChildOptions = {}): NicedChild {
  const child = spawn("nice", ["-n", "19", cmd, ...args], {
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    ...(opts.env === undefined ? {} : { env: opts.env }),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (opts.onOutput !== undefined) {
    child.stdout?.on("data", opts.onOutput);
    child.stderr?.on("data", opts.onOutput);
  }
  return {
    pid: child.pid,
    killGroup: (signal): void => {
      if (typeof child.pid !== "number") {
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch {
        /* group already gone */
      }
    },
  };
}

/** Spawn `cmd args…` under `nice -n 19`, collect utf8 output, resolve on exit (never rejects on a
 *  non-zero code — the CALLER judges codes against the exit contract). */
export function spawnNiced(cmd: string, args: readonly string[], opts: SpawnNicedOptions = {}): Promise<SpawnNicedResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("nice", ["-n", "19", cmd, ...args], {
      cwd: opts.cwd,
      // biome-ignore lint/style/noProcessEnv: the child inherits the AMBIENT env (PATH, HOME — how every spawn works); the rule guards app config reads, and no config is read here.
      env: opts.env === undefined ? process.env : { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
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
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
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
