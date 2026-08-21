// The ONE subprocess home: every tooling spawn rides `nice -n 19` (owner-endorsed 2026-08-21 — the box
// co-hosts the homelab; an un-niced tool fleet has starved it). `nice` execs the command in-process, so
// the child pid IS the command and timeout kills land on it directly.
import { spawn } from "node:child_process";
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
