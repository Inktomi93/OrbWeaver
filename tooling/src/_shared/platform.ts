// THE ONE PLATFORM MODULE: every read of the socket table or the process table, every `/proc` path and
// every OS-specific binary lives here or in its leaf, branched on an injectable `platform`. The
// `tooling-os-neutral` policy exempts these two files alone; a Linux-only call anywhere else is a finding. This
// file holds the spawns and openers; `platform-probes.ts` is the leaf with the `/proc` and `/sys` reads. Limits
// stated once: win32 exposes no process environment and no process group, so a run marker there is found
// only in argv and a tree is stopped through its recorded pids; darwin folds a process's environment into
// its command line.
import process from "node:process";
import type { ProcessEntry, SocketRow } from "./platform-parse.ts";
import { parseCimProcesses, parseLsofSockets, parseNetstatSockets, parsePsClock, parsePsProcesses, parseSsSockets } from "./platform-parse.ts";
import type { ProcReads } from "./platform-probes.ts";
import {
  linuxIsWsl2,
  linuxProcessDiagnostics,
  linuxProcesses,
  linuxProcessGroup,
  linuxProcessInfo,
  linuxProcSockets,
  PROC_NET_TCP_TABLES,
} from "./platform-probes.ts";
import type { FullPriorityChild, RunNicedSyncResult } from "./proc.ts";
import { runNicedSync, spawnFullPriorityChild } from "./proc.ts";

export type { ProcessEntry, SocketRow } from "./platform-parse.ts";

/** The platforms with a backend here. Any other platform reads nothing and never guesses. */
export const SUPPORTED_PLATFORMS = ["linux", "darwin", "win32"] as const;
export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

/** The reads a door performs, injected so a test drives the darwin and win32 branches on Linux with
 *  fixture output and a fake `/proc`. Production callers take the defaults. */
export interface PlatformDeps extends ProcReads {
  readonly platform?: NodeJS.Platform;
  readonly run?: (cmd: string, args: readonly string[]) => RunNicedSyncResult;
  /** Starts the default-browser opener; `openUrl` releases it at once and reads how it ended. */
  readonly launch?: (cmd: string, args: readonly string[]) => OpenerChild;
}

/** The default-browser opener as `openUrl` sees it: released at once, and awaited only for how it ended. */
export type OpenerChild = Pick<FullPriorityChild, "unref" | "wait">;

/** One established TCP socket: the local port it terminates, the peer it faces and the pid owning the
 *  local end when the OS named it. */
export interface EstablishedConnection {
  readonly localPort: number;
  readonly peerHost: string;
  readonly peerPort: number;
  readonly pid: number | null;
}

/** What the OS says about one live pid; `cwd` is null where the OS does not expose it (win32). */
export interface ProcessInfo {
  readonly pid: number;
  readonly ppid: number | null;
  readonly cmdline: string;
  readonly cwd: string | null;
}

/** How to run the operator's own pnpm from a child process with `shell: false`, on every platform.
 *    `node`    — `<node> <pnpm.cjs> <args>`: pnpm's own JS entry, run by the node we are already in. On win32
 *                pnpm on PATH is `pnpm.cmd`, and node refuses to spawn a `.cmd`/`.bat` without `shell: true`.
 *    `binary`  — `<pnpm executable> <args>`: the standalone pnpm the README installs is a native executable
 *                (`pnpm.exe` on win32), which spawns directly on every platform.
 *    `path`    — bare `pnpm` resolved by the OS execvp (POSIX only; no `.cmd` indirection there).
 *    `refused` — no usable pnpm could be named, and guessing would be a lie. `reason` is the fix. */
export type PnpmInvocation =
  | { readonly kind: "node"; readonly command: string; readonly args: readonly string[] }
  | { readonly kind: "binary"; readonly command: string; readonly args: readonly string[] }
  | { readonly kind: "path"; readonly command: string; readonly args: readonly string[] }
  | { readonly kind: "refused"; readonly reason: string };

/** The env key pnpm (and npm/yarn) sets to the absolute path of its own entry when it runs a script: a JS file, or the
 *  executable itself for a standalone pnpm. */
