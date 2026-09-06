// Durable ownership for the detached dev-stack process group. The JSON record carries the complete Linux
// process identity; every TERM/KILL re-reads it and refuses stale, reused, corrupt, or unsafe targets.
//
// THE STANDING RULE, unchanged: a process carrying NO launch identity may never authorize a negative-PGID
// signal. `verifyDevStackIdentity` still answers `departed` when the recorded leader is gone, and
// `signalDevStackIdentity` still signals NOTHING on that verdict (pinned in tests/tooling/stack/index.test.ts,
// "a dead leader refuses a stable same-group survivor without signaling it").
//
// WHAT #1013 CHANGED IS THE RULE'S INPUT, not the rule. The refusal's premise was "once the leader is gone,
// PGID/cwd/argv-shaped survivors carry no launch identity" — and it was made TRUE only by the fact that
// nothing stamped them. `stack.sh` now MINTS a high-entropy launch marker and exports it before spawning
// the setsid leader, so every member of the group inherits it; `captureDevStackIdentity` records the
// leader's copy. A live pid in the recorded group whose `/proc/<pid>/environ` carries that exact token was
// started by THIS launch and by nothing else — which is MORE evidence than the pgid ever was, not less.
// `adoptDevStackGroup` is that separate, stricter door: it requires EVERY live member to carry the marker,
// so a reused pgid or an unrelated joiner still refuses, and a record with no marker refuses exactly as
// before. Four receipts in one session (2026-09-01) were the cost of the old premise: status describing a
// different era, a stop that could not signal what it owned, a false "verified survivors" alarm, and a
// boot that refused cleanup while its detached tree carried on healthy.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { readObservedEngineProcess } from "@orb/server/infra/providers/vllm/engine";
import type { DevStackAdoption, DevStackIdentity, DevStackIdentityVerdict, ObservedStackProcess } from "../contract/types.ts";
import { pidIsAlive } from "./spawn-lock.ts";

const VERSION = 1 as const;
const NUMERIC_RE = /^\d+$/;

/** The environment variable `stack.sh` exports before spawning the setsid leader, and which every member
 *  of the resulting process group inherits. Its VALUE is the per-launch marker; this NAME is the contract
 *  between the shell that mints it and the reader below, so it is spelled in exactly these two places. */
export const DEV_STACK_LAUNCH_ID_ENV = "ORB_STACK_LAUNCH_ID";
/** A marker must be long and alphabet-restricted enough that it cannot be typed, guessed, or collided
 *  with by an unrelated process that merely happens to export the same variable name. `stack.sh` mints a
 *  kernel uuid; anything shorter or stranger than this is treated as no marker at all. */
const LAUNCH_ID_RE = /^[A-Za-z0-9-]{16,128}$/;

function errnoIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** The ambient environment, read in ONE place — this module reads a launch MARKER the launcher exported,
 *  never app configuration. */
function processEnv(): NodeJS.ProcessEnv {
  // biome-ignore lint/style/noProcessEnv: the launch marker is exported by the shell that spawned this process — reading it IS the mechanism, and no app config is read here.
  return process.env;
}

export function devStackIdentityFilePath(repoRoot: string): string {
  return path.join(repoRoot, ".cache", "stack", "stack.pgid");
}

export function parseDevStackIdentity(text: string): DevStackIdentity | null {
  // @orb-gate-ignore caught-failure-ownership(default:catch): malformed identity JSON returns null and recordedDevStackVerdict refuses the existing file. Ends if null can authorize a signal.
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
      value.cwd !== value.repoRoot ||
      // Present-but-malformed is a CORRUPT record, not an unmarked one: silently dropping a bad marker
      // would turn a tampered file into an ordinary pre-#1013 record and re-open the door it closes.
      (value.launchId !== undefined && !(typeof value.launchId === "string" && LAUNCH_ID_RE.test(value.launchId)))
    ) {
      return null;
    }
    return value as DevStackIdentity;
  } catch {
    return null;
  }
}

