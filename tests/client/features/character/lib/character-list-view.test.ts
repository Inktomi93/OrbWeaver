// lib/character-list-view — the pure LIST view helpers (§4.3/§4.4). DOM-free logic extracted for a
// browser-free test (Spine-Testing.md §7): the categorized group-by-tag fold (multi-tag duplication + the
// Uncategorized tail) and, since #1696, the CENSUS arm that decides which buckets exist at all.
//
// WHAT #1696 MOVED, AND WHAT IS PINNED HERE. The fold used to derive both the buckets and their counts from
// the LOADED rows, so at 312 characters the headers described the ~30 the keyset had paged in. The buckets
// and their sizes come from `character.listTagGroups` now (counted server-side over the same lens — pinned
// in `tests/server/domain/character/verbs/list-tag-groups.int.test.ts`), and what is left here is the half
// only the client can do: put the rows it HAS under the headers the server named. So the properties below
// are (a) the census arm respects the server's membership + order + counts and never re-derives them, and
// (b) the PENDING arm claims nothing about the library rather than filling the gap from the page.
//
// THE RESUME-OR-NEW PINS MOVED WITH THEIR SUBJECT (#1662). `resumeTargets` — and #1503's total-order pins
// over it — are retired: the resume target is `CharacterSummary.lastChatId`, computed in SQL over the whole
// library. The same three properties (recency wins · a never-messaged room falls back to its row stamp · an
// equal-recency pair resolves by DATA, not by iteration order) are pinned where they now execute,
// `tests/server/domain/character/persistence/queries.int.test.ts` ("the resume target").
//
// The chip-filter pins moved OUT with `filterByChips` (owner ruling 2026-08-13 — favorites/archived/tag
// narrowing is `character.list` query input now). Their semantics are pinned where they execute:
// `tests/server/domain/character/verbs/list.int.test.ts` ("server-side chip filters").

import type { TagFolderType } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// Deep import the PURE lib module (NOT the "@orb/client/features/character" barrel): a barrel import drags
// browser TSX into the dom-less root typecheck:graph program (the theme clamp.ts relative-import precedent).
import type { FilterableRow, TagGroupCensus } from "../../../../../packages/client/src/features/character/lib/character-list-view.ts";
import { groupByTag, groupStartsOpen } from "../../../../../packages/client/src/features/character/lib/character-list-view.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const tag = (id: string, name: string, isHiddenOnCard = false, folderType: TagFolderType = "NONE"): FilterableRow["tags"][number] => ({
  id: castId<TagId>(id),
  name,
  isHiddenOnCard,
  folderType,
});

const row = (over: Partial<FilterableRow> & { readonly id?: string }): FilterableRow & { id: string } => ({
  id: over.id ?? "char_x",
  tags: over.tags ?? [],
});

/** A census as `character.listTagGroups` returns it — already ordered by the server. */
const census = (groups: readonly (readonly [string, string, number])[], uncategorized: number): TagGroupCensus => ({
  groups: groups.map(([id, name, characters]) => ({ id: castId<TagId>(id), name, folderType: "NONE" as const, characters })),
  uncategorized,
});

test("groupByTag: multi-tag rows appear under EACH group; untagged fall to the Uncategorized tail", () => {
  const rpg = tag("t_rpg", "rpg");
  const noir = tag("t_noir", "noir");
  const rows = [row({ id: "a", tags: [rpg, noir] }), row({ id: "b", tags: [rpg] }), row({ id: "c", tags: [] })];
  const groups = groupByTag(
    rows,
    census(
      [
        ["t_noir", "noir", 1],
        ["t_rpg", "rpg", 2],
      ],
      1,
    ),
  );
  // The server's order is kept verbatim (it ranks most-populated-first with a name tie-break); Uncategorized
  // is always the tail, because it is the catch-all rather than a bucket in the ranking.
  expect(groups.map((g) => (g.tag === null ? "__uncat" : g.tag.name))).toEqual(["noir", "rpg", "__uncat"]);
  const rpgGroup = groups.find((g) => g.tag?.name === "rpg");
  expect(rpgGroup?.items.map((r) => r.id)).toEqual(["a", "b"]);
  const uncat = groups.find((g) => g.tag === null);
  expect(uncat?.items.map((r) => r.id)).toEqual(["c"]);
});

