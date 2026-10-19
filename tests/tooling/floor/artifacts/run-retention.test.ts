// The prune ledger reader (tooling/src/floor/artifacts/run-retention.ts). The ledger exists so a cited run
// that was deleted answers "pruned, and when" instead of reading as a run that never existed, so a reader
// that returns an empty history for a damaged ledger defeats its own purpose.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readPrunedRuns } from "@orb/tooling/floor/artifacts/run-retention";
import { installOutputSink } from "@orb/tooling/floor/cli/log";

const LEDGER = ".pruned.jsonl";

function ledgerRow(runId: string): string {
  return JSON.stringify({ runId, prunedAt: "2026-10-01T00:00:00.000Z", ranAt: "2026-09-01T00:00:00.000Z" });
}

test("a torn final ledger row costs only itself, never the intact rows before it", ({ scratch }) => {
  writeFileSync(join(scratch, LEDGER), `${ledgerRow("main-1-a")}\n${ledgerRow("main-2-b")}\n{"runId":"main-3-c","pruned`);
  const warnings: string[] = [];
  const release = installOutputSink({ line: () => undefined, warn: (line) => warnings.push(line) });
  try {
    expect(readPrunedRuns(scratch).map((row) => row.runId)).toEqual(["main-1-a", "main-2-b"]);
  } finally {
    release();
  }
  // The skipped row is reported once, so a short history is never silent about why it is short.
  expect(warnings).toHaveLength(1);
});

test("no ledger means nothing was pruned here", ({ scratch }) => {
  expect(readPrunedRuns(scratch)).toEqual([]);
});

test("an unreadable ledger is a failure, not an empty history", ({ scratch }) => {
  // A directory at the ledger path: present, but not readable as a file.
  mkdirSync(join(scratch, LEDGER));
  expect(() => readPrunedRuns(scratch)).toThrow();
});
