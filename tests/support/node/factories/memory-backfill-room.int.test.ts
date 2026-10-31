// @subject tests/support/node/factories/memory-backfill-room.ts
import { expect, test } from "../fixtures.ts";
import { createMemoryBackfillRoom, MEMORY_BACKFILL_BLOCK_SIZE, memoryBackfillLines } from "./memory-backfill-room.ts";

const TRANSCRIPT_TURNS = 8;

test("the room's provider answers each tier-0 summarize call of the real memory sweep, one per block", async () => {
  await using room = await createMemoryBackfillRoom({ transcript: TRANSCRIPT_TURNS });
  expect(room.summaries()).toBe(0);
  expect(memoryBackfillLines(TRANSCRIPT_TURNS, "Earlier")).toHaveLength(TRANSCRIPT_TURNS);

  const run = room.h.root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the composed root has no admitted-workload driver");
  }
  const job = await room.h.caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" });
  await run(job.id, AbortSignal.timeout(60_000));

  expect((await room.h.caller.workloads.get({ id: job.id })).status).toBe("succeeded");
  expect(room.summaries()).toBe(TRANSCRIPT_TURNS / MEMORY_BACKFILL_BLOCK_SIZE);
});
