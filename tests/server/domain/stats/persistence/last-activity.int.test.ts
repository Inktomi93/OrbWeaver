// Only a turn is character activity: a new seat, a title or any other write to a room's row leaves last activity
// where the last message put it, on the live write and on a rebuild from canon alike.
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
// @subject packages/server/src/domain/stats/substrate/rebuild-rollups.ts
// @subject packages/server/src/domain/stats/persistence/retained-chat-accounting.ts
// @subject packages/server/src/domain/chat/substrate/stats-delta.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { textRoom } from "../../chat/scenario-physical.ts";

interface Activity {
  readonly owner: number | null | undefined;
  readonly speaker: number | null | undefined;
  readonly seated: number | null | undefined;
}

async function activity(h: ChatRoot, speaker: CharacterId, seated: CharacterId): Promise<Activity> {
  return {
    owner: (await h.root.services.stats.overview(h.owner.userId))?.lastActivityAt,
    speaker: (await h.root.services.stats.character(h.owner.userId, speaker))?.lastActivityAt,
    seated: (await h.root.services.stats.character(h.owner.userId, seated))?.lastActivityAt,
  };
}

/** The activity the live writes left, then the activity a rebuild from canon gives. */
async function liveThenRebuilt(h: ChatRoot, speaker: CharacterId, seated: CharacterId): Promise<{ readonly live: Activity; readonly rebuilt: Activity }> {
  const live = await activity(h, speaker, seated);
  await h.root.services.stats.reconcile(h.owner.userId);
  return { live, rebuilt: await activity(h, speaker, seated) };
}

async function turn(h: ChatRoot, content: string): Promise<void> {
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content });
  await h.root.settleBackground();
}

test("a later seat and a title write leave last activity at the last turn on both paths, and a later turn moves both", async () => {
  await using h = await textRoom(["The voice answers once.", "The voice answers again.", "The quiet seat answers."]);
  const [speaker] = h.characters;
  if (speaker === undefined) {
    throw new Error("the room seated no character");
  }
  const quiet = await h.caller.character.create({
    input: createCharacterSchema.parse({ handle: "quiet-seat", name: "Quiet Seat", description: "Sits and never speaks." }),
  });

  h.root.clock.advance(60_000);
  const turnAt = h.root.clock.now();
  await turn(h, "Speak once.");
  h.root.clock.advance(60_000);
  await h.root.services.chat.addCharacterToChat({ principal: h.owner, chatId: h.chatId, characterId: quiet.id });
  h.root.clock.advance(60_000);
  await h.root.services.chat.updateTitle({ principal: h.owner, chatId: h.chatId, title: "Renamed later" });
  const reply = (await h.caller.chat.listMessages({ chatId: h.chatId })).messages.findLast((row) => row.role === "assistant");
  if (reply === undefined) {
    throw new Error("the turn wrote no reply");
  }
  h.root.clock.advance(60_000);
  await h.caller.chat.editMessage({ chatId: h.chatId, messageId: reply.id, timeZone: UTC_TIME_ZONE, content: "The voice answers once, corrected." });

  expect(await liveThenRebuilt(h, speaker.id, quiet.id)).toEqual({
    live: { owner: turnAt, speaker: turnAt, seated: null },
    rebuilt: { owner: turnAt, speaker: turnAt, seated: null },
  });

  // Control: a turn after those writes moves last activity on both paths, and the group turn gives the quiet seat its first.
  h.root.clock.advance(60_000);
  const laterTurnAt = h.root.clock.now();
  await turn(h, "Speak again.");
  expect(await liveThenRebuilt(h, speaker.id, quiet.id)).toEqual({
    live: { owner: laterTurnAt, speaker: laterTurnAt, seated: laterTurnAt },
    rebuilt: { owner: laterTurnAt, speaker: laterTurnAt, seated: laterTurnAt },
  });
});
