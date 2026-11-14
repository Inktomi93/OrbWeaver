// The merge of a split folder's previews marks an entry a repeat when an earlier upload's entry holds all of its
// identities, and keeps every other entry as its own upload judged it. Its counts are exact over every entry, the
// unlisted tail of a capped upload included, and name the writes no other upload could be compared with.
// @subject packages/contracts/src/import/preview.ts

import type { ImportPreview, ImportPreviewItem, ImportPreviewKind } from "@orb/contracts/import";
import { IMPORT_PREVIEW_LIST_MAX, importPreviewListOf, mergeImportPreviews } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";

const KIND = "themes" satisfies ImportPreviewKind;

function itemAt(
  profile: string,
  path: string,
  identities: readonly string[],
  flag: Partial<Pick<ImportPreviewItem, "inLibrary" | "repeat">> = {},
): ImportPreviewItem {
  return { source: { profile, path }, sourceDigest: `${profile}/${path}`, name: path, identities, ...flag };
}

/** One upload's preview whose only entries are theme files. */
function uploadOf(...items: readonly ImportPreviewItem[]): ImportPreview {
  const empty = importPreviewListOf([]);
  return {
    kinds: {
      characters: empty,
      chats: empty,
      personas: empty,
      worlds: empty,
      presets: empty,
      themes: importPreviewListOf(items),
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

test("two entries and two skips whose shown sources clip alike stay two, by the digest of their whole source", () => {
  const clipped = { profile: "alice", path: "worlds/long" };
  const entry = (digest: string): ImportPreviewItem => ({ source: clipped, sourceDigest: digest, name: digest, identities: [digest] });
  const skip = (digest: string): ImportPreview["skipped"]["items"][number] => ({ source: clipped, sourceDigest: digest, reason: "not a readable world book" });
  const upload: ImportPreview = { ...uploadOf(entry("east"), entry("west")), skipped: { total: 2, items: [skip("east"), skip("west")] } };

  const merged = mergeImportPreviews([upload, upload]);

  expect(merged.kinds[KIND].items.map(({ sourceDigest }) => sourceDigest)).toEqual(["east", "west"]);
  expect(merged.kinds[KIND].total).toBe(2);
  expect(merged.skipped.items.map(({ sourceDigest }) => sourceDigest)).toEqual(["east", "west"]);
  expect(merged.skipped.total).toBe(2);
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

/** More entries than a preview lists, so the upload sends the first of them and counts the rest. The last entry,
 *  the one past the cap, carries `flagTail`. */
function tailedUpload(profile: string, flagTail: Partial<Pick<ImportPreviewItem, "inLibrary" | "repeat">> = {}): ImportPreview {
  const entries = Array.from({ length: IMPORT_PREVIEW_LIST_MAX + 1 }, (_, i) =>
    itemAt(profile, `${profile}-${String(i)}.json`, [`${profile}-${String(i)}`], i === IMPORT_PREVIEW_LIST_MAX ? flagTail : {}),
  );
  return uploadOf(...entries);
}

test("the counts of a kind past the list cap are exact: an owned entry past the cap is not a write", () => {
  const merged = mergeImportPreviews([tailedUpload("alice", { inLibrary: true })]);

  // The control: the list really holds fewer entries than the upload has, so a count read off it would be short.
  expect(merged.kinds[KIND].items).toHaveLength(IMPORT_PREVIEW_LIST_MAX);
  expect(merged.kinds[KIND].total).toBe(IMPORT_PREVIEW_LIST_MAX + 1);
  expect(merged.kinds[KIND].counts).toEqual({ inLibrary: 1, repeat: 0, writes: IMPORT_PREVIEW_LIST_MAX, withoutArt: 0, uncompared: 0 });
});

test("a split folder whose uploads each have an unlisted tail counts the writes it could not compare with the other upload", () => {
  const merged = mergeImportPreviews([tailedUpload("alice"), tailedUpload("bob", { repeat: true })]);

  const { total, counts } = merged.kinds[KIND];
  expect(total).toBe(2 * (IMPORT_PREVIEW_LIST_MAX + 1));
  // Alice's tail is an unflagged write nobody compared; bob's tail entry is its own upload's repeat, known exactly.
  expect(counts).toEqual({ inLibrary: 0, repeat: 1, writes: total - 1, withoutArt: 0, uncompared: 1 });
});

/** A file every upload of a split folder carries, as many of them as `count`: each upload lists the first of them and
 *  counts the rest, and an entry past the list cap has the same source in every upload. */
function sharedUpload(count: number, flag: Partial<Pick<ImportPreviewItem, "inLibrary" | "repeat">> = {}): ImportPreview {
  return uploadOf(...Array.from({ length: count }, (_, i) => itemAt("alice", `shared-${String(i)}.json`, [], flag)));
}

test("entries every upload of a split folder carries are counted once however many uploads hold them, owned or not", () => {
  const past = IMPORT_PREVIEW_LIST_MAX + 1;

  const fresh = mergeImportPreviews([sharedUpload(past), sharedUpload(past)]).kinds[KIND];
  const owned = mergeImportPreviews([sharedUpload(past, { inLibrary: true }), sharedUpload(past, { inLibrary: true })]).kinds[KIND];

  // Each upload sends no identities for these, so a write among them is a bound; the entry past the cap is one write.
  expect(fresh.total).toBe(past);
  expect(fresh.counts).toEqual({ inLibrary: 0, repeat: 0, writes: past, withoutArt: 0, uncompared: past });
  expect(owned.total).toBe(past);
  expect(owned.counts).toEqual({ inLibrary: past, repeat: 0, writes: 0, withoutArt: 0, uncompared: 0 });
});

test("an entry one upload lists and another leaves in its tail is counted once, whichever upload lists it", () => {
  const past = IMPORT_PREVIEW_LIST_MAX + 1;
  const last = itemAt("alice", "last.json", ["last"], { inLibrary: true });
  const filler = (profile: string): ImportPreviewItem[] =>
    Array.from({ length: IMPORT_PREVIEW_LIST_MAX }, (_, i) =>
      itemAt(profile, `${profile}-${String(i)}.json`, [`${profile}-${String(i)}`], { inLibrary: true }),
    );

  const tailFirst = mergeImportPreviews([uploadOf(...filler("alice"), last), uploadOf(last)]).kinds[KIND];
  const tailSecond = mergeImportPreviews([uploadOf(last), uploadOf(...filler("alice"), last)]).kinds[KIND];

  expect(tailFirst.total).toBe(past);
  expect(tailSecond.total).toBe(past);
  expect(tailFirst.counts.inLibrary).toBe(past);
  expect(tailSecond.counts.inLibrary).toBe(past);
});

test("an unlisted entry past the digests an upload sends cannot be matched, so it is counted as the upload counted it and named uncompared", () => {
  // Far past the cap and the digests together; the bound itself is read off what the list sends.
  const entries = 20 * IMPORT_PREVIEW_LIST_MAX;
  const upload = sharedUpload(entries);
  const digested = upload.kinds[KIND].tail.writes.length;
  const unmatched = entries - IMPORT_PREVIEW_LIST_MAX - digested;

  const merged = mergeImportPreviews([upload, sharedUpload(entries)]).kinds[KIND];

  // The control: the digests stop short of the tail, so some entries are the same file in both uploads and cannot be told.
  expect(digested).toBeGreaterThan(0);
  expect(unmatched).toBeGreaterThan(0);
  // Those count twice, a bound the count says it is; every other entry counts once.
  expect(merged.total).toBe(entries + unmatched);
  expect(merged.counts.uncompared).toBe(merged.counts.writes);
});

test("one upload with an unlisted tail has no other upload to be compared with, so none of it is uncompared", () => {
  expect(mergeImportPreviews([tailedUpload("alice")]).kinds[KIND].counts.uncompared).toBe(0);
});

test("in a split folder a listed entry with no identities is uncompared, and an entry the library holds is not", () => {
  const merged = mergeImportPreviews([
    uploadOf(itemAt("alice", "a.json", []), itemAt("alice", "held.json", [], { inLibrary: true })),
    uploadOf(itemAt("bob", "b.json", ["b"])),
  ]);

  expect(merged.kinds[KIND].counts).toEqual({ inLibrary: 1, repeat: 0, writes: 2, withoutArt: 0, uncompared: 1 });
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
