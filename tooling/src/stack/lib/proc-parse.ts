// The `ss` listener reader. Pure string parsing, so the parse bug it closes is unit-testable without a
// live socket. The `/proc` start-ticks reader lives in `_shared/proc-stat.ts`.
const SS_PID_RE = /pid=(\d+)/u;
const WHITESPACE_RE = /\s+/u;
// ss -ltn columns: State Recv-Q Send-Q Local-Address:Port Peer-Address:Port [Process]
const SS_LOCAL_ADDRESS_COLUMN = 3;

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
