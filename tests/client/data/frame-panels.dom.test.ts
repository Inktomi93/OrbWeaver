// A frame's saved open panels belong to that frame: byte-identical documents under another character, another room
// or no character never see the report, so one frame's panel state never opens another's panels.
// @subject packages/client/src/data/frame-panels.ts
import type { FramePanelsOrigin } from "@orb/client/data";
import { readFramePanels, rememberFramePanels } from "@orb/client/data";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";

const ids = createIdSource();

test("a panels report reads back only for the frame that reported it", () => {
  const chatId = ids.typeId(ID_PREFIX.chat);
  const reporter: FramePanelsOrigin = { chatId, characterId: ids.typeId(ID_PREFIX.character) };
  const bytes = JSON.stringify(["the same reply's segments", "the same styles"]);
  rememberFramePanels(reporter, bytes, [0, 2]);
  // Positive control: the reporting frame reads its own report.
  expect(readFramePanels(reporter, bytes)).toEqual([0, 2]);
  const others = {
    "another character": { chatId, characterId: ids.typeId(ID_PREFIX.character) },
    "no character": { chatId, characterId: null },
    "another room": { chatId: ids.typeId(ID_PREFIX.chat), characterId: reporter.characterId },
  } as const satisfies Record<string, FramePanelsOrigin>;
  for (const [name, origin] of Object.entries(others)) {
    expect(readFramePanels(origin, bytes), name).toBeUndefined();
  }
  expect(readFramePanels(reporter, JSON.stringify(["another reply", "the same styles"]))).toBeUndefined();
});