export const PNPM_EXECPATH_ENV = "npm_execpath";
/** pnpm's JS entry, however this process was launched: a `.cjs`/`.js`/`.mjs` tail is the whole test. */
const JS_ENTRY_RE = /\.(?:c|m)?js$/u;

const POWERSHELL = "powershell.exe";
const POWERSHELL_FLAGS = ["-NoProfile", "-NonInteractive", "-Command"] as const;
const CIM_FIELDS = "ProcessId,ParentProcessId,CommandLine,KernelModeTime,UserModeTime";
const PS_PROCESS_COLUMNS = "pid=,ppid=,time=,command=";

function isSupported(platform: NodeJS.Platform): platform is SupportedPlatform {
  return (SUPPORTED_PLATFORMS as readonly string[]).includes(platform);
}

/** The platform a door branches on, or null for one this module has no backend for. */
function supportedPlatform(deps: PlatformDeps): SupportedPlatform | null {
  const platform = deps.platform ?? process.platform;
  return isSupported(platform) ? platform : null;
}

function runOf(deps: PlatformDeps): (cmd: string, args: readonly string[]) => RunNicedSyncResult {
  return deps.run ?? ((cmd, args): RunNicedSyncResult => runNicedSync(cmd, args));
}

function stdoutOf(result: RunNicedSyncResult): string {
  return result.status === 0 ? result.stdout : "";
}

/** A socket-table read: what the OS named, or a refusal saying which tool on which platform could not answer.
 *  Never an empty table in place of a failed read: an empty table means "nothing is listening", and a verb
 *  that believes it reports a live server stopped or a held port free. */
export type SocketTableRead<T> = { readonly kind: "read"; readonly value: T } | { readonly kind: "refused"; readonly reason: string };

/** The shell's "command not found" status; `nice` answers it when the tool it was asked to run is absent. */
const MISSING_COMMAND_STATUS = 127;
const MISSING_COMMAND_ERROR = "ENOENT";
/** `lsof` exits 1 with nothing on either stream when no socket matched the filter: its empty answer. */
const LSOF_NO_MATCH_STATUS = 1;
const LINE_RE = /\r?\n/u;

/** The tool each platform reads its socket table with, per asked state. */
function socketTableCommand(platform: SupportedPlatform, listening: boolean): readonly [string, readonly string[]] {
  switch (platform) {
    case "linux":
      return listening ? ["ss", ["-tlnp"]] : ["ss", ["-tnp", "state", "established"]];
    case "darwin":
      return ["lsof", ["-nP", "-iTCP", `-sTCP:${listening ? "LISTEN" : "ESTABLISHED"}`, "-Fpn"]];
    case "win32":
      return ["netstat", ["-ano"]];
  }
}

function parseSocketTable(platform: SupportedPlatform, listening: boolean, stdout: string): readonly SocketRow[] {
  switch (platform) {
    case "linux":
      return parseSsSockets(stdout);
    case "darwin":
      return parseLsofSockets(stdout, listening);
    case "win32":
      return parseNetstatSockets(stdout).filter((row) => row.listening === listening);
  }
}

function isMissingCommand(result: RunNicedSyncResult): boolean {
  return result.errorCode === MISSING_COMMAND_ERROR || result.status === MISSING_COMMAND_STATUS;
}

/** Why a tool that ran gave no usable answer, or null when its answer stands. */
function toolFailure(platform: SupportedPlatform, result: RunNicedSyncResult): string | null {
  if (result.errorCode !== undefined) {
    return `could not run (${result.errorCode})`;
  }
  const lsofNoMatch = platform === "darwin" && result.status === LSOF_NO_MATCH_STATUS && result.stdout === "" && result.stderr === "";
  if (result.status === 0 || lsofNoMatch) {
    return null;
  }
  const said = result.stderr.trim().split(LINE_RE)[0] ?? "";
  const status = result.status === null ? "was killed before it answered" : `exited ${String(result.status)}`;
  return said === "" ? status : `${status} (${said})`;
}

function refused<T>(where: string): SocketTableRead<T> {
  return { kind: "refused", reason: `socket table unreadable on ${where}` };
}

