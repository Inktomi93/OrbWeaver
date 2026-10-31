// Each readiness row's door, sent through the production `workloads.start` verb: the rows it enqueues, their chain,
// and the queue rows the rail then reads as that pass running.

import { expect, test } from "@orb/testkit/node";
import type { CorpusReadinessStageId } from "#client/features/discovery/lib/corpus-analysis-state.ts";
import { CORPUS_READINESS_STAGE_IDS } from "#client/features/discovery/lib/corpus-analysis-state.ts";
import { enqueueReadinessPass, isReadinessRun } from "#client/features/discovery/lib/corpus-readiness-passes.ts";

/** What each row's door must start: the workload kind, its mode, and, for the portraits, the image source. */
const EXPECTED_RUNS: Record<CorpusReadinessStageId, readonly { readonly kind: string; readonly mode: string; readonly params: object }[]> = {
  families: [{ kind: "index", mode: "singular", params: { source: "image" } }],
  distilled: [{ kind: "distill-characters", mode: "singular", params: {} }],
  storyThemes: [
    { kind: "memory-backfill", mode: "singular", params: {} },
    { kind: "compute-themes", mode: "singular", params: {} },
  ],
  keywords: [{ kind: "compute-cooccurrence", mode: "bulk", params: {} }],
  duplicates: [{ kind: "find-duplicates", mode: "singular", params: {} }],
};

test("each row's door enqueues its own pass, chained in order, and the rail reads those rows as that pass running", async ({ harness, ownerCaller }) => {
  // The story-themes chain starts with a memory backfill, which the chat domain admits only while memory is on.
  await ownerCaller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  for (const stage of CORPUS_READINESS_STAGE_IDS) {
    const started: string[] = [];
    await enqueueReadinessPass(stage, async (run) => {
      const ref = await ownerCaller.workloads.start(run);
      started.push(ref.id);
      return ref;
    });
    const listed = await ownerCaller.workloads.list({});
    const rows = started.map((id) => listed.find((row) => row.id === id)).filter((row) => row !== undefined);
    expect(rows).toHaveLength(started.length);
    expect(rows.map(({ kind, mode, params }) => ({ kind, mode, params }))).toEqual(EXPECTED_RUNS[stage]);
    expect(rows.map((row) => row.dependsOn ?? [])).toEqual(started.map((_id, index) => (index === 0 ? [] : [started[index - 1]])));
    expect(rows.map((row) => row.ownerId)).toEqual(rows.map((row) => (row.mode === "bulk" ? null : harness.ownerId)));
    expect(rows.every((row) => isReadinessRun(stage, row))).toBe(true);
    // Every other row's pass leaves these rows alone, so one live pass never marks a sibling row running.
    for (const other of CORPUS_READINESS_STAGE_IDS.filter((candidate) => candidate !== stage)) {
      expect(rows.some((row) => isReadinessRun(other, row))).toBe(false);
    }
  }
});

test("a text index is not the portraits pass, so the families row does not read it as running", async ({ ownerCaller }) => {
  const ref = await ownerCaller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" });
  const row = (await ownerCaller.workloads.list({})).find((candidate) => candidate.id === ref.id);
  expect(row?.kind).toBe("index");
  expect(row !== undefined && isReadinessRun("families", row)).toBe(false);
});

test("the keywords door is the box owner's: a member's enqueue is refused at the transport", async ({ otherCaller }) => {
  await expect(enqueueReadinessPass("keywords", (run) => otherCaller.workloads.start(run))).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await otherCaller.workloads.list({})).filter((row) => row.kind === "compute-cooccurrence")).toEqual([]);
});
