// The one reader of a process's `/proc/<pid>/stat` start time. Start ticks count from boot and never move
// with the wall clock, so equal ticks for one pid prove it is the same process.
import { readFileSync } from "node:fs";

const WHITESPACE_RE = /\s+/u;
// After "pid (comm)" the remaining fields start at field 3, so starttime (field 22) is index 19 of the rest.
const PROC_STARTTIME_INDEX = 19;

/** /proc/<pid>/stat field 22 (starttime). The comm field can contain spaces AND parens, so the split is
 *  anchored on the LAST `)`. */
export function parseProcStartTicks(statLine: string): string | null {
  const close = statLine.lastIndexOf(")");
  if (close === -1) {
    return null;
  }
  const fields = statLine
    .slice(close + 1)
    .trim()
    .split(WHITESPACE_RE);
  return fields[PROC_STARTTIME_INDEX] ?? null;
}

/** The start ticks of the process now behind `pid`, or `null` when `/proc` has no entry for it: the pid is
 *  gone, `hidepid` hides it, or the host has no `/proc`. Any other read failure throws. */
export function procStartTicks(pid: number): string | null {
  try {
    return parseProcStartTicks(readFileSync(`/proc/${String(pid)}/stat`, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