/** ONE socket-table read: every TCP socket in the asked state. `ss` on Linux, `lsof` on darwin, `netstat` on
 *  win32. `ss` stays the Linux primary because it asks the kernel's socket diagnostics directly; only when it is
 *  not installed does Linux read `/proc/net/tcp{,6}` and join owners through `/proc/<pid>/fd`, the same walk
 *  `ss -p` makes. A tool that ran and failed, or a missing tool with nothing to fall back to, refuses. */
function sockets(listening: boolean, deps: PlatformDeps): SocketTableRead<readonly SocketRow[]> {
  const platform = supportedPlatform(deps);
  if (platform === null) {
    return refused(`${deps.platform ?? process.platform}: this module has no socket-table backend for the platform`);
  }
  const [cmd, args] = socketTableCommand(platform, listening);
  const spelling = `\`${[cmd, ...args].join(" ")}\``;
  const result = runOf(deps)(cmd, args);
  if (isMissingCommand(result)) {
    const fallback = platform === "linux" ? linuxProcSockets(listening, deps) : null;
    if (fallback !== null) {
      return { kind: "read", value: fallback };
    }
    const proc = platform === "linux" ? `, and neither ${PROC_NET_TCP_TABLES.join(" nor ")} could be read` : "";
    return refused(`${platform}: ${spelling} is not installed${proc}`);
  }
  const failure = toolFailure(platform, result);
  return failure === null ? { kind: "read", value: parseSocketTable(platform, listening, result.stdout) } : refused(`${platform}: ${spelling} ${failure}`);
}

/** Port to the pid listening on it. A port with no nameable owner (another user's process) is absent. */
export function listeningPids(deps: PlatformDeps = {}): SocketTableRead<ReadonlyMap<number, number>> {
  const table = sockets(true, deps);
  if (table.kind === "refused") {
    return table;
  }
  const bound = new Map<number, number>();
  for (const row of table.value) {
    if (row.pid !== null && !bound.has(row.localPort)) {
      bound.set(row.localPort, row.pid);
    }
  }
  return { kind: "read", value: bound };
}

/** Every established TCP connection the box holds, with the owner of the local end when nameable. */
export function establishedConnections(deps: PlatformDeps = {}): SocketTableRead<readonly EstablishedConnection[]> {
  const table = sockets(false, deps);
  if (table.kind === "refused") {
    return table;
  }
  return { kind: "read", value: table.value.map((row) => ({ localPort: row.localPort, peerHost: row.peerHost, peerPort: row.peerPort, pid: row.pid })) };
}

/** A read's value, or a throw carrying the refusal: for a caller whose only honest answer to an unreadable
 *  table is to stop. Under `runTool` the throw is a tool error, exit 2, never a verdict. */
export function socketTableOrThrow<T>(read: SocketTableRead<T>): T {
  if (read.kind === "refused") {
    throw new Error(read.reason);
  }
  return read.value;
}

function darwinProcessInfo(pid: number, deps: PlatformDeps): ProcessInfo | null {
  const run = runOf(deps);
  const entry = parsePsProcesses(stdoutOf(run("ps", ["-o", PS_PROCESS_COLUMNS, "-p", String(pid)])))[0];
  if (entry === undefined) {
    return null;
  }
  const cwd = parseLsofCwd(stdoutOf(run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])));
  return { pid, ppid: entry.ppid, cmdline: entry.cmdline, cwd };
}

/** `lsof -a -p <pid> -d cwd -Fn` answers `p<pid>` then `n<path>`. */
function parseLsofCwd(output: string): string | null {
  const line = output.split("\n").find((candidate) => candidate.startsWith("n"));
  return line === undefined ? null : line.slice(1).trim();
}

function win32Processes(deps: PlatformDeps, filter: string | null): readonly ProcessEntry[] {
  const query = filter === null ? "Get-CimInstance Win32_Process" : `Get-CimInstance Win32_Process -Filter "${filter}"`;
  const output = stdoutOf(runOf(deps)(POWERSHELL, [...POWERSHELL_FLAGS, `${query} | Select-Object ${CIM_FIELDS} | ConvertTo-Json -Compress`]));
  // @orb-waive caught-failure-ownership(catch): PowerShell output that is not the JSON asked for is "nothing observed" to every caller, and nothing observed signals nothing. Ends if an empty list ever reads as a verdict.
  try {
    return parseCimProcesses(output);
  } catch {
    return [];
  }
}

