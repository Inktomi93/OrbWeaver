// @subject packages/server/src/domain/chat/verbs/read.ts
// The host's prompt preview is an honesty instrument: through the composed root it shows the bytes, costs, preset,
// personas and clock the next real turn sends, read back from the physical provider request, and it changes nothing.

import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG, promptSectionIdSchema, TEMPLATE_DEFS } from "@orb/contracts/preset";
import type { IanaTimeZone } from "@orb/kit/time";
import { parseIanaTimeZone } from "@orb/kit/time";
import { nonEmpty, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, readRoomCanon } from "@orb/testkit/node/composed";
import { attachPersonaLore, invitePerson, seatPersona } from "../persona-cache-physical.ts";
import { textRoom, wireOf, wireText } from "../scenario-physical.ts";
import { turnRpgReply, turnRpgRoom } from "./turn-rpg-physical.ts";

type PreviewAssembly = ChatRoot["root"]["services"]["chat"]["previewAssembly"];
type AssemblyPreview = Awaited<ReturnType<PreviewAssembly>>;

function literal(id: string, content: string): PromptSection {
  return { type: "literal", id: promptSectionIdSchema.parse(id), name: id, role: "system", content, enabled: true };
}

/** A preset whose rack leads with one marked row, so a render of that preset is findable in any prompt. */
function presetLeading(id: string, content: string): PromptConfig {
  return { ...DEFAULT_PROMPT_CONFIG, sections: [literal(id, content), ...DEFAULT_PROMPT_CONFIG.sections] };
}

async function preview(h: ChatRoot, extra: Partial<Parameters<PreviewAssembly>[0]> = {}): Promise<AssemblyPreview> {
  return await h.root.services.chat.previewAssembly({ principal: h.owner, chatId: h.chatId, ...extra });
}

async function previewText(h: ChatRoot): Promise<string> {
  const { prompt } = await preview(h);
  return `${prompt.static}\n${prompt.dynamic}`;
}

async function send(h: ChatRoot, timeZone?: IanaTimeZone): Promise<void> {
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on.", ...(timeZone === undefined ? {} : { timeZone }) });
  expect(outcome.aborted).toBe(false);
}

/** Every string the provider received on the newest request the act sent. */
async function newestWire(h: ChatRoot, act: () => Promise<unknown>): Promise<string> {
  const { newest } = await wireOf(h, act);
  return wireText(newest);
}

function cardsOf(budget: AssemblyPreview["budget"]): AssemblyPreview["budget"]["sources"][number] | undefined {
  return budget.sources.find(({ source }) => source === "cards");
}

test("the preview builds the next turn's prompt and writes nothing: no canon, no variable, no provider call", async () => {
  await using h = await textRoom(["The keeper answers."], { promptConfig: presetLeading("mood", "{{setvar::mood::wary}}The room is quiet.") });
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "hello" });
  const canonBefore = await readRoomCanon(h.root, h.owner, h.chatId);
  const requestsBefore = h.requests.length;

  const previewed = await preview(h);
  expect(previewed.prompt.static).toContain("The room is quiet.");
  expect((await preview(h)).prompt.static).toBe(previewed.prompt.static);
  expect(await readRoomCanon(h.root, h.owner, h.chatId)).toEqual(canonBefore);
  expect(await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId })).toEqual({});
  expect(h.requests).toHaveLength(requestsBefore);

  // The same render inside a real turn does write: the variable lands and canon grows.
  await send(h);
  expect(await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId })).toEqual({ mood: "wary" });
  expect((await readRoomCanon(h.root, h.owner, h.chatId)).length).toBeGreaterThan(canonBefore.length);
});

