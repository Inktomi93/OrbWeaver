// @subject packages/server/src/domain/chat/verbs/turn.ts
// Saved host settings and public steering must reach actual native model input, not a reconstructed turn request.

import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import { DEFAULT_PROMPT_CONFIG, promptSectionIdSchema } from "@orb/contracts/preset";
import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, readRoomCanon } from "@orb/testkit/node/composed";
import type { WireOf } from "../scenario-physical.ts";
import { openingOf, openingText, textRoom, wireOf, wireText } from "../scenario-physical.ts";

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
  const { outcome, bodies } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi" }));
  expect(outcome.aborted).toBe(false);
  expect(bodies).toMatchObject([{ stop: ["<END>", "\nUser:"] }]);
});

type DraftParams = Omit<Parameters<ChatRoot["root"]["services"]["chat"]["impersonateStream"]>[0], "principal" | "chatId">;

/** Drain one impersonation draft and return its text with the requests it sent. */
async function drainDraft(h: ChatRoot, params: DraftParams = {}): Promise<WireOf<string>> {
  return await wireOf(h, async () => {
    let text = "";
    for await (const { delta } of h.root.services.chat.impersonateStream({ principal: h.owner, chatId: h.chatId, ...params })) {
      text += delta;
    }
    return text;
  });
}

test("a public guided impersonation substitutes the chosen third-person perspective and steering input on the native wire", async () => {
  await using h = await textRoom(["A drafted next line."]);
  const { outcome: draft, bodies: inputs } = await drainDraft(h, { guided: { action: "impersonate", input: "ask about the ruins", person: "third" } });
  expect(draft).toBe("A drafted next line.");
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
  const { outcome, bodies: inputs } = scene.draft
    ? await wireOf(h, async () => ({ aborted: false, text: (await drainDraft(h)).outcome }))
    : await wireOf(h, async () => {
        const sent = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hello" });
        return { aborted: sent.aborted, text: sent.messages.find(({ role }) => role === "assistant")?.content ?? "" };
      });
  expect(outcome.aborted).toBe(false);
  expect(outcome.text).toBe("A complete answer.");
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
  const { outcome, bodies: inputs } = await wireOf(h, () =>
    h.root.services.chat.send({
      principal: h.owner,
      chatId: h.chatId,
      content: "hi",
      ...(scene.guided ? { guided: { action: "response", input: "be dramatic" } } : {}),
    }),
  );
  expect(outcome.aborted).toBe(false);
  expect(inputs).toHaveLength(1);
  const wire = JSON.stringify(inputs);
  expect(wire.includes("special consideration")).toBe(scene.guided);
  expect(wire.includes("be dramatic")).toBe(scene.guided);
});

test("a public impersonation with no selected person uses the actual first-person default on the native wire", async () => {
  await using h = await textRoom(["A drafted next line."]);
  const { outcome: draft, bodies: inputs } = await drainDraft(h, { guided: { action: "impersonate", input: "ask about the ruins" } });
  expect(draft).toBe("A drafted next line.");
  expect(inputs).toHaveLength(1);
  expect(JSON.stringify(inputs)).toContain("first-person perspective");
  expect(JSON.stringify(inputs)).toContain("ask about the ruins");
});

test("an unsteered public draft uses the actual active persona and resolves every voice-lock placeholder", async () => {
  await using h = await textRoom(["A drafted next line."]);
  const persona = await h.caller.persona.create({ input: createPersonaSchema.parse({ name: "Alex", description: "The current speaking voice." }) });
  await h.caller.persona.setActivePersona({ chatId: h.chatId, personaId: persona.id });
  const { outcome: draft, bodies: inputs } = await drainDraft(h);
  expect(draft).toBe("A drafted next line.");
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
  await using h = await textRoom(["The next answer."], {
    transcript: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "The tavern is quiet." },
    ],
  });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the response-nudge room created no character");
  }
  const { outcome, bodies } = await wireOf(h, () =>
    h.root.services.chat.generate({
      principal: h.owner,
      chatId: h.chatId,
      speakerCharacterId: character.id,
      ...(scene.afterAssistant ? { afterAssistant: true } : {}),
    }),
  );
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]?.content).toBe("The next answer.");
  expect(bodies).toHaveLength(1);
  const body = bodies[0];
  if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
    throw new Error("the actual native response input has no messages");
  }
  const lastUser = body["messages"].findLast((row) => row !== null && typeof row === "object" && !Array.isArray(row) && row["role"] === "user");
  if (lastUser === undefined) {
    throw new Error("the physical response input has no user message");
  }
  expect(JSON.stringify(lastUser).includes("write the next reply")).toBe(scene.afterAssistant);
  expect(openingText(body)).toBe(openingOf("hello"));
});

