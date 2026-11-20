// @subject packages/contracts/src/preset/index.ts
// @subject packages/server/src/domain/preset/verbs/import-file.ts
// A SillyTavern preset has no prompt for orbweaver's memory or databank slots. Imported through the Presets page and
// made the default, it still carries both into a real turn: the recalled scene and the attached document reach the
// prompt the chat model receives.
import { expect, test } from "@orb/testkit/node";
import { ask, recallTurn, world } from "./recall-world.ts";

const RECALLED_SCENE = "arc-bath.";
const DOCUMENT_LINE = "The bath ledger names the keeper's lantern-bath.";

// SillyTavern wire keys are snake_case by spec, so the preset is raw JSON.
const ST_PRESET = JSON.stringify({
  prompts: [
    { identifier: "main", name: "Main", content: "You narrate the caravan.", role: "system" },
    { identifier: "chatHistory", name: "Chat History", ["system_prompt"]: true, marker: true },
  ],
  ["prompt_order"]: [
    {
      ["character_id"]: 100_001,
      order: [
        { identifier: "main", enabled: true },
        { identifier: "chatHistory", enabled: true },
      ],
    },
  ],
});

test("a SillyTavern preset imported through the Presets page recalls memory and retrieves the room's document on a real turn", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const imported = await w.h.caller.preset.importFile({ fileText: ST_PRESET, fileName: "Caravan.json" });
  if (!imported.ok || imported.presetId === undefined) {
    throw new Error("the SillyTavern preset did not import");
  }
  await w.h.caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: imported.presetId } });
  const ledger = await w.h.caller.databank.createFromText({ name: "Bath ledger", text: DOCUMENT_LINE });
  await w.h.caller.databank.attachToChat({ chatId: w.h.chatId, documentId: ledger.document.id });
  await w.activate();

  const run = await recallTurn(w.h, ask("bath"));
  // The positive control: the turn ran the imported preset, whose own main prompt is in the prompt.
  expect(run.prompt).toContain("You narrate the caravan.");
  expect(run.trace.surfaced).toBeGreaterThan(0);
  expect.soft(run.prompt).toContain(RECALLED_SCENE);
  expect.soft(run.prompt).toContain(DOCUMENT_LINE);
  expect(imported.addedSections?.length).toBeGreaterThan(0);
});
