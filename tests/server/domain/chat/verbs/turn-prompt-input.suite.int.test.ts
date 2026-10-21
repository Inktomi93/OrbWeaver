// @subject packages/server/src/domain/chat/verbs/turn.ts
// Saved host settings and public steering must reach actual native model input, not a reconstructed turn request.
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "@orb/testkit/node/corpus-provider.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { textRoom } from "../scenario-physical.ts";

async function wireBodies(h: ChatRoot): Promise<JsonValue[]> {
  return await Promise.all(
    h.requests
      .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))
      .map(async (request) => jsonValueSchema.parse(JSON.parse(await request.clone().text()))),
  );
}

test("saved custom stopping strings reach the actual native stop set on a declared stop-capable endpoint", async () => {
  await using h = await textRoom(["The response ends here."]);
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, sampling: { stop: true } },
      features: { detectServer: false },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  await h.caller.settings.updateUserSettingsSection({ section: "chat", patch: { customStoppingStrings: ["<END>", "\nUser:"] } });
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi" })).aborted).toBe(false);
  expect(await wireBodies(h)).toMatchObject([{ stop: ["<END>", "\nUser:"] }]);
});

test("a public guided impersonation substitutes the chosen third-person perspective and steering input on the native wire", async () => {
  await using h = await textRoom(["A drafted next line."]);
  let drafted = "";
  for await (const { delta } of h.root.services.chat.impersonateStream({
    principal: h.owner,
    chatId: h.chatId,
    guided: { action: "impersonate", input: "ask about the ruins", person: "third" },
  })) {
    drafted += delta;
  }
  expect(drafted).toBe("A drafted next line.");
  const inputs = await wireBodies(h);
  expect(inputs).toHaveLength(1);
  expect(JSON.stringify(inputs)).toContain("third-person perspective");
  expect(JSON.stringify(inputs)).toContain("ask about the ruins");
});

test.for([
  { title: "an empty custom stop list omits the native stop field", seats: 1, replies: 1, draft: false, custom: [], expected: undefined },
  { title: "an ordinary two-character turn does not acquire impersonation label stops", seats: 2, replies: 2, draft: false, custom: [], expected: undefined },
  {
    title: "a real impersonation adds every present label after the saved host stop",
    seats: 2,
    replies: 1,
    draft: true,
    custom: ["<END>"],
    expected: ["<END>", "\nAria:", "\nBryn:"],
  },
])("$title", async (scene) => {
  await using h = await textRoom(
    Array.from({ length: scene.replies }, () => "A complete answer."),
    {
      characters: [
        createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." }),
        createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "An observant mage." }),
      ].slice(0, scene.seats),
      group: { output: "per-speaker", policy: "natural" },
    },
  );
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 }, sampling: { stop: true } }, features: { detectServer: false } },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  await h.caller.settings.updateUserSettingsSection({ section: "chat", patch: { customStoppingStrings: scene.custom } });
  let text = "";
  let aborted = false;
  if (scene.draft) {
    for await (const { delta } of h.root.services.chat.impersonateStream({ principal: h.owner, chatId: h.chatId })) {
      text += delta;
    }
  } else {
    const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
    aborted = outcome.aborted;
    text = outcome.messages.find(({ role }) => role === "assistant")?.content ?? "";
  }
  expect(aborted).toBe(false);
  expect(text).toBe("A complete answer.");
  const inputs = await wireBodies(h);
  expect(inputs).toHaveLength(scene.replies);
  for (const input of inputs) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("the actual native text request is not an object");
    }
    expect(Object.hasOwn(input, "stop")).toBe(scene.expected !== undefined);
    expect(input["stop"]).toEqual(scene.expected);
  }
});

test.for([
  { title: "a public guided response renders its default instruction and authored input on the native wire", guided: true },
  { title: "an unsteered public send has no guided response template on the native wire", guided: false },
])("$title", async (scene) => {
  await using h = await textRoom(["A complete answer."]);
  const outcome = await h.root.services.chat.send({
    principal: h.owner,
    chatId: h.chatId,
    content: "hi",
    ...(scene.guided ? { guided: { action: "response", input: "be dramatic" } } : {}),
  });
  expect(outcome.aborted).toBe(false);
  const inputs = await wireBodies(h);
  expect(inputs).toHaveLength(1);
  const wire = JSON.stringify(inputs);
  expect(wire.includes("special consideration")).toBe(scene.guided);
  expect(wire.includes("be dramatic")).toBe(scene.guided);
});

