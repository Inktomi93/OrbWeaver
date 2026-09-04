// The PURE half of snap's request-log arm (#1199): URL filtering and explicit bounded-ring receipts.
import type { RequestLogEntry, RequestLogReceipt } from "../../../../tooling/src/snap/index.ts";
import { filterRequests, matchesRequestFilter, requestLogLines } from "../../../../tooling/src/snap/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function entry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    index: 0,
    method: "GET",
    url: "http://127.0.0.1:5173/api/trpc/chat.list",
    resourceType: "fetch",
    status: 200,
    failed: null,
    sizes: { requestBodySize: 0, requestHeadersSize: 120, responseBodySize: 1234, responseHeadersSize: 80 },
    durationMs: 12,
    ...overrides,
  };
}

function receipt(overrides: Partial<RequestLogReceipt> = {}): RequestLogReceipt {
  return {
    total: 3,
    filter: null,
    shown: [entry()],
    body: null,
    window: { start: 0, end: 3, retainedStart: 0, evicted: 0 },
    ring: {
      capacity: 4096,
      seen: 3,
      retained: 3,
      evicted: 0,
      bodyCapBytes: 262_144,
      bodyBudgetBytes: 33_554_432,
      bodyRetainedBytes: 0,
      bodiesCaptured: 0,
      bodiesNotRetained: {
        "ineligible-content-type": 0,
        "over-entry-cap": 0,
        "over-aggregate-budget": 0,
        "evicted-before-read": 0,
        "read-error": 0,
      },
    },
    jsonPath: "reports/runs/snap/x/requests/root.json",
    ...overrides,
  };
}

test("the filter is a case-insensitive URL substring, and null shows everything", () => {
  const rows = [entry(), entry({ index: 1, url: "http://127.0.0.1:5173/assets/app.css", resourceType: "stylesheet" })];

  expect(filterRequests(rows, null)).toHaveLength(2);
  expect(filterRequests(rows, "TRPC").map((row) => row.index)).toEqual([0]);
  expect(filterRequests(rows, "nothing-here")).toEqual([]);
  expect(matchesRequestFilter("http://x/API/Trpc", "trpc")).toBe(true);
});

test("the block states BOTH counts — how many rows are shown and how many the run recorded", () => {
  const block = requestLogLines(receipt({ filter: "trpc" })).join("\n");

  expect(block).toContain('--- REQUESTS (1 of 3, filter "trpc") ---');
  expect(block).toContain("GET");
  expect(block).toContain("size=1234");
  expect(block).toContain("ms=12");
});

test("an unavailable sizes() read and an unfinished request read as UNKNOWN, never as zero", () => {
  const block = requestLogLines(receipt({ shown: [entry({ sizes: null, durationMs: null })] })).join("\n");

  expect(block).toContain("size=unknown");
  expect(block).toContain("ms=unfinished");
});

test("a filter that matched no body says so — an empty answer about the page, not a silent omission", () => {
  const block = requestLogLines(receipt({ body: { kind: "no-match", filter: "zzz" } })).join("\n");

  expect(block).toContain("no request in this run matched");
});

test("a body rejected by a retention fence names the exact reason and both limits", () => {
  const block = requestLogLines(
    receipt({
      body: {
        kind: "not-retained",
        url: "http://x/big.json",
        reason: "over-entry-cap",
        contentType: "application/json",
        bytes: 300_000,
        bodyCapBytes: 262_144,
        bodyBudgetBytes: 33_554_432,
        bodyRetainedBytes: 1024,
      },
    }),
  ).join("\n");

  expect(block).toContain("BODY NOT RETAINED reason=over-entry-cap");
  expect(block).toContain("entry-cap=262144 aggregate=1024/33554432");
});

test("ring wrap is visible beside the observed denominator", () => {
  const block = requestLogLines(
    receipt({
      total: 4100,
      window: { start: 0, end: 4100, retainedStart: 4, evicted: 4 },
      ring: { ...receipt().ring, seen: 4100, retained: 4096, evicted: 4 },
    }),
  ).join("\n");

  expect(block).toContain("[0,4100) retained-start=4 evicted=4");
  expect(block).toContain("retained=4096/4096 seen=4100 evicted=4");
});
