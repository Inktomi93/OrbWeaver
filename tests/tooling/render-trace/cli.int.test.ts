// @instrument-proof: a planted error trace (status "error", one error span, one 250ms db span over the
// slow floor) rendered through the real cli must print the ✗ badge and the slow-db ⚠; the clean twin
// prints ● ok with neither — the waterfall cannot swallow a red or slow span. The fixture is typed
// `satisfies RequestTrace` against the REAL server shape, so wire drift fails tsc here, not silently.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RequestTrace } from "../../../tooling/src/render-trace/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

function trace(status: "ok" | "error", dbMs: number): RequestTrace {
  return {
    requestId: "req-proof",
    rootName: "http GET /api/proof",
    status,
    startedAt: 0,
    durationMs: 300,
    totals: { spanCount: 2, dbSpanCount: 1, dbDurationMs: dbMs, providerDurationMs: 0 },
    spans: [
      {
        spanId: "s1",
        parentSpanId: undefined,
        requestId: "req-proof",
        events: [],
        name: "http GET /api/proof",
        status,
        startedAt: 0,
        durationMs: 300,
        attributes: { "http.path": "/api/proof" },
      },
      {
        spanId: "s2",
        parentSpanId: "s1",
        requestId: "req-proof",
        events: [],
        name: "db.execute",
        status: "ok",
        startedAt: 10,
        durationMs: dbMs,
        attributes: { "db.sql": "SELECT 1" },
      },
    ],
  } satisfies RequestTrace;
}

test("a planted error trace REDs the waterfall through the real cli", async ({ runCli, scratch }) => {
  const file = join(scratch, "bad-trace.json");
  await writeFile(file, JSON.stringify(trace("error", 250)));
  const res = await runCli("render-trace", ["render", file]);
  expect(res.stdout).toContain("✗ error");
  expect(res.stdout).toContain("⚠");
  await expect(res).toExitWith(0);
});

test("the clean twin renders ● ok with no red badge and no slow flag", async ({ runCli, scratch }) => {
  const file = join(scratch, "ok-trace.json");
  await writeFile(file, JSON.stringify(trace("ok", 1)));
  const res = await runCli("render-trace", ["render", file]);
  expect(res.stdout).toContain("● ok");
  expect(res.stdout).not.toContain("✗");
  expect(res.stdout).not.toContain("⚠");
  await expect(res).toExitWith(0);
});

test("a non-trace input is CLI misuse, never a silent empty render", async ({ runCli, scratch }) => {
  const file = join(scratch, "not-a-trace.json");
  await writeFile(file, JSON.stringify({ hello: "world" }));
  const res = await runCli("render-trace", ["render", file]);
  await expect(res).toExitWith(3);
});

test("an unknown subcommand is CLI misuse", async ({ runCli }) => {
  const res = await runCli("render-trace", ["waterfall"]);
  await expect(res).toExitWith(3);
});

// ── ZERO HYGIENE (#409): a trace with nothing in it is absent evidence, not a clean waterfall ──

// @instrument-absence-proof: a trace whose SPAN population is empty must report INSTRUMENT ERROR — while a
// genuinely EMPTY traces LIST (the twin below) stays clean, because an empty ring is a real answer.
test("a trace whose SPAN population is empty is an INSTRUMENT ERROR, never a clean header", async ({ runCli, scratch }) => {
  // A recorded trace always carries its root span; an empty list means the tracer captured nothing —
  // rendering the header alone read exactly like a successful waterfall.
  const file = join(scratch, "spanless.json");
  await writeFile(file, JSON.stringify({ ...trace("ok", 1), spans: [], totals: { spanCount: 0, dbSpanCount: 0, dbDurationMs: 0, providerDurationMs: 0 } }));
  const res = await runCli("render-trace", ["render", file]);
  expect(res.stdout + res.stderr).toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(2);
});

test("an EMPTY traces list says so out loud and stays clean — an empty ring is a real answer", async ({ runCli, scratch }) => {
  // The nuance arm: the debug endpoint answering `{traces:[]}` is a healthy endpoint with nothing to
  // show, so it is NOT a tool error — but printing absolutely nothing read as a successful render.
  const file = join(scratch, "no-traces.json");
  await writeFile(file, JSON.stringify({ traces: [] }));
  const res = await runCli("render-trace", ["render", file]);
  expect(res.stdout).toContain("0 traces");
  await expect(res).toExitWith(0);
});
