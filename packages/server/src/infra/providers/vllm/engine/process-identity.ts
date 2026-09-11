// Durable ownership for the detached vLLM process groups. A listening port proves only that SOMETHING is
// serving; a pid proves only a number that Linux may later reuse. Every destructive engine action therefore
// compares the launch-time /proc identity (pid + pgid + start ticks + executable + raw cmdline + cwd) with a
// fresh read immediately before process.kill. The standalone shell reaches this same module through
// engines-ctl, so there is one identity contract and one signal door for both owners.
//
// THE STANDING RULE, unchanged (#1756 is the engine twin of the dev stack's #1013): a process carrying NO
// launch identity may never authorize a negative-PGID signal. `verifyEngineLaunchIdentity` still refuses a
// departed leader, `signalEngineLaunchIdentity`/`signalRecordedEngineProcess` still signal nothing on that
// verdict, and `signalOrphanedEngineGroup` is still the disabled legacy door. None of their pins move.
//
// WHAT CHANGED IS THE RULE'S INPUT, not the rule. The refusal's premise — "once the leader is gone,
// PGID/cwd/argv-shaped survivors carry no launch identity" — was true only because nothing stamped them.
// The launcher now MINTS a per-launch marker ({@link mintEngineLaunchMarker}) and `buildEngineSpawnSpec` puts it
// in the engine's spawn ENV, so every member of that setsid group inherits it and
// `captureEngineLaunchIdentity` records the leader's copy from its own `/proc/<pid>/environ`. A live pid in
// the recorded group carrying that exact token was started by THIS launch and by nothing else — MORE
// evidence than the pgid ever was, not less. {@link adoptEngineGroup} is that separate, STRICTER door: every
// live member must carry the marker, so a reused pgid or an unrelated joiner still refuses, and a record
// with no marker (every pidfile written before this) refuses exactly as before. The receipt it ends:
// `engines stop` refusing a live engine named by a dead launch record, leaving the operator to hand-run
// `kill -TERM -<pgid>` — the negative-PGID kill with no authorization at all.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { z } from "zod";
import type { EngineGroupAdoption, EngineLaunchMarker } from "../../contract/index.ts";
import { VLLM_ENGINES } from "./engines.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

const IDENTITY_VERSION = 1 as const;
const IDENTITY_FILENAME = "engines.pgid";
const PROC_STAT_TAIL_START_TICKS_INDEX = 19;
const PROC_STAT_TAIL_PGID_INDEX = 2;
const MAX_TCP_PORT = 65_535;
const DECIMAL_INTEGER_RE = /^\d+$/;
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
const ENGINE_LAUNCH_MARKER_RE = /^[A-Za-z0-9-]{16,128}$/;

/** Mint the marker for ONE launcher invocation — every engine it spawns carries this token, so "was this
 *  live pid started by the launch that wrote the record?" is answerable after the leader is gone. */
export function mintEngineLaunchMarker(): EngineLaunchMarker {
  return randomUUID() as EngineLaunchMarker;
}

export interface EngineLaunchIdentity extends ObservedEngineProcess {
  readonly version: typeof IDENTITY_VERSION;
  readonly engine: VllmEngine;
  readonly port: number;
  readonly repoRoot: string;
  /** The launch marker the recorded leader actually carried, read from its own `/proc/<pid>/environ`.
   *  ABSENT on every record written before #1756, and on one written by a launcher that stamped none —
   *  {@link adoptEngineGroup} answers `no-marker` for those, which is the pre-#1756 refusal verbatim. */
  readonly launchMarker?: string | undefined;
}

export interface EngineIdentityFile {
  readonly version: typeof IDENTITY_VERSION;
  readonly repoRoot: string;
  readonly engines: {
    readonly embed?: EngineLaunchIdentity | undefined;
    readonly rerank?: EngineLaunchIdentity | undefined;
    readonly gen?: EngineLaunchIdentity | undefined;
  };
}

type EngineOwnershipVerdict =
  | { readonly verdict: "owned"; readonly pgid: number }
  | { readonly verdict: "absent"; readonly reason: string }
  | { readonly verdict: "refused"; readonly reason: string };

type EngineSignalVerdict =
  | { readonly verdict: "signaled"; readonly pgid: number }
  | Extract<EngineOwnershipVerdict, { readonly verdict: "absent" | "refused" }>;