test("the budget partitions the next turn by source, prices each seated card by its own bytes, and every text slice reaches the model", async () => {
  const mira = createCharacterSchema.parse({
    handle: "mira",
    name: "Mira",
    description: "A bold knight of the Lantern Road who never yields her post to anyone.",
  });
  const niko = createCharacterSchema.parse({ handle: "niko", name: "Niko", description: "A wary scout." });
  await using h = await textRoom(["A reply worth some tokens.", "ok", "ok", "ok"], { characters: [mira, niko] });
  await send(h);
  const { budget, prompt } = await preview(h);

  expect(budget.totalTokens).toBeGreaterThan(0);
  expect(budget.sources.reduce((sum, { tokens }) => sum + tokens, 0)).toBe(budget.totalTokens);
  const system = budget.sources.find(({ source }) => source === "system");
  expect(system?.tokens).toBeGreaterThan(0);
  expect(prompt.static).toContain(system?.text ?? "<no system slice>");

  // History is accounted by cost, never served as content, and the rack's history pivot carries the same number.
  const history = budget.sources.find(({ source }) => source === "history");
  expect(history?.text).toBe("");
  expect(history?.tokens).toBeGreaterThan(0);
  const pivotId = DEFAULT_PROMPT_CONFIG.sections.find((section) => section.type === "marker" && section.marker === "chat_history")?.id;
  const pivot = budget.sections.find(({ sectionId }) => sectionId === pivotId);
  expect(pivot?.tokens).toBe(history?.tokens);
  // One send is one user turn and its reply, so the fit keeps two rows.
  expect(pivot?.rows).toHaveLength(2);
  const rack = DEFAULT_PROMPT_CONFIG.sections.map(({ id }) => id);
  const priced = budget.sections.map(({ sectionId }) => sectionId);
  expect(nonEmpty(priced).every((id) => rack.includes(id))).toBe(true);
  expect(priced).toEqual(priced.toSorted((a, b) => rack.indexOf(a) - rack.indexOf(b)));
  expect(nonEmpty(budget.sections).every(({ rows }) => rows.length > 0)).toBe(true);

  const cards = cardsOf(budget);
  expect(cards?.parts.map(({ label }) => label)).toEqual([mira.name, niko.name]);
  const [miraPart, nikoPart] = cards?.parts ?? [];
  expect(miraPart?.text).toContain(mira.description);
  expect(nikoPart?.text).toContain(niko.description);
  expect(miraPart?.tokens ?? 0).toBeGreaterThan(nikoPart?.tokens ?? 0);

  const wire = await newestWire(h, () => send(h));
  for (const source of budget.sources.filter(({ text }) => text !== "")) {
    for (const part of source.parts) {
      expect(wire, `${source.source}: ${part.label}`).toContain(part.text);
    }
  }
});

test("the budget ceiling is the bound connection's window, or the preset's cap when that binds first", async () => {
  await using h = await textRoom([]);
  const bindWindow = async (window?: number): Promise<void> => {
    const connection = await h.root.services.connection.create({
      principal: h.owner,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: `window-${window ?? "undeclared"}`,
      allowBackground: true,
      declared: {
        kind: "generation",
        generation: { input: ["text"], ...(window === undefined ? {} : { context: { window } }) },
        features: { detectServer: false },
      },
    });
    await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  };
  const small = 8192;
  const large = 40_960;
  await bindWindow(small);
  const narrow = (await preview(h)).budget;
  expect(narrow.limit).toEqual({ kind: "window", tokens: small });
  expect(narrow.ceilingEstimated).toBe(false);
  await bindWindow(large);
  const wide = (await preview(h)).budget;
  expect(wide.limit).toEqual({ kind: "window", tokens: large });
  expect(wide.ceilingTokens).toBeGreaterThan(narrow.ceilingTokens);

  const cap = 6000;
  const capped = await h.caller.preset.create({
    name: "Capped",
    kind: "custom",
    config: { ...DEFAULT_PROMPT_CONFIG, params: { ...DEFAULT_PROMPT_CONFIG.params, maxContextTokens: cap } },
  });
  expect((await preview(h, { presetOverride: capped.id })).budget.limit).toEqual({ kind: "cap", tokens: cap });

  // A connection that declares no window runs on a guessed one: the preview says so until the preset's cap binds.
  await bindWindow();
  expect((await preview(h)).budget.ceilingEstimated).toBe(true);
  expect((await preview(h, { presetOverride: capped.id })).budget.ceilingEstimated).toBe(false);
});

