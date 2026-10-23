// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/engine/auto-mode.ts
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { B_CHAT_MODEL, B_UTILITY_MODEL, saveSpeakerConnection, speakerInputs, speakerRoom } from "./speaker-funding-physical.ts";
import { TAIL_ROSTER } from "./turn-lifetimes-roster.ts";

test("Stop during the third actual Utility pick closes the whole chain after its two committed speakers", async () => {
  let utilityRequests = 0;
  await using room = await speakerRoom(
    {
      chat: ["The first complete beat.", "The second complete beat."],
      picks: [["Aria"], ["Bryn"], ["Cara"]],
      get holdUtility() {
        return ++utilityRequests === 3;
      },
    },
    {
      characters: TAIL_ROSTER,
      group: {
        output: "per-speaker",
        policy: "smart",
        smartPicker: "utility",
        allowSelfResponses: false,
        autoMode: true,
        autoModeMaxTurns: 3,
        autoModeDelayMs: 0,
      },
    },
    { ...SHIPPED_PROMPT_CACHE, enabled: false },
  );
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const params = { principal: room.h.owner, chatId: room.h.chatId };
  const sending = room.h.root.services.chat.send({ ...params, content: "Who speaks next?" });
  const settled = Promise.allSettled([sending]);
  try {
    await room.peer.reached;
    expect(utilityRequests).toBe(3);
    expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toHaveLength(3);
    expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toHaveLength(2);
    const before = await room.h.root.db.select().from(messages).where(eq(messages.chatId, room.h.chatId)).orderBy(messages.seq);
    expect(before.filter(({ role }) => role === "assistant").map(({ characterId }) => characterId)).toEqual([
      room.h.characters[0]?.id,
      room.h.characters[1]?.id,
    ]);
    expect(room.events.filter(({ type }) => type === "turnAccepted")).toHaveLength(3);
    await room.h.root.services.chat.abort(params);
    await room.peer.closed;
    const outcome = await sending;
    expect(outcome.aborted).toBe(false);
    const lifecycle = room.events.filter(({ type }) => type === "turnAccepted" || type === "turnStarted" || type === "turnAborted" || type === "turnCompleted");
    expect(lifecycle.at(-1)).toMatchObject({ type: "turnAborted", intent: "generate", reason: "user", automationDepth: 0 });
    expect(await room.h.root.db.select().from(messages).where(eq(messages.chatId, room.h.chatId)).orderBy(messages.seq)).toEqual(before);
    expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toHaveLength(2);
    expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toHaveLength(3);
    await expect(room.h.root.services.chat.abort(params)).resolves.toBeUndefined();
  } finally {
    await room.h.root.services.chat.abort(params);
    room.peer.release();
    await settled;
    await room.h.root.settleBackground();
  }
});
