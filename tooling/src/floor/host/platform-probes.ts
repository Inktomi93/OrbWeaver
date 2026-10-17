// THE PLATFORM MODULE'S LEAF (`platform.ts` is the rest): every `/proc` and `/sys` read, including the cgroup
// quota files the load budget needs and the `/proc/net/tcp{,6}` socket table Linux falls back to without `ss`. It imports nothing from `proc.ts` or `load-budget*`, because the load
// budget sits under the process doors (proc.ts takes its timeouts from it) and reads these files through here.
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import process from "node:process";
import type { ProcessCompletion, ProcessCompletionOwner, ProcessEntry, SocketRow } from "./platform-parse.ts";
import { nulJoined, parseProcNetTcp, parseProcStatCpuMs, parseProcStatGroup, parseProcStatusParent, parseSocketInode } from "./platform-parse.ts";

/** The reads a Linux door performs, injected so a test drives them with a fake `/proc`. */
export interface ProcReads {
  /** A text file, or null when it cannot be read (a pid that exited mid-scan, a hidden `/proc` entry). */
  readonly readFile?: (path: string) => string | null;
  readonly readDir?: (path: string) => readonly string[];
  readonly readLink?: (path: string) => string | null;
}

/** A targeted identity/state read, never a process scanner; unsupported platforms refuse completion. */
export function processCompletion(pid: number, deps: ProcReads & { readonly platform?: NodeJS.Platform } = {}): ProcessCompletion {
  if ((deps.platform ?? process.platform) !== "linux") {
    return { kind: "unknown" };
  }
  let stat: string | null;
  try {
    stat = deps.readFile === undefined ? readFileSync(`${PROC}/${String(pid)}/stat`, "utf8") : deps.readFile(`${PROC}/${String(pid)}/stat`);
  } catch (error) {
    if (gone(error)) {
      return { kind: "gone" };
    }
    return { kind: "unknown" };
  }
  const close = stat?.lastIndexOf(")") ?? -1;
  const fields =
    close < 0
      ? []
      : (stat
          ?.slice(close + 2)
          .trim()
          .split(/\s+/u) ?? []);
  const state = fields[0];
  const identity = fields[STAT_STARTTIME_AFTER_COMM];
  if (state === undefined || !/^[RSDZTtXxKWPI]$/u.test(state) || identity === undefined || !PID_DIR_RE.test(identity)) {
    return { kind: "unknown" };
  }
  return { kind: state === "Z" || state === "X" ? "zombie" : "live", identity };
}

/** Reuse the native table walk, but a failed directory read is not a completed empty sweep. */
export function completionProcesses(
  deps: ProcReads & { readonly platform?: NodeJS.Platform; readonly owner?: ProcessCompletionOwner } = {},
): readonly ProcessEntry[] {
  if ((deps.platform ?? process.platform) !== "linux") {
    throw new Error("process completion table unavailable on this platform");
  }
  if (deps.owner !== undefined) {
    const current = processCompletion(process.pid, deps);
    if (deps.owner.pid !== process.pid || current.kind !== "live" || current.identity !== deps.owner.identity) {
      throw new Error("process completion owner identity unavailable");
    }
  }
  return linuxProcesses({
    ...deps,
    readFile: completionFileReader(deps, deps.owner),
    readDir: deps.readDir ?? ((path): readonly string[] => readdirSync(path)),
  });
}

function gone(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ESRCH");
}

/** Native runners keep their real/effective UID. Inaccessible foreign users cannot be their children;
 *  ambiguous ownership under this UID must retain the clone, not become an empty marker selection. */
function completionFileReader(deps: ProcReads, owner: ProcessCompletionOwner | undefined): (path: string) => string | null {
  const read = deps.readFile ?? ((path: string): string => readFileSync(path, "utf8"));
  return (path): string | null => {
    try {
      const value = read(path);
      if (value !== null) {
        return value;
      }
    } catch (error) {
      if (gone(error)) {
        return null;
      }
    }
    if (excludeInaccessibleProcess(path, read, owner)) {
      return null;
    }
    throw new Error(`process completion metadata unavailable: ${path}`);
  };
}

