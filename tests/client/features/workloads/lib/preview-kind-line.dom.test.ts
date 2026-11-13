// The count line of a kind reads the preview's exact counts, never its capped list, and says when a split folder's
// writes could not be compared with the other uploads.
// @subject packages/client/src/features/workloads/lib/portability-model.ts

import type { ImportPreview, ImportPreviewItem, ImportPreviewList } from "@orb/contracts/import";
import { IMPORT_PREVIEW_LIST_MAX, importPreviewListOf, mergeImportPreviews } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import { importPreviewUncomparedNote } from "#client/features/workloads/lib/import-library-names.ts";
import { previewKindLine } from "#client/features/workloads/lib/portability-model.ts";

function entry(path: string, flag: Partial<Pick<ImportPreviewItem, "inLibrary">> = {}): ImportPreviewItem {
  return { source: { profile: "profile", path }, sourceDigest: path, name: path, identities: [path], ...flag };
}

const OWNED_PAST_THE_CAP = IMPORT_PREVIEW_LIST_MAX + 1;

test("a kind with more owned entries than the list holds says how many the library holds, not how many are listed", () => {
  const owned = importPreviewListOf(Array.from({ length: OWNED_PAST_THE_CAP }, (_, i) => entry(`p${String(i)}.json`, { inLibrary: true })));

  // The control: the list is capped, so a count taken from it would read one short.
  expect(owned.items).toHaveLength(IMPORT_PREVIEW_LIST_MAX);
  expect(previewKindLine("presets", owned)).toBe(`${String(OWNED_PAST_THE_CAP)} presets, ${String(OWNED_PAST_THE_CAP)} already in your library`);
});

test("a split folder's line states the writes no other upload could be compared with, and a whole one states none", () => {
  const upload = (profile: string): ImportPreviewList =>
    importPreviewListOf(Array.from({ length: OWNED_PAST_THE_CAP }, (_, i) => entry(`${profile}/p${String(i)}.json`)));
  const wrap = (presets: ImportPreviewList): ImportPreview => {
    const none = importPreviewListOf([]);
    return {
      kinds: { characters: none, chats: none, personas: none, worlds: none, presets, themes: none, backgrounds: none, groups: none, orphans: none },
      skipped: { total: 0, items: [] },
    };
  };

  const split = mergeImportPreviews([wrap(upload("a")), wrap(upload("b"))]).kinds.presets;
  const whole = mergeImportPreviews([wrap(upload("a"))]).kinds.presets;

  expect(previewKindLine("presets", split)).toBe(`${String(2 * OWNED_PAST_THE_CAP)} presets, ${importPreviewUncomparedNote(2)}`);
  expect(previewKindLine("presets", whole)).toBe(`${String(OWNED_PAST_THE_CAP)} presets`);
});
