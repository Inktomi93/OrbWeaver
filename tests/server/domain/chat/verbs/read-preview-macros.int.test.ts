// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/assembly/user-macros.ts
// The previews show where each user macro came from and which lost its name: the macro slice of the assembly trace,
// read through the host-gated door beside the prompt it explains. A plugin's guest runs once per turn and never in a
// preview, which any room member's read may trigger, so the previews name its macros and never run them.

import { spawn } from "node:child_process";
import { setTimeout as realDelay } from "node:timers/promises";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, promptSectionIdSchema } from "@orb/contracts/preset";
import type { PluginId } from "@orb/kit/ids";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { installMacroGuest } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom, wireOf, wireText } from "../scenario-physical.ts";
import { GAME_MOOD } from "./turn-rpg-macro-data.ts";
import { turnRpgRoom } from "./turn-rpg-physical.ts";

// Longer than a preview takes and shorter than the sandbox's settlement wall for a stalled invoke, so only a preview
// that never waits on the guest finishes inside it.
const PREVIEW_WINDOW_MS = 1500;
const PREVIEWS_PER_KIND = 3;

type Preview = Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["previewAssembly"]>>;

/** A preset whose rack leads with one literal row, so any macro in `content` renders into the preview. */
function presetLeading(content: string, extra: Partial<PromptConfig> = {}): PromptConfig {
  const row: PromptSection = { type: "literal", id: promptSectionIdSchema.parse("macro-probe"), name: "Macro probe", role: "system", content, enabled: true };
  return makePromptConfig({ ...extra, sections: [row, ...DEFAULT_PROMPT_CONFIG.sections] });
}

async function preview(h: ChatRoot): Promise<Preview> {
  return await h.root.services.chat.previewAssembly({ principal: h.owner, chatId: h.chatId });
}

function renderedText({ prompt }: Preview): string {
  return `${prompt.static}\n${prompt.dynamic}`;
}

/** Put text on the room character's card, which every preview renders: plugin macro names are only known after install. */
async function writeOnCard(h: ChatRoot, description: string): Promise<void> {
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the room seated no character");
  }
  await h.caller.character.update({ characterId: character.id, input: { description } });
}

/** The host-namespaced macro name the plugin registered, as the owner's own read lists it. */
async function macroNameOf(h: ChatRoot, pluginId: PluginId): Promise<string> {
  const row = (await h.caller.plugin.listMacros()).find((macro) => macro.pluginId === pluginId);
  if (row === undefined) {
    throw new Error("the plugin listed no macro");
  }
  return row.name;
}

/** Every kind of preview a plugin's macro could reach: the host's prompt preview and the member-gated context fit. */
async function everyPreview(h: ChatRoot, member: ChatRoot["owner"]): Promise<void> {
  for (let run = 0; run < PREVIEWS_PER_KIND; run += 1) {
    await preview(h);
    await h.root.services.chat.previewContextFit({ principal: h.owner, chatId: h.chatId });
    await h.root.services.chat.previewContextFit({ principal: member, chatId: h.chatId });
  }
}

async function pluginStatus(h: ChatRoot, pluginId: PluginId): Promise<string | undefined> {
  return (await h.caller.plugin.list()).find((plugin) => plugin.id === pluginId)?.status;
}

test("a preset macro a game macro shadows is rejected with its source, and the game's macro is registered", async () => {
  await using h = await turnRpgRoom([], {
    promptConfig: presetLeading("Scene tone: {{mood}}.", {
      userMacros: [{ name: "mood", description: "the preset's scene tone", args: [], body: "wry", strict: false, inputs: [] }],
    }),
  });
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, patch: { userMacros: [GAME_MOOD] } });

  const shown = await preview(h);

  expect(renderedText(shown)).toContain("Scene tone: doomed.");
  expect(shown.trace.macros?.rejected).toEqual([{ name: "mood", reason: expect.any(String), source: { kind: "preset", id: expect.any(String) } }]);
  expect(shown.trace.macros?.registered).toContainEqual({ name: "mood", source: { kind: "game", id: h.chatId } });
});