function excludeInaccessibleProcess(path: string, read: (path: string) => string | null, owner: ProcessCompletionOwner | undefined): boolean {
  const pid = /^\/proc\/(?<pid>\d+)\//u.exec(path)?.groups?.["pid"];
  if (owner !== undefined && pid !== undefined) {
    const candidate = processCompletion(Number(pid), { readFile: read });
    if (candidate.kind !== "unknown" && (candidate.kind === "gone" || candidate.kind === "zombie" || BigInt(candidate.identity) < BigInt(owner.identity))) {
      return true;
    }
  }
  let status: string | null;
  try {
    status = pid === undefined ? null : read(`${PROC}/${pid}/status`);
  } catch (error) {
    if (gone(error)) {
      return true;
    }
    throw new Error(`process completion metadata unavailable: ${path}`, { cause: error });
  }
  const ids = /^Uid:\s+(?<real>\d+)\s+(?<effective>\d+)\s+\d+\s+\d+/mu.exec(status ?? "")?.groups;
  const userId = process.getuid?.();
  const effectiveId = process.geteuid?.();
  return (
    ids !== undefined &&
    userId !== undefined &&
    effectiveId !== undefined &&
    Number(ids["real"]) !== userId &&
    Number(ids["real"]) !== effectiveId &&
    Number(ids["effective"]) !== userId &&
    Number(ids["effective"]) !== effectiveId
  );
}

const PROC = "/proc";
const PROC_VERSION = "/proc/version";
const PROC_SELF_CGROUP = "/proc/self/cgroup";
const CGROUP_ROOT = "/sys/fs/cgroup";
/** The kernel's own TCP socket tables for this network namespace; `tcp6` is absent where IPv6 is off. */
export const PROC_NET_TCP_TABLES = ["/proc/net/tcp", "/proc/net/tcp6"] as const;
const WSL2_KERNEL_RE = /microsoft-standard|wsl2/iu;
const PID_DIR_RE = /^\d+$/u;
const STATUS_LINE_RE = /^(?:Name|State|Threads|PPid):/u;
const LINE_RE = /\r?\n/u;