test("a preset override renders the room as that preset, and another owner's preset falls back to the host's own", async () => {
  await using h = await textRoom([], { promptConfig: presetLeading("room-row", "THE ROOM PRESET SPEAKS") });
  const candidate = await h.caller.preset.create({
    name: "Candidate",
    kind: "custom",
    config: { ...DEFAULT_PROMPT_CONFIG, sections: [literal("only-row", "THE CANDIDATE SPEAKS")] },
  });
  const overridden = await preview(h, { presetOverride: candidate.id });
  expect(overridden.prompt.static).toContain("THE CANDIDATE SPEAKS");
  expect(overridden.prompt.static).not.toContain("THE ROOM PRESET SPEAKS");
  expect(overridden.budget.sections.map(({ sectionId }) => sectionId)).toEqual(["only-row"]);
  expect((await preview(h)).prompt.static).toContain("THE ROOM PRESET SPEAKS");

  const stranger = await h.root.principalFor((await h.root.actor()).id);
  const strangerCaller = await h.root.internalCallerFor(stranger.userId);
  const foreign = await strangerCaller.preset.create({ name: "Private", kind: "custom", config: presetLeading("secret-row", "THE STRANGER'S PRIVATE PRESET") });
  const refused = await preview(h, { presetOverride: foreign.id });
  expect(refused.prompt.static).not.toContain("THE STRANGER'S PRIVATE PRESET");
  expect(refused.prompt.static).toContain("THE ROOM PRESET SPEAKS");
});

test("a game room previews the GM preset its turn sends, and an explicit override still outranks it", async () => {
  await using h = await turnRpgRoom([(): Response => turnRpgReply("The keeper nods.")], { promptConfig: presetLeading("host-row", "THE HOST DEFAULT SPEAKS") });
  const gm = await h.caller.preset.create({ name: "GM voice", kind: "custom", config: presetLeading("gm-row", "THE GM PRESET SPEAKS") });
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, gmPresetId: gm.id });

  const previewed = await previewText(h);
  expect(previewed).toContain("THE GM PRESET SPEAKS");
  expect(previewed).not.toContain("THE HOST DEFAULT SPEAKS");
  expect(await newestWire(h, () => send(h))).toContain("THE GM PRESET SPEAKS");

  const candidate = await h.caller.preset.create({ name: "Candidate", kind: "custom", config: presetLeading("candidate-row", "THE CANDIDATE SPEAKS") });
  const overridden = (await preview(h, { presetOverride: candidate.id })).prompt.static;
  expect(overridden).toContain("THE CANDIDATE SPEAKS");
  expect(overridden).not.toContain("THE GM PRESET SPEAKS");
});

test("re-pinning the anchor drops the swapped-out persona from the preview, the peek and the next turn", async () => {
  const before = "The old traveller nobody plays anymore.";
  const after = "Alex, the current player.";
  await using h = await textRoom(["ok", "ok"]);
  const old = await seatPersona(h, h.owner, "You", before);
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: old.id });
  await send(h);
  const current = await seatPersona(h, h.owner, "Alex", after);

  // While the old persona is still the anchor, both legitimately ride the card context.
  const swapped = await previewText(h);
  expect(swapped).toContain(before);
  expect(swapped).toContain(after);

  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: current.id });
  const anchored = await previewText(h);
  expect(anchored).toContain(after);
  expect(anchored).not.toContain(before);
  const wire = await newestWire(h, () => send(h));
  expect(wire).toContain(after);
  expect(wire).not.toContain(before);
});

test("a member's persona leaves the host's preview and the next turn when that member leaves the room", async () => {
  const description = "The guest who walked out.";
  await using h = await textRoom(["ok"]);
  const member = await invitePerson(h);
  await seatPersona(h, member, "Departed", description);
  expect(await previewText(h)).toContain(description);

  await h.root.services.chat.kick({ principal: h.owner, chatId: h.chatId, userId: member.userId });
  expect(await previewText(h)).not.toContain(description);
  expect(await newestWire(h, () => send(h))).not.toContain(description);
});