const REWRITE_TARGET = "The lantern gutters as the stranger steps inside.";
const REWRITE_STEER = "make it terse";

/** Swipe the room's seeded reply, steered or not, and return the one provider request with the outcome's replies. */
async function swipeSeededReply(guided: boolean): Promise<{ readonly body: JsonValue; readonly wire: string; readonly replies: readonly string[] }> {
  await using h = await textRoom(["The lantern flares."], {
    transcript: [
      { role: "user", content: "hello" },
      { role: "assistant", content: REWRITE_TARGET },
    ],
  });
  const prior = (await readRoomCanon(h.root, h.owner, h.chatId)).findLast(({ role }) => role === "assistant");
  if (prior === undefined) {
    throw new Error("the rewrite transcript wrote no prior reply");
  }
  const { outcome, bodies } = await wireOf(h, () =>
    h.root.services.chat.swipe({
      principal: h.owner,
      chatId: h.chatId,
      messageId: prior.id,
      ...(guided ? { guided: { action: "rewrite", input: REWRITE_STEER } } : {}),
    }),
  );
  expect(bodies).toHaveLength(1);
  return { body: bodies[0], wire: wireText(bodies[0]), replies: outcome.messages.map(({ content }) => content) };
}

test("a guided rewrite sends the reply it rewrites, then its instruction as the closing user turn", async () => {
  const { body, replies } = await swipeSeededReply(true);
  expect(replies).toEqual(["The lantern flares."]);
  if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
    throw new Error("the actual native rewrite request has no messages");
  }
  // A trailing assistant row would read as a prefill to continue, so the instruction must close the request.
  expect(body["messages"].slice(-2)).toMatchObject([
    { role: "assistant", content: REWRITE_TARGET },
    { role: "user", content: expect.stringContaining(REWRITE_STEER) },
  ]);
});

test("an unguided swipe of the same reply regenerates from the context before it", async () => {
  const { wire, replies } = await swipeSeededReply(false);
  expect(replies).toEqual(["The lantern flares."]);
  expect(wire).toContain("hello");
  expect(wire).not.toContain(REWRITE_TARGET);
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
        {
          type: "literal",
          id: promptSectionIdSchema.parse("normal-probe"),
          name: "Normal probe",
          role: "system",
          enabled: true,
          content: NORMAL_MARK,
          trigger: ["normal"],
        },
        {
          type: "literal",
          id: promptSectionIdSchema.parse("continue-probe"),
          name: "Continue probe",
          role: "system",
          enabled: true,
          content: CONTINUE_MARK,
          trigger: ["continue"],
        },
      ],
    },
    ...(scene.kind === "send"
      ? {}
      : {
          transcript: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "The tale so far." },
          ],
        }),
  });
  const prior = (await readRoomCanon(h.root, h.owner, h.chatId)).findLast(({ role }) => role === "assistant");
  const { bodies: inputs } = await wireOf(h, async () => {
    if (scene.kind === "send") {
      await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi" });
      return;
    }
    if (prior === undefined) {
      throw new Error("the trigger-gate transcript wrote no prior reply");
    }
    if (scene.kind === "swipe") {
      await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: prior.id });
    } else {
      await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: prior.id });
    }
  });
  expect(inputs).toHaveLength(1);
  // The send room is born empty, so its opening row is the live send; the others open on the seeded line. A trigger
  // section may append to the tail user row, so the opening is matched as a prefix.
  expect(openingText(inputs[0]).startsWith(openingOf(scene.kind === "send" ? "hi" : "hello"))).toBe(true);
  const wire = JSON.stringify(inputs);
  expect(wire.includes(NORMAL_MARK)).toBe(scene.normal);
  expect(wire.includes(CONTINUE_MARK)).toBe(scene.continuation);
});
