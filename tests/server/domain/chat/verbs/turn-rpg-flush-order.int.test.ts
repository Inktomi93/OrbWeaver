// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/rpg/chat-ops/index.ts
import { closeDb } from "@orb/db";
import { freshCountedDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { coreFrame, coreHeldReply, coreSse } from "../engine/core-physical.ts";
import { turnRpgReply, turnRpgRoom } from "./turn-rpg-physical.ts";

test("the actual post-commit RPG flush enters its physical game read before public turn completion", async () => {
  const counted = await freshCountedDb();
  await using lifetime = new AsyncDisposableStack();
  lifetime.defer(() => closeDb(counted.db));
  const state = coreHeldReply();
  const h = lifetime.use(
    await turnRpgRoom(
      [
        (): Response =>
          coreSse([
            coreFrame({ choices: [{ delta: { content: "The keeper reaches the registered beat." } }] }),
            terminalSseLine({ usage: { promptTokens: 12, completionTokens: 8 } }),
          ]),
        async (request): Promise<Response> => {
          await state.respond(request);
          return turnRpgReply("", "Registered observatory");
        },
      ],
      { server: { db: counted.db } },
      "cheap",
    ),
  );
  let committedAt = -1;
  let completedAt = -1;
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId !== h.chatId) {
        return;
      }
      if (event.type === "messageCommitted" && event.view?.role === "assistant") {
        committedAt = counted.queries.count();
      }
      if (event.type === "turnCompleted") {
        completedAt = counted.queries.count();
      }
    }),
  );
  try {
    const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Reach the registered beat." });
    expect(sent.aborted).toBe(false);
    await state.reached;
    expect(committedAt).toBeGreaterThanOrEqual(0);
    expect(completedAt).toBeGreaterThan(committedAt);
    // onTurnCompleted synchronously registers before this first physical read; no private flush op is substituted.
    expect(
      counted.queries
        .statements()
        .slice(committedAt, completedAt)
        .filter((statement) => statement.includes('from "rpg_games"')),
    ).toHaveLength(1);
    expect(h.root.app.rpgTrace?.recent({ chatId: h.chatId }).map(({ event }) => event)).toContainEqual(
      expect.objectContaining({ phase: "flush", path: "tool-round" }),
    );
    state.release();
    await h.root.settleBackground();
    expect((await h.root.services.rpg.getTrackerView({ principal: h.owner, chatId: h.chatId })).ambient).toMatchObject({ location: "Registered observatory" });
  } finally {
    state.release();
    await h.root.settleBackground();
  }
});
