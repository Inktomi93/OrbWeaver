// THE PLATFORM MODULE'S LEAF (`platform.ts` is the rest): every `/proc` and `/sys` read, including the cgroup
// quota files the load budget needs. It imports nothing from `proc.ts` or `load-budget*`, because the load
// budget sits under the process doors (proc.ts takes its timeouts from it) and reads these files through here.
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import type { ProcessEntry } from "./platform-parse.ts";
import { nulJoined, parseProcStatCpuMs, parseProcStatGroup, parseProcStatusParent } from "./platform-parse.ts";

/** The reads a Linux door performs, injected so a test drives them with a fake `/proc`. */
export interface ProcReads {
  /** A text file, or null when it cannot be read (a pid that exited mid-scan, a hidden `/proc` entry). */
  readonly readFile?: (path: string) => string | null;
  readonly readDir?: (path: string) => readonly string[];
  readonly readLink?: (path: string) => string | null;
}

const PROC = "/proc";
const PROC_VERSION = "/proc/version";
const PROC_SELF_CGROUP = "/proc/self/cgroup";
const CGROUP_ROOT = "/sys/fs/cgroup";
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
  // @orb-waive caught-failure-ownership(catch): an unreadable `/proc/<pid>/cwd` answers null, which every caller reads as "unknown", never as "not ours". Ends if null ever authorizes a signal.
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
