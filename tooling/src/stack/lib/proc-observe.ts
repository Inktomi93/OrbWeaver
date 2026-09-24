// The /proc observation half of dev-stack launch ownership: what the kernel says about a live pid.
// Every reader fails closed (unreadable, absent and malformed all answer `null`), so a process we did
// not observe can never authorize a negative-PGID signal.

import { readFileSync, readlinkSync } from "node:fs";

const PROC_STAT_TAIL_START_TICKS_INDEX = 19;
const PROC_STAT_TAIL_PGID_INDEX = 2;

/** A run of decimal digits and nothing else — the shape of every numeric field `/proc` hands back as text. */
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

/** Parse Linux /proc/<pid>/stat without splitting the parenthesized process name into fake fields. */
function parseProcIdentityStat(text: string): { readonly pgid: number; readonly startTicks: string } | null {
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
  // @orb-waive caught-failure-ownership(catch): an unreadable /proc process entry returns null, and the dev-stack identity verifier treats null as absent/refused — NEVER "owned", so an unreadable process can never authorize the negative-PGID kill; fail-closed. Ends if null ever yields an "owned" verdict.
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