/** What one engine's stop attempt actually did, through BOTH doors. `adoption` is present only when the
 *  ordinary door declined and the marker door was therefore consulted — its absence means it was never
 *  asked, which is a different fact from "it refused". */
export interface EngineStopOutcome {
  readonly recorded: EngineSignalVerdict;
  readonly adoption?: EngineGroupAdoption | undefined;
  readonly signaled: boolean;
}

const engineSchema = z.enum(VLLM_ENGINES);
const positiveProcessId = z.number().int().gt(1);
const base64Cmdline = z
  .string()
  .min(1)
  .refine((value) => Buffer.from(value, "base64").toString("base64") === value, "cmdline must be canonical base64");
const launchIdentitySchema = z
  .strictObject({
    version: z.literal(IDENTITY_VERSION),
    engine: engineSchema,
    port: z.number().int().min(1).max(MAX_TCP_PORT),
    repoRoot: z.string().min(1),
    pid: positiveProcessId,
    pgid: positiveProcessId,
    startTicks: z.string().regex(DECIMAL_INTEGER_RE),
    executable: z.string().min(1),
    cmdlineBase64: base64Cmdline,
    cwd: z.string().min(1),
    // Optional so a pre-#1756 record still parses and stays stoppable by the ordinary door. PRESENT-BUT-
    // MALFORMED is a CORRUPT record, not an unmarked one: `strictObject` + this regex refuse the whole file,
    // because silently dropping a bad marker would turn a tampered pidfile into an ordinary old record and
    // re-open the door the marker closes.
    launchMarker: z.string().regex(ENGINE_LAUNCH_MARKER_RE).optional(),
  })
  .refine((record) => record.pid === record.pgid, "engine must remain its setsid process-group leader");
const identityFileSchema = z
  .strictObject({
    version: z.literal(IDENTITY_VERSION),
    repoRoot: z.string().min(1),
    engines: z.strictObject({
      embed: launchIdentitySchema.optional(),
      rerank: launchIdentitySchema.optional(),
      gen: launchIdentitySchema.optional(),
    }),
  })
  .superRefine((file, ctx) => {
    for (const engine of engineSchema.options) {
      const record = file.engines[engine];
      if (record !== undefined && (record.engine !== engine || record.repoRoot !== file.repoRoot)) {
        ctx.addIssue({ code: "custom", message: `${engine} identity does not match its file slot/root` });
      }
    }
  });

