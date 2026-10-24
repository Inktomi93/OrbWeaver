// @subject packages/server/src/domain/chat/memory/recall/recorder.ts

import type { MemoryRecallSlice } from "@orb/contracts/chat";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createMemoryRecallRecorder } from "@orb/server/domain/chat";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createIdSource(createSeededIds().next);
const roomA = ids.typeId(ID_PREFIX.chat);
const roomB = ids.typeId(ID_PREFIX.chat);
const bucket = ids.typeId(ID_PREFIX.character);

function slice(surfaced: number): MemoryRecallSlice {
  return { mode: "mixA", queryText: null, queryEmbedded: false, poolSize: surfaced, candidateCount: surfaced, surfaced, ms: 1, note: null, candidates: [] };
}

test("the recorder stamps its own sequence and the injected clock, and keeps only the newest records past its depth", () => {
  let clock = 100;
  const recorder = createMemoryRecallRecorder({
    now: () => {
      clock += 10;
      return clock;
    },
    limit: 2,
  });
  for (const surfaced of [1, 2, 3]) {
    recorder.sink({ chatId: roomA, scopedCharacterId: bucket, trace: slice(surfaced) });
  }
  expect(recorder.recent().map((record) => [record.seq, record.at, record.trace.surfaced])).toEqual([
    [2, 120, 2],
    [3, 130, 3],
  ]);
});

test("a read filtered to one room never returns another room's recalls, and a limit keeps the most recent", () => {
  const recorder = createMemoryRecallRecorder({ now: () => 0 });
  recorder.sink({ chatId: roomA, scopedCharacterId: bucket, trace: slice(1) });
  recorder.sink({ chatId: roomB, scopedCharacterId: bucket, trace: slice(2) });
  recorder.sink({ chatId: roomA, scopedCharacterId: bucket, trace: slice(3) });
  expect(recorder.recent({ chatId: roomA }).map((record) => record.trace.surfaced)).toEqual([1, 3]);
  expect(recorder.recent({ chatId: roomA, limit: 1 }).map((record) => record.trace.surfaced)).toEqual([3]);
  expect(recorder.recent({ limit: 2 }).map((record) => record.trace.surfaced)).toEqual([2, 3]);
});
