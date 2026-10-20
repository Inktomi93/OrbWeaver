// @subject packages/server/src/domain/chat/engine/round.ts
// D16 compares physical requests; narrator identity has its one deliberate framing exception.
import "@orb/testkit/node/composed-real.ts";
import type { GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, narratorPolicyOf } from "@orb/contracts/chat";
import { messages, messageVariants } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";

const GROUP_OF_ONE: GroupConfig = { ...DEFAULT_GROUP_CONFIG, output: "per-speaker", speakerTags: true, cardScope: "scoped" };
const NARRATOR_OF_ONE: GroupConfig = {
  output: "narrator",
  policy: narratorPolicyOf(DEFAULT_GROUP_CONFIG.policy),
  smartPicker: DEFAULT_GROUP_CONFIG.smartPicker,
  speakerTags: true,
  groupNudge: DEFAULT_GROUP_CONFIG.groupNudge,
  autoMode: DEFAULT_GROUP_CONFIG.autoMode,
  autoModeMaxTurns: DEFAULT_GROUP_CONFIG.autoModeMaxTurns,
  autoModeDelayMs: DEFAULT_GROUP_CONFIG.autoModeDelayMs,
  allowSelfResponses: DEFAULT_GROUP_CONFIG.allowSelfResponses,
  memberCardVisibility: DEFAULT_GROUP_CONFIG.memberCardVisibility,
};

async function posture(group: GroupConfig): Promise<{
  readonly body: string;
  readonly characterId: CharacterId;
  readonly row: (Pick<typeof messages.$inferSelect, "role" | "characterId"> & Pick<typeof messageVariants.$inferSelect, "content">) | undefined;
}> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({ providerFetch: provider.execute, group });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the real solo room has no character");
  }
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 1, role: "user", authorUserId: h.owner.userId, content: "hello there" }, h.root.idSource);
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 2, characterId: character.id, content: "well met, traveler" }, h.root.idSource);
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 3, role: "user", authorUserId: h.owner.userId, content: "tell me more" }, h.root.idSource);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Continue the conversation." });
  expect(outcome.aborted).toBe(false);
  const physical = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(physical).toHaveLength(1);
  const firstRequest = physical[0];
  const assistant = outcome.messages.find(({ role }) => role === "assistant");
  if (firstRequest === undefined || assistant === undefined) {
    throw new Error("the real posture produced no physical request or assistant row");
  }
  const body = await firstRequest.text();
  const row = await h.root.db
    .select({ role: messages.role, characterId: messages.characterId, content: messageVariants.content })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(eq(messages.id, assistant.id))
    .get();
  return { body, characterId: character.id, row };
}

test("the wire request is BYTE-identical: untouched solo room vs fully group-configured roster of one", async () => {
  const solo = await posture(DEFAULT_GROUP_CONFIG);
  const grouped = await posture(GROUP_OF_ONE);
  expect(grouped.body).toBe(solo.body);
  expect(solo.body).toContain("well met, traveler");
});

test("the group knobs are runtime-fenced, not mode-fenced: no nudge, no name-stamp at one character", async () => {
  const grouped = await posture(GROUP_OF_ONE);
  expect(grouped.body).not.toContain("[Write the next reply only as");
  expect(grouped.body).not.toContain("Aria:");
});

test("the NARRATOR arm at one character degrades to the solo shape — byte-identical but for the mode's own framing", async () => {
  const solo = await posture(DEFAULT_GROUP_CONFIG);
  const narrator = await posture(NARRATOR_OF_ONE);
  const bodies = [solo.body, narrator.body].map((body) => jsonValueSchema.parse(JSON.parse(body)));
  const framings = bodies.map((body) => {
    if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
      throw new Error("the physical posture request has no messages");
    }
    const system = body["messages"].find(
      (message) => message !== null && typeof message === "object" && !Array.isArray(message) && message["role"] === "system",
    );
    if (system === undefined || system === null || typeof system !== "object" || Array.isArray(system) || typeof system["content"] !== "string") {
      throw new Error("the physical posture request has no text system message");
    }
    const [framing, ...rest] = system["content"].split("\n\n");
    system["content"] = rest.join("\n\n");
    return framing;
  });
  expect(JSON.stringify(bodies[1])).toBe(JSON.stringify(bodies[0]));
  expect(framings[0]).toContain("You are Aria in an immersive");
  expect(framings[1]).toContain("You are the narrator of an immersive");
  expect(framings[1]).not.toContain("perspective only");
  expect(narrator.body).toContain("A bold knight.");
  expect(narrator.body).not.toContain("Continue the scene, voicing the present characters");
  expect(narrator.body).not.toContain("[Character — Aria]");
});

test("the persisted canon row is identical across postures (role/author/content)", async () => {
  const solo = await posture(DEFAULT_GROUP_CONFIG);
  const grouped = await posture(GROUP_OF_ONE);
  expect(solo.row).toEqual({ role: "assistant", characterId: solo.characterId, content: "reply" });
  expect(grouped.row).toEqual(solo.row);
});
