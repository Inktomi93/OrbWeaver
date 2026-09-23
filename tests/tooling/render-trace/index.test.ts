// renderTrace is the pure trace→string waterfall printer shared by trace-tail.ts / probe-fire.ts —
// ported from neo-tavern's tests/scripts/probes/trace-render.test.ts (this file's home is
// tests/tooling/ per docs/law/Spine-Testing.md §2: a test of a scripts/ tool, not a packages/<pkg>/src
// mirror). vitest's test process is never a TTY, so trace-render's ANSI helpers are identity —
// asserting the plain strings below over `output` ALSO proves the non-TTY identity path (no `\x1b[`
// escape ever lands in the string; a real terminal would only add codes around the same substrings).
import process from "node:process";
import type { RequestTrace, SerializedSpan } from "../../../tooling/src/render-trace/index.ts";
import { fireEvidenceGap, renderTrace } from "../../../tooling/src/render-trace/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const ANSI_ESCAPE = "\x1b[";

function span(over: Partial<SerializedSpan> = {}): SerializedSpan {
  return {
    spanId: "s1",
    parentSpanId: undefined,
    name: "trpc.chat.send",
    startedAt: 1000,
    durationMs: 31,
    status: "ok",
    attributes: { "trpc.type": "mutation" },
    events: [],
    requestId: "req-123",
    ...over,
  };
}

function trace(over: Partial<RequestTrace> = {}): RequestTrace {
  return {
    requestId: "req-123",
    startedAt: 1000,
    durationMs: 32,
    rootName: "http GET /api/trpc/chat.send",
    status: "ok",
    spans: [
      span(),
      span({
        spanId: "s2",
        parentSpanId: "s1",
        name: "db.execute",
        startedAt: 1005,
        durationMs: 1,
        attributes: { "db.sql": "SELECT 1", "db.rows": 1 },
      }),
    ],
    totals: { spanCount: 2, dbSpanCount: 1, dbDurationMs: 1, providerDurationMs: 0 },
    ...over,
  };
}

test("header carries root name, ok badge, duration, requestId, and totals", () => {
  const out = renderTrace(trace());
  expect(out).toContain("http GET /api/trpc/chat.send");
  expect(out).toContain("● ok");
  expect(out).toContain("32ms");
  expect(out).toContain("req req-123");
  expect(out).toContain("2 spans · 1db (1ms) · provider 0ms");
});

test("renders each span depth-first (root before its child)", () => {
  const out = renderTrace(trace());
  expect(out).toContain("trpc.chat.send");
  expect(out).toContain("db.execute");
  expect(out.indexOf("trpc.chat.send")).toBeLessThan(out.indexOf("db.execute"));
});

test("depth-first order holds for a deeper tree (grandchild after its parent, not just its root)", () => {
  const deep = trace({
    spans: [
      span({ spanId: "root", name: "http POST /api/trpc/chat.send" }),
      span({ spanId: "mid", parentSpanId: "root", name: "trpc.chat.send", startedAt: 1001 }),
      span({
        spanId: "leaf",
        parentSpanId: "mid",
        name: "db.execute",
        startedAt: 1002,
        durationMs: 1,
        attributes: {},
      }),
    ],
    totals: { spanCount: 3, dbSpanCount: 1, dbDurationMs: 1, providerDurationMs: 0 },
  });
  const out = renderTrace(deep);
  const rootAt = out.indexOf("http POST /api/trpc/chat.send");
  const midAt = out.indexOf("trpc.chat.send");
  const leafAt = out.indexOf("db.execute");
  expect(rootAt).toBeLessThan(midAt);
  expect(midAt).toBeLessThan(leafAt);
});

test("inline attributes use the short key (db.sql → sql=, db.rows → rows=)", () => {
  const out = renderTrace(trace());
  expect(out).toContain("sql=SELECT 1");
  expect(out).toContain("rows=1");
});

test("an error trace shows the error badge", () => {
  expect(renderTrace(trace({ status: "error" }))).toContain("✗ error");
});

test("a slow db span (≥ SLOW_DB_MS) is flagged with ⚠", () => {
  const slow = trace({
    durationMs: 200,
    spans: [
      span({
        name: "db.execute",
        durationMs: 150, // ≥ default SLOW_DB_MS (100)
        attributes: { "db.sql": "SELECT * FROM big" },
      }),
    ],
    totals: { spanCount: 1, dbSpanCount: 1, dbDurationMs: 150, providerDurationMs: 0 },
  });
  expect(renderTrace(slow)).toContain("⚠");
});

test("a fast db span (< SLOW_DB_MS) carries no ⚠ flag", () => {
  const fast = trace({
    spans: [span({ name: "db.execute", durationMs: 5, attributes: { "db.sql": "SELECT 1" } })],
    totals: { spanCount: 1, dbSpanCount: 1, dbDurationMs: 5, providerDurationMs: 0 },
  });
  expect(renderTrace(fast)).not.toContain("⚠");
});

test("non-TTY output carries no ANSI escape codes (identity path)", () => {
  const out = renderTrace(trace({ status: "error" }));
  expect(process.stdout.isTTY).not.toBe(true);
  expect(out).not.toContain(ANSI_ESCAPE);
});

// ── ZERO HYGIENE (#409): the fire op's evidence verdict, pure ────────────────────────────────────────
// The cli-tier arms of this contract live in cli.int.test.ts; `fire` boots a whole server, so its
// decision is pinned at the pure seam instead.

test("a fire run whose requests carried NO request id is an evidence gap, not a clean skip", () => {
  // The recorded ruling this changes ("still exit 0 — a missing capability is a skip") survives; its
  // input changed: the middleware IS wired, so this arm is a live-regression tripwire.
  const gap = fireEvidenceGap({ fired: 2, missingRid: 2, rendered: 0, detailFailed: 0 });
  expect(gap?.evidence).toBe("the observability middleware");
});

test("requests that carried ids but produced NO trace are an evidence gap of their own", () => {
  expect(fireEvidenceGap({ fired: 2, missingRid: 0, rendered: 0, detailFailed: 2 })?.evidence).toBe("the trace ring");
});

test("a run that rendered at least one trace has its evidence, and a run that fired nothing is not judged", () => {
  expect(fireEvidenceGap({ fired: 2, missingRid: 1, rendered: 1, detailFailed: 0 })).toBeNull();
  expect(fireEvidenceGap({ fired: 0, missingRid: 0, rendered: 0, detailFailed: 0 })).toBeNull();
});

test("a PARTIAL recording is a gap, not a clean run (#1507 red-first)", () => {
  // The defect: the op asked only "did ANY trace render?", so 1 of 3 rendered printed `traces=1` and
  // exited clean while two recordings were missing — visible only in a stderr line nobody parses.
  const gap = fireEvidenceGap({ fired: 3, missingRid: 0, rendered: 1, detailFailed: 2 });
  expect(gap?.evidence).toBe("the trace ring");
  // The numbers a reader needs to act: how many are missing, out of how many were traceable.
  expect(gap?.detail).toContain("2 of 3");
  expect(gap?.detail).toContain("rendered 1");
});

test("a COMPLETE recording stays clean — every traced request rendered (#1507 positive control)", () => {
  expect(fireEvidenceGap({ fired: 3, missingRid: 0, rendered: 3, detailFailed: 0 })).toBeNull();
  // A request that never got an id is a DIFFERENT population: it was never traceable, so it cannot be a
  // missing trace. Two fired, one traceable, that one rendered ⇒ nothing is missing.
  expect(fireEvidenceGap({ fired: 2, missingRid: 1, rendered: 1, detailFailed: 0 })).toBeNull();
});
