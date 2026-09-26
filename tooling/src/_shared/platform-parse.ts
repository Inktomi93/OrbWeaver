// The pure parsers behind `platform.ts`: each reads one OS tool's documented output shape into the shared
// socket and process facts. No I/O and no platform read here, so every branch is provable with fixture text.

/** One TCP socket as the OS reports it: the local port, the peer (empty for a listener) and the owner pid
 *  when the tool could name it. */
export interface SocketRow {
  readonly localPort: number;
  readonly peerHost: string;
  readonly peerPort: number;
  readonly listening: boolean;
  readonly pid: number | null;
}

/** One process as the OS lists it. `environ` is null where the OS gives no readable environment; `cpuMs` is
 *  null where the tool reports no CPU time. */
export interface ProcessEntry {
  readonly pid: number;
  readonly ppid: number | null;
  readonly cmdline: string;
  readonly environ: string | null;
  readonly cpuMs: number | null;
}

const WHITESPACE_RE = /\s+/u;
const DECIMAL_RE = /^\d+$/u;
const SS_PID_RE = /pid=(\d+)/u;
const PPID_RE = /^PPid:\s+(\d+)$/mu;

/** `ss` column layout. With the State column present (`-l`): State Recv-Q Send-Q Local Peer. Under a
 *  state filter the State column is dropped, so every later column moves left by one. */
const SS_STATE_COLUMN = 0;
const SS_LOCAL_COLUMN = 3;
const SS_PEER_COLUMN = 4;
const SS_FILTER_SHIFT = 1;
const SS_LISTEN = "LISTEN";
const SS_ESTABLISHED = "ESTAB";

/** `netstat -ano` column layout: Proto Local Peer State PID. */
const NETSTAT_PROTO_COLUMN = 0;
const NETSTAT_LOCAL_COLUMN = 1;
const NETSTAT_PEER_COLUMN = 2;
const NETSTAT_STATE_COLUMN = 3;
const NETSTAT_PID_COLUMN = 4;
const NETSTAT_LISTENING = "LISTENING";
const NETSTAT_ESTABLISHED = "ESTABLISHED";
/** netstat names the System Idle Process as the owner of a socket nobody holds. */
const NETSTAT_NO_PID = "0";

/** `ps -axo pid=,ppid=,time=,command=` column layout; the command runs to the end of the line. */
const PS_PID_COLUMN = 0;
const PS_PPID_COLUMN = 1;
const PS_TIME_COLUMN = 2;
const PS_COMMAND_COLUMN = 3;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const CLOCK_PARTS_WITH_HOURS = 3;
const CLOCK_PARTS_WITHOUT_HOURS = 2;

/** Linux `/proc/<pid>/stat` field numbers (1-based, per proc(5)); the split tail starts at the state field. */
const PROC_STAT_STATE_FIELD = 3;
const PROC_STAT_PGID_FIELD = 5;
const PROC_STAT_UTIME_FIELD = 14;
const PROC_STAT_STIME_FIELD = 15;
/** Linux clock ticks per second for `/proc` CPU fields (`CLK_TCK`), 100 on every Linux Node runs on. */
const LINUX_CLK_TCK = 100;
/** Windows CIM reports CPU in 100-nanosecond units. */
const CIM_TICKS_PER_MS = 10_000;

/** `host:port` split from the RIGHT: an IPv6 address is `[::1]:8888`, so a left split loses. */
export function splitHostPort(token: string): { readonly host: string; readonly port: number } | null {
  const colon = token.lastIndexOf(":");
  if (colon <= 0) {
    return null;
  }
  const port = Number(token.slice(colon + 1));
  return Number.isInteger(port) ? { host: token.slice(0, colon), port } : null;
}

function socketRow(local: string, peer: string, listening: boolean, pid: number | null): SocketRow | null {
  const localParsed = splitHostPort(local);
  if (localParsed === null) {
    return null;
  }
  const peerParsed = listening ? null : splitHostPort(peer);
  return {
    localPort: localParsed.port,
    peerHost: peerParsed === null ? "" : peerParsed.host,
    peerPort: peerParsed === null ? 0 : peerParsed.port,
    listening,
    pid,
  };
}

