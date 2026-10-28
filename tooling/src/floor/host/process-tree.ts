// Process-tree selection consumes only OS identity metadata; proc owns the injected execution and signal edges.
// Captured Windows identities survive parent exit. An unreadable or ambiguous lineage never proves completion.
import type { ProcessGroup, ProcessGroupDeps, RunNicedSyncResult } from "../process/proc-contract.ts";
import type { ProcessCompletionOwner } from "./platform-parse.ts";

/** Identity-only Windows observation protocol; process command lines and environments are excluded. */
export interface ProcessTreeRow {
  readonly pid: number;
  readonly ppid: number;
  readonly identity: string | null;
}

const DECIMAL = /^\d+$/u;
const POWERSHELL = "powershell.exe";
const IDENTITY_QUERY =
  "$ErrorActionPreference = 'Stop'; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object { @{ pid = $_.ProcessId; ppid = $_.ParentProcessId; identity = $(if ($null -eq $_.CreationDate) { $null } else { $_.CreationDate.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) }) } })";

function pidValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function processRows(result: RunNicedSyncResult): readonly ProcessTreeRow[] {
  if (result.status !== 0 || result.errorCode !== undefined) {
    throw new Error("process-tree observation failed");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (cause) {
    throw new Error("process-tree observation was not JSON", { cause });
  }
  if (!Array.isArray(parsed)) {
    throw new Error("process-tree observation was not an array");
  }
  const rows: ProcessTreeRow[] = [];
  const seen = new Set<number>();
  for (const value of parsed) {
    if (typeof value !== "object" || value === null) {
      throw new Error("process-tree observation contained an invalid row");
    }
    const { pid, ppid, identity } = value as Partial<ProcessTreeRow>;
    if (!(pidValue(pid) && pidValue(ppid)) || (identity !== null && (typeof identity !== "string" || !DECIMAL.test(identity))) || seen.has(pid)) {
      throw new Error("process-tree observation contained invalid identity metadata");
    }
    seen.add(pid);
    rows.push({ pid, ppid, identity });
  }
  return rows;
}

function errorIs(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function captureDescendant(
  entry: ProcessTreeRow,
  parent: ProcessCompletionOwner,
  byPid: ReadonlyMap<number, ProcessTreeRow>,
  captured: Map<number, ProcessCompletionOwner>,
): void {
  if (entry.ppid !== parent.pid || captured.has(entry.pid)) {
    return;
  }
  if (entry.identity === null) {
    throw new Error(`process-tree descendant identity unavailable for pid ${String(entry.pid)}`);
  }
  if (BigInt(entry.identity) < BigInt(parent.identity)) {
    return;
  }
  if (byPid.get(parent.pid)?.identity !== parent.identity) {
    throw new Error(`process-tree lineage ambiguous after parent ${String(parent.pid)} exited`);
  }
  captured.set(entry.pid, { pid: entry.pid, identity: entry.identity });
}

function captureDescendants(captured: Map<number, ProcessCompletionOwner>, rows: readonly ProcessTreeRow[], byPid: ReadonlyMap<number, ProcessTreeRow>): void {
  // The map iterator visits newly captured children too, independent of the process table's row order.
  for (const parent of captured.values()) {
    for (const entry of rows) {
      captureDescendant(entry, parent, byPid, captured);
    }
  }
}

function windowsGroup(pid: number, run: NonNullable<ProcessGroupDeps["run"]>): ProcessGroup | null {
  const read = (): readonly ProcessTreeRow[] => processRows(run(POWERSHELL, ["-NoProfile", "-NonInteractive", "-Command", IDENTITY_QUERY]));
  const initial = read();
  const root = initial.find((entry) => entry.pid === pid);
  if (root === undefined) {
    return null;
  }
  if (root.identity === null) {
    throw new Error(`process-tree root ${String(pid)} cannot be identified before termination`);
  }
  const captured = new Map<number, ProcessCompletionOwner>([[pid, { pid, identity: root.identity }]]);
  const select = (rows: readonly ProcessTreeRow[]): readonly ProcessCompletionOwner[] => {
    const byPid = new Map(rows.map((entry) => [entry.pid, entry]));
    for (const owner of captured.values()) {
      const present = byPid.get(owner.pid);
      if (present !== undefined && present.identity !== owner.identity) {
        throw new Error(`process-tree identity changed for pid ${String(owner.pid)}`);
      }
    }
    captureDescendants(captured, rows, byPid);
    return [...captured.values()].filter((owner) => byPid.has(owner.pid));
  };
  select(initial);
  const signal = (): void => {
    const targets = select(read());
    if (targets.length === 0) {
      return;
    }
    const result = run("taskkill", [...targets.flatMap((owner) => ["/PID", String(owner.pid)]), "/F"]);
    if ((result.status !== 0 || result.errorCode !== undefined) && select(read()).length > 0) {
      throw new Error(`taskkill failed for owned process tree ${String(pid)} (status ${String(result.status)}, error ${result.errorCode ?? "none"})`);
    }
  };
  return {
    platform: "win32",
    signal,
    signalRoot: signal,
    alive: () => select(read()).length > 0,
    rootAlive: () => select(read()).some((owner) => owner.pid === pid),
  };
}

/** Build a retained controller over an already-owned root; this function grants no process ownership. */
export function processGroup(
  pid: number,
  platform: NodeJS.Platform,
  run: NonNullable<ProcessGroupDeps["run"]>,
  signal: NonNullable<ProcessGroupDeps["signal"]>,
): ProcessGroup | null {
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    throw new Error("process-tree root must be a pid greater than one");
  }
  if (platform === "win32") {
    return windowsGroup(pid, run);
  }
  const send = (target: number, value: NodeJS.Signals): void => {
    try {
      signal(target, value);
    } catch (error) {
      if (!errorIs(error, "ESRCH")) {
        throw error;
      }
    }
  };
  const alive = (target: number): boolean => {
    try {
      signal(target, 0);
      return true;
    } catch (error) {
      if (errorIs(error, "ESRCH")) {
        return false;
      }
      if (errorIs(error, "EPERM")) {
        return true;
      }
      throw error;
    }
  };
  return { platform, signal: (value) => send(-pid, value), signalRoot: (value) => send(pid, value), alive: () => alive(-pid), rootAlive: () => alive(pid) };
}
