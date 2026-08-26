// Durable ownership for the detached dev-stack process group. The JSON record carries the complete Linux
// process identity; every TERM/KILL re-reads it and refuses stale, reused, corrupt, or unsafe targets.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { readObservedEngineProcess } from "@orb/server/infra/providers/vllm/engine";
import type { DevStackIdentity, DevStackIdentityVerdict, ObservedStackProcess } from "../contract/types.ts";

const VERSION = 1 as const;
const NUMERIC_RE = /^\d+$/;

export function devStackIdentityFilePath(repoRoot: string): string {
  return path.join(repoRoot, ".cache", "stack", "stack.pgid");
}

export function parseDevStackIdentity(text: string): DevStackIdentity | null {
  try {
    const value = JSON.parse(text) as Partial<DevStackIdentity>;
    if (
      value.version !== VERSION ||
      !Number.isInteger(value.pid) ||
      (value.pid ?? 0) <= 1 ||
      value.pgid !== value.pid ||
      typeof value.startTicks !== "string" ||
      !NUMERIC_RE.test(value.startTicks) ||
      typeof value.executable !== "string" ||
      value.executable.length === 0 ||
      typeof value.cmdlineBase64 !== "string" ||
      value.cmdlineBase64.length === 0 ||
      typeof value.cwd !== "string" ||
      typeof value.repoRoot !== "string" ||
      value.cwd !== value.repoRoot
    ) {
      return null;
    }
    return value as DevStackIdentity;
  } catch {
    return null;
  }
}

export function readDevStackIdentity(repoRoot: string): DevStackIdentity | null {
  try {
    const identity = parseDevStackIdentity(readFileSync(devStackIdentityFilePath(repoRoot), "utf8"));
    return identity?.repoRoot === path.resolve(repoRoot) ? identity : null;
  } catch {
    return null;
  }
}

function sameProcess(left: ObservedStackProcess, right: ObservedStackProcess): boolean {
  return (
    left.pid === right.pid &&
    left.pgid === right.pgid &&
    left.startTicks === right.startTicks &&
    left.executable === right.executable &&
    left.cmdlineBase64 === right.cmdlineBase64 &&
    left.cwd === right.cwd
  );
}

function defaultGroupProcesses(pgid: number): ObservedStackProcess[] {
  const processes: ObservedStackProcess[] = [];
  for (const name of readdirSync("/proc")) {
    if (!NUMERIC_RE.test(name)) {
      continue;
    }
    const observed = readObservedEngineProcess(Number(name));
    if (observed?.pgid === pgid) {
      processes.push(observed);
    }
  }
  return processes;
}

export function verifyDevStackIdentity(
  identity: DevStackIdentity,
  opts: {
    readonly readProcess?: (pid: number) => ObservedStackProcess | null;
    readonly groupProcesses?: (pgid: number) => readonly ObservedStackProcess[];
  } = {},
): DevStackIdentityVerdict {
  if (identity.pid <= 1 || identity.pgid <= 1 || identity.pid !== identity.pgid || identity.repoRoot !== path.resolve(identity.repoRoot)) {
    return { verdict: "refused", reason: "recorded dev-stack PID/PGID/root is unsafe" };
  }
  const readProcess = opts.readProcess ?? readObservedEngineProcess;
  const leader = readProcess(identity.pid);
  if (leader !== null) {
    return sameProcess(identity, leader)
      ? { verdict: "owned", pgid: identity.pgid, witness: leader }
      : { verdict: "refused", reason: `recorded leader pid ${identity.pid} was reused or changed identity` };
  }
  const survivors = (opts.groupProcesses ?? defaultGroupProcesses)(identity.pgid).filter(
    (candidate) => candidate.pid !== identity.pid && candidate.cwd === identity.repoRoot,
  );
  return survivors[0] === undefined
    ? { verdict: "absent", reason: `recorded dev-stack group ${identity.pgid} is gone` }
    : { verdict: "owned", pgid: identity.pgid, witness: survivors[0] };
}

export function captureDevStackIdentity(repoRoot: string, pid: number): DevStackIdentity | null {
  const resolvedRoot = path.resolve(repoRoot);
  const observed = readObservedEngineProcess(pid);
  if (observed === null || observed.pid !== observed.pgid || observed.cwd !== resolvedRoot) {
    return null;
  }
  const argv = Buffer.from(observed.cmdlineBase64, "base64").toString("utf8").split("\0");
  const expectedScript = path.join(resolvedRoot, "tooling", "src", "stack", "stack.sh");
  if (!(argv.includes(expectedScript) && argv.includes("_leader"))) {
    return null;
  }
  return { version: VERSION, repoRoot: resolvedRoot, ...observed };
}

export function writeDevStackIdentity(identity: DevStackIdentity): void {
  const target = devStackIdentityFilePath(identity.repoRoot);
  const temporary = `${target}.tmp-${process.pid}`;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(temporary, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  renameSync(temporary, target);
}

export function signalDevStackIdentity(
  identity: DevStackIdentity,
  signal: NodeJS.Signals,
  opts: {
    readonly readProcess?: (pid: number) => ObservedStackProcess | null;
    readonly groupProcesses?: (pgid: number) => readonly ObservedStackProcess[];
    readonly kill?: (target: number, signal: NodeJS.Signals) => void;
  } = {},
): DevStackIdentityVerdict | { readonly verdict: "signaled"; readonly pgid: number } {
  const first = verifyDevStackIdentity(identity, opts);
  if (first.verdict !== "owned") {
    return first;
  }
  const witness = (opts.readProcess ?? readObservedEngineProcess)(first.witness.pid);
  const leader = (opts.readProcess ?? readObservedEngineProcess)(identity.pid);
  if (witness === null || !sameProcess(first.witness, witness) || (first.witness.pid !== identity.pid && leader !== null)) {
    return { verdict: "refused", reason: "dev-stack identity changed immediately before signal" };
  }
  try {
    (opts.kill ?? process.kill)(-identity.pgid, signal);
    return { verdict: "signaled", pgid: identity.pgid };
  } catch {
    return { verdict: "refused", reason: `could not signal verified dev-stack group ${identity.pgid}` };
  }
}

export function recordedDevStackVerdict(repoRoot: string): DevStackIdentityVerdict {
  const target = devStackIdentityFilePath(repoRoot);
  const identity = readDevStackIdentity(repoRoot);
  if (identity === null) {
    return existsSync(target)
      ? { verdict: "refused", reason: `dev-stack identity ${target} is malformed; manual cleanup required` }
      : { verdict: "absent", reason: "no dev-stack launch identity exists" };
  }
  return verifyDevStackIdentity(identity);
}
