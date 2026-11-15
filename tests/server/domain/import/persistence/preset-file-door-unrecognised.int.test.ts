// @subject packages/server/src/domain/preset/verbs/import-file.ts
// @subject packages/contracts/src/preset/index.ts
// A file of another shape is refused by the Presets page door as not recognized, and the refusal names the exports the
// import reads. A file the reader claimed and could not store is refused for its own reason, with no such list.
import { PRESET_IMPORT_ACCEPTS, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node";
import { harness } from "./_st-tree-door.ts";

const FILE_NAME = "Other.json";
// Another tool's JSON: it carries neither an orbweaver envelope nor a chat-completion preset's prompts.
const OTHER_SHAPE = JSON.stringify({ blocks: [{ id: "intro", text: "You narrate." }], scripts: [{ name: "panel", find: "<a>", replace: "<b>" }] });
const OVER_CAP_PROMPT_CHARS = 100_001;
// The reader claims this file (it has `prompts`) and refuses a value it cannot store.
const CLAIMED_BUT_REFUSED = JSON.stringify({
  prompts: [{ identifier: "main", name: "Main", role: "system", content: "x".repeat(OVER_CAP_PROMPT_CHARS) }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
});

test("a file of another shape is refused as unrecognized and the refusal names what the import reads", async () => {
  expect(tryImportStChatCompletionPreset(JSON.parse(OTHER_SHAPE))).toMatchObject({ ok: false, recognised: false });
  expect(tryImportStChatCompletionPreset(JSON.parse(CLAIMED_BUT_REFUSED))).toMatchObject({ ok: false, recognised: true });

  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);
  const before = (await caller.preset.list()).length;

  for (const refusal of [
    await caller.preset.previewFile({ fileText: OTHER_SHAPE, fileName: FILE_NAME }),
    await caller.preset.importFile({ fileText: OTHER_SHAPE, fileName: FILE_NAME }),
  ]) {
    expect(refusal.ok).toBe(false);
    expect(refusal.ok ? "" : refusal.error).toContain(PRESET_IMPORT_ACCEPTS);
  }

  const claimed = await caller.preset.previewFile({ fileText: CLAIMED_BUT_REFUSED, fileName: FILE_NAME });
  expect(claimed.ok).toBe(false);
  expect(claimed.ok ? "" : claimed.error).not.toContain(PRESET_IMPORT_ACCEPTS);

  expect((await caller.preset.list()).length).toBe(before);
});