test("a disabled member drops out of the preview's consent set, while an enabled offline member's lore stays in", async () => {
  const lore = "THE MEMBER'S PRIVATE LORE";
  await using h = await textRoom([]);
  const member = await invitePerson(h);
  const persona = await seatPersona(h, member, "Offline Player", "A member who is not online.");
  await attachPersonaLore(h, member, persona.id, lore);
  expect(await previewText(h)).toContain(lore);

  await h.root.services.admin.setEnabled({ principal: h.owner, userId: member.userId, enabled: false });
  expect(await previewText(h)).not.toContain(lore);
});

test("a narrator room and a per-speaker room each preview the prompt their own turn sends", async () => {
  const characters = [
    createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "Aria is a warden of the ford." }),
    createCharacterSchema.parse({ handle: "kai", name: "Kai", description: "Kai is a wandering bard." }),
  ];
  await using perSpeaker = await textRoom(["ok", "ok"], { characters });
  await using narrator = await textRoom(["The ford is quiet."], { characters, group: { output: "narrator", policy: DEFAULT_GROUP_CONFIG.policy } });
  const narrated = (await preview(narrator)).prompt.static;
  const spoken = (await preview(perSpeaker)).prompt.static;

  expect(await newestWire(narrator, () => send(narrator))).toContain(narrated);
  expect(await newestWire(perSpeaker, () => send(perSpeaker))).toContain(spoken);
  // The two shapes differ, so neither containment above can pass on the other room's prompt.
  expect(narrated).not.toBe(spoken);
});

test("the preview reads the clock in the viewer's zone, the zone the next turn renders in", async () => {
  const zone = parseIanaTimeZone("Asia/Kathmandu");
  if (zone === null) {
    throw new Error("the platform must know Asia/Kathmandu");
  }
  const clock = "CLOCK {{date}} {{time}} {{weekday}}";
  const config: PromptConfig = {
    ...presetLeading("clock", clock),
    guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { ...DEFAULT_GUIDED_ACTIONS.response, prompt: clock } },
  };
  await using h = await textRoom(["ok"], { promptConfig: config });
  const preset = await h.caller.preset.create({ name: "Clock", kind: "custom", config });
  const template = async (timeZone?: IanaTimeZone): Promise<string | undefined> =>
    (
      await h.root.services.chat.previewActionTemplates({
        principal: h.owner,
        chatId: h.chatId,
        presetId: preset.id,
        ...(timeZone === undefined ? {} : { timeZone }),
      })
    ).templates.find(({ id }) => id === "response")?.resolved;
  const clockLine = (text: string): string => text.split("\n").find((line) => line.startsWith("CLOCK ")) ?? "<no clock line>";

  const viewer = clockLine((await preview(h, { timeZone: zone })).prompt.static);
  const utc = clockLine((await preview(h)).prompt.static);
  expect(viewer).not.toBe(utc);
  expect(await template(zone)).toBe(viewer);
  expect(await template()).toBe(utc);
  expect(clockLine(await newestWire(h, () => send(h, zone)))).toBe(viewer);
});

