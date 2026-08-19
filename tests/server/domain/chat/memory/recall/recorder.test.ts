// The recall flight recorder's ring (#250) — bounded retention, chat filtering, and the stamped seq/time the
// emitter never supplies (determinism: the clock is injected).

import type { MemoryRecallSlice } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createMemoryRecallRecorder } from "../../../../../../packages/server/src/domain/chat/memory/recall/recorder.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const scoped = castId<CharacterId>("character_group");

function slice(surfaced: number): MemoryRecallSlice {
  return { mode: "mixA", queryText: null, queryEmbedded: false, poolSize: surfaced, candidateCount: surfaced, surfaced, ms: 1, note: null, candidates: [] };
}

describe("memory/recall/recorder", () => {
  test("stamps a monotonic seq + the injected clock, oldest-first", () => {
    let clock = 100;
    const rec = createMemoryRecallRecorder({
      now: () => {
        clock += 10;
        return clock;
      },
    });
    rec.sink({ chatId: castId<ChatId>("chat_a"), scopedCharacterId: scoped, trace: slice(1) });
    rec.sink({ chatId: castId<ChatId>("chat_a"), scopedCharacterId: scoped, trace: slice(2) });
    expect(rec.recent().map((r) => [r.seq, r.at, r.trace.surfaced])).toEqual([
      [1, 110, 1],
      [2, 120, 2],
    ]);
  });

  test("drops the OLDEST past the ring depth (per-turn ephemera, no table)", () => {
    const rec = createMemoryRecallRecorder({ now: () => 0, limit: 2 });
    for (const surfaced of [1, 2, 3]) {
      rec.sink({ chatId: castId<ChatId>("chat_a"), scopedCharacterId: scoped, trace: slice(surfaced) });
    }
    expect(rec.recent().map((r) => r.trace.surfaced)).toEqual([2, 3]);
  });

  test("filters to one chat, and `limit` takes the MOST RECENT n", () => {
    const rec = createMemoryRecallRecorder({ now: () => 0 });
    rec.sink({ chatId: castId<ChatId>("chat_a"), scopedCharacterId: scoped, trace: slice(1) });
    rec.sink({ chatId: castId<ChatId>("chat_b"), scopedCharacterId: scoped, trace: slice(2) });
    rec.sink({ chatId: castId<ChatId>("chat_a"), scopedCharacterId: scoped, trace: slice(3) });
    expect(rec.recent({ chatId: castId<ChatId>("chat_a") }).map((r) => r.trace.surfaced)).toEqual([1, 3]);
    expect(rec.recent({ limit: 2 }).map((r) => r.trace.surfaced)).toEqual([2, 3]);
  });
});
