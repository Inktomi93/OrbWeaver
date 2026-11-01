// @subject packages/server/src/domain/chat/engine/smart-arbitrate.ts
// @subject packages/server/src/domain/chat/engine/rerank-pick.ts
// Native vendor inputs and committed canon prove the public Smart policy, not a substituted arbiter.

import { createPersonaSchema } from "@orb/contracts/persona";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { muteCara, send, smartRoom, THREE, warnings } from "./smart-picker.fixtures.ts";
import { B_CHAT_MODEL, B_UTILITY_MODEL, saveSpeakerConnection, speakerInputs } from "./speaker-funding-physical.ts";

test("default Smart ranks native negative logits once and never calls Utility", async () => {
  await using room = await smartRoom(
    {
      chat: ["Bryn answers."],
      rerank: [
        { index: 1, ["relevance_score"]: -0.5 },
        { index: 0, ["relevance_score"]: -7 },
      ],
    },
    {
      group: { output: "per-speaker", policy: "smart", allowSelfResponses: true },
    },
  );
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "rerank");
  const result = await send(room);
  expect(result.messages.filter((m) => m.role === "assistant").map((m) => m.characterId)).toEqual([room.h.characters[1]?.id]);
  const rankRequests = room.peer.requests.filter((request) => new URL(request.url).pathname === "/v1/rerank");
  expect(rankRequests).toHaveLength(1);
  expect(await rankRequests[0]?.clone().json()).toMatchObject({
    query: expect.stringContaining("who's up?"),
    documents: [expect.stringMatching(/^aria:/u), expect.stringMatching(/^bryn:/u)],
  });
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toEqual([]);
  expect(warnings(room)).toEqual([]);
});

test("Utility opt-in routes a real structured pick instead of reranking", async () => {
  await using room = await smartRoom({ chat: ["Bryn answers."], picks: [["bryn"]] });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const result = await send(room);
  expect(result.messages.filter((m) => m.role === "assistant").map((m) => m.characterId)).toEqual([room.h.characters[1]?.id]);
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toHaveLength(1);
  expect(room.peer.requests.filter((request) => new URL(request.url).pathname === "/v1/rerank")).toEqual([]);
  expect(warnings(room)).toEqual([]);
});

test("unbound reranking commits one eligible natural speaker with its exact warning", async () => {
  await using room = await smartRoom({ chat: ["The eligible traveller answers."] }, { group: { output: "per-speaker", policy: "smart" } });
  await room.h.caller.connection.setBinding({ task: "rerank", connectionId: null });
  const result = await send(room);
  const assistants = result.messages.filter((m) => m.role === "assistant");
  expect(assistants).toHaveLength(1);
  expect(room.h.characters.map((c) => c.id)).toContain(assistants[0]?.characterId);
  expect(warnings(room)).toEqual([{ type: "warning", chatId: room.h.chatId, code: "speaker_rerank_unavailable" }]);
});

test("saved Utility sampling reaches native input without replacing the arbiter system", async () => {
  await using room = await smartRoom({ chat: ["First answer.", "Second answer."], picks: [["bryn"], ["aria"]] });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  await send(room);
  const preset = await room.h.caller.preset.create({
    name: "Owned Utility sampler",
    kind: "custom",
    config: {
      ...DEFAULT_PROMPT_CONFIG,
      params: { ...DEFAULT_PROMPT_CONFIG.params, temperature: 0.9, maxOutputTokens: 64, compaction: { mode: "managed" }, replyMedia: "text+image" },
      sections: [
        {
          type: "literal",
          id: "private-utility-template",
          name: "Utility template",
          role: "system",
          content: "NEVER BLEED THIS CUSTOM UTILITY SYSTEM",
          enabled: true,
        },
      ],
    },
  });
  await room.h.caller.settings.updateUserSettingsSection({ section: "seeds", patch: { summarizePreset: { kind: "preset", presetId: preset.id } } });
  await send(room, "and now?");
  const inputs = await speakerInputs(room.peer.requests, B_UTILITY_MODEL);
  expect(inputs).toHaveLength(2);
  expect(inputs[0]).toMatchObject({ temperature: 0.2, ["max_tokens"]: 128 });
  expect(inputs[1]).toMatchObject({ temperature: 0.9, ["max_tokens"]: 64 });
  expect(inputs[1]).not.toHaveProperty("modalities");
  expect(inputs[1]?.messages.filter((m) => m.role === "system")).toEqual(inputs[0]?.messages.filter((m) => m.role === "system"));
  expect(JSON.stringify(inputs)).not.toContain("NEVER BLEED THIS CUSTOM UTILITY SYSTEM");
  expect(warnings(room)).toEqual([]);
});

