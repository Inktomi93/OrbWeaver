// lib/character-list-view — the pure LIST view helpers (§4.3/§4.4). DOM-free logic extracted for a
// browser-free test (Spine-Testing.md §7): the categorized group-by-tag fold (multi-tag duplication + the
// Uncategorized tail + empty-group drop) and the resume-or-new most-recent-chat reduction.
//
// The chip-filter pins moved OUT with `filterByChips` (owner ruling 2026-08-13 — favorites/archived/tag
// narrowing is `character.list` query input now). Their semantics are pinned where they execute:
// `tests/server/domain/character/verbs/list.int.test.ts` ("server-side chip filters").

import type { TagFolderType } from "@orb/contracts/tag";
import type { CharacterId, ChatId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// Deep import the PURE lib module (NOT the "@orb/client/features/character" barrel): a barrel import drags
// browser TSX into the dom-less root typecheck:graph program (the theme clamp.ts relative-import precedent).
import type { FilterableRow, ResumableChat } from "../../../../../packages/client/src/features/character/lib/character-list-view.ts";
import { groupByTag, groupStartsOpen, resumeTargets } from "../../../../../packages/client/src/features/character/lib/character-list-view.ts";
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
