// The merge of a split folder's previews marks an entry a repeat when an earlier upload's entry holds all of its
// identities, and keeps every other entry as its own upload judged it.
// @subject packages/contracts/src/import/preview.ts

import type { ImportPreview, ImportPreviewItem, ImportPreviewKind } from "@orb/contracts/import";
import { mergeImportPreviews } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";

const KIND = "themes" satisfies ImportPreviewKind;

function itemAt(
  profile: string,
  path: string,
  identities: readonly string[],
  flag: Partial<Pick<ImportPreviewItem, "inLibrary" | "repeat">> = {},
): ImportPreviewItem {
  return { source: { profile, path }, name: path, identities, ...flag };
}

/** One upload's preview whose only entries are theme files. */
function uploadOf(...items: readonly ImportPreviewItem[]): ImportPreview {
  const empty = { total: 0, items: [] };
  return {
    kinds: {
      characters: empty,
      chats: empty,
      personas: empty,
      worlds: empty,
      presets: empty,
      themes: { total: items.length, items },
      backgrounds: empty,
      groups: empty,
      orphans: empty,
    },
    skipped: { total: 0, items: [] },
  };
}

function verdictOf(item: ImportPreviewItem): "writes" | "repeat" | "library" {
  if (item.repeat === true) {
    return "repeat";
  }
  return item.inLibrary === true ? "library" : "writes";
}

/** What each merged item says of itself: its path and whether a run writes it. */
function verdicts(preview: ImportPreview): readonly (readonly [string, "writes" | "repeat" | "library"])[] {
  return preview.kinds[KIND].items.map((item) => [item.source.path, verdictOf(item)]);
}

test("an entry whose identities an earlier upload's entry holds is a repeat, and one with other identities is not", () => {
  const merged = mergeImportPreviews([
    uploadOf(itemAt("alice", "Dusk.json", ["dusk"])),
    uploadOf(itemAt("bob", "Dusk.json", ["dusk"]), itemAt("bob", "Ember.json", ["ember"])),
  ]);

  expect(verdicts(merged)).toEqual([
    ["Dusk.json", "writes"],
    ["Dusk.json", "repeat"],
    ["Ember.json", "writes"],
  ]);
  expect(merged.kinds[KIND].total).toBe(3);
});

test("the same source in two uploads is one entry and is not a repeat of itself", () => {
  const shared = itemAt("alice", "Dusk.json", ["dusk"]);

  const merged = mergeImportPreviews([uploadOf(shared), uploadOf(shared)]);

  expect(verdicts(merged)).toEqual([["Dusk.json", "writes"]]);
});

test("an entry with no identities cannot be compared and stays a write", () => {
  const merged = mergeImportPreviews([uploadOf(itemAt("alice", "a.json", [])), uploadOf(itemAt("bob", "b.json", []))]);

  expect(verdicts(merged)).toEqual([
    ["a.json", "writes"],
    ["b.json", "writes"],
  ]);
});

test("an entry the library holds keeps that verdict, and what an upload already marked a repeat stays one", () => {
  const merged = mergeImportPreviews([
    uploadOf(itemAt("alice", "held.json", ["held"], { inLibrary: true }), itemAt("alice", "first.json", ["first"])),
    uploadOf(itemAt("bob", "held.json", ["held"], { inLibrary: true }), itemAt("bob", "first.json", ["first"], { repeat: true })),
  ]);

  expect(verdicts(merged)).toEqual([
    ["held.json", "library"],
    ["first.json", "writes"],
    ["held.json", "library"],
    ["first.json", "repeat"],
  ]);
});

test("an entry that holds several identities is a repeat only when earlier entries hold every one of them", () => {
  const merged = mergeImportPreviews([
    uploadOf(itemAt("alice", "one.json", ["a"]), itemAt("alice", "two.json", ["b"])),
    uploadOf(itemAt("bob", "both.json", ["a", "b"]), itemAt("bob", "partly.json", ["a", "c"])),
  ]);

  expect(verdicts(merged)).toEqual([
    ["one.json", "writes"],
    ["two.json", "writes"],
    ["both.json", "repeat"],
    ["partly.json", "writes"],
  ]);
});