function ssRow(line: string): SocketRow | null {
  const fields = line.trim().split(WHITESPACE_RE);
  // A state filter drops the State column, so a row whose first field is a queue depth is a filtered row.
  const filtered = DECIMAL_RE.test(fields[SS_STATE_COLUMN] ?? "");
  const state = filtered ? SS_ESTABLISHED : fields[SS_STATE_COLUMN];
  if (state !== SS_LISTEN && state !== SS_ESTABLISHED) {
    return null;
  }
  const shift = filtered ? SS_FILTER_SHIFT : 0;
  const pid = SS_PID_RE.exec(line);
  return socketRow(fields[SS_LOCAL_COLUMN - shift] ?? "", fields[SS_PEER_COLUMN - shift] ?? "", state === SS_LISTEN, pid === null ? null : Number(pid[1]));
}

/** `ss -tlnp` (listening) or `ss -tnp state established`: one row per socket, the owner pid from `pid=`. */
export function parseSsSockets(output: string): readonly SocketRow[] {
  return output
    .split(/\r?\n/u)
    .map(ssRow)
    .filter((row): row is SocketRow => row !== null);
}

/** `lsof -nP -iTCP -sTCP:LISTEN -Fpn` or `-sTCP:ESTABLISHED -Fpn`: a process set opens with `p<pid>` and
 *  each of its sockets is an `n<local>` or `n<local>-><peer>` line; every other field letter is skipped. */
export function parseLsofSockets(output: string, listening: boolean): readonly SocketRow[] {
  const rows: SocketRow[] = [];
  let pid: number | null = null;
  for (const line of output.split(/\r?\n/u)) {
    const field = line[0];
    const value = line.slice(1).trim();
    if (field === "p") {
      pid = DECIMAL_RE.test(value) ? Number(value) : null;
    } else if (field === "n" && pid !== null) {
      const [local = "", peer = ""] = value.split("->");
      const row = socketRow(local, peer, listening, pid);
      if (row !== null) {
        rows.push(row);
      }
    }
  }
  return rows;
}

function netstatRow(line: string): SocketRow | null {
  const fields = line.trim().split(WHITESPACE_RE);
  const state = fields[NETSTAT_STATE_COLUMN];
  if (fields[NETSTAT_PROTO_COLUMN] !== "TCP" || (state !== NETSTAT_LISTENING && state !== NETSTAT_ESTABLISHED)) {
    return null;
  }
  const pidText = fields[NETSTAT_PID_COLUMN] ?? "";
  const pid = DECIMAL_RE.test(pidText) && pidText !== NETSTAT_NO_PID ? Number(pidText) : null;
  return socketRow(fields[NETSTAT_LOCAL_COLUMN] ?? "", fields[NETSTAT_PEER_COLUMN] ?? "", state === NETSTAT_LISTENING, pid);
}

/** `netstat -ano`: `TCP <local> <peer> <STATE> <pid>`; UDP rows carry no state and are dropped. */
export function parseNetstatSockets(output: string): readonly SocketRow[] {
  return output
    .split(/\r?\n/u)
    .map(netstatRow)
    .filter((row): row is SocketRow => row !== null);
}

/** The tail of `/proc/<pid>/stat` after the parenthesised command, which may itself hold spaces and
 *  parentheses, so the split anchors on the LAST `)`. Null for text that is not a stat line. */
function procStatField(text: string, field: number): number | null {
  const close = text.lastIndexOf(")");
  if (close === -1) {
    return null;
  }
  const tail = text
    .slice(close + 1)
    .trim()
    .split(WHITESPACE_RE);
  const value = Number(tail[field - PROC_STAT_STATE_FIELD]);
  return Number.isInteger(value) ? value : null;
}

export function parseProcStatGroup(text: string): number | null {
  const pgid = procStatField(text, PROC_STAT_PGID_FIELD);
  return pgid !== null && pgid > 0 ? pgid : null;
}

export function parseProcStatCpuMs(text: string): number | null {
  const utime = procStatField(text, PROC_STAT_UTIME_FIELD);
  const stime = procStatField(text, PROC_STAT_STIME_FIELD);
  return utime === null || stime === null ? null : Math.round(((utime + stime) * MS_PER_SECOND) / LINUX_CLK_TCK);
}

