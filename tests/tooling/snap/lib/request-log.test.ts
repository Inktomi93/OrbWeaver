// The PURE half of snap's request-log arm (#1199): the URL-substring filter, the body cap's truncation
// ACCOUNTING, and the printed block. The browser-backed proof that the recorder sees a real page's
// requests is the sibling tests/tooling/snap/ops/request-log.int.test.ts.
import type { RequestLogEntry, RequestLogReceipt } from "../../../../tooling/src/snap/index.ts";
import { capBody, filterRequests, matchesRequestFilter, REQUEST_BODY_CAP_BYTES, requestLogLines } from "../../../../tooling/src/snap/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function entry(overrides: Partial<RequestLogEntry> = {}): RequestLogEntry {
  return {
    index: 0,
    method: "GET",
    url: "http://127.0.0.1:5173/api/trpc/chat.list",
    resourceType: "fetch",
    status: 200,
    failed: null,
    sizeBytes: 1234,
    durationMs: 12,
    ...overrides,
  };
}

function receipt(overrides: Partial<RequestLogReceipt> = {}): RequestLogReceipt {
  return { total: 3, filter: null, shown: [entry()], body: null, jsonPath: "reports/runs/snap/x/requests/root.json", ...overrides };
}

test("the filter is a case-insensitive URL substring, and null shows everything", () => {
  const rows = [entry(), entry({ index: 1, url: "http://127.0.0.1:5173/assets/app.css", resourceType: "stylesheet" })];

  expect(filterRequests(rows, null)).toHaveLength(2);
  expect(filterRequests(rows, "TRPC").map((row) => row.index)).toEqual([0]);
  expect(filterRequests(rows, "nothing-here")).toEqual([]);
  expect(matchesRequestFilter("http://x/API/Trpc", "trpc")).toBe(true);
});

test("a body under the cap is complete; over it the cut is ACCOUNTED, never a bare ellipsis", () => {
  expect(capBody("hello")).toEqual({ text: "hello", bytes: 5, truncatedAt: null });

  const big = capBody("x".repeat(REQUEST_BODY_CAP_BYTES + 500));

  expect(big.bytes).toBe(REQUEST_BODY_CAP_BYTES + 500);
  expect(big.truncatedAt).toBe(REQUEST_BODY_CAP_BYTES);
  expect(big.text).toHaveLength(REQUEST_BODY_CAP_BYTES);
});

test("the block states BOTH counts — how many rows are shown and how many the run recorded", () => {
  const block = requestLogLines(receipt({ filter: "trpc" })).join("\n");

  expect(block).toContain('--- REQUESTS (1 of 3, filter "trpc") ---');
  expect(block).toContain("GET");
  expect(block).toContain("size=1234");
  expect(block).toContain("ms=12");
});

test("an undeclared size and an unfinished request read as UNKNOWN, never as zero", () => {
  const block = requestLogLines(receipt({ shown: [entry({ sizeBytes: null, durationMs: null })] })).join("\n");

  expect(block).toContain("size=unknown");
  expect(block).toContain("ms=unfinished");
});

test("a filter that matched no body says so — an empty answer about the page, not a silent omission", () => {
  const block = requestLogLines(receipt({ body: { kind: "no-match", filter: "zzz" } })).join("\n");

  expect(block).toContain("no request in this run matched");
});

test("a truncated body names the byte it was cut at", () => {
  const block = requestLogLines(
    receipt({ body: { kind: "captured", url: "http://x/big.css", bytes: 20_000, truncatedAt: REQUEST_BODY_CAP_BYTES, text: "body" } }),
  ).join("\n");

  expect(block).toContain(`truncatedAt=${REQUEST_BODY_CAP_BYTES}`);
});
