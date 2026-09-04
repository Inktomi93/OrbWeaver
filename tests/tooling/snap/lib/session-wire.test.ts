// Fixture tests for the session WIRE readers (tooling/src/snap/lib/session-wire.ts): a request line, a
// registry row, an event line and the RESULT pairs — each round-trips, and each answers null to anything
// off-grammar (a torn line, another protocol version, a missing ownership fact) so nothing half-read is
// ever mistaken for a verdict. The partition/verdict half is tests/tooling/snap/lib/session-plan.test.ts.
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../../../../tooling/src/snap/contract/session.ts";
import { readSessionEvent, readSessionRequest, readSessionRow, resultPairsOf } from "../../../../tooling/src/snap/lib/session-wire.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { sessionEnvironmentOf } from "../../../../tooling/src/snap/ops/session-daemon.ts";
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
    environment: {
      viewport: { width: 1280, height: 800 },
      device: null,
      colorScheme: null,
      reducedMotion: false,
      contrast: "more",
      reducedTransparency: true,
      deviceScaleFactor: null,
    },
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
  const request = {
    v: 1,
    kind: "call",
    runId: "r",
    slotDir: "/s",
    argv: ["--eval", "1"],
    cwd: "/c",
    checkout: LANE,
    boot: true,
    force: false,
    exportOut: null,
  };
  expect(readSessionRequest(JSON.stringify(request))).toEqual(request);
  expect(readSessionRequest(JSON.stringify({ ...request, v: 2 }))).toBeNull();
  expect(readSessionRequest(JSON.stringify({ ...request, kind: "drive" }))).toBeNull();
  expect(readSessionRequest(JSON.stringify({ ...request, argv: "not-a-list" }))).toBeNull();
  expect(readSessionRequest(JSON.stringify({ ...request, kind: "export", exportOut: "custom/session" }))).toEqual({
    ...request,
    kind: "export",
    exportOut: "custom/session",
  });
  expect(readSessionRequest("{not json")).toBeNull();
  expect(readSessionRequest("[]")).toBeNull();
  // The two booleans default to false when absent — a caller that never sends them is not a booter.
  const { boot: _boot, force: _force, exportOut: _exportOut, ...bare } = request;
  expect(readSessionRequest(JSON.stringify(bare))).toEqual({ ...request, boot: false, force: false });
  for (const malformed of [
    { ...request, boot: "yes" },
    { ...request, force: 1 },
    { ...request, exportOut: false },
  ]) {
    expect(readSessionRequest(JSON.stringify(malformed))).toBeNull();
  }
});

test("a row is trusted only when its ownership facts parse", () => {
  expect(readSessionRow(JSON.stringify(row()))).toEqual(row());
  const { contrast: _contrast, ...missingContrast } = row().environment;
  const { reducedTransparency: _transparency, ...missingTransparency } = row().environment;
  expect(readSessionRow(JSON.stringify({ ...row(), environment: missingContrast }))).toBeNull();
  expect(readSessionRow(JSON.stringify({ ...row(), environment: missingTransparency }))).toBeNull();
  expect(readSessionRow(JSON.stringify({ ...row(), environment: { ...row().environment, contrast: "less" } }))).toBeNull();
  expect(readSessionRow(JSON.stringify({ ...row(), environment: { ...row().environment, reducedTransparency: "yes" } }))).toBeNull();
  expect(readSessionRow(JSON.stringify({ ...row(), ownerCheckout: 7 }))).toBeNull();
  expect(readSessionRow(JSON.stringify({ ...row(), v: 0 }))).toBeNull();
  expect(readSessionRow("")).toBeNull();
});

// THE SIBLING-ATTACH HALF OF THIS CASE IS GONE, not weakened (#1315). `sessionProbeAttachOptions` existed
// so a SECOND instrument's process could attach to the daemon's browser and declare the same environment;
// every sibling is now a snap ARM running inside the daemon's own call, so there is no second CDP client
// left to keep in step. What still has to hold — and what the false clean would be — is that the ROW the
// daemon publishes carries the two media arms verbatim, which is the half asserted here.
test("the daemon row preserves contrast and reduced transparency exactly", () => {
  const args = parseSnapArgs([]);
  args.browserContrast = "more";
  args.reducedTransparency = true;
  args.probe = true;
  const environment = sessionEnvironmentOf(args);
  expect(environment).toMatchObject({
    contrast: "more",
    reducedTransparency: true,
    reducedMotion: true,
  });
  expect(readSessionRow(JSON.stringify(row({ environment })))?.environment).toEqual(environment);
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
  const sessionProvenance = {
    name: "p-home-perf",
    call: 4,
    evidenceWindow: 4,
    binding: row().binding,
    stage: {
      state: "bound",
      ownerCheckout: LANE,
      band: 2,
      ref: "stage/session-p-home-perf-b2",
      binding: row().binding,
      failure: null,
    },
  };
  expect(readSessionEvent(JSON.stringify({ kind: "done", exit: 0, pairs: [], sessionProvenance }))).toEqual({
    kind: "done",
    exit: 0,
    pairs: [],
    sessionProvenance,
  });
  for (const malformed of [
    { ...sessionProvenance, call: -1 },
    { ...sessionProvenance, evidenceWindow: 1.5 },
    { ...sessionProvenance, binding: { kind: "foreign", url: "http://localhost:5173" } },
    { ...sessionProvenance, binding: { kind: "base", url: 7 } },
    { ...sessionProvenance, stage: { ...sessionProvenance.stage, state: "guessed" } },
    { ...sessionProvenance, stage: { ...sessionProvenance.stage, ownerCheckout: 7 } },
    { ...sessionProvenance, stage: { ...sessionProvenance.stage, band: -1 } },
    { ...sessionProvenance, stage: { ...sessionProvenance.stage, binding: { kind: "base", url: 7 } } },
  ]) {
    expect(readSessionEvent(JSON.stringify({ kind: "done", exit: 0, pairs: [], sessionProvenance: malformed }))).toBeNull();
  }
  expect(readSessionEvent(JSON.stringify({ kind: "ping" }))).toBeNull();
  expect(readSessionEvent("nope")).toBeNull();
});

test("resultPairsOf reads the LAST RESULT line and splits each pair on its first '='", () => {
  expect(resultPairsOf(["URL x", "RESULT snap-scenario name=a", "", "RESULT snap out=/tmp/a=b.png pages=1 nav=OK"])).toEqual([
    ["out", "/tmp/a=b.png"],
    ["pages", "1"],
    ["nav", "OK"],
  ]);
  expect(resultPairsOf(["RESULT snap out=/tmp/a.png pages=1", "RESULT snap exit=0 index=/tmp/run.json"])).toEqual([
    ["out", "/tmp/a.png"],
    ["pages", "1"],
  ]);
  expect(resultPairsOf(["no result here"])).toEqual([]);
});
