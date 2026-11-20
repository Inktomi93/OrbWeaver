// A canon retraction is not activity: deleting a message, selecting another variant, an edit that appends a variant
// and a re-voice each leave live last activity where a rebuild from canon puts it, for the owner and for each voice.
// @subject packages/server/src/domain/chat/substrate/stats-delta.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts
// @subject packages/server/src/domain/stats/persistence/retained-chat-accounting.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { MessageView } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { textRoom } from "../../chat/scenario-physical.ts";

const STEP_MS = 60_000;

type Activity = Readonly<Record<"owner" | CharacterId, number | null | undefined>>;

async function activity(h: ChatRoot, voices: readonly CharacterId[]): Promise<Activity> {
  const entries = await Promise.all(voices.map(async (id) => [id, (await h.root.services.stats.character(h.owner.userId, id))?.lastActivityAt] as const));
  return { owner: (await h.root.services.stats.overview(h.owner.userId))?.lastActivityAt, ...Object.fromEntries(entries) };
}

/** The activity the live writes left, then the activity a rebuild from canon gives. */
async function liveThenRebuilt(h: ChatRoot, voices: readonly CharacterId[]): Promise<{ readonly live: Activity; readonly rebuilt: Activity }> {
  const live = await activity(h, voices);
  await h.root.services.stats.reconcile(h.owner.userId);
  return { live, rebuilt: await activity(h, voices) };
}

/** One turn at a fresh clock step; returns its time and the reply it wrote. */
async function turn(h: ChatRoot, content: string): Promise<{ readonly at: number; readonly reply: MessageView }> {
  h.root.clock.advance(STEP_MS);
  const at = h.root.clock.now();
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content });
  await h.root.settleBackground();
  const reply = outcome.messages.find((row) => row.role === "assistant");
  if (reply === undefined) {
    throw new Error("the turn wrote no reply");
  }
  return { at, reply };
}

function speakerOf(h: ChatRoot): CharacterId {
  const [speaker] = h.characters;
  if (speaker === undefined) {
    throw new Error("the room seated no character");
  }
  return speaker.id;
}

test("deleting the latest turn moves last activity back to the turn before it on both paths", async () => {
  await using h = await textRoom(["The first answer.", "The second answer."]);
  const speaker = speakerOf(h);
  const first = await turn(h, "Speak once.");
  await turn(h, "Speak twice.");
  const latest = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.filter((row) => row.createdAt > first.at);
  expect(latest).toHaveLength(2);

  h.root.clock.advance(STEP_MS);
  await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: h.chatId, messageIds: latest.map((row) => row.id) });
  expect(await liveThenRebuilt(h, [speaker])).toEqual({
    live: { owner: first.at, [speaker]: first.at },
    rebuilt: { owner: first.at, [speaker]: first.at },
  });
});

test("selecting the older variant keeps last activity at the newest generation on both paths", async () => {
  await using h = await textRoom(["The first take.", "The second take."]);
  const speaker = speakerOf(h);
  const { reply } = await turn(h, "Speak.");
  h.root.clock.advance(STEP_MS);
  const swipedAt = h.root.clock.now();
  await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: reply.id, timeZone: UTC_TIME_ZONE });
  await h.root.settleBackground();

  h.root.clock.advance(STEP_MS);
  await h.root.services.chat.selectVariant({
    principal: h.owner,
    chatId: h.chatId,
    messageId: reply.id,
    variantId: reply.selectedVariantId,
    timeZone: UTC_TIME_ZONE,
  });
  expect(await liveThenRebuilt(h, [speaker])).toEqual({
    live: { owner: swipedAt, [speaker]: swipedAt },
    rebuilt: { owner: swipedAt, [speaker]: swipedAt },
  });
});

test("an edit that appends a variant leaves last activity at the turn on both paths", async () => {
  await using h = await textRoom(["The audited answer."]);
  const speaker = speakerOf(h);
  const { at, reply } = await turn(h, "Speak.");

  h.root.clock.advance(STEP_MS);
  await h.root.services.chat.applyProseRewrite({
    principal: h.owner,
    chatId: h.chatId,
    messageId: reply.id,
    variantId: reply.selectedVariantId,
    expectedContentHash: sha256Hex(reply.content),
    content: "The audited answer, repaired.",
  });
  expect(await liveThenRebuilt(h, [speaker])).toEqual({
    live: { owner: at, [speaker]: at },
    rebuilt: { owner: at, [speaker]: at },
  });
});

test("re-voicing a reply moves its activity to the new voice and leaves the old voice none, on both paths", async () => {
  await using h = await textRoom(["The borrowed answer."]);
  const speaker = speakerOf(h);
  const { at, reply } = await turn(h, "Speak.");
  expect(reply.characterId).toBe(speaker);
  const other = await h.caller.character.create({
    input: createCharacterSchema.parse({ handle: "second-voice", name: "Second Voice", description: "Takes over a reply." }),
  });
  h.root.clock.advance(STEP_MS);
  await h.root.services.chat.addCharacterToChat({ principal: h.owner, chatId: h.chatId, characterId: other.id });

  h.root.clock.advance(STEP_MS);
  await h.root.services.chat.reattributeMessages({ principal: h.owner, chatId: h.chatId, messageIds: [reply.id], characterId: other.id });
  expect(await liveThenRebuilt(h, [speaker, other.id])).toEqual({
    live: { owner: at, [speaker]: null, [other.id]: at },
    rebuilt: { owner: at, [speaker]: null, [other.id]: at },
  });
});