/** `PPid:\t<n>` from `/proc/<pid>/status`. */
export function parseProcStatusParent(text: string): number | null {
  const match = PPID_RE.exec(text);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/** `hh:mm:ss` or `mm:ss` to seconds; null for anything else. */
function clockSeconds(clock: string): number | null {
  const parts = clock.split(":").map(Number);
  if (parts.some(Number.isNaN) || (parts.length !== CLOCK_PARTS_WITH_HOURS && parts.length !== CLOCK_PARTS_WITHOUT_HOURS)) {
    return null;
  }
  const [hours = 0, minutes = 0, seconds = 0] = parts.length === CLOCK_PARTS_WITH_HOURS ? parts : [0, ...parts];
  return hours * MINUTES_PER_HOUR * SECONDS_PER_MINUTE + minutes * SECONDS_PER_MINUTE + seconds;
}

/** BSD `ps` elapsed (`etime`) or CPU (`time`) text, `[[dd-]hh:]mm:ss[.cs]`, to whole seconds. */
export function parsePsClock(text: string): number | null {
  const trimmed = text.trim();
  const dash = trimmed.indexOf("-");
  const days = dash === -1 ? 0 : Number(trimmed.slice(0, dash));
  const clock = clockSeconds(dash === -1 ? trimmed : trimmed.slice(dash + 1));
  if (Number.isNaN(days) || clock === null) {
    return null;
  }
  return Math.floor(days * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE + clock);
}

function psRow(line: string): ProcessEntry | null {
  const fields = line.trim().split(WHITESPACE_RE);
  const pidText = fields[PS_PID_COLUMN] ?? "";
  const ppidText = fields[PS_PPID_COLUMN] ?? "";
  if (!(DECIMAL_RE.test(pidText) && DECIMAL_RE.test(ppidText)) || fields.length <= PS_COMMAND_COLUMN) {
    return null;
  }
  const cmdline = fields.slice(PS_COMMAND_COLUMN).join(" ");
  const cpuSeconds = parsePsClock(fields[PS_TIME_COLUMN] ?? "");
  // With `-E` the environment follows the command on the same line, so both channels share one blob.
  return { pid: Number(pidText), ppid: Number(ppidText), cmdline, environ: cmdline, cpuMs: cpuSeconds === null ? null : cpuSeconds * MS_PER_SECOND };
}

/** `ps -axo pid=,ppid=,time=,command=`: three numeric columns lead, the command runs to the end. */
export function parsePsProcesses(output: string): readonly ProcessEntry[] {
  return output
    .split(/\r?\n/u)
    .map(psRow)
    .filter((row): row is ProcessEntry => row !== null);
}

function cimRow(item: unknown): ProcessEntry | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const row = item as Record<string, unknown>;
  const pid = row["ProcessId"];
  if (typeof pid !== "number") {
    return null;
  }
  const kernel = typeof row["KernelModeTime"] === "number" ? row["KernelModeTime"] : 0;
  const user = typeof row["UserModeTime"] === "number" ? row["UserModeTime"] : 0;
  return {
    pid,
    ppid: typeof row["ParentProcessId"] === "number" ? row["ParentProcessId"] : null,
    cmdline: typeof row["CommandLine"] === "string" ? row["CommandLine"] : "",
    environ: null,
    cpuMs: Math.round((kernel + user) / CIM_TICKS_PER_MS),
  };
}

/** The compact JSON `platform.ts` asks PowerShell for: one object per process, or one bare object when
 *  PowerShell had a single result (`ConvertTo-Json` unwraps a one-element pipeline). */
export function parseCimProcesses(json: string): readonly ProcessEntry[] {
  const text = json.trim();
  if (text === "") {
    return [];
  }
  const parsed: unknown = JSON.parse(text);
  return (Array.isArray(parsed) ? parsed : [parsed]).map(cimRow).filter((row): row is ProcessEntry => row !== null);
}

/** The ordinary Linux `/proc` NUL-separated argv or environ blob as one space-joined string. */
export function nulJoined(blob: string): string {
  return blob
    .split("\0")
    .filter((part) => part !== "")
    .join(" ");
}
