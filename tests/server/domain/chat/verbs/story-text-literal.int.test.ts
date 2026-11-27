// @subject packages/kit/src/macro/registry.ts
// @subject packages/server/src/domain/chat/verbs/compaction.ts
// @subject packages/server/src/domain/chat/memory/recall/recall.ts
// @subject packages/server/src/domain/rpg/chat-ops/macro-view.ts

// D353: stored story text reaches its slot as literal text. A memory digest, a compaction summary (written by the
// room's model or carried in by an import) and a game-state beat the state round wrote all reach the host's turn
// with their macros inert: no room variable, no global variable, no name. The host preset's own section is the
// control: its macros still read and write.

import { declaredCapabilitySchema } from "@orb/contracts/inference";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG, promptSectionIdSchema } from "@orb/contracts/preset";
import { RPG_LITE_TOOL_NAMES, RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { buildChatBundleFile, CHAT_BUNDLE_EXT, parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import { finiteReplies, makePromptConfig, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readCompactionMarker,
} from "@orb/testkit/node/composed";
import { documentRoom, embedDocuments, sendTurn } from "../handoff-attachments-physical.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom, wireOf, wireText } from "../scenario-physical.ts";

const STORED = "{{setvar::seized::1}}{{setglobalvar::seized::1}}{{{setvar::run::1}}} keeper {{char}} and {{{user}}} end";
const CONTROL = "{{setvar::control::1}}{{setglobalvar::control::1}}Globals seized=[{{getglobalvar::seized}}] control=[{{getglobalvar::control}}]";
const INTENT = { maxContextTokens: 32_000, maxOutputTokens: 128 };

/** The host preset: its own control section, then the shipped sections, which place the story slots. */
function controlPreset(extra = ""): ReturnType<typeof makePromptConfig> {
  return makePromptConfig({
    sections: [
      { type: "literal", id: promptSectionIdSchema.parse("story-control"), name: "Control", role: "system", content: `${CONTROL}${extra}`, enabled: true },
      ...DEFAULT_PROMPT_CONFIG.sections,
    ],
  });
}

/** The text's words, with braces and invisible separators folded to single spaces: an evaluated macro loses its name. */
function words(text: string): string {
  return text.replace(/[^\p{L}\p{N}:=]+/gu, " ").trim();
}

async function roomVariables(h: ChatRoot, chatId = h.chatId): Promise<Record<string, string>> {
  return await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId });
}

/** The stored text is on the wire as typed, and the names it holds were not substituted. */
function expectLiteral(h: ChatRoot, wire: string): void {
  const keeper = present(h.characters[0]).name;
  expect(words(wire)).toContain(words(STORED));
  expect(wire).not.toContain(`keeper ${keeper}`);
}

async function sendIn(h: ChatRoot, chatId: ChatRoot["chatId"], content: string): Promise<string> {
  const { outcome, newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId, content, timeZone: UTC_TIME_ZONE }));
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();
  return wireText(newest);
}

async function commitHistory(h: ChatRoot, chatId = h.chatId): Promise<void> {
  for (const content of ["The gate stands open.", "The traveller steps through."]) {
    await h.root.services.chat.commitMessage({ principal: h.owner, chatId, content, timeZone: UTC_TIME_ZONE });
  }
}

test("a memory digest that copied a member's macros reaches the host's turn as literal text", async () => {
  await using h = await documentRoom(["Only reply."], {
    summary: { anchor: "A gate scene", facts: STORED, keywords: ["gate"] },
    promptConfig: controlPreset(),
  });
  const member = await invitePerson(h);
  await h.root.services.chat.commitMessage({ principal: member, chatId: h.chatId, content: "Remember this: {{{setvar::seized::1}}}", timeZone: UTC_TIME_ZONE });
  await embedDocuments(h, h.owner, [h.owner]);

  const { wire } = await sendTurn(h, h.owner, "Tell me about the gate.");

  expectLiteral(h, wire);
  expect(await roomVariables(h)).toEqual({ control: "1" });
});