function readFileOrNull(path: string): string | null {
  // @orb-waive caught-failure-ownership(catch): a `/proc` entry that vanished or is hidden answers null, and every reader here treats null as "not observed", never as a verdict. Ends if null ever authorizes a signal.
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readLinkOrNull(path: string): string | null {
  // @orb-waive caught-failure-ownership(catch): an unreadable `/proc/<pid>/cwd` or fd link answers null, which every caller reads as "unknown" (no cwd, no socket owner), never as "not ours". Ends if null ever authorizes a signal.
  try {
    return readlinkSync(path);
  } catch {
    return null;
  }
}

function readDirOrEmpty(path: string): readonly string[] {
  // @orb-waive caught-failure-ownership(catch): a `/proc` that cannot be listed yields no processes, which a sweep reads as "nothing observed" and signals nothing. Ends if an empty list ever reads as a verdict.
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function fileOf(reads: ProcReads): (path: string) => string | null {
  return reads.readFile ?? readFileOrNull;
}

/** One pid's parent, command line and working directory from `/proc`, or null when it is gone. */
export function linuxProcessInfo(
  pid: number,
  reads: ProcReads,
): { readonly ppid: number | null; readonly cmdline: string; readonly cwd: string | null } | null {
  const readFile = fileOf(reads);
  const cmdline = readFile(`${PROC}/${String(pid)}/cmdline`);
  if (cmdline === null) {
    return null;
  }
  const status = readFile(`${PROC}/${String(pid)}/status`);
  return {
    ppid: status === null ? null : parseProcStatusParent(status),
    cmdline: nulJoined(cmdline),
    cwd: (reads.readLink ?? readLinkOrNull)(`${PROC}/${String(pid)}/cwd`),
  };
}

/** A pid's process group from `/proc/<pid>/stat`, or null when it is gone. */
export function linuxProcessGroup(pid: number, reads: ProcReads): number | null {
  const stat = fileOf(reads)(`${PROC}/${String(pid)}/stat`);
  return stat === null ? null : parseProcStatGroup(stat);
}

const STAT_STARTTIME_AFTER_COMM = 19;

/** Kernel start ticks distinguish a live process from a later process reusing its pid. */
export function linuxProcessStartTicks(pid: number, reads: ProcReads): string | null {
  const stat = fileOf(reads)(`${PROC}/${String(pid)}/stat`);
  return stat === null ? null : (stat.slice(stat.lastIndexOf(")") + 2).split(" ")[STAT_STARTTIME_AFTER_COMM] ?? null);
}

/** Every process in `/proc`: pid, parent, command line, environment and CPU time. */
export function linuxProcesses(reads: ProcReads): readonly ProcessEntry[] {
  const readFile = fileOf(reads);
  const entries: ProcessEntry[] = [];
  for (const name of (reads.readDir ?? readDirOrEmpty)(PROC)) {
    if (!PID_DIR_RE.test(name)) {
      continue;
    }
    const cmdline = readFile(`${PROC}/${name}/cmdline`);
    if (cmdline === null) {
      continue;
    }
    const status = readFile(`${PROC}/${name}/status`);
    const environ = readFile(`${PROC}/${name}/environ`);
    const stat = readFile(`${PROC}/${name}/stat`);
    entries.push({
      pid: Number(name),
      ppid: status === null ? null : parseProcStatusParent(status),
      cmdline: nulJoined(cmdline),
      environ: environ === null ? null : nulJoined(environ),
      cpuMs: stat === null ? null : parseProcStatCpuMs(stat),
    });
  }
  return entries;
}

/** The `/proc` forensics a wedge dump wants: the status lines naming state and thread count, the kernel
 *  function the process is blocked in, and its open fds. */
export function linuxProcessDiagnostics(pid: number, reads: ProcReads): { readonly status: string; readonly wchan: string; readonly fds: string } {
  const readFile = fileOf(reads);
  const status = (readFile(`${PROC}/${String(pid)}/status`) ?? "")
    .split(LINE_RE)
    .filter((line) => STATUS_LINE_RE.test(line))
    .join(" | ");
  return {
    status,
    wchan: readFile(`${PROC}/${String(pid)}/wchan`) ?? "<unreadable>",
    fds: (reads.readDir ?? readDirOrEmpty)(`${PROC}/${String(pid)}/fd`).join(","),
  };
}

/** The pid owning each wanted socket inode, from the `socket:[<inode>]` links under every `/proc/<pid>/fd`. A
 *  process whose fds this user cannot list owns nothing here, the same blind spot `ss -p` has. */
function socketOwners(wanted: ReadonlySet<number>, reads: ProcReads): ReadonlyMap<number, number> {
  const owners = new Map<number, number>();
  const readDir = reads.readDir ?? readDirOrEmpty;
  const readLink = reads.readLink ?? readLinkOrNull;
  for (const name of wanted.size === 0 ? [] : readDir(PROC)) {
    if (!PID_DIR_RE.test(name)) {
      continue;
    }
    for (const inode of socketInodesOf(name, readDir, readLink)) {
      if (wanted.has(inode) && !owners.has(inode)) {
        owners.set(inode, Number(name));
      }
    }
    if (owners.size === wanted.size) {
      break;
    }
  }
  return owners;
}

function socketInodesOf(pid: string, readDir: (path: string) => readonly string[], readLink: (path: string) => string | null): readonly number[] {
  return readDir(`${PROC}/${pid}/fd`).flatMap((fd) => {
    const link = readLink(`${PROC}/${pid}/fd/${fd}`);
    const inode = link === null ? null : parseSocketInode(link);
    return inode === null ? [] : [inode];
  });
}

/** Every TCP socket in the asked state from `/proc/net/tcp{,6}`, each owner joined through the fd links; null
 *  when neither table could be read, which the caller turns into a refusal, never into "no sockets". */
export function linuxProcSockets(listening: boolean, reads: ProcReads): readonly SocketRow[] | null {
  const tables = PROC_NET_TCP_TABLES.map(fileOf(reads)).filter((table): table is string => table !== null);
  if (tables.length === 0) {
    return null;
  }
  const rows = tables.flatMap(parseProcNetTcp).filter((row) => row.listening === listening);
  // Inode 0 is a socket with no file behind it (an orphaned close); no fd can name it.
  const owners = socketOwners(new Set(rows.map((row) => row.inode).filter((inode) => inode !== 0)), reads);
  return rows.map(({ inode, ...row }) => ({ ...row, pid: owners.get(inode) ?? null }));
}

/** Is this Linux kernel WSL2's? */
export function linuxIsWsl2(reads: ProcReads): boolean {
  const version = fileOf(reads)(PROC_VERSION);
  return version !== null && WSL2_KERNEL_RE.test(version);
}

/** Where cgroup v2 records this process's own cgroup and where the hierarchy is mounted; undefined off Linux,
 *  where there are no cgroups and so no ceiling to read. */
export function cgroupFiles(platform: NodeJS.Platform): { readonly procSelf: string; readonly root: string } | undefined {
  return platform === "linux" ? { procSelf: PROC_SELF_CGROUP, root: CGROUP_ROOT } : undefined;
}
