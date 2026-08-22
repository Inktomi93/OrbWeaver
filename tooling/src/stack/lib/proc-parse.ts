// The two /proc + `ss` readers. Pure string parsing, so the parse bugs they close are unit-testable
// without a live socket or a live process.
const SS_PID_RE = /pid=(\d+)/u;
const WHITESPACE_RE = /\s+/u;
// ss -ltn columns: State Recv-Q Send-Q Local-Address:Port Peer-Address:Port [Process]
const SS_LOCAL_ADDRESS_COLUMN = 3;
// After "pid (comm)" the remaining /proc/<pid>/stat fields start at field 3, so starttime (field 22)
// sits at index 19 of the post-comm remainder.
const PROC_STARTTIME_INDEX = 19;

/** Pull the listening pid for `port` out of `ss -ltnp` output. Matches on the LOCAL address column ending
 *  in `:<port>` so `:8788` never matches a peer address or `:87880`. */
export function parseListenerPid(ssOutput: string, port: number): number | null {
  for (const line of ssOutput.split("\n")) {
    const columns = line.trim().split(WHITESPACE_RE);
    const local = columns[SS_LOCAL_ADDRESS_COLUMN];
    if (local === undefined || !local.endsWith(`:${port}`)) {
      continue;
    }
    const match = SS_PID_RE.exec(line);
    if (match?.[1] !== undefined) {
      return Number(match[1]);
    }
    return null; // listening, but the owner is another user's process (no pid= without privileges)
  }
  return null;
}

/** /proc/<pid>/stat field 22 (starttime). The comm field can contain spaces AND parens, so the split is
 *  anchored on the LAST `)` — the classic /proc parse bug this avoids by construction. */
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
