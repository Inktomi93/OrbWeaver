// @subject packages/server/src/domain/chat/verbs/turn.ts
// Speakerless public generation uses the saved room policy and actual prior canon, not the roster's first seat.
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent, GroupConfigInput } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { messages } from "@orb/db";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";
import { B_CHAT_MODEL, B_UTILITY_MODEL, saveSpeakerConnection, speakerInputs, speakerRoom } from "./speaker-funding-physical.ts";

test("speakerless list generation skips the actual last speaker and commits only the next eligible seat", async () => {
  await using h = await textRoom(["Bryn answers."], {
    characters: [
      createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." }),
      createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "An observant mage." }),
    ],
    group: { output: "per-speaker", policy: "list", allowSelfResponses: false },
  });
  const [aria, bryn] = h.characters;
  if (aria === undefined || bryn === undefined) {
    throw new Error("the public generation fixture created no two-seat roster");
  }
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 1, role: "user", authorUserId: h.owner.userId, characterId: null, content: "hello" }, h.root.idSource);
  const prior = await seedMessage(
    h.root.db,
    { chatId: h.chatId, seq: 2, role: "assistant", characterId: aria.id, content: "Aria answers first." },
    h.root.idSource,
  );
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: bryn.id, content: "Bryn answers.", seq: 3 });
  expect(outcome.messages[0]?.id).not.toBe(prior.id);
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon.map(({ role }) => role)).toEqual(["user", "assistant", "assistant"]);
  expect(canon.map(({ characterId }) => characterId)).toEqual([null, aria.id, bryn.id]);
  expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(1);
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
  await using h = await textRoom([expectedName + " answers."], {
    characters: names.map((name) => createCharacterSchema.parse({ handle: name.toLowerCase(), name, description: name + " is present." })),
    group: scene.group,
  });
  const [aria, bryn] = h.characters;
  const selected = h.characters[scene.expected];
  if (aria === undefined || bryn === undefined || selected === undefined) {
    throw new Error("the generation matrix did not create its authored roster");
  }
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 1, role: "user", authorUserId: h.owner.userId, content: "hello" }, h.root.idSource);
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 2, role: "assistant", characterId: aria.id, content: "Aria answers first." }, h.root.idSource);
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
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: selected.id, content: expectedName + " answers.", seq: 3 });
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon.map(({ characterId }) => characterId)).toEqual([null, aria.id, selected.id]);
  expect(h.requests.filter((request) => new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(1);
});

test("speakerless manual generation commits nothing and closes its accepted slot without starting a turn", async () => {
  await using h = await textRoom([], {
    characters: [
      createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." }),
      createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "An observant mage." }),
    ],
    group: { output: "per-speaker", policy: "manual" },
  });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the manual room has no character");
  }
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 1, role: "user", authorUserId: h.owner.userId, content: "hello" }, h.root.idSource);
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 2, role: "assistant", characterId: character.id, content: "The prior answer." }, h.root.idSource);
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
  const reply = expectedName + " answers.";
  await using f = await speakerRoom(
    { chat: [reply], picks: [scene.picks], utilityFailure: scene.failure },
    {
      characters: scene.names.map((name) => createCharacterSchema.parse({ handle: name, name, description: "The traveller " + name + "." })),
      group: { output: "per-speaker", policy: "smart", smartPicker: "utility", allowSelfResponses: false },
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
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 1, role: "user", authorUserId: h.owner.userId, content: "hello" }, h.root.idSource);
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 2, role: "assistant", characterId: aria.id, content: "aria answers first." }, h.root.idSource);
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, ...(scene.explicit ? { speakerCharacterId: aria.id } : {}) });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]).toMatchObject({ role: "assistant", characterId: expected.id, content: reply, seq: 3 });
  expect(await speakerInputs(f.peer.requests, B_UTILITY_MODEL)).toHaveLength(scene.explicit ? 0 : 1);
  expect(await speakerInputs(f.peer.requests, B_CHAT_MODEL)).toHaveLength(1);
  expect(f.events.filter(({ type }) => type === "warning")).toEqual(
    scene.failure ? [{ type: "warning", chatId: h.chatId, code: "smart_arbitration_degraded" }] : [],
  );
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon.map(({ characterId }) => characterId)).toEqual([null, aria.id, expected.id]);
});
