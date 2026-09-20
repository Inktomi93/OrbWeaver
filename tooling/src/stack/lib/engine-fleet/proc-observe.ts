// The /proc OBSERVATION half of engine launch ownership — what the kernel says about a live pid, and
// nothing else. Split out of `process-identity.ts` at the 450-line cap (policy `tooling-size`) when the
// fleet moved into `tooling/` and joined the population that judges tool-file size; the cut is BY NATURE,
// the move playbook's rule (Core-Tooling-Law.md §9.1): everything here is a pure read of `/proc` plus the
// marker vocabulary those reads recognise, while the DURABLE RECORD (its zod schemas, the pidfile) and
// every SIGNAL door stay in `process-identity.ts`.
//
// It is the LEAF of the pair — it imports nothing from its former home, so the split can never become a
// cycle, and the signal doors keep exactly one direction to read observations through.
//
// FAIL-CLOSED IS THE CONTRACT OF EVERY READER HERE: unreadable, absent and malformed all answer `null`,
// and `null` never contributes to an "owned"/"adoptable" verdict upstairs. That is what makes the
// negative-PGID signal impossible to authorize on a process we did not observe.

import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import type { EngineLaunchMarker } from "../../contract/engine-ownership.ts";

const PROC_STAT_TAIL_START_TICKS_INDEX = 19;
const PROC_STAT_TAIL_PGID_INDEX = 2;

/** A run of decimal digits and nothing else — the shape of every numeric field `/proc` hands back as text
 *  (a pid directory name, the start-ticks field). Exported because the durable record's schema validates
 *  the SAME field with the SAME rule, and two spellings of it would be two rules. */
export const DECIMAL_INTEGER_RE = /^\d+$/;
const FIELD_SEPARATOR_RE = /\s+/;

export interface ObservedEngineProcess {
  readonly pid: number;
  readonly pgid: number;
  readonly startTicks: string;
  readonly executable: string;
  /** Exact bytes from /proc/<pid>/cmdline, encoded only so JSON can carry embedded NULs losslessly. */
  readonly cmdlineBase64: string;
  readonly cwd: string;
}

/** The environment variable the launcher exports into an engine's spawn env, and which every member of the
 *  resulting setsid group inherits. Its VALUE is the per-launch marker; this NAME is the contract between
 *  {@link buildEngineSpawnSpec}'s env and the reader below, so it is spelled in exactly one place. */
export const ENGINE_LAUNCH_MARKER_ENV = "ORB_ENGINE_LAUNCH_MARKER";

/** A marker must be long and alphabet-restricted enough that it cannot be typed, guessed, or collided with
 *  by an unrelated process that merely happens to export the same variable name. `mintEngineLaunchMarker` mints
 *  a kernel uuid; anything shorter or stranger than this is treated as no marker at all. */
export const ENGINE_LAUNCH_MARKER_RE = /^[A-Za-z0-9-]{16,128}$/;

/** Mint the marker for ONE launcher invocation — every engine it spawns carries this token, so "was this
 *  live pid started by the launch that wrote the record?" is answerable after the leader is gone. */
export function mintEngineLaunchMarker(): EngineLaunchMarker {
  return randomUUID() as EngineLaunchMarker;
}

/** Parse Linux /proc/<pid>/stat without splitting the parenthesized process name into fake fields. */
export function parseProcIdentityStat(text: string): { readonly pgid: number; readonly startTicks: string } | null {
  const close = text.lastIndexOf(") ");
  if (close === -1) {
    return null;
  }
  const tail = text
    .slice(close + 2)
    .trim()
    .split(FIELD_SEPARATOR_RE);
  const pgidText = tail[PROC_STAT_TAIL_PGID_INDEX];
  const startTicks = tail[PROC_STAT_TAIL_START_TICKS_INDEX];
  const pgid = Number(pgidText);
  if (pgidText === undefined || startTicks === undefined || !Number.isInteger(pgid) || pgid <= 1 || !DECIMAL_INTEGER_RE.test(startTicks)) {
    return null;
  }
  return { pgid, startTicks };
}

/** Fresh /proc identity. Any missing/partial/unparseable field fails closed as null. */
export function readObservedEngineProcess(pid: number): ObservedEngineProcess | null {
  if (!Number.isInteger(pid) || pid <= 1) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): an unreadable /proc process entry returns null, and verifyEngineLaunchIdentity treats null as absent/refused — NEVER "owned", so an unreadable process can never authorize the negative-PGID kill; fail-closed. Ends if null ever yields an "owned" verdict.
  try {
    const parsed = parseProcIdentityStat(readFileSync(`/proc/${pid}/stat`, "utf8"));
    const cmdline = readFileSync(`/proc/${pid}/cmdline`);
    if (parsed === null || cmdline.length === 0) {
      return null;
    }
    return {
      pid,
      pgid: parsed.pgid,
      startTicks: parsed.startTicks,
      executable: readlinkSync(`/proc/${pid}/exe`),
      cmdlineBase64: cmdline.toString("base64"),
      cwd: readlinkSync(`/proc/${pid}/cwd`),
    };
  } catch {
    return null;
  }
}

/** One live process's launch marker, read from `/proc/<pid>/environ` — the SPAWN environment, which is
 *  exactly right here: the marker is exported before the exec and can never be edited afterwards, so what a
 *  running pid carries is proof of which launch started it. `null` = unreadable, absent or malformed, and
 *  all three are "not provably ours" (fail-closed: an unreadable process can never authorize a signal). */
export function readEngineProcessLaunchMarker(pid: number, read: (procPath: string) => Buffer = (procPath) => readFileSync(procPath)): string | null {
  // @orb-waive caught-failure-ownership(catch): an unreadable /proc/<pid>/environ returns null, which adoptEngineGroup treats as UNMARKED — the fail-closed direction, so it can never authorize a signal. Ends if null ever contributes to an adoptable verdict.
  try {
    const prefix = `${ENGINE_LAUNCH_MARKER_ENV}=`;
    const entry = read(`/proc/${pid}/environ`)
      .toString("utf8")
      .split("\0")
      .find((pair) => pair.startsWith(prefix));
    if (entry === undefined) {
      return null;
    }
    const value = entry.slice(prefix.length);
    return ENGINE_LAUNCH_MARKER_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Every LIVE pid whose process group is `pgid`, read from `/proc` — the living tree, which is the only
 *  thing that can answer "what actually survived". A pid that vanishes mid-scan is simply not a member. */
export function engineGroupMembers(pgid: number, readDir: () => readonly string[] = () => readdirSync("/proc")): readonly number[] {
  const members: number[] = [];
  for (const entry of readDir()) {
    if (!DECIMAL_INTEGER_RE.test(entry)) {
      continue;
    }
    const pid = Number(entry);
    if (readObservedEngineProcess(pid)?.pgid === pgid) {
      members.push(pid);
    }
  }
  return members;
}