test("a guided steer previews through the same assembly the guided turn sends, and a plain preview carries none of it", async () => {
  const steer = "Make the keeper answer in verse.";
  await using h = await textRoom(["ok"]);
  const guided = { action: "response", input: steer } as const;
  const steered = await preview(h, { guided });
  expect(steered.trace.guidedInstructionIncluded).toBe(true);
  const instruction = steered.prompt.afterHistory.find(({ content }) => content.includes(steer))?.content;
  expect(instruction).toBeDefined();

  const plain = await preview(h);
  expect(plain.trace.guidedInstructionIncluded).toBe(false);
  expect(JSON.stringify(plain.prompt)).not.toContain(steer);

  const { outcome, newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on.", guided }));
  expect(outcome.aborted).toBe(false);
  expect(wireText(newest)).toContain(present(instruction));
});

test("the preview binds {{user}} to the host's own persona or the room's anchor, never a member's, as the turn does", async () => {
  await using h = await textRoom(["ok"], { promptConfig: presetLeading("voice", "VOICE {{user}}") });
  const voiceLine = (text: string): string => text.split("\n").find((line) => line.startsWith("VOICE ")) ?? "<no voice line>";
  const member = await invitePerson(h);
  await seatPersona(h, member, "Bystander", "The first member who happened to join.");
  const anchor = await h.root.services.persona.create({
    principal: h.owner,
    input: createPersonaSchema.parse({ name: "Anchor", description: "The identity this room is about." }),
  });
  await h.root.services.chat.setChatAnchorPersona({ principal: h.owner, chatId: h.chatId, personaId: anchor.id });

  // A host with no seat persona speaks as the anchor they own.
  expect(voiceLine((await preview(h)).prompt.static)).toBe(`VOICE ${anchor.name}`);

  const seated = await seatPersona(h, h.owner, "Hostly", "The host's own seat persona.");
  const previewed = voiceLine((await preview(h)).prompt.static);
  expect(previewed).toBe(`VOICE ${seated.name}`);
  expect(voiceLine(await newestWire(h, () => send(h)))).toBe(previewed);
});

test("the template readout renders the inspected preset through the room's own identity and leaves fire-time tokens unresolved", async () => {
  await using h = await textRoom([]);
  const persona = await seatPersona(h, h.owner, "Alex", "The current player.");
  const preset = await h.caller.preset.create({
    name: "Impersonation",
    kind: "custom",
    config: {
      ...DEFAULT_PROMPT_CONFIG,
      guidedActions: {
        ...DEFAULT_GUIDED_ACTIONS,
        impersonate: {
          ...DEFAULT_GUIDED_ACTIONS.impersonate,
          prompt: "Write {{user}}'s next message from a {{person}}-person perspective. {{input}}",
        },
      },
    },
  });
  const readout = await h.root.services.chat.previewActionTemplates({ principal: h.owner, chatId: h.chatId, presetId: preset.id });
  expect(readout.templates.map(({ id }) => id)).toEqual(TEMPLATE_DEFS.map(({ id }) => id));
  expect(readout.identity.user).toBe(persona.name);
  const impersonate = readout.templates.find(({ id }) => id === "impersonate")?.resolved ?? "";
  expect(impersonate).toContain(`Write ${persona.name}'s next message`);
  expect(impersonate).not.toContain("{{user}}");
  expect(impersonate).toContain("{{person}}");
  expect(impersonate).toContain("{{input}}");
});

test("a history pivot that is switched off sends no history: the preview prices none and the provider request carries no earlier turn", async () => {
  const earlier = "an earlier line the model reads only while history is on";
  const withPivot = (enabled: boolean): PromptConfig => ({
    ...DEFAULT_PROMPT_CONFIG,
    sections: DEFAULT_PROMPT_CONFIG.sections.map((section) =>
      section.type === "marker" && section.marker === "chat_history" ? { ...section, enabled } : section,
    ),
  });
  const sentWith = async (enabled: boolean): Promise<{ readonly historyTokens: number; readonly wire: string }> => {
    await using h = await textRoom(["The keeper answers."], { promptConfig: withPivot(enabled) });
    await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: earlier });
    const { budget } = await preview(h);
    const wire = await newestWire(h, () => send(h));
    return { historyTokens: budget.sources.find(({ source }) => source === "history")?.tokens ?? 0, wire };
  };

  const on = await sentWith(true);
  expect(on.historyTokens).toBeGreaterThan(0);
  expect(on.wire).toContain(earlier);

  const off = await sentWith(false);
  expect(off.historyTokens).toBe(0);
  expect(off.wire).not.toContain(earlier);
});
