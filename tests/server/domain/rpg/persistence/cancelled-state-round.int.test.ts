// A public abort cancels the caller's state round after its narrative finished: the game keeps no
// snapshot row and the tracker shows no ambient state.
// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/rpg/flush-barrier.ts

import { rpgSnapshots } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import { coreFrame, coreHeldReply, coreSse } from "../../chat/engine/core-physical.ts";
import { turnRpgRoom } from "../../chat/verbs/turn-rpg-physical.ts";

test("public abort cancels its caller's real state round after narrative generation has already finished", async () => {
  const state = coreHeldReply();
  await using h = await turnRpgRoom(
    [
      (): Response =>
        coreSse([
          coreFrame({ choices: [{ delta: { content: "The keeper has finished speaking." } }] }),
          terminalSseLine({ usage: { promptTokens: 12, completionTokens: 8 } }),
        ]),
      state.respond,
    ],
    {},
    "cheap",
  );
  const params = { principal: h.owner, chatId: h.chatId };
  try {
    const generation = await h.root.services.chat.generate(params);
    expect(generation.aborted).toBe(false);
    expect(generation.messages).toMatchObject([{ role: "assistant", content: "The keeper has finished speaking." }]);
    const signal = await state.reached;
    expect(signal.aborted).toBe(false);
    await expect(h.root.services.chat.abort(params)).resolves.toBeUndefined();
    expect(signal.aborted).toBe(true);
    await h.root.settleBackground();
    expect((await h.root.services.chat.listMessages(params)).messages).toMatchObject([{ role: "assistant", content: "The keeper has finished speaking." }]);
    expect((await h.root.services.rpg.getTrackerView(params)).ambient).toBeNull();
    const game = await h.root.services.rpg.getGame(params);
    expect(await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, game.id))).toEqual([]);
    expect(h.root.app.rpgTrace?.recent({ chatId: h.chatId }).map(({ event }) => event)).toContainEqual(
      expect.objectContaining({ phase: "flushed", outcome: "cancelled" }),
    );
  } finally {
    state.release();
    await h.root.settleBackground();
  }
});
