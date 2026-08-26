// Durable ownership for the detached vLLM process groups. A listening port proves only that SOMETHING is
// serving; a pid proves only a number that Linux may later reuse. Every destructive engine action therefore
// compares the launch-time /proc identity (pid + pgid + start ticks + executable + raw cmdline + cwd) with a
// fresh read immediately before process.kill. The standalone shell reaches this same module through
// engines-ctl, so there is one identity contract and one signal door for both owners.

import { existsSync, mkdirSync, readFileSync, readlinkSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { z } from "zod";
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

export interface EngineLaunchIdentity extends ObservedEngineProcess {
  readonly version: typeof IDENTITY_VERSION;
  readonly engine: VllmEngine;
  readonly port: number;
  readonly repoRoot: string;
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

function sameObservedProcess(left: ObservedEngineProcess, right: ObservedEngineProcess): boolean {
  return (
    left.pid === right.pid &&
    left.pgid === right.pgid &&
    left.startTicks === right.startTicks &&
    left.executable === right.executable &&
    left.cmdlineBase64 === right.cmdlineBase64 &&
    left.cwd === right.cwd
  );
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

/** Capture only a live setsid leader launched from this exact repo root. */
export function captureEngineLaunchIdentity(engine: VllmEngine, port: number, repoRoot: string, pid: number): EngineLaunchIdentity | null {
  const observed = readObservedEngineProcess(pid);
  const resolvedRoot = path.resolve(repoRoot);
  if (observed === null || observed.pgid !== pid || observed.cwd !== resolvedRoot) {
    return null;
  }
  const parsed = launchIdentitySchema.safeParse({ version: IDENTITY_VERSION, engine, port, repoRoot: resolvedRoot, ...observed });
  return parsed.success ? parsed.data : null;
}

export function serializeEngineIdentityFile(file: EngineIdentityFile): string {
  const parsed = identityFileSchema.parse(file);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function parseEngineIdentityFile(text: string): EngineIdentityFile | null {
  try {
    const parsed = identityFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readEngineIdentityFile(repoRoot: string): EngineIdentityFile | null {
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

function liveOrReusedLeaderVerdict(identity: EngineLaunchIdentity, leader: ObservedEngineProcess | null): EngineSignalVerdict | null {
  if (leader === null) {
    return null;
  }
  const verdict = verifyEngineLaunchIdentity(identity, leader, {
    engine: identity.engine,
    port: identity.port,
    repoRoot: identity.repoRoot,
    listenerPid: identity.pid,
  });
  return verdict.verdict === "owned" ? { verdict: "absent", reason: `recorded leader pid ${identity.pid} still owns the engine group` } : verdict;
}

/** Recover a recorded process group after its setsid leader died, re-verifying immediately before signal. */
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
  const leaderVerdict = liveOrReusedLeaderVerdict(identity, readProcess(identity.pid));
  if (leaderVerdict !== null) {
    return leaderVerdict;
  }
  const first = readProcess(survivorPid);
  if (first === null || first.pgid !== identity.pgid || first.cwd !== identity.repoRoot) {
    return { verdict: "refused", reason: `pid ${survivorPid} is not decisively related to recorded engine group ${identity.pgid}` };
  }
  const second = readProcess(survivorPid);
  if (readProcess(identity.pid) !== null || second === null || !sameObservedProcess(first, second)) {
    return { verdict: "refused", reason: "engine group identity changed during orphan recovery" };
  }
  try {
    (opts.kill ?? process.kill)(-identity.pgid, signal);
    return { verdict: "signaled", pgid: identity.pgid };
  } catch (error) {
    const code = error instanceof Error && "code" in error ? (error as Error & { readonly code?: unknown }).code : undefined;
    return code === "ESRCH"
      ? { verdict: "absent", reason: `owned engine group ${identity.pgid} exited before ${signal}` }
      : { verdict: "refused", reason: `could not signal verified orphaned engine group ${identity.pgid}` };
  }
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
