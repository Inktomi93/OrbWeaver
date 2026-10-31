// A tier-1 digest whose first or last covered segment row is gone fails closed for a speaker bound by a join horizon.
// @subject packages/server/src/domain/chat/memory/recall/recall.ts

import type { MemoryRecallVerdict } from "@orb/contracts/chat";
import { chatSegments } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { and, eq } from "drizzle-orm";
import { FAN_OUT, TURN_INTENT, world } from "../recall-world.ts";

test("a tier-1 digest missing its first or its last covered span fails closed for a speaker bound by a join horizon", async () => {
  await using w = await world.build({ mode: "tiered", maxTier: 1, scout: true });
  const { h } = w;
  const keeper = h.characters[0];
  if (keeper === undefined) {
    throw new Error("the recall world has no speaker");
  }
  const tier1Verdicts = async (): Promise<ReadonlyMap<number, MemoryRecallVerdict>> => {
    const before = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
    const turn = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: keeper.id, intent: TURN_INTENT });
    expect(turn.aborted).toBe(false);
    const record = h.root.app.recallRecorder
      .recent({ chatId: h.chatId })
      .filter((candidate) => candidate.seq > before && candidate.scopedCharacterId === keeper.id)
      .at(-1);
    return new Map(record?.trace.candidates.filter((candidate) => candidate.tier === 1).map((candidate) => [candidate.blockIdx, candidate.verdict]));
  };
  const whole = await tier1Verdicts();
  const [lostFirst, lostLast, intact] = [...whole.keys()];
  if (lostFirst === undefined || lostLast === undefined || intact === undefined) {
    throw new Error("the speaker recalls fewer than three tier-1 digests");
  }
  expect([...whole.values()]).not.toContain("unwitnessed");
  // A tier-1 digest covers FAN_OUT consecutive tier-0 segments; one is removed from the first end of one digest and the last end of another.
  for (const blockIdx of [lostFirst * FAN_OUT, lostLast * FAN_OUT + FAN_OUT - 1]) {
    await h.root.db.delete(chatSegments).where(and(eq(chatSegments.chatId, h.chatId), eq(chatSegments.blockIdx, blockIdx)));
  }
  const cut = await tier1Verdicts();
  expect(cut.get(lostFirst)).toBe("unwitnessed");
  expect(cut.get(lostLast)).toBe("unwitnessed");
  expect(cut.get(intact)).not.toBe("unwitnessed");
});
