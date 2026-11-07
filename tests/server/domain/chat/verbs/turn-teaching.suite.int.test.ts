// @subject packages/server/src/domain/chat/teaching-contribution.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
// What the model is taught on a real turn, read from the native provider bytes: the choices teach (its frame, the
// host's override, the game's own copy) and the react tool's attachment. Knob precedence for the choices teach has
// its own cases in turn-offer-choices.suite.int.test.ts.
import { CHAT_REACT_TOOL_NAME } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { PROSE_SLOTS, resolveProseText } from "@orb/contracts/prose";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { connectDevice } from "@orb/testkit/node/composed";
import { REACTION_ANONYMOUS_REACTOR, REACTION_WHOLE_MESSAGE_TARGET, reactionNote } from "#server/domain/chat/substrate/reaction-note.ts";
import { coreProse } from "../engine/core-physical.ts";
import { inputMessages, invitePerson, messageText, personaInputs, personaRoom, seatPersona } from "../persona-cache-physical.ts";
import { textRoom, wireBodies, wireText } from "../scenario-physical.ts";
import { TAIL_ROSTER } from "./turn-lifetimes-roster.ts";
import { turnRpgReply, turnRpgRoom, turnToolsRoom, turnWireBody } from "./turn-rpg-physical.ts";

const CHOICES_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text;

function framed(teach: string, prose: ProseOverrides = {}): string {
  return resolveProseText("chat.teach.choicesFrame", prose, { teach });
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

async function send(h: ChatRoot): Promise<void> {
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "hi" });
  expect(outcome.aborted).toBe(false);
}

async function newestWire(h: ChatRoot): Promise<string> {
  const body = (await wireBodies(h)).at(-1);
  if (body === undefined) {
    throw new Error("the room made no chat-completions request");
  }
  return wireText(body);
}

/** Run one turn and read the request it made; the flush it schedules settles first, so no bytes cross turns. */
async function newestWireAfter(h: ChatRoot, turn: () => Promise<{ readonly aborted: boolean }>): Promise<string> {
  expect((await turn()).aborted).toBe(false);
  await h.root.settleBackground();
  return await newestWire(h);
}

test("the choices teach reaches the model inside its frame, and the frame is the host's to replace", async () => {
  const prose: ProseOverrides = { "chat.teach.choicesFrame": { text: "<<{{teach}}>>", baseVersion: 1 } };
  await using shipped = await textRoom(["ok"]);
  await shipped.root.services.chat.setOfferChoices({ principal: shipped.owner, chatId: shipped.chatId, enabled: true });
  await send(shipped);
  expect(occurrences(await newestWire(shipped), framed(CHOICES_TEACH))).toBe(1);

  await using custom = await textRoom(["ok"], { promptConfig: { ...DEFAULT_PROMPT_CONFIG, prose } });
  await custom.root.services.chat.setOfferChoices({ principal: custom.owner, chatId: custom.chatId, enabled: true });
  await send(custom);
  const wire = await newestWire(custom);
  expect(occurrences(wire, `<<${CHOICES_TEACH}>>`)).toBe(1);
  expect(wire).not.toContain(framed(CHOICES_TEACH));
});

test("a host's rewrite of the teach is what the model reads, with {{user}} and {{char}} rendered as names", async () => {
  const override = "Offer {{user}} three ways to answer {{char}}.";
  const prose: ProseOverrides = { "rpg.reminder.cyoaTeach": { text: override, baseVersion: 1 } };
  await using h = await personaRoom(["ok", "ok"], { promptConfig: { ...DEFAULT_PROMPT_CONFIG, prose } });
  await h.root.services.chat.setOfferChoices({ principal: h.owner, chatId: h.chatId, enabled: true });
  const [character] = h.characters;
  if (character === undefined) {
    throw new Error("the persona room seated no character");
  }

  await send(h);
  const bare = wireText((await personaInputs(h)).at(-1) ?? null);
  expect(bare).toContain(framed(`Offer ${DEFAULT_PERSONA_NAME} three ways to answer ${character.name}.`, prose));
  expect(bare).not.toContain("{{user}}");
  expect(bare).not.toContain(CHOICES_TEACH);

  await seatPersona(h, h.owner, "Alex", "A traveller.");
  await send(h);
  const named = wireText((await personaInputs(h)).at(-1) ?? null);
  expect(named).toContain(framed(`Offer Alex three ways to answer ${character.name}.`, prose));
});