// THE DEFECT #1696 CLOSED, as a property: the header's number is the LIBRARY's, and it is not the loaded
// length. At 312 characters those two differ by two orders of magnitude and the old fold could only say the
// second one.
test("groupByTag: the bucket's `total` is the SERVER's count, never the loaded members' length", () => {
  const rpg = tag("t_rpg", "rpg");
  const groups = groupByTag([row({ id: "a", tags: [rpg] })], census([["t_rpg", "rpg", 47]], 265));
  expect(groups[0]?.total).toBe(47);
  expect(groups[0]?.items).toHaveLength(1);
  expect(groups.find((g) => g.tag === null)?.total).toBe(265);
});

// The whole point of taking the HEADERS from the server too: a tag whose members are all still beyond the
// loaded window is a real bucket, and a page-derived fold could not know it existed.
test("groupByTag: a census bucket with NO loaded member still renders — the headers are the library's map", () => {
  const groups = groupByTag([], census([["t_vamp", "vampire", 12]], 0));
  expect(groups.map((g) => g.tag?.name)).toEqual(["vampire"]);
  expect(groups[0]?.items).toEqual([]);
  expect(groups[0]?.total).toBe(12);
});

test("groupByTag: an Uncategorized bucket the census counts at ZERO is not a header", () => {
  const rpg = tag("t_rpg", "rpg");
  const groups = groupByTag([row({ id: "a", tags: [rpg] })], census([["t_rpg", "rpg", 1]], 0));
  expect(groups.map((g) => g.tag === null)).toEqual([false]);
});

// The PENDING arm. It must not fill the library's numbers in from the page — that IS the defect — so it
// states them as absent and folds only what it has.
test("groupByTag: with NO census the buckets are page-local and every `total` is null", () => {
  const rpg = tag("t_rpg", "rpg");
  const noir = tag("t_noir", "noir");
  const rows = [row({ id: "a", tags: [rpg, noir] }), row({ id: "c", tags: [] })];
  const groups = groupByTag(rows, null);
  expect(groups.map((g) => (g.tag === null ? "__uncat" : g.tag.name))).toEqual(["noir", "rpg", "__uncat"]);
  expect(groups.every((g) => g.total === null)).toBe(true);
});

test("groupByTag: hidden-on-card tags do not form groups (a hidden-only row is Uncategorized)", () => {
  const secret = tag("t_secret", "secret", true);
  // The census agrees by construction — the server counts VISIBLE accepted tags only, so a hidden-only
  // carrier arrives in its `uncategorized` count and no bucket is named for the hidden tag.
  const groups = groupByTag([row({ id: "a", tags: [secret] })], census([], 1));
  expect(groups).toHaveLength(1);
  expect(groups[0]?.tag).toBeNull();
  expect(groups[0]?.items.map((r) => r.id)).toEqual(["a"]);
});

// C9-1d — the tags-as-folders read. `folderType` was a WRITE-ONLY column (the tag editor wrote it, nothing
// branched on it); `groupStartsOpen` is its first live consumer, so these pin the mapping itself.
test("groupStartsOpen: an OPEN tag's group starts expanded, a plain tag's starts collapsed", () => {
  expect(groupStartsOpen(tag("t_open", "rpg", false, "OPEN"))).toBe(true);
  expect(groupStartsOpen(tag("t_plain", "noir", false, "NONE"))).toBe(false);
});

test("groupStartsOpen: CLOSED is DEFERRED, so it collapses like a plain tag — it never opens by default", () => {
  // The drilldown arm (hide until entered) is deliberately unbuilt (owner ruling 2026-08-09). Until it
  // exists, CLOSED must not be the odd member that silently reads as OPEN.
  expect(groupStartsOpen(tag("t_closed", "vault", false, "CLOSED"))).toBe(false);
});

test("groupStartsOpen: the Uncategorized bucket (no tag) always starts expanded", () => {
  // It has no folderType to read and no editor to configure it — a catch-all the user cannot open by
  // configuration must not be closed by default.
  expect(groupStartsOpen(null)).toBe(true);
});