/** The shared durable record path. The historical filename stays stable for operator tooling. */
export function engineIdentityFilePath(repoRoot: string): string {
  return path.join(repoRoot, ".cache", "stack", IDENTITY_FILENAME);
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

/** Capture only a live setsid leader launched from this exact repo root.
 *
 *  The marker is read from the SPAWNED LEADER's own `/proc`, never from the launcher's intent: recording a
 *  token we merely meant to export would assert evidence nobody observed. (The dev-stack twin falls back to
 *  its own environment because its capture runs inside the shell that minted the marker; here the launcher
 *  holds the value explicitly and no such second witness exists.) A leader that carries none is recorded
 *  WITHOUT one and stays governed by the pre-#1756 refusal. */
export function captureEngineLaunchIdentity(engine: VllmEngine, port: number, repoRoot: string, pid: number): EngineLaunchIdentity | null {
  const observed = readObservedEngineProcess(pid);
  const resolvedRoot = path.resolve(repoRoot);
  if (observed === null || observed.pgid !== pid || observed.cwd !== resolvedRoot) {
    return null;
  }
  const launchMarker = readEngineProcessLaunchMarker(pid);
  const parsed = launchIdentitySchema.safeParse({
    version: IDENTITY_VERSION,
    engine,
    port,
    repoRoot: resolvedRoot,
    ...observed,
    ...(launchMarker === null ? {} : { launchMarker }),
  });
  return parsed.success ? parsed.data : null;
}

export function serializeEngineIdentityFile(file: EngineIdentityFile): string {
  const parsed = identityFileSchema.parse(file);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function parseEngineIdentityFile(text: string): EngineIdentityFile | null {
  // @orb-waive caught-failure-ownership(catch): a malformed engine-identity file parses to null (no launch record), so no negative-PGID signal can be authorized against it — the fail-closed direction. Ends if a null record ever authorizes a signal.
  try {
    const parsed = identityFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readEngineIdentityFile(repoRoot: string): EngineIdentityFile | null {
  // @orb-waive caught-failure-ownership(catch): an unreadable engine-identity file returns null (no launch record); no signal can be authorized without a matching record — fail-closed. Ends if a null read ever authorizes a signal.
  try {
    return parseEngineIdentityFile(readFileSync(engineIdentityFilePath(repoRoot), "utf8"));
  } catch {
    return null;
  }
}

/** Merge newly launched engines without deleting still-live sibling records; replace the file atomically. */
export function writeEngineLaunchIdentities(repoRoot: string, launched: readonly EngineLaunchIdentity[]): void {
  if (launched.length === 0) {
    return;
  }
  const resolvedRoot = path.resolve(repoRoot);
  const prior = readEngineIdentityFile(resolvedRoot);
  const engines: Partial<Record<VllmEngine, EngineLaunchIdentity>> = {};
  if (prior !== null && prior.repoRoot === resolvedRoot) {
    for (const engine of engineSchema.options) {
      const identity = prior.engines[engine];
      if (identity !== undefined) {
        engines[engine] = identity;
      }
    }
  }
  for (const identity of launched) {
    engines[identity.engine] = identity;
  }
  const file: EngineIdentityFile = { version: IDENTITY_VERSION, repoRoot: resolvedRoot, engines };
  const target = engineIdentityFilePath(resolvedRoot);
  const temporary = `${target}.tmp-${process.pid}`;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(temporary, serializeEngineIdentityFile(file), { encoding: "utf8", flag: "wx", mode: 0o600 });
  renameSync(temporary, target);
}

/** Pure ownership decision. Every field participates; a partial match is foreign, never close enough. */
export function verifyEngineLaunchIdentity(
  identity: EngineLaunchIdentity,
  observed: ObservedEngineProcess | null,
  expected: { readonly engine: VllmEngine; readonly port: number; readonly repoRoot: string; readonly listenerPid: number | null },
): EngineOwnershipVerdict {
  if (!Number.isInteger(identity.pid) || identity.pid <= 1 || !Number.isInteger(identity.pgid) || identity.pgid <= 1 || identity.pid !== identity.pgid) {
    return { verdict: "refused", reason: "recorded PID/PGID is not a safe setsid leader" };
  }
  if (identity.engine !== expected.engine || identity.port !== expected.port || identity.repoRoot !== path.resolve(expected.repoRoot)) {
    return { verdict: "refused", reason: "launch record does not match the requested engine, port, and repo root" };
  }
  if (expected.listenerPid !== null && expected.listenerPid !== identity.pid) {
    return { verdict: "refused", reason: `configured port is owned by foreign pid ${expected.listenerPid}; launch record names ${identity.pid}` };
  }
  if (observed === null) {
    return expected.listenerPid === null
      ? { verdict: "absent", reason: `recorded pid ${identity.pid} is gone and the configured port is free` }
      : { verdict: "refused", reason: `configured port still names pid ${expected.listenerPid}, but its launch identity is unreadable` };
  }
  if (
    observed.pid !== identity.pid ||
    observed.pgid !== identity.pgid ||
    observed.startTicks !== identity.startTicks ||
    observed.executable !== identity.executable ||
    observed.cmdlineBase64 !== identity.cmdlineBase64 ||
    observed.cwd !== identity.cwd ||
    observed.cwd !== identity.repoRoot
  ) {
    return { verdict: "refused", reason: `pid ${identity.pid} no longer matches its launch identity (stale or reused process)` };
  }
  return { verdict: "owned", pgid: identity.pgid };
}

/** Verify immediately before the only negative-PGID syscall. */
export function signalEngineLaunchIdentity(
  identity: EngineLaunchIdentity,
  signal: NodeJS.Signals,
  opts: {
    readonly engine: VllmEngine;
    readonly port: number;
    readonly repoRoot: string;
    readonly listenerPid: number | null;
    readonly readProcess?: (pid: number) => ObservedEngineProcess | null;
    readonly kill?: (target: number, signal: NodeJS.Signals) => void;
  },
): EngineSignalVerdict {
  const readProcess = opts.readProcess ?? readObservedEngineProcess;
  const ownership = verifyEngineLaunchIdentity(identity, readProcess(identity.pid), opts);
  if (ownership.verdict !== "owned") {
    return ownership;
  }
  // @orb-waive caught-failure-ownership(error): the kill failure is classified into a typed verdict (ESRCH → absent, else → refused) AFTER ownership was already verified "owned" above — propagated as a verdict, and no unverified signal is ever sent. Ends if the kill precedes ownership verification.
  try {
    (opts.kill ?? process.kill)(-ownership.pgid, signal);
    return { verdict: "signaled", pgid: ownership.pgid };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as Error & { readonly code?: unknown }).code : undefined;
    return code === "ESRCH"
      ? { verdict: "absent", reason: `owned pid ${identity.pid} exited before ${signal}` }
      : { verdict: "refused", reason: `could not signal verified engine pid ${identity.pid}` };
  }
}

/**
 * Legacy orphan-cleanup door, deliberately disabled. The durable record proves only its recorded leader;
 * once that leader is gone, PGID/cwd/argv-shaped survivors carry no launch identity and may never authorize
 * a negative-PGID signal. Keep the refusal here while callers migrate so stale code fails closed.
 */
export function signalOrphanedEngineGroup(
  identity: EngineLaunchIdentity,
  survivorPid: number,
  signal: NodeJS.Signals,
  opts: {
    readonly readProcess?: (pid: number) => ObservedEngineProcess | null;
    readonly kill?: (target: number, signal: NodeJS.Signals) => void;
  } = {},
): EngineSignalVerdict {
  if (identity.pid <= 1 || identity.pgid <= 1 || identity.pid !== identity.pgid || survivorPid <= 1 || survivorPid === identity.pid) {
    return { verdict: "refused", reason: "orphan recovery requires a safe recorded group and a distinct survivor" };
  }
  const readProcess = opts.readProcess ?? readObservedEngineProcess;
  const leader = readProcess(identity.pid);
  if (leader === null) {
    return {
      verdict: "refused",
      reason: `recorded engine leader pid ${identity.pid} is absent; refusing ${signal} for survivor pid ${survivorPid}; manual cleanup or relaunch required`,
    };
  }
  const verdict = verifyEngineLaunchIdentity(identity, leader, {
    engine: identity.engine,
    port: identity.port,
    repoRoot: identity.repoRoot,
    listenerPid: identity.pid,
  });
  return verdict.verdict === "owned"
    ? { verdict: "refused", reason: `recorded engine leader pid ${identity.pid} is still live; orphan cleanup is not applicable` }
    : verdict;
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

/** MAY a leaderless engine group be adopted? (#1756.) The standing rule is untouched — a survivor with no
 *  launch identity authorizes nothing — but a survivor CAN now carry one, so this asks whether it does.
 *
 *  EVERY live member must carry the recorded marker, not merely one of them. A pgid can be reused after
 *  wraparound, and an unrelated process could be placed in the group by something we did not start;
 *  requiring unanimity means the negative-PGID signal can only ever land on a group that is entirely this
 *  launch's. One unmarked member and the answer is the old refusal, naming the pid that caused it.
 *
 *  It is a LEADERLESS-group door and enforces that itself: while the recorded leader is alive, the ordinary
 *  verifier owns the decision (and refuses a mismatched record for reasons this door cannot see, such as a
 *  reused pid), so a live leader answers `leader-live` and adopts nothing. */
export function adoptEngineGroup(
  identity: EngineLaunchIdentity,
  opts: {
    readonly members?: (pgid: number) => readonly number[];
    readonly markerOf?: (pid: number) => string | null;
    readonly readProcess?: (pid: number) => ObservedEngineProcess | null;
  } = {},
): EngineGroupAdoption {
  const pgid = identity.pgid;
  if (identity.launchMarker === undefined) {
    return {
      kind: "no-marker",
      pgid,
      reason: `engine record for group ${pgid} carries no launch marker (written before #1756, or by a launcher that exported none)`,
    };
  }
  if ((opts.readProcess ?? readObservedEngineProcess)(identity.pid) !== null) {
    return { kind: "leader-live", pgid, reason: `recorded engine leader pid ${identity.pid} is still live; the ordinary identity door owns this decision` };
  }
  const members = (opts.members ?? engineGroupMembers)(pgid);
  if (members.length === 0) {
    return { kind: "empty", pgid };
  }
  const markerOf = opts.markerOf ?? readEngineProcessLaunchMarker;
  const unmarked = members.filter((pid) => markerOf(pid) !== identity.launchMarker);
  return unmarked.length === 0 ? { kind: "adoptable", pgid, members } : { kind: "unmarked", pgid, unmarked };
}

/** Signal an ADOPTED leaderless group: the same negative-PGID syscall as {@link signalEngineLaunchIdentity},
 *  behind the stricter of the two doors. Returns the adoption verdict that authorized (or refused) it, so
 *  the caller prints WHAT it verified rather than asserting ownership it never checked. */
export function signalAdoptedEngineGroup(
  identity: EngineLaunchIdentity,
  signal: NodeJS.Signals,
  opts: {
    readonly members?: (pgid: number) => readonly number[];
    readonly markerOf?: (pid: number) => string | null;
    readonly readProcess?: (pid: number) => ObservedEngineProcess | null;
    readonly kill?: (target: number, signal: NodeJS.Signals) => void;
  } = {},
): EngineGroupAdoption {
  const adoption = adoptEngineGroup(identity, opts);
  if (adoption.kind !== "adoptable") {
    return adoption;
  }
  // @orb-waive caught-failure-ownership(error): ESRCH means the adopted group exited between the census and the signal — the desired end state; every other signal failure rethrows. Ends if callers require proof the signal landed.
  try {
    (opts.kill ?? process.kill)(-adoption.pgid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && (error as Error & { readonly code?: unknown }).code === "ESRCH")) {
      throw error;
    }
  }
  return adoption;
}

/** The one operator sentence for an adoption verdict — so `stop` and any future status pane cannot describe
 *  the same tree two different ways. */
export function engineAdoptionText(adoption: EngineGroupAdoption): string {
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

/** Read the durable record and route through the same verifier. Missing/malformed state never reaches kill. */
export function signalRecordedEngineProcess(opts: {
  readonly repoRoot: string;
  readonly engine: VllmEngine;
  readonly port: number;
  readonly listenerPid: number | null;
  readonly signal: NodeJS.Signals;
}): EngineSignalVerdict {
  const { repoRoot, engine, port, listenerPid, signal } = opts;
  const target = engineIdentityFilePath(repoRoot);
  const file = readEngineIdentityFile(repoRoot);
  if (file === null) {
    if (existsSync(target)) {
      return { verdict: "refused", reason: `engine identity file ${target} is malformed or legacy; relaunch engines to write current identity state` };
    }
    return listenerPid === null
      ? { verdict: "absent", reason: "no launch identity and no configured-port listener" }
      : { verdict: "refused", reason: `configured port is owned by foreign pid ${listenerPid}; no launch identity exists` };
  }
  const identity = file.engines[engine];
  if (identity === undefined) {
    return listenerPid === null
      ? { verdict: "absent", reason: `no launch identity for ${engine} and its configured port is free` }
      : { verdict: "refused", reason: `configured port is owned by foreign pid ${listenerPid}; no ${engine} launch identity exists` };
  }
  return signalEngineLaunchIdentity(identity, signal, { engine, port, repoRoot, listenerPid });
}

/** Both doors for one engine, in the only order that is safe (#1756). The ORDINARY door runs first and is
 *  untouched; only when it declines AND the recorded leader has departed is the stricter marker door
 *  consulted. `signaled` is the caller's tally — it says a verified signal was sent by ONE of the two doors,
 *  never that the group is gone.
 *
 *  Why the fallback is gated on the ordinary door DECLINING rather than replacing it: while the leader is
 *  alive the record is verifiable field-by-field, which is strictly more than group membership proves, and a
 *  mismatch there (a reused pid, a foreign listener on our port) is a refusal the marker cannot overturn. */
export function stopRecordedEngineProcess(opts: {
  readonly repoRoot: string;
  readonly engine: VllmEngine;
  readonly port: number;
  readonly listenerPid: number | null;
  readonly signal: NodeJS.Signals;
  readonly adopt?: (identity: EngineLaunchIdentity, signal: NodeJS.Signals) => EngineGroupAdoption;
}): EngineStopOutcome {
  const recorded = signalRecordedEngineProcess(opts);
  if (recorded.verdict === "signaled") {
    return { recorded, signaled: true };
  }
  const identity = readEngineIdentityFile(opts.repoRoot)?.engines[opts.engine];
  if (identity === undefined) {
    return { recorded, signaled: false };
  }
  const adopt = opts.adopt ?? ((record: EngineLaunchIdentity, signal: NodeJS.Signals): EngineGroupAdoption => signalAdoptedEngineGroup(record, signal));
  const adoption = adopt(identity, opts.signal);
  return { recorded, adoption, signaled: adoption.kind === "adoptable" };
}