function win32ProcessInfo(pid: number, deps: PlatformDeps): ProcessInfo | null {
  const entry = win32Processes(deps, `ProcessId = ${String(pid)}`)[0];
  return entry === undefined ? null : { pid, ppid: entry.ppid, cmdline: entry.cmdline, cwd: null };
}

/** What the OS says about one pid, or null when it is gone or unreadable: null is "not observed", never
 *  "not ours". */
export function processInfo(pid: number, deps: PlatformDeps = {}): ProcessInfo | null {
  const platform = supportedPlatform(deps);
  return platform === null ? null : processInfoOn(platform, pid, deps);
}

function processInfoOn(platform: SupportedPlatform, pid: number, deps: PlatformDeps): ProcessInfo | null {
  switch (platform) {
    case "linux": {
      const info = linuxProcessInfo(pid, deps);
      return info === null ? null : { pid, ...info };
    }
    case "darwin":
      return darwinProcessInfo(pid, deps);
    case "win32":
      return win32ProcessInfo(pid, deps);
  }
}

/** The POSIX process group of a pid, or null: win32 has no process group, and a pid that is gone has none. */
export function processGroupId(pid: number, deps: PlatformDeps = {}): number | null {
  const platform = supportedPlatform(deps);
  if (platform === null || platform === "win32") {
    return null;
  }
  if (platform === "linux") {
    return linuxProcessGroup(pid, deps);
  }
  const pgid = Number(stdoutOf(runOf(deps)("ps", ["-o", "pgid=", "-p", String(pid)])).trim());
  return Number.isInteger(pgid) && pgid > 0 ? pgid : null;
}

/** Seconds since a pid started, or null when the OS cannot say. */
export function processAgeSeconds(pid: number, deps: PlatformDeps = {}): number | null {
  const platform = supportedPlatform(deps);
  const run = runOf(deps);
  if (platform === null) {
    return null;
  }
  if (platform === "win32") {
    const script = `(Get-CimInstance Win32_Process -Filter "ProcessId = ${String(pid)}" | ForEach-Object { [int]((Get-Date) - $_.CreationDate).TotalSeconds })`;
    const seconds = Number(stdoutOf(run(POWERSHELL, [...POWERSHELL_FLAGS, script])).trim());
    return Number.isInteger(seconds) && seconds >= 0 ? seconds : null;
  }
  return parsePsClock(stdoutOf(run("ps", ["-o", "etime=", "-p", String(pid)])));
}

/** Every process on the box: pid, parent, command line, environment where the OS exposes it, CPU time. */
export function listProcesses(deps: PlatformDeps = {}): readonly ProcessEntry[] {
  const platform = supportedPlatform(deps);
  return platform === null ? [] : listProcessesOn(platform, deps);
}

function listProcessesOn(platform: SupportedPlatform, deps: PlatformDeps): readonly ProcessEntry[] {
  switch (platform) {
    case "linux":
      return linuxProcesses(deps);
    case "darwin":
      // `-E` appends each process's environment to its command line; the parser keeps both in one blob.
      return parsePsProcesses(stdoutOf(runOf(deps)("ps", ["-axEww", "-o", PS_PROCESS_COLUMNS])));
    case "win32":
      return win32Processes(deps, null);
  }
}

/** CPU milliseconds burned by `pid` and every descendant, from one process-table read. */
export function processTreeCpuMs(pid: number, deps: PlatformDeps = {}): number {
  const entries = listProcesses(deps);
  const children = new Map<number, number[]>();
  for (const entry of entries) {
    if (entry.ppid !== null) {
      children.set(entry.ppid, [...(children.get(entry.ppid) ?? []), entry.pid]);
    }
  }
  const tree = new Set<number>([pid]);
  const queue = [pid];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of children.get(next) ?? []) {
      if (!tree.has(child)) {
        tree.add(child);
        queue.push(child);
      }
    }
  }
  return entries.filter((entry) => tree.has(entry.pid)).reduce((total, entry) => total + (entry.cpuMs ?? 0), 0);
}

/** The Linux `/proc` forensics a wedge dump wants: the status lines that name the state and thread count,
 *  the kernel function the process is blocked in, and its open fds. Elsewhere only the command line is
 *  knowable, and the block says so. */
