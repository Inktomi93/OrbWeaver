// The session substrate's WIRE readers (docs/design/1208-instrument-substrate.md §3.4) — ONE grammar for
// the daemon and the client: a request line off the socket, a registry row off disk, an event line back,
// and the RESULT pairs a call's captured lines carry. Every reader validates field by field and answers
// null to anything off-grammar — a daemon on another protocol version, a truncated row, a torn line —
// so nothing half-read is ever mistaken for a verdict. Split from ./session-plan.ts (the partition,
// verdicts and refusal texts) at the tooling size cap; pinned by tests/tooling/snap/lib/session-wire.test.ts.
import type { SessionEvent, SessionPageInfo, SessionRequest, SessionRow } from "../contract/session.ts";
import { SESSION_PROTOCOL_VERSION, SESSION_REQUEST_KINDS } from "../contract/session.ts";

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  // @orb-gate-ignore caught-failure-ownership(default:catch): a malformed line IS the negative answer both readers return — the daemon refuses the request as a protocol error and the client treats the row as unreadable; `null` is that answer at every call site. Ends if a caller starts needing WHY the bytes did not parse.
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function readSessionRequest(line: string): SessionRequest | null {
  const record = parseJsonObject(line);
  if (record === null || record["v"] !== SESSION_PROTOCOL_VERSION) {
    return null;
  }
  const kind = record["kind"];
  if (typeof kind !== "string" || !(SESSION_REQUEST_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  const { runId, slotDir, argv, cwd, checkout } = record;
  if (typeof runId !== "string" || typeof slotDir !== "string" || !isStringArray(argv) || typeof cwd !== "string" || typeof checkout !== "string") {
    return null;
  }
  return {
    v: SESSION_PROTOCOL_VERSION,
    kind: kind as SessionRequest["kind"],
    runId,
    slotDir,
    argv,
    cwd,
    checkout,
    boot: record["boot"] === true,
    force: record["force"] === true,
  };
}

/** A row is trusted only when its ownership facts parse — a row that cannot name its owner or its daemon
 *  cannot be reasoned about across checkouts and reads as absent (the stage marker's posture). */
function sessionRowFrom(value: unknown): SessionRow | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record["v"] !== SESSION_PROTOCOL_VERSION) {
    return null;
  }
  if (
    typeof record["name"] !== "string" ||
    typeof record["ownerCheckout"] !== "string" ||
    typeof record["daemonPid"] !== "number" ||
    typeof record["slotDir"] !== "string"
  ) {
    return null;
  }
  return record as unknown as SessionRow;
}

export function readSessionRow(text: string): SessionRow | null {
  return sessionRowFrom(parseJsonObject(text));
}

function isPair(value: unknown): value is readonly [string, string] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string";
}

function isPageInfo(value: unknown): value is SessionPageInfo {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record["index"] === "number" && typeof record["url"] === "string" && typeof record["title"] === "string";
}

/** The client's reader for one daemon event line — the grammar `SessionEvent` declares, validated field by
 *  field so a daemon on another protocol version cannot be misread as a verdict. */
export function readSessionEvent(line: string): SessionEvent | null {
  const record = parseJsonObject(line);
  if (record === null) {
    return null;
  }
  const kind = record["kind"];
  if ((kind === "line" || kind === "warn") && typeof record["text"] === "string") {
    return { kind, text: record["text"] };
  }
  if (kind === "done" && typeof record["exit"] === "number" && Array.isArray(record["pairs"])) {
    return { kind, exit: record["exit"], pairs: record["pairs"].filter(isPair) };
  }
  if (kind === "status") {
    const row = sessionRowFrom(record["row"]);
    const busy = record["busy"];
    if (row === null || !Array.isArray(record["pages"]) || typeof record["idleMs"] !== "number" || !(busy === null || typeof busy === "string")) {
      return null;
    }
    return { kind, row, pages: record["pages"].filter(isPageInfo), busy, idleMs: record["idleMs"] };
  }
  return null;
}

/** The `RESULT <tool> k=v …` pairs of a captured line set — the LAST RESULT line wins (a call prints one).
 *  Split on the first `=` per pair, exactly as `grep ^RESULT` readers do. */
export function resultPairsOf(lines: readonly string[]): readonly (readonly [string, string])[] {
  const result = lines.findLast((line) => line.startsWith("RESULT "));
  if (result === undefined) {
    return [];
  }
  return result
    .split(" ")
    .slice(2)
    .flatMap((token): (readonly [string, string])[] => {
      const eq = token.indexOf("=");
      return eq === -1 ? [] : [[token.slice(0, eq), token.slice(eq + 1)]];
    });
}
