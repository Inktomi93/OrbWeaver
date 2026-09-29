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
import { appendHistory, batteryCadenceLines, lastRanAt, previousAtTier, readHistory, slowdownLines, slowdowns } from "../../../../tooling/src/verify/index.ts";
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
    wallMs: null,
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

// ── #1983 PART 2: THE INSTRUMENT BATTERY'S CADENCE, AS A READING ─────────────────────────────────────
//
// FOUR `tests/tooling/**` SUITES SAT RED ON MAIN FOR DAYS in one five-day window, and not one of them was
// a bad test — every one fired loud the moment its premise moved. The break was the OBSERVATION CHANNEL:
// `tests/tooling/**` is `--full`-only (#1842, owner's word, unchanged) and nothing runs `--full` on a
// cadence, so the red was unobservable rather than unobserved.
//
// Part 2 was RULED (claude-b, 2026-09-12): the battery runs ONCE PER MERGE TRAIN at the quiescent barrier.
// That ruling lived only in the orchestrator playbook's owed-at-barrier list, and a law that lives only in
// prose is a wish — nothing on the machine could say how long it had actually been. These arms pin the
// reading that answers it, INCLUDING its two honest limits, because an overstated cadence line would be
// the same false clean one layer up.

/** A whole-tree report carrying `stages`, in the shape `batteryCadenceLines` reads. */
function report(stages: readonly { readonly name: string; readonly mode: string }[], scope = "whole"): Parameters<typeof batteryCadenceLines>[1] {
  return {
    tier: "static",
    scope,
    ok: true,
    exitCode: 0,
    failed: 0,
    noVerdict: [],
    stages: stages.map((s) => ({
      name: s.name,
      group: "tests",
      mode: s.mode as "full",
      ok: true,
      exitCode: 0,
      durationMs: 1,
      logFile: null,
      failureExcerpt: null,
      runsAt: null,
      notices: [],
    })),
  };
}

const BATTERY = { name: "tests:tooling", mode: "full" } as const;

test("#1983 — a run that DID carry the battery says so, and claims nothing else", () => {
  const lines = batteryCadenceLines([], report([BATTERY])).join("\n");
  expect(lines).toContain("RAN in this run");
  expect(lines, "the covered arm must not also nag about a cadence it just satisfied").not.toContain("did NOT run here");
});

test("#1983 — a whole-tree run WITHOUT the battery names when it last ran, in runs and by sha", () => {
  // Three retained runs; the battery ran in the middle one. The advisory must locate THAT one, not the
  // most recent line, which is what a naive "last entry" read would report.
  const history = [
    entry({ runId: "a", sha: "aaa1111", stages: [{ name: "lint:biome", mode: "full", durationMs: 1 }] }),
    entry({ runId: "b", sha: "bbb2222", at: "2026-09-11T00:00:00.000Z", tier: "full", stages: [{ name: "tests:tooling", mode: "full", durationMs: 9 }] }),
    entry({ runId: "c", sha: "ccc3333", stages: [{ name: "lint:biome", mode: "full", durationMs: 1 }] }),
  ];
  expect(lastRanAt(history, "tests:tooling")?.sha).toBe("bbb2222");

  const lines = batteryCadenceLines(history, report([{ name: "lint:biome", mode: "full" }])).join("\n");
  expect(lines).toContain("tests:tooling did NOT run here (it is --full-only, #1842)");
  expect(lines).toContain("last RAN at bbb2222");
  expect(lines, "distance is in RUNS — the store has no clock and a wall-clock claim would be invented").toContain("1 verify run(s) ago");
  expect(lines, "and the ruling it is measuring against is named, not implied").toContain("ONCE PER MERGE TRAIN");
  expect(lines).toContain("Cadence enforcement remains the quiescent-barrier procedure");
  expect(lines).toContain("cannot identify a merge train or prove a prior pass");
  // LIMIT 1, IN THE RENDERED TEXT: history records a stage's MODE and DURATION, never its exit. The line
  // may not be read as "the battery was green", and saying so is part of the advisory rather than a
  // comment only this file can see.
  expect(lines).toContain("never that it passed");
});

test("#1983 — a DEFERRED or SKIPPED battery row is not a run of it, in either reader", () => {
  // The arm that makes the whole reading honest. A deferred row records 0ms and is present in `stages`, so
  // a reader keying on NAME ALONE would report every scoped run as having covered the battery — the exact
  // false clean #1983 is about, rebuilt inside its own fix.
  const deferredOnly = [entry({ runId: "d", sha: "ddd4444", stages: [{ name: "tests:tooling", mode: "deferred", durationMs: 0 }] })];
  expect(lastRanAt(deferredOnly, "tests:tooling")).toBeUndefined();
  expect(batteryCadenceLines(deferredOnly, report([{ name: "tests:tooling", mode: "deferred" }])).join("\n")).toContain(
    "NOT WITHIN THE RETAINED HISTORY WINDOW",
  );
});

test("#1983 — an EMPTY history says so honestly, and a SCOPED run says nothing at all", () => {
  // LIMIT 2: the store is a bounded, gitignored, per-checkout file. "Never ran" is a claim it cannot make,
  // so the absent answer is phrased as the window it actually searched.
  expect(batteryCadenceLines([], report([{ name: "lint:biome", mode: "full" }])).join("\n")).toContain("NOT WITHIN THE RETAINED HISTORY WINDOW");
  // NEGATIVE CONTROL — a scoped run defers half the tier by design, so a cadence claim there would be
  // about the wrong question. Without this arm every `verify --changed` would carry the nag.
  expect(batteryCadenceLines([], report([{ name: "lint:biome", mode: "scoped" }], "packages/db"))).toStrictEqual([]);
});