test("one native schema-constrained happy pick is honored without warning", async () => {
  await using room = await smartRoom({ chat: ["Bryn's committed answer."], picks: [["bryn"]] });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const result = await send(room);
  expect(result.messages.filter((m) => m.role === "assistant").map((m) => m.characterId)).toEqual([room.h.characters[1]?.id]);
  const inputs = await speakerInputs(room.peer.requests, B_UTILITY_MODEL);
  expect(inputs).toHaveLength(1);
  expect(inputs[0]?.response_format?.json_schema.name).toBe("speaker_pick");
  expect(warnings(room)).toEqual([]);
});

test("native arbiter transcript uses the persisted persona and each actual character label", async () => {
  await using room = await smartRoom(
    { chat: ["Aria answers."], picks: [["aria"]] },
    {
      personas: [createPersonaSchema.parse({ name: "host_pov", description: "The host's past point of view." })],
      transcript: [
        { role: "user", personaName: "host_pov", content: "Anyone awake?" },
        { role: "assistant", speakerHandle: "aria", content: "I never sleep." },
        { role: "assistant", speakerHandle: "bryn", content: "Speak for yourself." },
      ],
    },
  );
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const { h } = room;
  await h.root.services.persona.setActivePersona({ principal: h.owner, chatId: h.chatId, personaId: null });
  await send(room);
  const inputs = await speakerInputs(room.peer.requests, B_UTILITY_MODEL);
  expect(inputs).toHaveLength(1);
  expect(inputs[0]?.messages.find((m) => m.role === "user")?.content).toContain(
    `Recent conversation:\nhost_pov: Anyone awake?\naria: I never sleep.\nbryn: Speak for yourself.\n${DEFAULT_PERSONA_NAME}: who's up?\n\n`,
  );
});

test("several native responders commit in the model's actual order", async () => {
  await using room = await smartRoom({ chat: ["Cara first.", "Aria second."], picks: [["cara", "aria"]] }, { characters: THREE });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const result = await send(room);
  expect(result.messages.filter((m) => m.role === "assistant").map((m) => m.characterId)).toEqual([room.h.characters[2]?.id, room.h.characters[0]?.id]);
  expect(warnings(room)).toEqual([]);
});

test("ordinary human mentions schedule actual named seats without Utility", async () => {
  await using room = await smartRoom({ chat: ["Cara first.", "Bryn second."] }, { characters: THREE });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const result = await send(room, "cara, bryn: thoughts?");
  expect(result.messages.filter((m) => m.role === "assistant").map((m) => m.characterId)).toEqual([room.h.characters[2]?.id, room.h.characters[1]?.id]);
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toEqual([]);
});

test("a muted-only mention still asks Utility and never forces the muted seat", async () => {
  await using room = await smartRoom({ chat: ["Bryn answers."], picks: [["bryn"]] }, { characters: THREE });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  await muteCara(room);
  const result = await send(room, "@cara hello");
  expect(result.messages.filter((m) => m.role === "assistant").map((m) => m.characterId)).toEqual([room.h.characters[1]?.id]);
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toHaveLength(1);
});

test("a physical Utility refusal degrades to one eligible speaker and exact warning", async () => {
  await using room = await smartRoom({ chat: ["Natural fallback answers."], utilityFailure: true });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const result = await send(room);
  const assistants = result.messages.filter((m) => m.role === "assistant");
  expect(assistants).toHaveLength(1);
  expect(room.h.characters.map((c) => c.id)).toContain(assistants[0]?.characterId);
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toHaveLength(1);
  expect(warnings(room)).toEqual([{ type: "warning", chatId: room.h.chatId, code: "smart_arbitration_degraded" }]);
});

test("a saved Utility row without structured vehicles refuses free-text arbitration", async () => {
  await using room = await smartRoom({ chat: ["Natural fallback answers."] });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize", { key: "owned-incapable-utility-key", structured: false });
  const result = await send(room);
  const assistants = result.messages.filter((m) => m.role === "assistant");
  expect(assistants).toHaveLength(1);
  expect(room.h.characters.map((c) => c.id)).toContain(assistants[0]?.characterId);
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toEqual([]);
  expect(warnings(room)).toEqual([{ type: "warning", chatId: room.h.chatId, code: "smart_arbitration_degraded" }]);
});