test("in a labelled multi-human room the teach never reads as part of the player's line", async () => {
  await using h = await personaRoom(["ok"]);
  const bob = await invitePerson(h);
  const online = new AbortController();
  using _presence = { [Symbol.dispose]: (): void => online.abort() };
  await connectDevice(h.root, h.owner.userId, online.signal);
  await connectDevice(h.root, bob.userId, online.signal);
  await h.root.services.chat.setOfferChoices({ principal: h.owner, chatId: h.chatId, enabled: true });
  await seatPersona(h, h.owner, "Alice", "A guide.");
  const outcome = await h.root.services.chat.send({ principal: bob, chatId: h.chatId, content: "bob speaks" });
  expect(outcome.aborted).toBe(false);
  const rows = inputMessages((await personaInputs(h)).at(-1) ?? null).map(messageText);
  const line = rows.find((row) => row.includes("bob speaks"));
  expect(line).toBeDefined();
  expect(line).not.toContain(CHOICES_TEACH);
  expect(rows.filter((row) => row.includes(CHOICES_TEACH))).toEqual([framed(CHOICES_TEACH)]);
});

test("the player's dice stamp is honoured by the turns answering it and by no later turn", async () => {
  const roll = PROSE_SLOTS["rpg.reminder.playerRolledDice"].text;
  await using h = await turnRpgRoom(Array.from({ length: 5 }, () => (): Response => turnRpgReply("The keeper nods.")));
  const params = { principal: h.owner, chatId: h.chatId };
  const { stamp } = await h.root.services.rpg.rollDice({ ...params, notation: "d20" });
  const rolled = await newestWireAfter(h, () => h.root.services.chat.send({ ...params, content: `I leap the gap. ${stamp}` }));
  expect(occurrences(rolled, roll)).toBe(1);

  const reply = (await h.root.services.chat.listMessages(params)).messages.findLast(({ role }) => role === "assistant");
  if (reply === undefined) {
    throw new Error("the rolled send wrote no reply");
  }
  // A swipe of the answering slot reads the stored message: it carries no pending text of its own.
  const swiped = await newestWireAfter(h, () => h.root.services.chat.swipe({ ...params, messageId: reply.id }));
  expect(occurrences(swiped, roll)).toBe(1);

  const generated = await newestWireAfter(h, () => h.root.services.chat.generate(params));
  expect(generated).not.toContain(roll);

  const plain = await newestWireAfter(h, () => h.root.services.chat.send({ ...params, content: "I walk on." }));
  expect(plain).not.toContain(roll);

  const oldSwipe = await newestWireAfter(h, () => h.root.services.chat.swipe({ ...params, messageId: reply.id }));
  expect(oldSwipe).not.toContain(roll);
});

const ROLL_NOTE = PROSE_SLOTS["rpg.reminder.playerRolledDice"].text;
const STAMP = "[dice: d20 → 7]";

function replies(count: number): (() => Response)[] {
  return Array.from({ length: count }, () => (): Response => turnRpgReply("The keeper nods."));
}

/** Whether each provider request so far carried the roll note, oldest first. */
async function rollNotes(h: ChatRoot): Promise<boolean[]> {
  return (await wireBodies(h)).map((body) => wireText(body).includes(ROLL_NOTE));
}

test("an auto-mode beat answers another character, so only the turns answering the player's stamp carry the note", async () => {
  await using h = await turnRpgRoom(replies(4), {
    characters: TAIL_ROSTER.slice(0, 2),
    group: { output: "per-speaker", policy: "list", allowSelfResponses: false, autoMode: true, autoModeMaxTurns: 2, autoModeDelayMs: 0 },
  });
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: `I leap. ${STAMP}` });
  await h.root.settleBackground();
  // The group send's two speakers both answer the player; the two chained beats answer each other.
  expect(await rollNotes(h)).toEqual([true, true, false, false]);
});

test("a generate on the stamped tail answers it; a generate on any later tail does not", async () => {
  await using h = await turnRpgRoom(replies(2));
  const params = { principal: h.owner, chatId: h.chatId };
  await h.root.services.chat.commitMessage({ ...params, content: `I leap. ${STAMP}` });
  await h.root.services.chat.generate(params);
  await h.root.settleBackground();
  await h.root.services.chat.generate(params);
  await h.root.settleBackground();
  expect(await rollNotes(h)).toEqual([true, false]);
});

test("a hidden stamped message is off the wire, so a swipe is not told its roll", async () => {
  await using h = await turnRpgRoom(replies(2));
  const params = { principal: h.owner, chatId: h.chatId };
  await h.root.services.chat.send({ ...params, content: `I leap. ${STAMP}` });
  await h.root.settleBackground();
  const { messages } = await h.root.services.chat.listMessages(params);
  const user = messages.find(({ role }) => role === "user");
  const reply = messages.findLast(({ role }) => role === "assistant");
  if (user === undefined || reply === undefined) {
    throw new Error("the send wrote no rows");
  }
  await h.root.services.chat.setMessageHidden({ ...params, messageId: user.id, hidden: true });
  await h.root.services.chat.swipe({ ...params, messageId: reply.id });
  await h.root.settleBackground();
  expect(await rollNotes(h)).toEqual([true, false]);
});

