// `stack down`: the recorded group first, then the two ports. A group is signalled on the record's verdict
// or on a recorded child still being this checkout's; a port holder is stopped only when its command line
// names this checkout. Anything else is refused by pid, never guessed at.
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { budget } from "../../_shared/load-budget.ts";
import { listeningPids, processGroupId, processInfo } from "../../_shared/platform.ts";
import { killPidGroup } from "../../_shared/proc.ts";
import type { LeaderProbes, LeaderRecord, LeaderState, StackContext } from "../contract/types.ts";
import { leaderVerdict, readLeaderRecord, recordAuthorizesSignal, removeLeaderRecord } from "../lib/leader-record.ts";
import { pidIsAlive } from "../lib/spawn-lock.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack down");

const SETTLE_POLL_MS = 500;
/** Quiet-box grace for a TERM before KILL; a server's own drain is ten seconds. */
const TERM_GRACE_BASE_MS = 15_000;
const KILL_GRACE_BASE_MS = 10_000;

export function log(message: string): void {
  print(`stack: ${message}`);
}

/** The final `RESULT stack …` machine line: the last line is the parseable one. */
export function result(line: string): void {
  print(`\nRESULT stack ${line}`);
}

/** Alive, and its command line names this checkout. The one ownership test every signal here rests on. */
function ownsPid(ctx: StackContext, pid: number): boolean {
  if (!pidIsAlive(pid)) {
    return false;
  }
  const info = processInfo(pid);
  if (info === null) {
    return false;
  }
  return info.cmdline.includes(ctx.repoRoot);
}

/** POSIX: the recorded group still has a member (`kill(-pgid, 0)`, the `pgrep -g` question). win32 has no
 *  group, so the recorded pids are asked instead. */
function groupHasMembers(record: LeaderRecord): boolean {
  if (record.pgid !== null && process.platform !== "win32") {
    return pidIsAlive(-record.pgid);
  }
  return [record.pid, ...record.children].some((pid) => pidIsAlive(pid));
}

/** A recorded child still this checkout's proves the group is still this launch's: a group id is not
 *  reused while the group has members, and that child is one. */
function ownsGroup(ctx: StackContext, record: LeaderRecord): boolean {
  return [record.pid, ...record.children].some((pid) => ownsPid(ctx, pid));
}

function probes(ctx: StackContext): LeaderProbes {
  return { now: Date.now(), ownsPid: (pid) => ownsPid(ctx, pid), groupHasMembers };
}

export function readVerdict(ctx: StackContext): { readonly read: ReturnType<typeof readLeaderRecord>; readonly state: LeaderState } {
  const read = readLeaderRecord(ctx.runDir, ctx.repoRoot);
  return { read, state: leaderVerdict(read, probes(ctx)) };
}

/** Poll `done` up to `ceilingMs` of sleeps, counted in polls. */
async function settle(done: () => boolean, ceilingMs: number): Promise<boolean> {
  const polls = Math.ceil(ceilingMs / SETTLE_POLL_MS);
  for (let poll = 0; poll < polls; poll += 1) {
    if (done()) {
      return true;
    }
    await sleep(SETTLE_POLL_MS);
  }
  return done();
}

function signalGroup(record: LeaderRecord, signal: NodeJS.Signals): void {
  if (record.pgid !== null && process.platform !== "win32") {
    killPidGroup(record.pgid, signal);
    return;
  }
  // No process group on win32: each recorded pid's tree is terminated (`taskkill /T`).
  for (const pid of [record.pid, ...record.children]) {
    killPidGroup(pid, signal);
  }
}

/** TERM the recorded group, wait, escalate to KILL, wait again. True when the group is empty. */
async function stopRecordedGroup(record: LeaderRecord): Promise<boolean> {
  signalGroup(record, "SIGTERM");
  if (await settle(() => !groupHasMembers(record), budget(TERM_GRACE_BASE_MS))) {
    return true;
  }
  log(`group ${groupName(record)} ignored TERM; escalating to KILL`);
  signalGroup(record, "SIGKILL");
  return await settle(() => !groupHasMembers(record), budget(KILL_GRACE_BASE_MS));
}

export function groupName(record: LeaderRecord): string {
  return String(record.pgid ?? record.pid);
}

