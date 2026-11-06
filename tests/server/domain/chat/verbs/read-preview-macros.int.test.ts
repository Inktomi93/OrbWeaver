// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/assembly/user-macros.ts
// The host's preview shows where each user macro came from and which lost its name: the macro slice of the assembly
// trace, read through the host-gated door beside the prompt it explains. Plugin macros resolve in a real guest.

import { spawn } from "node:child_process";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, promptSectionIdSchema } from "@orb/contracts/preset";
import type { PluginId } from "@orb/kit/ids";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { installMacroGuest } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";
import { GAME_MOOD } from "./turn-rpg-macro-data.ts";
import { turnRpgRoom } from "./turn-rpg-physical.ts";

// One step of the root's scoped clock; the poll repeats it until the macro deadline has passed. The poll is shorter
// than the sandbox's own settlement wall for a stalled invoke, so only the macro deadline can settle the preview in it.
const TICK_MS = 250;
const POLL_TIMEOUT_MS = 2000;
const TEST_TIMEOUT_MS = 15_000;

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

/** The probe row with each token written as `token=<its render>`, so an unresolved token is visible as raw braces. */
function probe(tokens: readonly string[]): string {
  return `PROBE ${tokens.map((token) => `${token}={{${token}}}`).join(" ; ")} END`;
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

test("two plugins resolve to their own values under their own ids, and the legacy hyphen spelling keeps resolving", async () => {
  await using h = await textRoom([], { server: { pluginSpawn: spawn } });
  const oracle = await installMacroGuest(h.root, h.owner, { slug: "oracle-deck", name: "Oracle Deck" }, [
    { name: "omen", description: "Draws an omen.", answer: "OMEN-VALUE" },
  ]);
  const ledger = await installMacroGuest(h.root, h.owner, { slug: "ledger", name: "Ledger" }, [
    { name: "tally", description: "Counts coins.", answer: "TALLY-VALUE" },
  ]);
  const omen = await macroNameOf(h, oracle);
  const tally = await macroNameOf(h, ledger);
  const legacyOmen = "plugin_oracle_deck_omen";
  await writeOnCard(h, probe([omen, legacyOmen, tally]));

  const shown = await preview(h);

  const text = renderedText(shown);
  expect(text).toContain(`${omen}=OMEN-VALUE`);
  expect(text).toContain(`${tally}=TALLY-VALUE`);
  expect(text).toContain(`${legacyOmen}=OMEN-VALUE`);
  expect(shown.trace.macros?.registered).toEqual(
    expect.arrayContaining([
      { name: omen, source: { kind: "plugin", id: oracle } },
      { name: tally, source: { kind: "plugin", id: ledger } },
    ]),
  );
  expect(shown.trace.macros?.rejected).toEqual([]);
});

test("a legacy spelling two plugins both claim stays with the live name, not with either hyphenated plugin", async () => {
  const claimed = "plugin_foo_bar_baz";
  await using h = await textRoom([], { server: { pluginSpawn: spawn } });
  await installMacroGuest(h.root, h.owner, { slug: "foo-bar" }, [{ name: "baz", description: "d", answer: "HYPHEN-VALUE" }]);
  await installMacroGuest(h.root, h.owner, { slug: "foo" }, [{ name: "bar_baz", description: "d", answer: "PLAIN-VALUE" }]);
  await writeOnCard(h, probe([claimed]));

  const text = renderedText(await preview(h));

  expect(text).toContain(`${claimed}=PLAIN-VALUE`);
  expect(text).not.toContain("HYPHEN-VALUE");
});

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

test("a plugin macro that never answers renders empty at the deadline while another plugin's macro still resolves", { timeout: TEST_TIMEOUT_MS }, async () => {
  await using h = await textRoom([], { server: { pluginSpawn: spawn } });
  const slow = await installMacroGuest(h.root, h.owner, { slug: "slow-deck" }, [{ name: "stalled", description: "Never answers.", stalls: true }]);
  const quick = await installMacroGuest(h.root, h.owner, { slug: "quick-deck" }, [{ name: "quick", description: "Answers.", answer: "QUICK-VALUE" }]);
  await writeOnCard(h, `Omen:[{{${await macroNameOf(h, slow)}}}] Quick:[{{${await macroNameOf(h, quick)}}}]`);

  let settled = false;
  const pending = preview(h).finally(() => {
    settled = true;
  });
  await expect
    .poll(
      () => {
        h.root.timers.advance(TICK_MS);
        return settled;
      },
      { timeout: POLL_TIMEOUT_MS, interval: 25 },
    )
    .toBe(true);

  const text = renderedText(await pending);
  expect(text).toContain("Omen:[]");
  expect(text).toContain("Quick:[QUICK-VALUE]");
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