test("a compaction summary the model wrote reaches the turn as literal text and writes no room or global variable", async () => {
  await using h = await textRoom([STORED, "First reply.", "Second reply."], { promptConfig: controlPreset() });
  await commitHistory(h);
  await h.root.services.chat.compact({ principal: h.owner, chatId: h.chatId, signal: new AbortController().signal });
  expect((await readCompactionMarker(h.root, h.owner, h.chatId)).compactSummary).toBe(STORED);

  expectLiteral(h, await sendIn(h, h.chatId, "Where are we?"));
  expect(await roomVariables(h)).toEqual({ control: "1" });
  // A later turn reads the global plane: the host's own write landed, the summary's did not.
  expect(await sendIn(h, h.chatId, "And now?")).toContain("Globals seized=[] control=[1]");
  expect(await h.root.services.automation.getGlobalVariable({ principal: h.owner, key: "seized" })).toBeNull();
});

test("an imported room's stored summary reaches its first turn as literal text", async () => {
  await using h = await textRoom(["Imported reply."], { promptConfig: controlPreset() });
  await commitHistory(h);
  const exported = await h.root.app.exportService.exportChatBundle({ principal: h.owner, chatId: h.chatId });
  const parsed = exported === null ? null : parseChatBundleFile(exported.bytes);
  if (parsed === null || !parsed.ok) {
    throw new Error("the room produced no readable chat bundle");
  }
  const descriptor = present(h.root.app.portability.find((entity) => entity.kind === "chat"));
  const bytes = buildChatBundleFile({ ...parsed.value, compactSummary: STORED, compactedAtSeq: 1 });
  expect(await descriptor.importFile(h.owner.userId, { filename: `${present(h.characters[0]).handle}/stored${CHAT_BUNDLE_EXT}`, bytes })).toMatchObject({
    ok: true,
  });
  const imported = present((await h.root.services.chat.listChats({ principal: h.owner })).items.find((room) => room.id !== h.chatId)).id;

  expectLiteral(h, await sendIn(h, imported, "Where are we?"));
  expect(await roomVariables(h, imported)).toEqual({ control: "1" });
});

test("a guided steer that quotes a member's message reaches the turn as typed and writes nothing", async () => {
  const member = "{{setvar::seized::1}}{{{setvar::run::1}}} hold the gate";
  await using h = await textRoom(["Steered reply."], {
    promptConfig: {
      ...controlPreset(),
      guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "Steer from [{{lastUserMessage}}] {{input}}", role: "system" } },
    },
  });
  const guest = await invitePerson(h);
  await h.root.services.chat.commitMessage({ principal: guest, chatId: h.chatId, content: member, timeZone: UTC_TIME_ZONE });

  // An empty send: the member's message stays the last user message the guided template reads.
  const { newest } = await wireOf(h, () =>
    h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, guided: { action: "response", input: "go" } }),
  );
  await h.root.settleBackground();

  expect(words(wireText(newest))).toContain(words(`Steer from [${member}] go`));
  expect(await roomVariables(h)).toEqual({ control: "1" });
});

test("a game beat the state round wrote reaches the next turn's scene macro as literal text", async () => {
  using plan = finiteReplies("story game", [
    [{ name: RPG_LITE_TOOL_NAMES[2], argumentsJson: JSON.stringify({ location: "The gate", recentEvent: STORED }) }],
    [{ name: RPG_NO_CHANGES_TOOL, argumentsJson: "{}" }],
  ]);
  const execution = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller waits.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => ({ text: "The traveller waits.", toolCalls: plan.take() }),
  });
  await using h = await createChatRoot({ providerFetch: execution.execute, memoryEnabled: false, promptConfig: controlPreset("SCENE[{{rpgSceneState}}]") });
  // The state round offers its tools only to a connection that declares tool calls.
  const text = present((await h.root.services.connection.list({ principal: h.owner })).find((connection) => connection.declared?.generation !== undefined));
  await h.root.services.connection.update({
    principal: h.owner,
    connectionId: text.id,
    patch: {
      declared: declaredCapabilitySchema.parse({
        ...text.declared,
        generation: { ...text.declared?.generation, tools: { parallel: true, silencesProse: false } },
      }),
    },
  });
  await h.caller.rpg.createGame({ chatId: h.chatId, mode: "lite" });
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Enter the gate.", intent: INTENT })).aborted).toBe(false);
  await h.root.settleBackground();

  const { newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Look around.", intent: INTENT }));
  await h.root.settleBackground();

  // The scene macro's own block, not the narrator's game notes, which carry the same beat.
  const wire = wireText(newest);
  const scene = /SCENE\[([^\]]*)\]/u.exec(wire)?.[1] ?? "";
  expectLiteral(h, scene);
  expect(await roomVariables(h)).toEqual({ control: "1" });
});
