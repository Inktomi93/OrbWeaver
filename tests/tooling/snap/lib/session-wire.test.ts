// Fixture tests for the session WIRE readers (tooling/src/snap/lib/session-wire.ts): a request line, a
// registry row, an event line and the RESULT pairs — each round-trips, and each answers null to anything
// off-grammar (a torn line, another protocol version, a missing ownership fact) so nothing half-read is
// ever mistaken for a verdict. The partition/verdict half is tests/tooling/snap/lib/session-plan.test.ts.
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../../../../tooling/src/snap/contract/session.ts";
import { readSessionEvent, readSessionRequest, readSessionRow, resultPairsOf } from "../../../../tooling/src/snap/lib/session-wire.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const LANE = "/home/dev/orbweaver/.claude/worktrees/agent-lane";
const HOME = "/home/dev/orbweaver/.cache/snap-session";
const MINUTE = 60_000;

function row(over: Partial<SessionRow> = {}): SessionRow {
  return {
    v: SESSION_PROTOCOL_VERSION,
    name: "p-home-perf",
    ownerCheckout: LANE,
    daemonPid: 4242,
    pgid: 4242,
    socket: `${HOME}/p-home-perf.sock`,
    cdpEndpoint: "http://127.0.0.1:40001",
    slotDir: `${LANE}/reports/runs/snap-session/agent-lane-4242-2026-09-02T18-00-00-000Z`,
    binding: { kind: "base", url: "http://localhost:5173" },
    environment: { viewport: { width: 1280, height: 800 }, device: null, colorScheme: null, reducedMotion: false, deviceScaleFactor: null },
    bootArgv: ["--base", "http://localhost:5173", "/"],
    createdAt: "2026-09-02T18:00:00.000Z",
    lastUsedAt: "2026-09-02T18:20:00.000Z",
    inflightOp: null,
    lastOp: "--eval 1",
    ttlMs: 30 * MINUTE,
    headless: true,
    calls: 3,
    ...over,
  };
}

test("a request line round-trips, and anything off-grammar is null — never a half-read request", () => {
  const request = { v: 1, kind: "call", runId: "r", slotDir: "/s", argv: ["--eval", "1"], cwd: "/c", checkout: LANE, boot: true, force: false };
  expect(readSessionRequest(JSON.stringify(request))).toEqual(request);
  expect(readSessionRequest(JSON.stringify({ ...request, v: 2 }))).toBeNull();
  expect(readSessionRequest(JSON.stringify({ ...request, kind: "drive" }))).toBeNull();
  expect(readSessionRequest(JSON.stringify({ ...request, argv: "not-a-list" }))).toBeNull();
  expect(readSessionRequest("{not json")).toBeNull();
  expect(readSessionRequest("[]")).toBeNull();
  // The two booleans default to false when absent — a caller that never sends them is not a booter.
  const { boot: _boot, force: _force, ...bare } = request;
  expect(readSessionRequest(JSON.stringify(bare))).toEqual({ ...request, boot: false, force: false });
});

test("a row is trusted only when its ownership facts parse", () => {
  expect(readSessionRow(JSON.stringify(row()))).toEqual(row());
  expect(readSessionRow(JSON.stringify({ ...row(), ownerCheckout: 7 }))).toBeNull();
  expect(readSessionRow(JSON.stringify({ ...row(), v: 0 }))).toBeNull();
  expect(readSessionRow("")).toBeNull();
});

test("the client reads exactly the four event kinds and drops malformed members instead of misreading them", () => {
  expect(readSessionEvent(JSON.stringify({ kind: "line", text: "RESULT snap x=1" }))).toEqual({ kind: "line", text: "RESULT snap x=1" });
  expect(readSessionEvent(JSON.stringify({ kind: "warn", text: "w" }))).toEqual({ kind: "warn", text: "w" });
  expect(readSessionEvent(JSON.stringify({ kind: "done", exit: 2, pairs: [["a", "1"], ["broken"], ["b", "2"]] }))).toEqual({
    kind: "done",
    exit: 2,
    pairs: [
      ["a", "1"],
      ["b", "2"],
    ],
  });
  const status = { kind: "status", row: row(), pages: [{ index: 0, url: "about:blank", title: "" }, { index: "x" }], busy: null, idleMs: 5 };
  expect(readSessionEvent(JSON.stringify(status))).toEqual({ ...status, pages: [{ index: 0, url: "about:blank", title: "" }] });
  expect(readSessionEvent(JSON.stringify({ kind: "status", row: {}, pages: [], busy: null, idleMs: 5 }))).toBeNull();
  expect(readSessionEvent(JSON.stringify({ kind: "done", exit: "two", pairs: [] }))).toBeNull();
  expect(readSessionEvent(JSON.stringify({ kind: "ping" }))).toBeNull();
  expect(readSessionEvent("nope")).toBeNull();
});

test("resultPairsOf reads the LAST RESULT line and splits each pair on its first '='", () => {
  expect(resultPairsOf(["URL x", "RESULT snap-scenario name=a", "", "RESULT snap out=/tmp/a=b.png pages=1 nav=OK"])).toEqual([
    ["out", "/tmp/a=b.png"],
    ["pages", "1"],
    ["nav", "OK"],
  ]);
  expect(resultPairsOf(["no result here"])).toEqual([]);
});
