// TIMING RETENTION (#411) — the store keeps a real second data point, and the comparison only ever speaks
// about stages that are actually comparable.
//
// THE TWO HALVES ARE TESTED DIFFERENTLY ON PURPOSE. The COMPARISON (`slowdowns`) is pure, so it is pinned
// in-process against constructed entries — including every case where an advisory would be a LIE (a
// deferred stage's 0ms, a stage the previous run never ran, sub-second jitter). The STORE is fsBacked, so
// it is pinned against a real planted root, including the two failure modes a ledger must survive: a torn
// line from a killed run, and a file that has reached its retention window.
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RunHistoryEntry } from "../../../../tooling/src/verify/index.ts";
import { appendHistory, previousAtTier, readHistory, slowdownLines, slowdowns } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function entry(over: Partial<RunHistoryEntry> = {}): RunHistoryEntry {
  return {
    runId: "1-2026-08-22T00:00:00.000Z",
    at: "2026-08-22T00:00:00.000Z",
    tier: "static",
    scope: "whole",
    sha: "abc1234",
    exitCode: 0,
    totalMs: 0,
    stages: [],
    ...over,
  };
}

const HISTORY = join("reports", "verify-history.jsonl");

// ── the COMPARISON (pure) ───────────────────────────────────────────────────────────────────────────

test("slowdowns: a stage that doubled over a real baseline is reported with both numbers", () => {
  const before = entry({ runId: "a", stages: [{ name: "structure:full", mode: "full", durationMs: 40_000 }] });
  const now = entry({ runId: "b", stages: [{ name: "structure:full", mode: "full", durationMs: 95_000 }] });
  expect(slowdowns(before, now)).toEqual([{ stage: "structure:full", wasMs: 40_000, nowMs: 95_000, ratio: 95_000 / 40_000 }]);
});

test("slowdowns: exactly 2x is NOT an advisory — the threshold is strictly greater, so a boundary run stays quiet", () => {
  const before = entry({ runId: "a", stages: [{ name: "lint:biome", mode: "full", durationMs: 10_000 }] });
  const now = entry({ runId: "b", stages: [{ name: "lint:biome", mode: "full", durationMs: 20_000 }] });
  expect(slowdowns(before, now)).toEqual([]);
});

test("slowdowns: sub-second jitter is NEVER an advisory (3ms → 30ms is 10x and is noise)", () => {
  const before = entry({ runId: "a", stages: [{ name: "structure:agent-config", mode: "full", durationMs: 3 }] });
  const now = entry({ runId: "b", stages: [{ name: "structure:agent-config", mode: "full", durationMs: 30 }] });
  expect(slowdowns(before, now)).toEqual([]);
});

test("slowdowns: a DEFERRED stage is never compared — its 0ms would make every later run read as ∞x slower", () => {
  const before = entry({ runId: "a", stages: [{ name: "types:native", mode: "deferred", durationMs: 0 }] });
  const now = entry({ runId: "b", stages: [{ name: "types:native", mode: "full", durationMs: 5000 }] });
  expect(slowdowns(before, now)).toEqual([]);
});

test("slowdowns: a stage the previous run did not carry at all is not a regression (a new stage is not slower)", () => {
  const before = entry({ runId: "a", stages: [] });
  const now = entry({ runId: "b", stages: [{ name: "deps:knip", mode: "full", durationMs: 9000 }] });
  expect(slowdowns(before, now)).toEqual([]);
});

test("slowdowns: with NO previous run there is nothing to say (the first run on a fresh worktree)", () => {
  expect(slowdowns(undefined, entry({ stages: [{ name: "x", mode: "full", durationMs: 90_000 }] }))).toEqual([]);
});

test("slowdownLines: the advisory names BOTH runs and states plainly that it is not a verdict", () => {
  const before = entry({ runId: "a", sha: "dead123", stages: [{ name: "structure:full", mode: "full", durationMs: 40_000 }] });
  const now = entry({ runId: "b", stages: [{ name: "structure:full", mode: "full", durationMs: 95_000 }] });
  const lines = slowdownLines(before, slowdowns(before, now)).join("\n");
  expect(lines).toContain("dead123");
  expect(lines).toContain("advisory only, not a verdict");
  expect(lines).toContain("structure:full: 40000ms → 95000ms (2.4×)");
});

// ── TIER isolation ──────────────────────────────────────────────────────────────────────────────────

test("previousAtTier: a push run is never the baseline for a static run (the stage sets differ wholesale)", () => {
  const history = [entry({ runId: "s1", tier: "static" }), entry({ runId: "p1", tier: "push" })];
  expect(previousAtTier(history, "static", "now")?.runId).toBe("s1");
  expect(previousAtTier(history, "full", "now")).toBeUndefined();
});

test("previousAtTier: the run being recorded is never its own baseline", () => {
  expect(previousAtTier([entry({ runId: "me" })], "static", "me")).toBeUndefined();
});

// ── the STORE (fsBacked) ────────────────────────────────────────────────────────────────────────────

test("appendHistory: writes one JSONL line per run under the gitignored reports root", async ({ plantedTree }) => {
  const root = await plantedTree({ "keep.txt": "x" });
  appendHistory(root, entry({ runId: "a" }));
  appendHistory(root, entry({ runId: "b" }));
  const lines = readFileSync(join(root, HISTORY), "utf8").trim().split("\n");
  expect(lines).toHaveLength(2);
  expect(readHistory(root).map((e) => e.runId)).toEqual(["a", "b"]);
});

test("readHistory: a TORN line (the append a killed run never finished) is skipped, not thrown on", async ({ plantedTree }) => {
  const root = await plantedTree({ "keep.txt": "x" });
  await mkdir(join(root, "reports"), { recursive: true });
  writeFileSync(join(root, HISTORY), `${JSON.stringify(entry({ runId: "a" }))}\n{"runId":"torn`);
  expect(readHistory(root).map((e) => e.runId)).toEqual(["a"]);
});

test("appendHistory: the file is BOUNDED — the retention window drops the oldest entries, never the newest", async ({ plantedTree }) => {
  const root = await plantedTree({ "keep.txt": "x" });
  for (let i = 0; i < 205; i += 1) {
    appendHistory(root, entry({ runId: `r${i}` }));
  }
  const kept = readHistory(root);
  expect(kept).toHaveLength(200);
  expect(kept.at(0)?.runId).toBe("r5");
  expect(kept.at(-1)?.runId).toBe("r204");
});

test("appendHistory: an unwritable reports root WARNS and returns — a timing ledger may never fail a run", async ({ plantedTree }) => {
  const root = await plantedTree({ "keep.txt": "x" });
  // `reports` as a FILE makes both mkdir and the append fail; the store must swallow it.
  writeFileSync(join(root, "reports"), "not a directory");
  expect(() => appendHistory(root, entry())).not.toThrow();
  expect(readHistory(root)).toEqual([]);
});