export function processDiagnostics(pid: number, deps: PlatformDeps = {}): string {
  const info = processInfo(pid, deps);
  const cmdline = info === null ? "<gone>" : info.cmdline;
  if (supportedPlatform(deps) !== "linux") {
    return `  cmdline: ${cmdline}`;
  }
  const { status, wchan, fds } = linuxProcessDiagnostics(pid, deps);
  return [`  status : ${status}`, `  wchan  : ${wchan}`, `  cmdline: ${cmdline}`, `  fds    : ${fds}`].join("\n");
}

/** Running inside WSL2, whose own addresses other devices cannot reach without Windows port forwarding.
 *  WSL1 does not match: it shares Windows' own network stack. */
export function isWsl2(deps: PlatformDeps = {}): boolean {
  if (supportedPlatform(deps) !== "linux") {
    return false;
  }
  return linuxIsWsl2(deps);
}

/** The default-browser opener per platform; `xdg-open` is the answer on every other Unix. */
function openerFor(platform: SupportedPlatform | null, url: string): readonly [string, readonly string[]] {
  if (platform === "darwin") {
    return ["open", [url]];
  }
  if (platform === "win32") {
    // `start` is a cmd builtin; its first quoted argument is the window title, so the URL needs an empty one.
    return ["cmd.exe", ["/c", "start", "", url]];
  }
  return ["xdg-open", [url]];
}

/** The default launcher. Full priority, because a browser the opener starts keeps the opener's priority for its whole
 *  life. No stdio, because that browser outlives this process: an unread pipe would stall it and a closed one could kill
 *  it. Detached on POSIX, so the Ctrl-C that stops the caller never reaches the browser; win32 `detached` would open a
 *  second console, and the browser `start` launches is not attached to this one. */
function launchOpener(cmd: string, args: readonly string[]): OpenerChild {
  return spawnFullPriorityChild(cmd, args, { stdio: "ignore", detached: process.platform !== "win32" });
}

/** Open a URL in the default browser. The opener is released at once, so the caller can exit before it does; the
 *  promise answers the error when the opener could not run (a box with no desktop has none), never throws it, and
 *  otherwise `undefined`. Whether a browser then appears is the desktop's business. */
export async function openUrl(url: string, deps: PlatformDeps = {}): Promise<Error | undefined> {
  const [command, args] = openerFor(supportedPlatform(deps), url);
  const opener = (deps.launch ?? launchOpener)(command, args);
  // Asked before the release: a spawn failure is emitted on the next tick, and `wait` is its only listener.
  const exit = opener.wait();
  opener.unref();
  return (await exit).error;
}

/** Name the pnpm to run with, for a `shell: false` spawn on any platform.
 *
 *  `npm_execpath` is the answer on all three OSes and is present under every `pnpm <script>`: pnpm exports the
 *  absolute path of its own entry into each script's environment, so `<this node> <pnpm.cjs> …`, or the standalone
 *  executable itself, runs the exact package manager the operator invoked. Only a direct `node <entry>.ts` misses it; on POSIX the bare
 *  name then resolves through PATH, and on win32 it cannot (PATH holds `pnpm.cmd`, which node will not run
 *  without a shell), so win32 refuses and names the one-word fix instead of failing inside a spawn. */
export function pnpmInvocation(opts: {
  readonly ambient: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly nodePath: string;
  readonly args: readonly string[];
}): PnpmInvocation {
  const execPath = opts.ambient[PNPM_EXECPATH_ENV];
  if (execPath !== undefined && execPath !== "") {
    return JS_ENTRY_RE.test(execPath)
      ? { kind: "node", command: opts.nodePath, args: [execPath, ...opts.args] }
      : { kind: "binary", command: execPath, args: [...opts.args] };
  }
  if (opts.platform === "win32") {
    return {
      kind: "refused",
      reason: `cannot find pnpm to run with: ${PNPM_EXECPATH_ENV} is unset, and on Windows pnpm on PATH is a .cmd file node will not run without a shell. Run the command through \`pnpm\` (not \`node …\`).`,
    };
  }
  return { kind: "path", command: "pnpm", args: [...opts.args] };
}
