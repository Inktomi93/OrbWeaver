// The dev leader's record: the codec, the path, and the ownership verdict over it. Ownership is the record
// plus the kernel's guarantee that a POSIX process group id is not reused while the group has members;
// on win32 the recorded pids are the tree. A process this launch did not record authorizes no signal.
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import type { DevPinKey, LeaderProbes, LeaderRead, LeaderRecord, LeaderState, PinSource } from "../contract/types.ts";
import { DEV_PIN_KEYS, PIN_SOURCES } from "../contract/types.ts";

const VERSION = 2 as const;
export const LEADER_RECORD_FILE = "stack.pgid";
/** The env key the supervisor mints a launch id into before it spawns the leader. */
export const LAUNCH_ID_ENV = "ORB_STACK_LAUNCH_ID";
/** How often the leader rewrites its record. */
export const HEARTBEAT_MS = 5000;
/** A beat older than this reads as a stopped leader whatever its pid says: a wedged leader, or a pid the
 *  OS handed to something else. Several beats of slack, because a loaded box delays a timer. */
const STALE_BEATS = 6;
export const HEARTBEAT_STALE_MS = HEARTBEAT_MS * STALE_BEATS;
const RECORD_FILE_MODE = 0o600;

export function leaderRecordPath(runDir: string): string {
  return join(runDir, LEADER_RECORD_FILE);
}

function isPinSource(value: unknown): value is PinSource {
  return typeof value === "string" && (PIN_SOURCES as readonly string[]).includes(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parsePins(value: unknown): LeaderRecord["pins"] | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const values = Reflect.get(value, "values");
  const sources = Reflect.get(value, "sources");
  if (typeof values !== "object" || values === null || typeof sources !== "object" || sources === null) {
    return null;
  }
  const outSources: Partial<Record<DevPinKey, PinSource>> = {};
  const outValues: Partial<Record<DevPinKey, string>> = {};
  for (const key of DEV_PIN_KEYS) {
    const source = Reflect.get(sources, key);
    if (!isPinSource(source)) {
      return null;
    }
    outSources[key] = source;
    const shown = Reflect.get(values, key);
    if (typeof shown === "string") {
      outValues[key] = shown;
    }
  }
  return { values: outValues, sources: outSources as Record<DevPinKey, PinSource> };
}

/** Parse a record file. Anything short of the full shape is `null`: a truncated write, an older version,
 *  a tampered pid. The caller reports `corrupt` and signals nothing on its strength. */
export function parseLeaderRecord(text: string): LeaderRecord | null {
  let value: unknown;
  // @orb-waive caught-failure-ownership(catch): malformed record JSON is a corrupt record, which `leaderVerdict` reports and which never authorizes a signal. Ends if null can authorize a signal.
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const r = value as Partial<Record<keyof LeaderRecord, unknown>>;
  const ports = r.ports as Partial<Record<"server" | "vite", unknown>> | undefined;
  const pins = parsePins(r.pins);
  if (
    r.version !== VERSION ||
    !isPositiveInteger(r.pid) ||
    !(r.pgid === null || isPositiveInteger(r.pgid)) ||
    typeof r.launchId !== "string" ||
    r.launchId.length === 0 ||
    typeof r.repoRoot !== "string" ||
    typeof r.runDir !== "string" ||
    ports === undefined ||
    !isPositiveInteger(ports.server) ||
    !isPositiveInteger(ports.vite) ||
    !Array.isArray(r.children) ||
    !r.children.every(isPositiveInteger) ||
    pins === null ||
    typeof r.startedAt !== "string" ||
    typeof r.beatMs !== "number"
  ) {
    return null;
  }
  return {
    version: VERSION,
    pid: r.pid,
    pgid: r.pgid,
    launchId: r.launchId,
    repoRoot: r.repoRoot,
    runDir: r.runDir,
    ports: { server: ports.server, vite: ports.vite },
    children: [...r.children],
    pins,
    startedAt: r.startedAt,
    beatMs: r.beatMs,
  };
}

export function serializeLeaderRecord(record: LeaderRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/** What is at the record path. A record that names another checkout is corrupt here: a shared run dir is
 *  the defect the run dir exists to prevent. */
export function readLeaderRecord(runDir: string, repoRoot: string): LeaderRead {
  const path = leaderRecordPath(runDir);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { kind: "absent" };
    }
    throw error;
  }
  const record = parseLeaderRecord(text);
  return record === null || record.repoRoot !== repoRoot ? { kind: "corrupt", path } : { kind: "record", record };
}

/** Atomic: a reader never sees a half-written record. */
export function writeLeaderRecord(runDir: string, record: LeaderRecord): void {
  const target = leaderRecordPath(runDir);
  const temporary = `${target}.tmp-${String(process.pid)}`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(temporary, serializeLeaderRecord(record), { encoding: "utf8", mode: RECORD_FILE_MODE });
  renameSync(temporary, target);
}

/** Delete the record; an already-absent file is the same end state. */
export function removeLeaderRecord(runDir: string): void {
  // @orb-waive caught-failure-ownership(error): ENOENT is the idempotent end state of a removal; every other unlink failure is rethrown. Ends if removal gains a separate operator result.
  try {
    unlinkSync(leaderRecordPath(runDir));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

export function leaderVerdict(read: LeaderRead, probes: LeaderProbes): LeaderState {
  if (read.kind !== "record") {
    return read.kind;
  }
  const record = read.record;
  if (probes.ownsPid(record.pid)) {
    return probes.now - record.beatMs <= (probes.staleAfterMs ?? HEARTBEAT_STALE_MS) ? "live" : "stale-leader";
  }
  return probes.groupHasMembers(record) ? "departed-with-survivors" : "departed";
}

/** The states `down` may signal on the record's strength alone. A departed leader's survivors need the
 *  further proof that a recorded child is still this checkout's (`ownsGroup` in the ops). */
export function recordAuthorizesSignal(state: LeaderState): boolean {
  return state === "live" || state === "stale-leader";
}