test("the macro slice rides the host's preview only: a member is refused the read", async () => {
  await using h = await textRoom([], {
    promptConfig: presetLeading("Mood: {{mood}}.", {
      userMacros: [{ name: "mood", description: "the scene tone", args: [], body: "wry", strict: false, inputs: [] }],
    }),
  });
  const member = await invitePerson(h);

  expect((await preview(h)).trace.macros?.registered).toBeDefined();
  await expect(h.root.services.chat.previewAssembly({ principal: member, chatId: h.chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.notHost });
});

test("a preview names a plugin's macros, hyphen alias included, without a value and without running the guest", async () => {
  await using h = await textRoom(["The deck answers."], { server: { pluginSpawn: spawn } });
  const deck = await installMacroGuest(h.root, h.owner, { slug: "tick-deck", name: "Tick Deck" }, [
    { name: "tick", description: "Counts its runs.", counts: true },
  ]);
  const live = await macroNameOf(h, deck);
  const legacy = "plugin_tick_deck_tick";
  await writeOnCard(h, `PROBE ${live}={{${live}}} ${legacy}={{${legacy}}} END`);
  const member = await invitePerson(h);

  const shown = await preview(h);

  expect(shown.trace.macros?.registered).toEqual(
    expect.arrayContaining([
      { name: live, source: { kind: "plugin", id: deck }, deferred: true },
      { name: legacy, source: { kind: "plugin", id: deck }, deferred: true },
    ]),
  );
  // The guest has not run, so the render leaves the call as it always did.
  expect(renderedText(shown)).toContain(`${live}={{${live}}}`);

  await everyPreview(h, member);

  // Counting runs in the guest's own storage: the first run of all is the turn's, so no preview ran it.
  const { outcome, newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Draw." }));
  expect(outcome.aborted).toBe(false);
  const wire = wireText(newest);
  expect(wire).toContain(`${live}=1`);
  expect(wire).toContain(`${legacy}=1`);
});

test("the fit a plugin's macro could change is the fit without the plugin", async () => {
  await using h = await textRoom([], { server: { pluginSpawn: spawn } });
  const deck = await installMacroGuest(h.root, h.owner, { slug: "fit-deck", name: "Fit Deck" }, [
    { name: "fit", description: "A long answer.", answer: "A VALUE MUCH LONGER THAN THE RAW CALL ".repeat(30) },
  ]);
  await writeOnCard(h, `Deck: {{${await macroNameOf(h, deck)}}}`);
  const withPlugin = await h.root.services.chat.previewContextFit({ principal: h.owner, chatId: h.chatId });

  await h.root.services.plugin.setEnabled({ caller: h.owner, pluginId: deck, enabled: false });
  const withoutPlugin = await h.root.services.chat.previewContextFit({ principal: h.owner, chatId: h.chatId });

  expect(withPlugin).toEqual(withoutPlugin);
});

test("three previews of every kind leave a throwing macro's plugin enabled, and three turns disable it", async () => {
  await using h = await textRoom(["one", "two", "three"], { server: { pluginSpawn: spawn } });
  const deck = await installMacroGuest(h.root, h.owner, { slug: "boom-deck", name: "Boom Deck" }, [{ name: "boom", description: "Throws.", throws: true }]);
  await writeOnCard(h, `Deck: {{${await macroNameOf(h, deck)}}}`);
  const member = await invitePerson(h);

  await everyPreview(h, member);
  expect(await pluginStatus(h, deck)).toBe("enabled");

  for (let turn = 0; turn < PREVIEWS_PER_KIND; turn += 1) {
    expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Again." })).aborted).toBe(false);
  }
  expect(await pluginStatus(h, deck)).toBe("errored");
});

test("a macro that never answers holds no preview, the host's or a member's", async () => {
  await using h = await textRoom([], { server: { pluginSpawn: spawn } });
  const deck = await installMacroGuest(h.root, h.owner, { slug: "stall-deck", name: "Stall Deck" }, [
    { name: "stall", description: "Never answers.", stalls: true },
  ]);
  await writeOnCard(h, `Deck: {{${await macroNameOf(h, deck)}}}`);
  const member = await invitePerson(h);

  const settledInWindow = async (read: Promise<unknown>): Promise<boolean> =>
    await Promise.race([read.then(() => true), realDelay(PREVIEW_WINDOW_MS).then(() => false)]);

  expect(await settledInWindow(preview(h))).toBe(true);
  expect(await settledInWindow(h.root.services.chat.previewContextFit({ principal: member, chatId: h.chatId }))).toBe(true);
});