function signalPid(pid: number, signal: NodeJS.Signals): void {
  // @orb-waive caught-failure-ownership(error): ESRCH means the holder exited between the table read and the signal, the desired end state; every other failure is rethrown. Ends if callers require proof the signal landed.
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw error;
    }
  }
}

/** Stop a port holder this checkout owns through its group; a holder with no group is signalled alone. */
function signalHolder(pid: number, signal: NodeJS.Signals): void {
  const pgid = process.platform === "win32" ? null : processGroupId(pid);
  if (pgid === null) {
    if (process.platform === "win32") {
      killPidGroup(pid, signal);
    } else {
      signalPid(pid, signal);
    }
    return;
  }
  killPidGroup(pgid, signal);
}

interface PortSweep {
  readonly freed: readonly number[];
  readonly refused: readonly { readonly port: number; readonly pid: number; readonly cmdline: string | null }[];
}

/** The ports after the record: a holder whose command line names this checkout is stopped through its
 *  group; any other holder is refused by pid. This is how a stack whose record is gone is still found. */
async function sweepPorts(ctx: StackContext): Promise<PortSweep> {
  const freed: number[] = [];
  const refused: { port: number; pid: number; cmdline: string | null }[] = [];
  for (const port of [ctx.ports.server, ctx.ports.vite]) {
    const pid = listeningPids().get(port);
    if (pid === undefined) {
      continue;
    }
    const info = processInfo(pid);
    if (info === null || !info.cmdline.includes(ctx.repoRoot)) {
      refused.push({ port, pid, cmdline: info === null ? null : info.cmdline });
      continue;
    }
    log(`:${String(port)} is still held by pid ${String(pid)} from this checkout; stopping its group`);
    signalHolder(pid, "SIGTERM");
    const free = (): boolean => listeningPids().get(port) === undefined;
    if (!(await settle(free, budget(TERM_GRACE_BASE_MS)))) {
      signalHolder(pid, "SIGKILL");
      if (!(await settle(free, budget(KILL_GRACE_BASE_MS)))) {
        refused.push({ port, pid, cmdline: info.cmdline });
        continue;
      }
    }
    freed.push(port);
  }
  return { freed, refused };
}

/** The record's half of the teardown: the group name for the result line, and whether it is still held. */
async function stopRecorded(ctx: StackContext, quiet: boolean): Promise<{ readonly group: string; readonly stuck: boolean }> {
  const { read, state } = readVerdict(ctx);
  if (read.kind === "corrupt") {
    log(`the record at ${read.path} is malformed; sweeping the ports`);
    return { group: "none", stuck: false };
  }
  if (read.kind === "absent") {
    if (!quiet) {
      log("nothing recorded to stop; sweeping the ports");
    }
    return { group: "none", stuck: false };
  }
  const record = read.record;
  const group = groupName(record);
  if (recordAuthorizesSignal(state) || (state === "departed-with-survivors" && ownsGroup(ctx, record))) {
    log(`stopping group ${group} (${state})`);
    const gone = await stopRecordedGroup(record);
    if (!gone) {
      log(`group ${group} still has members after KILL — manual cleanup required`);
    }
    return { group, stuck: !gone };
  }
  log(
    state === "departed-with-survivors"
      ? `group ${group} has members but none this launch recorded; leaving it and sweeping the ports`
      : "the recorded leader is gone; sweeping the ports",
  );
  return { group, stuck: false };
}

/** The whole teardown. `quiet` skips the "nothing to stop" line for a restart. */
export async function doDevDown(ctx: StackContext, opts: { readonly quiet?: boolean } = {}): Promise<ExitCode> {
  const { group, stuck } = await stopRecorded(ctx, opts.quiet === true);
  if (stuck) {
    result(`status=stuck pgid=${group}`);
    return EXIT.violations;
  }
  const sweep = await sweepPorts(ctx);
  if (sweep.refused.length > 0) {
    for (const holder of sweep.refused) {
      log(
        `REFUSED :${String(holder.port)} — held by pid ${String(holder.pid)} (${holder.cmdline ?? "command line unreadable"}), not this checkout's; stop it yourself`,
      );
    }
    result(`status=port-conflict ${sweep.refused.map((holder) => `port=${String(holder.port)} pid=${String(holder.pid)}`).join(" ")}`);
    return EXIT.violations;
  }
  removeLeaderRecord(ctx.runDir);
  log(`stopped (pgid ${group})`);
  result(`status=stopped pgid=${group}`);
  return EXIT.clean;
}