test("a USER_INPUT regex that strips the stamp leaves nothing for the note to answer", async () => {
  await using h = await turnRpgRoom(replies(1));
  const script = await h.root.services.regex.createScript({
    principal: h.owner,
    input: createRegexScriptSchema.parse({ name: "Strip dice", findRegex: "/\\[dice:[^\\]]*\\]/g", replaceString: "", placement: ["USER_INPUT"] }),
  });
  await h.root.services.regex.attachGlobal({ principal: h.owner, scriptId: script.id });
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: `I leap. ${STAMP}` });
  await h.root.settleBackground();
  const wire = wireText((await wireBodies(h)).at(-1) ?? null);
  expect(wire).toContain("I leap.");
  expect(wire).not.toContain(STAMP);
  expect(wire).not.toContain(ROLL_NOTE);
});

test("a dice stamp quoted as code is not a roll", async () => {
  const roll = PROSE_SLOTS["rpg.reminder.playerRolledDice"].text;
  await using h = await turnRpgRoom([(): Response => turnRpgReply("The keeper nods.")]);
  const params = { principal: h.owner, chatId: h.chatId };
  const { stamp } = await h.root.services.rpg.rollDice({ ...params, notation: "d20" });
  const wire = await newestWireAfter(h, () => h.root.services.chat.send({ ...params, content: `Rolls look like \`${stamp}\`.` }));
  expect(wire).not.toContain(roll);
});

const GAME_ARMS = [
  { title: "a game that already teaches the choices stands the room's own teach down", cyoa: true, room: true, taught: 1, framedCount: 0 },
  { title: "the game's own teach alone is taught once, unframed", cyoa: true, room: false, taught: 1, framedCount: 0 },
  { title: "a game that does not teach the choices leaves the room's teach standing, framed", cyoa: false, room: true, taught: 1, framedCount: 1 },
  { title: "neither the game nor the room teaches the choices", cyoa: false, room: false, taught: 0, framedCount: 0 },
] as const;

test.for(GAME_ARMS)("$title", async (arm) => {
  await using h = await turnRpgRoom([(): Response => turnRpgReply("The keeper nods.")]);
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, patch: { cyoa: arm.cyoa } });
  await h.root.services.chat.setOfferChoices({ principal: h.owner, chatId: h.chatId, enabled: arm.room });
  await send(h);
  const body = (await wireBodies(h)).at(-1);
  if (body === undefined) {
    throw new Error("the game turn reached no provider");
  }
  const wire = wireText(body);
  expect(occurrences(wire, CHOICES_TEACH)).toBe(arm.taught);
  expect(occurrences(wire, framed(CHOICES_TEACH))).toBe(arm.framedCount);
});

test("a host's rewrite of the teach is the one teach on a game turn that also has the room's knob on", async () => {
  const rewrite = "CHOICES: offer three, in the voice of the scene.";
  const prose: ProseOverrides = { "rpg.reminder.cyoaTeach": { text: rewrite, baseVersion: 1 } };
  await using h = await turnRpgRoom([(): Response => turnRpgReply("The keeper nods.")], { promptConfig: { ...DEFAULT_PROMPT_CONFIG, prose } });
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, patch: { cyoa: true } });
  await h.root.services.chat.setOfferChoices({ principal: h.owner, chatId: h.chatId, enabled: true });
  await send(h);
  const wire = await newestWire(h);
  // Both resolutions read the host's rewrite, so the containment check sees a duplicate and the room stands down.
  expect(occurrences(wire, rewrite)).toBe(1);
  expect(occurrences(wire, CHOICES_TEACH)).toBe(0);
});

test("a game's state block is accounted under its own budget source and reaches the model, and a plain chat has none", async () => {
  await using game = await turnRpgRoom([(): Response => turnRpgReply("The keeper nods.")]);
  const preview = await game.root.services.chat.previewAssembly({ principal: game.owner, chatId: game.chatId });
  const state = preview.budget.sources.find((source) => source.source === "game-state");
  expect(state?.tokens).toBeGreaterThan(0);
  // The wire stubs a stored card, so the block's own opening line is the needle that survives to the provider.
  const opening = state?.text.split("\n")[0] ?? "";
  expect(opening).not.toBe("");
  await send(game);
  const wire = await newestWire(game);
  expect(wire).toContain(opening);

  await using plain = await textRoom([]);
  const plainPreview = await plain.root.services.chat.previewAssembly({ principal: plain.owner, chatId: plain.chatId });
  expect(plainPreview.budget.sources.some((source) => source.source === "game-state")).toBe(false);
});