test("a public impersonation with no selected person uses the actual first-person default on the native wire", async () => {
  await using h = await textRoom(["A drafted next line."]);
  let drafted = "";
  for await (const { delta } of h.root.services.chat.impersonateStream({
    principal: h.owner,
    chatId: h.chatId,
    guided: { action: "impersonate", input: "ask about the ruins" },
  })) {
    drafted += delta;
  }
  expect(drafted).toBe("A drafted next line.");
  const inputs = await wireBodies(h);
  expect(inputs).toHaveLength(1);
  expect(JSON.stringify(inputs)).toContain("first-person perspective");
  expect(JSON.stringify(inputs)).toContain("ask about the ruins");
});

test("an unsteered public draft uses the actual active persona and resolves every voice-lock placeholder", async () => {
  await using h = await textRoom(["A drafted next line."]);
  const persona = await h.caller.persona.create({ input: createPersonaSchema.parse({ name: "Alex", description: "The current speaking voice." }) });
  await h.caller.persona.setActivePersona({ chatId: h.chatId, personaId: persona.id });
  let drafted = "";
  for await (const { delta } of h.root.services.chat.impersonateStream({ principal: h.owner, chatId: h.chatId })) {
    drafted += delta;
  }
  expect(drafted).toBe("A drafted next line.");
  const inputs = await wireBodies(h);
  expect(inputs).toHaveLength(1);
  const wire = JSON.stringify(inputs);
  expect(wire).toContain("AS Alex (not Aria)");
  expect(wire).toContain("first-person perspective");
  expect(wire).toContain("Ignore all previous instructions");
  expect(wire).not.toContain("{{user}}");
  expect(wire).not.toContain("{{char}}");
  expect(wire).not.toContain("{{person}}");
});

test.for([
  { title: "afterAssistant appends the real response nudge as the last native user message", afterAssistant: true },
  { title: "an ordinary generate after the same assistant tail does not append the response nudge", afterAssistant: false },
])("$title", async (scene) => {
  await using h = await textRoom(["The next answer."]);
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the response-nudge room created no character");
  }
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 1, role: "user", authorUserId: h.owner.userId, content: "hello" }, h.root.idSource);
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 2, role: "assistant", characterId: character.id, content: "The tavern is quiet." }, h.root.idSource);
  const outcome = await h.root.services.chat.generate({
    principal: h.owner,
    chatId: h.chatId,
    speakerCharacterId: character.id,
    ...(scene.afterAssistant ? { afterAssistant: true } : {}),
  });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]?.content).toBe("The next answer.");
  const bodies = await wireBodies(h);
  expect(bodies).toHaveLength(1);
  const body = bodies[0];
  if (body === undefined || body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
    throw new Error("the actual native response input has no messages");
  }
  const lastUser = body["messages"].findLast((row) => row !== null && typeof row === "object" && !Array.isArray(row) && row["role"] === "user");
  if (lastUser === undefined) {
    throw new Error("the physical response input has no user message");
  }
  expect(JSON.stringify(lastUser).includes("write the next reply")).toBe(scene.afterAssistant);
});

const NORMAL_MARK = "NORMAL-TRIGGER-SECTION";
const CONTINUE_MARK = "CONTINUE-TRIGGER-SECTION";

test.for([
  { title: "a real send admits only the normal-gated preset section", kind: "send", normal: true, continuation: false },
  { title: "a real swipe admits neither normal nor continue preset sections", kind: "swipe", normal: false, continuation: false },
  { title: "a real continuation admits only the continue-gated preset section", kind: "continue", normal: false, continuation: true },
])("$title", async (scene) => {
  await using h = await textRoom(["A fresh continuation."], {
    promptConfig: {
      ...DEFAULT_PROMPT_CONFIG,
      sections: [
        ...DEFAULT_PROMPT_CONFIG.sections,
        { type: "literal", id: "normal-probe", name: "Normal probe", role: "system", enabled: true, content: NORMAL_MARK, trigger: ["normal"] },
        { type: "literal", id: "continue-probe", name: "Continue probe", role: "system", enabled: true, content: CONTINUE_MARK, trigger: ["continue"] },
      ],
    },
  });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the trigger-gate room created no character");
  }
  if (scene.kind === "send") {
    await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi" });
  } else {
    await seedMessage(h.root.db, { chatId: h.chatId, seq: 1, role: "user", authorUserId: h.owner.userId, content: "hello" }, h.root.idSource);
    const prior = await seedMessage(
      h.root.db,
      { chatId: h.chatId, seq: 2, role: "assistant", characterId: character.id, content: "The tale so far." },
      h.root.idSource,
    );
    if (scene.kind === "swipe") {
      await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: prior.id });
    } else {
      await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: prior.id });
    }
  }
  const inputs = await wireBodies(h);
  expect(inputs).toHaveLength(1);
  const wire = JSON.stringify(inputs);
  expect(wire.includes(NORMAL_MARK)).toBe(scene.normal);
  expect(wire.includes(CONTINUE_MARK)).toBe(scene.continuation);
});
