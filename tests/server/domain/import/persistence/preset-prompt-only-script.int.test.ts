// @subject packages/server/src/domain/import/substrate/preset.ts
// @subject packages/contracts/src/regex/schemas.ts
// @subject packages/server/src/domain/chat/assembly/history-regex.ts
// A SillyTavern preset's scripts run on the pass their two switches name once lifted through the folder door: a
// display-only script is drawn for the viewer and changes no stored row, a prompt-only script with a depth pair
// rewrites only the prompt copy of an older reply, and a script with neither switch still rewrites the saved reply.
import type { RegexDisplaySource } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import { textRoom, wireOf, wireText } from "../../chat/scenario-physical.ts";
import { admit, finishRun, settings } from "./_st-tree-door.ts";

const ST_AI_OUTPUT = 2;
const REPLY = "The kettle sings.";
const SAVED = "The kettle whistles.";
const PROMPT_COPY = "The KETTLE whistles.";
const PRESET_TIER: RegexDisplaySource = "preset";

// SillyTavern wire text is snake_case and integer placements by spec, so the scripts are raw JSON.
const ST_SCRIPT = {
  trimStrings: [],
  placement: [ST_AI_OUTPUT],
  disabled: false,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};

const SCRIPTS = [
  { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000001", scriptName: "Saved whistle", findRegex: "sings", replaceString: "whistles" },
  {
    ...ST_SCRIPT,
    id: "c0ffee00-0000-4000-8000-000000000002",
    scriptName: "Older reply shout",
    findRegex: "kettle",
    replaceString: "KETTLE",
    promptOnly: true,
    minDepth: 1,
    maxDepth: 2,
  },
  { ...ST_SCRIPT, id: "c0ffee00-0000-4000-8000-000000000003", scriptName: "Panel kettle", findRegex: "kettle", replaceString: "pot", markdownOnly: true },
];

test("each SillyTavern switch pairing on a preset script lands on its own pass through the folder door and a real turn", async () => {
  await using h = await textRoom([REPLY, REPLY, REPLY], {
    server: { env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => "127.0.0.1" },
  });
  const preset = {
    prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
    ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
    extensions: { ["regex_scripts"]: SCRIPTS },
  };
  await finishRun(h.root, await admit(h.root, { [ST_SETTINGS_FILE]: settings({}), "OpenAI Settings/Sola.json": JSON.stringify(preset) }));
  const imported = (await h.caller.preset.list()).find(({ name }) => name.startsWith("Sola"));
  if (imported === undefined) {
    throw new Error("the folder import landed no preset");
  }
  await h.caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: imported.id } });
  const attached = await h.root.services.regex.listForPreset({ principal: h.owner, presetId: imported.id });
  expect(attached.map(({ name, targets, passes, depth }) => ({ name, targets, passes, depth }))).toEqual([
    { name: "Saved whistle", targets: ["AI_OUTPUT"], passes: ["save"], depth: undefined },
    { name: "Older reply shout", targets: ["AI_OUTPUT"], passes: ["prompt"], depth: { min: 1, max: 2 } },
    { name: "Panel kettle", targets: ["AI_OUTPUT"], passes: ["display"], depth: undefined },
  ]);

  // Depth counts back from the newest row: on the third turn the second reply sits at depth 1 and the first at 3.
  for (const content of ["First.", "Second."]) {
    await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content });
  }
  const third = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Third." }));
  await h.root.settleBackground();
  const promptReplies = wireText(third.newest)
    .split("\n")
    .filter((line) => line === SAVED || line === PROMPT_COPY);
  expect(promptReplies).toEqual([SAVED, PROMPT_COPY]);

  const replies = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages
    .filter(({ role }) => role === "assistant")
    .map(({ content }) => content);
  expect(replies.slice(-3)).toEqual([SAVED, SAVED, SAVED]);

  const drawn = await h.root.services.chat.listDisplayScripts({ principal: h.owner, chatId: h.chatId });
  expect(drawn.map(({ script, from }) => ({ name: script.name, from }))).toEqual([{ name: "Panel kettle", from: PRESET_TIER }]);
});
