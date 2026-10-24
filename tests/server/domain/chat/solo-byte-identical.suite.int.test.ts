// @subject packages/server/src/domain/chat/engine/round.ts
// D16 compares physical requests; narrator identity has its one deliberate framing exception.
import type { GroupConfig, MessageView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, narratorPolicyOf } from "@orb/contracts/chat";
import { resolveProseText } from "@orb/contracts/prose";
import type { CharacterId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
} from "@orb/testkit/node/composed";

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
  readonly row: Pick<MessageView, "role" | "characterId" | "content"> | undefined;
}> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({
    providerFetch: provider.execute,
    group,
    transcript: [
      { role: "user", content: "hello there" },
      { role: "assistant", content: "well met, traveler" },
      { role: "user", content: "tell me more" },
    ],
  });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the real solo room has no character");
  }
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
  const stored = (await readRoomCanon(h.root, h.owner, h.chatId)).find(({ id }) => id === assistant.id);
  const row = stored === undefined ? undefined : { role: stored.role, characterId: stored.characterId, content: stored.content };
  return { body, characterId: character.id, row };
}

// The non-system messages of the physical request, in wire order: the whole seeded history plus the live send.
function historyLines(body: string): readonly JsonValue[] {
  const parsed = jsonValueSchema.parse(JSON.parse(body));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed["messages"])) {
    throw new Error("the physical posture request has no messages");
  }
  return parsed["messages"]
    .filter((message) => message !== null && typeof message === "object" && !Array.isArray(message) && message["role"] !== "system")
    .map((message) => (message !== null && typeof message === "object" && !Array.isArray(message) ? (message["content"] ?? null) : null));
}

test("the wire request is BYTE-identical: untouched solo room vs fully group-configured roster of one", async () => {
  const solo = await posture(DEFAULT_GROUP_CONFIG);
  const grouped = await posture(GROUP_OF_ONE);
  expect(grouped.body).toBe(solo.body);
  expect(solo.body).toContain("well met, traveler");
  expect(historyLines(solo.body)).toEqual([
    `${resolveProseText("preset.format.newChatMarker", {})}\n\nhello there`,
    "well met, traveler",
    "tell me more\n\nContinue the conversation.",
  ]);
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
