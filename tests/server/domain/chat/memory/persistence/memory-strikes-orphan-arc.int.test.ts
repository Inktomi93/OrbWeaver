// A longer summary whose built-from scene summary is no longer stored, the state a room left by an earlier build holds,
// stays out of recall while its scene is struck, and the memory view carries the strike on it. The scene's row is
// removed directly because no current build leaves that state.
// @subject packages/server/src/domain/chat/memory/strikes.ts
// @subject packages/server/src/domain/chat/memory/recall/recall.ts

import { chatDigests } from "@orb/db";
import { nonEmpty, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { and, eq } from "drizzle-orm";
import { blockOf, generatedText, probe, recallTurn, verdicts, world } from "../recall-world.ts";

const BOTH = `Tell me about the scene. ${probe("bath")} ${probe("storm")}`;
const MERGED_FACTS = "The scenes merged into one arc.";
const STORM_ARC = "The storm arc was merged into one telling.";

test("a longer summary over a struck scene stays out after the scene's own row is gone, and the view shows it struck", async () => {
  await using w = await world.build({
    mode: "tiered",
    maxTier: 1,
    replyFor: (body) => {
      const scripted = generatedText(body);
      return scripted.includes(MERGED_FACTS) && body.includes("arc-storm.") ? scripted.replace(MERGED_FACTS, STORM_ARC) : undefined;
    },
  });
  const { h } = w;
  const view = await h.caller.chat.memoryView({ chatId: h.chatId });
  const arc = present(view.items.find((item) => item.key.tier === 1 && item.text.includes(STORM_ARC)));
  const scene = present(view.items.find((item) => item.key.tier === 0 && item.key.blockIdx === blockOf("storm")));
  const { strikeId } = await h.caller.chat.strikeMemory({ chatId: h.chatId, item: scene.key });
  await h.root.db.delete(chatDigests).where(and(eq(chatDigests.chatId, h.chatId), eq(chatDigests.tier, 0), eq(chatDigests.blockIdx, blockOf("storm"))));

  const after = await h.caller.chat.memoryView({ chatId: h.chatId });
  // The premise: the scene's own summary is gone and the longer one built from it is still stored.
  expect(nonEmpty([...after.items]).some((item) => item.key.tier === 0 && item.key.blockIdx === blockOf("storm"))).toBe(false);
  expect(present(after.items.find((item) => item.key.tier === 1 && item.key.blockIdx === arc.key.blockIdx)).text).toBe(arc.text);
  const run = await recallTurn(h, BOTH);
  expect(run.prompt).not.toContain(STORM_ARC);
  expect(verdicts(run.trace, "covers-struck").map((candidate) => [candidate.tier, candidate.blockIdx])).toEqual([[1, arc.key.blockIdx]]);
  // The view carries the strike on the longer summary it still leaves out, not as an unmatched strike.
  expect(after.items.find((item) => item.key.tier === 1 && item.key.blockIdx === arc.key.blockIdx)).toMatchObject({
    strike: { strikeId, changedSinceStrike: true },
  });
  expect(after.unmatchedStrikes).toEqual([]);

  // The control: restored, the longer summary reaches the prompt.
  await h.caller.chat.restoreMemory({ chatId: h.chatId, strikeId });
  expect((await recallTurn(h, BOTH)).prompt).toContain(STORM_ARC);
});
