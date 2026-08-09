// lib/character-list-view — the pure LIST view helpers (§4.3/§4.4/§4.5). DOM-free logic extracted for a
// browser-free test (Spine-Testing.md §7): the chip filter's conjunctive semantics + the archived opt-in,
// the categorized group-by-tag fold (multi-tag duplication + the Uncategorized tail + empty-group drop),
// and the resume-or-new most-recent-chat reduction.

import type { TagFolderType } from "@orb/contracts/tag";
import type { CharacterId, ChatId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// Deep import the PURE lib module (NOT the "@orb/client/features/character" barrel): a barrel import drags
// browser TSX into the dom-less root typecheck:graph program (the theme clamp.ts relative-import precedent).
import type { FilterableRow, ResumableChat } from "../../../../../packages/client/src/features/character/lib/character-list-view.ts";
import { filterByChips, groupByTag, groupStartsOpen, resumeTargets } from "../../../../../packages/client/src/features/character/lib/character-list-view.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const tag = (id: string, name: string, isHiddenOnCard = false, folderType: TagFolderType = "NONE"): FilterableRow["tags"][number] => ({
  id: castId<TagId>(id),
  name,
  isHiddenOnCard,
  folderType,
});

const row = (over: Partial<FilterableRow> & { readonly id?: string }): FilterableRow & { id: string } => ({
  id: over.id ?? "char_x",
  starred: over.starred ?? false,
  archived: over.archived ?? false,
  tags: over.tags ?? [],
});

test("filterByChips: archived rows hidden unless showArchived is opted in", () => {
  const rows = [row({ id: "a" }), row({ id: "b", archived: true })];
  expect(filterByChips(rows, { favoritesOnly: false, showArchived: false, tagFilter: [] })).toHaveLength(1);
  expect(filterByChips(rows, { favoritesOnly: false, showArchived: true, tagFilter: [] })).toHaveLength(2);
});

test("filterByChips: favoritesOnly keeps only starred; tagFilter is conjunctive (AND)", () => {
  const rpg = tag("t_rpg", "rpg");
  const noir = tag("t_noir", "noir");
  const rows = [
    row({ id: "a", starred: true, tags: [rpg, noir] }),
    row({ id: "b", starred: true, tags: [rpg] }),
    row({ id: "c", starred: false, tags: [rpg, noir] }),
  ];
  const favs = filterByChips(rows, { favoritesOnly: true, showArchived: false, tagFilter: [] });
  expect(favs.map((r) => r.id)).toEqual(["a", "b"]);
  const both = filterByChips(rows, {
    favoritesOnly: false,
    showArchived: false,
    tagFilter: [
      { id: rpg.id, state: "include" },
      { id: noir.id, state: "include" },
    ],
  });
  expect(both.map((r) => r.id)).toEqual(["a", "c"]);
});

// EXCLUSION (the axis neither our lineage nor neo ever built): "everything tagged rpg that ISN'T noir" is
// the query a pure-AND multi-select cannot express at all.
test("filterByChips: an excluded tag removes the rows carrying it, and composes with include", () => {
  const rpg = tag("t_rpg", "rpg");
  const noir = tag("t_noir", "noir");
  const rows = [row({ id: "a", tags: [rpg, noir] }), row({ id: "b", tags: [rpg] }), row({ id: "c", tags: [noir] }), row({ id: "d", tags: [] })];

  const notNoir = filterByChips(rows, { favoritesOnly: false, showArchived: false, tagFilter: [{ id: noir.id, state: "exclude" }] });
  expect(notNoir.map((r) => r.id)).toEqual(["b", "d"]);

  const rpgNotNoir = filterByChips(rows, {
    favoritesOnly: false,
    showArchived: false,
    tagFilter: [
      { id: rpg.id, state: "include" },
      { id: noir.id, state: "exclude" },
    ],
  });
  expect(rpgNotNoir.map((r) => r.id)).toEqual(["b"]);
});

test("groupByTag: multi-tag rows appear under EACH group; untagged fall to the Uncategorized tail", () => {
  const rpg = tag("t_rpg", "rpg");
  const noir = tag("t_noir", "noir");
  const rows = [row({ id: "a", tags: [rpg, noir] }), row({ id: "b", tags: [rpg] }), row({ id: "c", tags: [] })];
  const groups = groupByTag(rows);
  // Named groups sort by tag name (noir < rpg), Uncategorized always last.
  expect(groups.map((g) => (g.tag === null ? "__uncat" : g.tag.name))).toEqual(["noir", "rpg", "__uncat"]);
  const rpgGroup = groups.find((g) => g.tag?.name === "rpg");
  expect(rpgGroup?.items.map((r) => r.id)).toEqual(["a", "b"]);
  const uncat = groups.find((g) => g.tag === null);
  expect(uncat?.items.map((r) => r.id)).toEqual(["c"]);
});

test("groupByTag: hidden-on-card tags do not form groups (a hidden-only row is Uncategorized)", () => {
  const secret = tag("t_secret", "secret", true);
  const groups = groupByTag([row({ id: "a", tags: [secret] })]);
  expect(groups).toHaveLength(1);
  expect(groups[0]?.tag).toBeNull();
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

test("resumeTargets: characterId → the most-recent chat (lastMessageAt desc, updatedAt tiebreak)", () => {
  const cid = castId<CharacterId>("char_a");
  const chat = (id: string, lastMessageAt: number | null, updatedAt: number): ResumableChat => ({
    id: castId<ChatId>(id),
    participantCharacterIds: [cid],
    lastMessageAt,
    updatedAt,
  });
  const map = resumeTargets([chat("chat_old", 100, 1), chat("chat_new", 200, 1)]);
  expect(map.get(cid)).toBe("chat_new");

  // A never-messaged chat (null lastMessageAt) falls back to updatedAt for recency.
  const map2 = resumeTargets([chat("chat_msg", 50, 1), chat("chat_fresh", null, 999)]);
  expect(map2.get(cid)).toBe("chat_fresh");
});
