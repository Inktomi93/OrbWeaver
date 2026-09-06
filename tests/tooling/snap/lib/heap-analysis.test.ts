// @instrument-proof: the outgoing-edge limit receipt reports its own POLICY cap, so a reader can tell a
//   3-edge object from a 30-edge object TRUNCATED to 3. It used to pass the observed count as the cap
//   (#1509), which made the receipt agree with itself no matter what it kept — a limit receipt that can
//   never disagree with the data is not evidence about the limit.
// @instrument-absence-proof: an UNtruncated read still reports the same policy cap and `complete: true`
//   with no events, so "complete" is a claim about the cap rather than a restatement of the row count.
//
// The parser is stubbed on purpose: the truncation itself happens inside `heap-devtools.ts` (it slices at
// HEAP_OUTGOING_EDGE_CAP), and what this file owns is whether the RECEIPT describes that policy honestly.

import type { HeapSnapshotIdentity, HeapSnapshotReceipt } from "../../../../tooling/src/snap/contract/heap.ts";
import { HEAP_OUTGOING_EDGE_CAP } from "../../../../tooling/src/snap/contract/heap.ts";
import { buildHeapRetainerReceipt } from "../../../../tooling/src/snap/lib/heap-analysis.ts";
import type { HeapDevToolsParser, HeapParsedRetainers } from "../../../../tooling/src/snap/lib/heap-devtools.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// FABRICATION-OK: minimal snapshot identity double; heapLimit reads only label/cap — the retainer-cap arithmetic is under test, not the identity shape
const IDENTITY = {
  label: "before",
  rawPath: "/tmp/before.heapsnapshot",
  summaryPath: "/tmp/before.json",
  sha256: "0".repeat(64),
  bytes: 1024,
  capturedAt: "2026-09-06T00:00:00.000Z",
  captureSessionId: "capture-1",
  browser: { product: "Chrome/1", protocolVersion: "1.3", revision: "r1", userAgent: "ua", jsVersion: "v8" },
  target: { targetId: "t1", browserContextId: null, url: "http://127.0.0.1:5173/", title: "orb", contextIndex: 0, pageIndex: 0 },
  parser: { package: "chrome-devtools-mcp", version: "1.8.0", engine: "HeapSnapshotManager" },
} as unknown as HeapSnapshotIdentity;

// FABRICATION-OK: minimal snapshot receipt double for the same reason as IDENTITY above
const SNAPSHOT = { v: 1, kind: "snapshot", identity: IDENTITY } as unknown as HeapSnapshotReceipt;

function edge(index: number): HeapParsedRetainers["outgoing"][number] {
  return {
    name: `prop${String(index)}`,
    type: "property",
    node: { nodeId: 100 + index, name: "Object", type: "object", distance: 4, selfSize: 16, retainedSize: 32, detached: false },
  };
}

function parserReturning(outgoing: number, outgoingTotal: number): HeapDevToolsParser {
  const parsed: HeapParsedRetainers = {
    candidates: 1,
    selected: { nodeId: 1, name: "Detached HTMLDivElement", type: "object", distance: 3, selfSize: 64, retainedSize: 512, detached: false },
    paths: [],
    dominators: [],
    outgoing: Array.from({ length: outgoing }, (_, index) => edge(index)),
    outgoingTotal,
    pathLimits: { depth: false, nodes: false, siblings: false },
  };
  // FABRICATION-OK: minimal HeapDevToolsParser double; the analysis reads exactly retainers() — the parsed-retainer shape is the real one
  return { retainers: async (): Promise<HeapParsedRetainers> => await Promise.resolve(parsed) } as unknown as HeapDevToolsParser;
}

function outgoingLimit(limits: Awaited<ReturnType<typeof buildHeapRetainerReceipt>>["limits"]): (typeof limits)[number] {
  const row = limits.find((limit) => limit.source === "heap-retainer-outgoing");
  if (row === undefined) {
    throw new Error("the retainer receipt no longer carries a heap-retainer-outgoing limit row");
  }
  return row;
}

test("a TRUNCATED outgoing read reports the policy cap, not the number of rows it kept", async () => {
  // 84 edges existed; the parser's own slice kept HEAP_OUTGOING_EDGE_CAP of them.
  const receipt = await buildHeapRetainerReceipt(parserReturning(HEAP_OUTGOING_EDGE_CAP, 84), SNAPSHOT, { kind: "detached" });
  const limit = outgoingLimit(receipt.limits);

  expect(limit.policy).toEqual({ cap: HEAP_OUTGOING_EDGE_CAP });
  expect(limit.complete).toBe(false);
  expect(limit.events).toEqual([{ kind: "rows", path: "heap-retainer-outgoing", original: 84, retained: HEAP_OUTGOING_EDGE_CAP, omitted: 54 }]);
  expect(receipt.outgoing).toMatchObject({ total: 84, shown: HEAP_OUTGOING_EDGE_CAP, omitted: 54 });
});

test("a SHORT outgoing read reports the same policy cap and states it is complete", async () => {
  const receipt = await buildHeapRetainerReceipt(parserReturning(3, 3), SNAPSHOT, { kind: "detached" });
  const limit = outgoingLimit(receipt.limits);

  // The whole point: 3 rows kept out of 3 is NOT a cap of 3. Before the fix both this row and the
  // truncated one above reported `cap` equal to whatever they had kept.
  expect(limit.policy).toEqual({ cap: HEAP_OUTGOING_EDGE_CAP });
  expect(limit.complete).toBe(true);
  expect(limit.events).toEqual([]);
});