/** The tool declarations the newest provider request carried, one serialized declaration each. */
async function declaredTools(h: ChatRoot): Promise<readonly string[]> {
  const request = h.requests.findLast((candidate) => candidate.method === "POST" && new URL(candidate.url).pathname.endsWith("/chat/completions"));
  if (request === undefined) {
    throw new Error("the room made no chat-completions request");
  }
  const tools = (await turnWireBody(request))["tools"];
  return Array.isArray(tools) ? tools.map((tool) => JSON.stringify(tool)) : [];
}

const REACT_ARMS = [
  { title: "the host's opt-in carries into a room that never chose", host: { charactersCanReact: true }, attached: true },
  { title: "the room's choice wins over the host's opt-in", host: { charactersCanReact: true }, room: { charactersCanReact: false }, attached: false },
  { title: "the room's opt-in attaches it over a host default of off", host: {}, room: { charactersCanReact: true }, attached: true },
  { title: "no opt-in anywhere attaches nothing", host: {}, attached: false },
  { title: "the room's reaction plane off outranks the opt-in", host: { charactersCanReact: true }, room: { reactionsEnabled: false }, attached: false },
  { title: "the host's reaction plane off carries into a room that never chose", host: { charactersCanReact: true, reactionsEnabled: false }, attached: false },
  {
    title: "the room's plane on restores it over a host plane of off",
    host: { charactersCanReact: true, reactionsEnabled: false },
    room: { reactionsEnabled: true },
    attached: true,
  },
] as const;

test.for(REACT_ARMS)("the react tool: $title", async (arm) => {
  await using h = await turnToolsRoom([(): Response => coreProse("ok")]);
  await h.caller.settings.updateUserSettingsSection({ section: "chat", patch: arm.host });
  const room: { readonly charactersCanReact?: boolean; readonly reactionsEnabled?: boolean } = "room" in arm ? arm.room : {};
  if (room.charactersCanReact !== undefined) {
    await h.root.services.chat.setCharactersCanReact({ principal: h.owner, chatId: h.chatId, enabled: room.charactersCanReact });
  }
  if (room.reactionsEnabled !== undefined) {
    await h.root.services.chat.setReactionsEnabled({ principal: h.owner, chatId: h.chatId, enabled: room.reactionsEnabled });
  }
  await send(h);
  const declared = (await declaredTools(h)).some((tool) => tool.includes(CHAT_REACT_TOOL_NAME));
  expect(declared).toBe(arm.attached);
});

test("two contributions that emit the identical injection reach the model once", async () => {
  // The host's frame turns the choices teach into exactly the note the reaction attribution writes for a reaction
  // to a line reading the same words: two contributions, one placement, one content.
  const line = "hello there";
  const note = reactionNote(REACTION_ANONYMOUS_REACTOR, "👍", REACTION_WHOLE_MESSAGE_TARGET, line);
  const prose: ProseOverrides = {
    "rpg.reminder.cyoaTeach": { text: line, baseVersion: 1 },
    "chat.teach.choicesFrame": { text: reactionNote(REACTION_ANONYMOUS_REACTOR, "👍", REACTION_WHOLE_MESSAGE_TARGET, "{{teach}}"), baseVersion: 1 },
  };
  await using h = await textRoom(["ok", "ok"], { promptConfig: { ...DEFAULT_PROMPT_CONFIG, prose } });
  const said = (await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: line })).messages[0];
  if (said === undefined) {
    throw new Error("commitMessage returned no row");
  }
  await h.root.services.chat.toggleReaction({ principal: h.owner, chatId: h.chatId, variantId: said.selectedVariantId, emoji: "👍" });

  // Positive control: the reaction alone teaches the note once, so the doubled case below is a collision and not a miss.
  await send(h);
  expect(occurrences(await newestWire(h), note)).toBe(1);

  await h.root.services.chat.setOfferChoices({ principal: h.owner, chatId: h.chatId, enabled: true });
  await send(h);
  expect(occurrences(await newestWire(h), note)).toBe(1);
});

test("two identical host-authored injections both reach the model; only contributions are collapsed", async () => {
  await using h = await textRoom(["ok"]);
  const line = "SAY IT TWICE";
  for (const order of [0, 1]) {
    await h.root.services.chat.setChatInjection({ principal: h.owner, chatId: h.chatId, position: "in_chat", depth: 0, role: "system", content: line, order });
  }
  await send(h);
  expect(occurrences(await newestWire(h), line)).toBe(2);
});