export function readDevStackIdentity(repoRoot: string): DevStackIdentity | null {
  // @orb-gate-ignore caught-failure-ownership(default:catch): an unreadable identity returns null and the existing-path check produces a manual-cleanup refusal. Ends if null can authorize a signal.
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

export function verifyDevStackIdentity(
  identity: DevStackIdentity,
  opts: {
    readonly readProcess?: (pid: number) => ObservedStackProcess | null;
  } = {},
): DevStackIdentityVerdict {
  if (identity.pid <= 1 || identity.pgid <= 1 || identity.pid !== identity.pgid || identity.repoRoot !== path.resolve(identity.repoRoot)) {
    return { verdict: "refused", reason: "recorded dev-stack PID/PGID/root is unsafe" };
  }
  const readProcess = opts.readProcess ?? readObservedEngineProcess;
  const leader = readProcess(identity.pid);
  if (leader === null) {
    return {
      verdict: "departed",
      pgid: identity.pgid,
      reason: `recorded dev-stack leader pid ${identity.pid} is absent; survivor ownership is unknowable, so manual cleanup or relaunch is required`,
    };
  }
  return sameProcess(identity, leader)
    ? { verdict: "owned", pgid: identity.pgid, witness: leader }
    : { verdict: "refused", reason: `recorded leader pid ${identity.pid} was reused or changed identity` };
}

/** The launch marker THIS process carries, or null. Read from the caller's own environment — the capture
 *  runs as a child of the very shell that minted and exported it. */
function readLaunchIdEnv(readEnv: (key: string) => string | undefined): string | undefined {
  const raw = readEnv(DEV_STACK_LAUNCH_ID_ENV);
  return raw !== undefined && LAUNCH_ID_RE.test(raw) ? raw : undefined;
}

/** One live process's launch marker, read from `/proc/<pid>/environ` — the SPAWN environment, which is
 *  exactly right here: the marker is exported before the exec and can never be edited afterwards, so what
 *  a running pid carries is proof of which launch started it. `null` = unreadable or absent, and both are
 *  "not provably ours" (fail-closed: an unreadable process can never authorize a signal). */
export function readProcessLaunchId(pid: number, read: (procPath: string) => Buffer = (procPath) => readFileSync(procPath)): string | null {
  // @orb-gate-ignore caught-failure-ownership(default:catch): an unreadable /proc/<pid>/environ returns null, which adoptDevStackGroup treats as UNMARKED — the fail-closed direction, so it can never authorize a signal. Ends if null ever contributes to an adoptable verdict.
  try {
    const prefix = `${DEV_STACK_LAUNCH_ID_ENV}=`;
    const entry = read(`/proc/${pid}/environ`)
      .toString("utf8")
      .split("\0")
      .find((pair) => pair.startsWith(prefix));
    if (entry === undefined) {
      return null;
    }
    const value = entry.slice(prefix.length);
    return LAUNCH_ID_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function captureDevStackIdentity(
  repoRoot: string,
  pid: number,
  readEnv: (key: string) => string | undefined = (key) => processEnv()[key],
): DevStackIdentity | null {
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
  // The marker is recorded ONLY when the spawned leader actually carries it: this shell exported it, so
  // reading our own environment and the leader's must agree, and the leader's is the one that matters.
  const launchId = readProcessLaunchId(pid) ?? readLaunchIdEnv(readEnv);
  return { version: VERSION, repoRoot: resolvedRoot, ...observed, ...(launchId === undefined ? {} : { launchId }) };
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
    readonly kill?: (target: number, signal: NodeJS.Signals) => void;
  } = {},
): DevStackIdentityVerdict | { readonly verdict: "signaled"; readonly pgid: number } {
  const first = verifyDevStackIdentity(identity, opts);
  if (first.verdict !== "owned") {
    return first;
  }
  const leader = (opts.readProcess ?? readObservedEngineProcess)(identity.pid);
  if (leader === null || !sameProcess(first.witness, leader)) {
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

/** Does the recorded process GROUP still hold any member? (#1162 — the honesty half of the teardown.)
 *
 *  `kill(-pgid, 0)` is the same question `pgrep -g <pgid>` answers, minus the parse: ESRCH means the
 *  group has NO members, EPERM means it has at least one this user may not signal. It assumes no
 *  ownership — an empty group is empty for everyone — so it is safe to ask after the leader is gone,
 *  which is exactly when `verifyDevStackIdentity` can no longer witness ownership.
 *
 *  This is what `do_stop` was missing: it printed "still has verified survivors after KILL" on the
 *  strength of a verdict that only ever said "I can no longer verify the leader" (tooling/src/stack/stack.sh). */
export function devStackGroupHasMembers(pgid: number, signal: (pid: number, signal: 0) => void = process.kill): boolean {
  return pidIsAlive(-pgid, signal);
}

/** Every LIVE pid whose process group is `pgid`, read from `/proc` — the living tree, which is the only
 *  thing that can answer "what actually survived". A pid that vanishes mid-scan is simply not a member. */
export function devStackGroupMembers(pgid: number, readDir: () => readonly string[] = () => readdirSync("/proc")): readonly number[] {
  const members: number[] = [];
  for (const entry of readDir()) {
    if (!NUMERIC_RE.test(entry)) {
      continue;
    }
    const pid = Number(entry);
    if (readObservedEngineProcess(pid)?.pgid === pgid) {
      members.push(pid);
    }
  }
  return members;
}

/** MAY a leaderless group be adopted? (#1013.) The standing rule is untouched — a survivor with no launch
 *  identity authorizes nothing — but a survivor CAN now carry one, so this asks whether it does.
 *
 *  EVERY live member must carry the recorded marker, not merely one of them. A pgid can be reused after
 *  wraparound, and an unrelated process could be placed in the group by something we did not start;
 *  requiring unanimity means the negative-PGID signal can only ever land on a group that is entirely this
 *  launch's. One unmarked member and the answer is the old refusal, naming the pid that caused it. */
export function adoptDevStackGroup(
  identity: DevStackIdentity,
  opts: {
    readonly members?: (pgid: number) => readonly number[];
    readonly launchIdOf?: (pid: number) => string | null;
  } = {},
): DevStackAdoption {
  const pgid = identity.pgid;
  if (identity.launchId === undefined) {
    return {
      kind: "no-marker",
      pgid,
      reason: `dev-stack record for group ${pgid} carries no launch marker (written before #1013, or by a launcher that exported none)`,
    };
  }
  const members = (opts.members ?? devStackGroupMembers)(pgid);
  if (members.length === 0) {
    return { kind: "empty", pgid };
  }
  const launchIdOf = opts.launchIdOf ?? readProcessLaunchId;
  const unmarked = members.filter((pid) => launchIdOf(pid) !== identity.launchId);
  return unmarked.length === 0 ? { kind: "adoptable", pgid, members } : { kind: "unmarked", pgid, unmarked };
}

/** Signal an ADOPTED leaderless group: the same negative-PGID syscall as `signalDevStackIdentity`, behind
 *  the stricter of the two doors. Returns the adoption verdict that authorized it (or refused it), so the
 *  caller prints WHAT it verified rather than asserting ownership it never checked. */
export function signalAdoptedDevStackGroup(
  identity: DevStackIdentity,
  signal: NodeJS.Signals,
  opts: {
    readonly members?: (pgid: number) => readonly number[];
    readonly launchIdOf?: (pid: number) => string | null;
    readonly kill?: (target: number, signal: NodeJS.Signals) => void;
  } = {},
): DevStackAdoption {
  const adoption = adoptDevStackGroup(identity, opts);
  if (adoption.kind !== "adoptable") {
    return adoption;
  }
  // @orb-gate-ignore caught-failure-ownership(empty:error): ESRCH means the adopted group exited between the census and the signal — the desired end state; every other signal failure rethrows. Ends if callers require proof the signal landed.
  try {
    (opts.kill ?? process.kill)(-adoption.pgid, signal);
  } catch (error) {
    if (!errnoIs(error, "ESRCH")) {
      throw error;
    }
  }
  return adoption;
}

/** The one operator sentence for an adoption verdict — so `status`, `stop` and `start` cannot describe
 *  the same tree three different ways. */
export function adoptionText(adoption: DevStackAdoption): string {
  if (adoption.kind === "adoptable") {
    return `group ${adoption.pgid} ADOPTED by launch marker — every live member (${adoption.members.join(", ")}) carries this launch's token`;
  }
  if (adoption.kind === "unmarked") {
    return `group ${adoption.pgid} is NOT provably ours: pid(s) ${adoption.unmarked.join(", ")} do not carry this launch's marker — manual cleanup required`;
  }
  if (adoption.kind === "empty") {
    return `group ${adoption.pgid} has no members left`;
  }
  return adoption.reason;
}
