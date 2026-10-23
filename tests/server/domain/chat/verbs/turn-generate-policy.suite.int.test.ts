// @subject packages/server/src/domain/chat/verbs/turn.ts
// Speakerless public generation uses the saved room policy and actual prior canon, not the roster's first seat.
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent, GroupConfigInput } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { TranscriptLine } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { openingOf, openingText, textRoom, wireBodies } from "../scenario-physical.ts";
import { B_CHAT_MODEL, B_UTILITY_MODEL, saveSpeakerConnection, speakerInputs, speakerRoom } from "./speaker-funding-physical.ts";

// An owner line and one reply by the room's first seat, written by the native transcript import.
function priorExchange(speakerHandle: string, reply: string): readonly TranscriptLine[] {
  return [
    { role: "user", content: "hello" },
    { role: "assistant", speakerHandle, content: reply },
  ];
}

test("speakerless list generation skips the actual last speaker and commits only the next eligible seat", async () => {
  await using h = await textRoom(["Bryn answers."], {
    characters: [
      createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." }),
      createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "An observant mage." }),
    ],
    group: { output: "per-speaker", policy: "list", allowSelfResponses: false },
    transcript: priorExchange("aria", "Aria answers first."),
  });
  const [aria, bryn] = h.characters;
  if (aria === undefined || bryn === undefined) {
    throw new Error("the public generation fixture created no two-seat roster");
  }
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  const prior = canon[1];
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: bryn.id, content: "Bryn answers.", seq: (prior?.seq ?? 0) + 1 });
  expect(outcome.messages[0]?.id).not.toBe(prior?.id);
  expect(canon.map(({ role }) => role)).toEqual(["user", "assistant", "assistant"]);
  expect(canon.map(({ characterId }) => characterId)).toEqual([null, aria.id, bryn.id]);
  const bodies = await wireBodies(h);
  expect(bodies).toHaveLength(1);
  expect(openingText(bodies[0])).toBe(openingOf("hello"));
});

test.for([
  {
    title: "list generation permits the prior seat when self-responses are enabled",
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
    muted: false,
    expected: 0,
  },
  {
    title: "pooled generation selects the seat after the actual prior speaker",
    group: { output: "per-speaker", policy: "pooled", allowSelfResponses: false },
    muted: false,
    expected: 1,
  },
  {
    title: "natural generation excludes both the muted seat and the actual prior speaker",
    group: { output: "per-speaker", policy: "natural", allowSelfResponses: false },
    muted: true,
    expected: 2,
  },
] satisfies readonly GenerateCase[])("$title", async (scene) => {
  const names = ["Aria", "Bryn", "Cara"];
  const expectedName = names[scene.expected];
  if (expectedName === undefined) {
    throw new Error("the generation matrix has no expected seat");
  }
  await using h = await textRoom([`${expectedName} answers.`], {
    characters: names.map((name) => createCharacterSchema.parse({ handle: name.toLowerCase(), name, description: `${name} is present.` })),
    group: scene.group,
    transcript: priorExchange("aria", "Aria answers first."),
  });
  const [aria, bryn] = h.characters;
  const selected = h.characters[scene.expected];
  if (aria === undefined || bryn === undefined || selected === undefined) {
    throw new Error("the generation matrix did not create its authored roster");
  }
  if (scene.muted) {
    const seat = (await h.root.services.chat.listParticipants({ principal: h.owner, chatId: h.chatId })).find(({ characterId }) => characterId === bryn.id);
    if (seat === undefined) {
      throw new Error("the actual roster has no Bryn seat");
    }
    await h.root.services.chat.setSeatKnobs({ principal: h.owner, chatId: h.chatId, participantId: seat.id, patch: { disabled: true } });
  }
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(outcome.messages[0]).toMatchObject({
    role: "assistant",
    characterId: selected.id,
    content: `${expectedName} answers.`,
    seq: (canon[1]?.seq ?? 0) + 1,
  });
  expect(canon.map(({ characterId }) => characterId)).toEqual([null, aria.id, selected.id]);
  const bodies = await wireBodies(h);
  expect(bodies).toHaveLength(1);
  expect(openingText(bodies[0])).toBe(openingOf("hello"));
});

test("speakerless manual generation commits nothing and closes its accepted slot without starting a turn", async () => {
  await using h = await textRoom([], {
    characters: [
      createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." }),
      createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "An observant mage." }),
    ],
    group: { output: "per-speaker", policy: "manual" },
    transcript: priorExchange("aria", "The prior answer."),
  });
  const before = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  const events: ChatBusEvent[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event));
  try {
    const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
    expect(outcome).toEqual({ messages: [], aborted: false, abortReason: undefined });
    expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq)).toEqual(before);
    expect(events.map(({ type }) => type)).not.toContain("turnStarted");
    expect(events.at(-1)).toMatchObject({ type: "turnCompleted", intent: "generate", messageId: null });
    expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toEqual([]);
  } finally {
    unsubscribe();
  }
});

interface GenerateCase {
  readonly title: string;
  readonly group: GroupConfigInput;
  readonly muted: boolean;
  readonly expected: number;
}
test.for([
  {
    title: "public Smart generation commits the native Utility pick with one arbitration and no warning",
    names: ["aria", "bryn", "cara"],
    picks: ["cara"],
    failure: false,
    explicit: false,
    expected: 2,
  },
  {
    title: "a native Utility refusal makes public generate use the eligible natural fallback and exact warning",
    names: ["aria", "bryn"],
    picks: [],
    failure: true,
    explicit: false,
    expected: 1,
  },
  {
    title: "an explicit public generation target bypasses even a saved working Utility binding",
    names: ["aria", "bryn"],
    picks: ["bryn"],
    failure: false,
    explicit: true,
    expected: 0,
  },
])("$title", async (scene) => {
  const expectedName = scene.names[scene.expected];
  if (expectedName === undefined) {
    throw new Error("the Smart generation matrix has no expected speaker");
  }
  const reply = `${expectedName} answers.`;
  await using f = await speakerRoom(
    { chat: [reply], picks: [scene.picks], utilityFailure: scene.failure },
    {
      characters: scene.names.map((name) => createCharacterSchema.parse({ handle: name, name, description: `The traveller ${name}.` })),
      group: { output: "per-speaker", policy: "smart", smartPicker: "utility", allowSelfResponses: false },
      transcript: priorExchange("aria", "aria answers first."),
    },
    { ...SHIPPED_PROMPT_CACHE, enabled: false },
  );
  const h = f.h;
  const aria = h.characters[0];
  const expected = h.characters[scene.expected];
  if (aria === undefined || expected === undefined) {
    throw new Error("the Smart generation matrix did not create its authored seats");
  }
  await saveSpeakerConnection(h, f.peer.baseUrl, "summarize");
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, ...(scene.explicit ? { speakerCharacterId: aria.id } : {}) });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  const [, priorReply] = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: expected.id, content: reply, seq: (priorReply?.seq ?? 0) + 1 });
  expect(await speakerInputs(f.peer.requests, B_UTILITY_MODEL)).toHaveLength(scene.explicit ? 0 : 1);
  const chat = await speakerInputs(f.peer.requests, B_CHAT_MODEL);
  expect(chat).toHaveLength(1);
  expect(chat[0]?.messages.find(({ role }) => role !== "system")?.content).toBe(openingOf("hello"));
  expect(f.events.filter(({ type }) => type === "warning")).toEqual(
    scene.failure ? [{ type: "warning", chatId: h.chatId, code: "smart_arbitration_degraded" }] : [],
  );
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon.map(({ characterId }) => characterId)).toEqual([null, aria.id, expected.id]);
});
