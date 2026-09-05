// #1652: `InstrumentArtifactLimitReceipt` has ONE schema home (`_shared/artifact-out.ts`) — heap's
// `heapSnapshotReceiptSchema` imports it rather than re-spelling a looser copy (a bare `z.number()`/
// `z.string()` that silently accepted a negative `omitted` and an empty `kind`/`path` the declaration
// reader already refuses). This file's own job is narrow: hold the heap READER to the same floor.
import { heapSnapshotReceiptSchema } from "../../../../tooling/src/snap/contract/heap.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The smallest object that satisfies `heapSnapshotReceiptSchema` — every axis but `limits` is filler,
 *  present only so `.safeParse` reaches the field under test. */
function validSnapshotReceipt(limits: unknown): unknown {
  return {
    v: 1,
    kind: "snapshot",
    identity: {
      label: "before",
      rawPath: "/tmp/before.heapsnapshot",
      summaryPath: "/tmp/before.json",
      sha256: "a".repeat(64),
      bytes: 1,
      capturedAt: "2026-09-05T00:00:00.000Z",
      captureSessionId: "session",
      browser: { product: "Chrome", protocolVersion: "1.3", revision: "1", userAgent: "ua", jsVersion: "1" },
      target: { targetId: "target", browserContextId: null, url: "file:///x", title: "x", contextIndex: 0, pageIndex: 0 },
      parser: { package: "chrome-devtools-mcp", version: "1.8.0", engine: "HeapSnapshotManager" },
    },
    statistics: { total: 0, nativeTotal: 0, typedArrays: 0, v8Total: 0, code: 0, jsArrays: 0, strings: 0, system: 0 },
    population: { nodes: 0, objects: 0, totalSelfSize: 0, rootNodeIndex: 0, maxJsObjectId: 0 },
    nativeContexts: { total: 0, shown: 0, omitted: 0, sharedSize: 0, unattributedSize: 0, rows: [] },
    retainedByContext: { contextCount: 0, retainedSize: 0, retainedCount: 0, notRetainedSize: 0, notRetainedCount: 0, totalSize: 0 },
    topClasses: { total: 0, shown: 0, omitted: 0, rows: [] },
    detached: { count: 0, shown: 0, omitted: 0, totalSelfSize: 0, totalRetainedSize: 0, rows: [] },
    parserProblems: { total: 0, shown: 0, omitted: 0, rows: [] },
    problems: [],
    limits,
  };
}

test("heapSnapshotReceiptSchema refuses a negative omitted and an empty kind/path (parity with the declaration reader)", () => {
  const negativeOmitted = validSnapshotReceipt([
    { source: "heap", complete: false, policy: null, events: [{ kind: "top-class-cap", path: "$.topClasses", original: 40, retained: 30, omitted: -10 }] },
  ]);
  expect(heapSnapshotReceiptSchema.safeParse(negativeOmitted).success).toBe(false);

  const emptyKind = validSnapshotReceipt([
    { source: "heap", complete: false, policy: null, events: [{ kind: "", path: "$.topClasses", original: 40, retained: 30, omitted: 10 }] },
  ]);
  expect(heapSnapshotReceiptSchema.safeParse(emptyKind).success).toBe(false);

  const emptyPath = validSnapshotReceipt([
    { source: "heap", complete: false, policy: null, events: [{ kind: "top-class-cap", path: "", original: 40, retained: 30, omitted: 10 }] },
  ]);
  expect(heapSnapshotReceiptSchema.safeParse(emptyPath).success).toBe(false);
});

test("heapSnapshotReceiptSchema accepts a real fractional quantity (a duration-shaped limit, #1643 parity)", () => {
  const fractional = validSnapshotReceipt([
    {
      source: "heap",
      complete: false,
      policy: { topClasses: 30 },
      events: [{ kind: "top-class-cap", path: "$.topClasses", original: 40.5, retained: 30, omitted: 10.5 }],
    },
  ]);
  expect(heapSnapshotReceiptSchema.safeParse(fractional).success).toBe(true);
});