test("withdrawing a working saved Utility binding degrades without a free-text replacement", async () => {
  await using room = await smartRoom({ chat: ["Bryn before withdrawal.", "Natural after withdrawal."], picks: [["bryn"]] });
  const utility = await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  expect((await send(room)).messages.filter((m) => m.role === "assistant").map((m) => m.characterId)).toEqual([room.h.characters[1]?.id]);
  expect(warnings(room)).toEqual([]);
  await room.h.root.services.connection.remove({ principal: room.h.owner, connectionId: utility.id });
  const result = await send(room, "and now?");
  expect(result.messages.filter((m) => m.role === "assistant")).toHaveLength(1);
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toHaveLength(1);
  expect(warnings(room)).toEqual([{ type: "warning", chatId: room.h.chatId, code: "smart_arbitration_degraded" }]);
});

test("off-roster native structured output never schedules an invented character", async () => {
  await using room = await smartRoom({ chat: ["Eligible fallback."], picks: [["Gandalf the Grey"], ["Gandalf the Grey"]] });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const result = await send(room);
  const assistants = result.messages.filter((m) => m.role === "assistant");
  expect(assistants).toHaveLength(1);
  expect(room.h.characters.map((c) => c.id)).toContain(assistants[0]?.characterId);
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toHaveLength(2);
  expect(warnings(room)).toEqual([{ type: "warning", chatId: room.h.chatId, code: "smart_arbitration_degraded" }]);
});

test("an eligible explicit human mention bypasses Smart without warning", async () => {
  await using room = await smartRoom({ chat: ["Bryn answers the mention."] }, { characters: THREE });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const result = await send(room, "@bryn hello");
  expect(result.messages.filter((m) => m.role === "assistant").map((m) => m.characterId)).toEqual([room.h.characters[1]?.id]);
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toEqual([]);
  expect(warnings(room)).toEqual([]);
});

test("a muted candidate in untrusted native output is rejected before scheduling", async () => {
  await using room = await smartRoom({ chat: ["Eligible fallback."], picks: [["cara"], ["cara"]] }, { characters: THREE });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  await muteCara(room);
  const result = await send(room);
  const assistants = result.messages.filter((m) => m.role === "assistant");
  expect(assistants).toHaveLength(1);
  expect(room.h.characters.slice(0, 2).map((c) => c.id)).toContain(assistants[0]?.characterId);
  expect(await speakerInputs(room.peer.requests, B_UTILITY_MODEL)).toHaveLength(2);
  expect(warnings(room)).toEqual([{ type: "warning", chatId: room.h.chatId, code: "smart_arbitration_degraded" }]);
});

test("public Stop closes held native arbitration without fallback or foreground generation", async () => {
  await using room = await smartRoom({ holdUtility: true, picks: [["bryn"]] });
  await saveSpeakerConnection(room.h, room.peer.baseUrl, "summarize");
  const sending = send(room);
  const settled = Promise.allSettled([sending]);
  try {
    await room.peer.reached;
    await room.h.root.services.chat.abort({ principal: room.h.owner, chatId: room.h.chatId });
    const outcome = await sending;
    expect(outcome).toMatchObject({ aborted: true, abortReason: "user" });
    await room.peer.closed;
    expect(outcome.messages.filter((m) => m.role === "assistant")).toEqual([]);
    expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
    expect(warnings(room)).toEqual([]);
    const canon = await readRoomCanon(room.h.root, room.h.owner, room.h.chatId);
    expect(canon.map((m) => m.role)).toEqual(["user"]);
    expect(canon[0]?.authorUserId).toBe(room.h.owner.userId);
    expect(room.events.filter((e) => e.type.startsWith("turn")).map((e) => e.type)).toEqual(["turnAccepted", "turnAborted"]);
    expect(room.events.find((e) => e.type === "turnAccepted")).toMatchObject({ intent: "send", speakerCharacterId: null, targetMessageId: null });
    expect(room.events.find((e) => e.type === "turnAborted")).toMatchObject({ intent: "send", reason: "user", automationDepth: 0 });
  } finally {
    room.peer.release();
    await room.h.root.services.chat.abort({ principal: room.h.owner, chatId: room.h.chatId });
    await settled;
  }
});
