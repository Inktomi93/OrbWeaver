// lib/character-library-lens — the three pure decisions the library pane makes around its server read
// (owner ruling 2026-08-13). DOM-free, so they are pinned here rather than only through a mounted pane
// (Spine-Testing.md §7).
//
// Each test corresponds to something that was WRONG while the pane filtered a loaded window: the readout
// claimed the loaded count was the answer, the chip vocabulary came from the loaded rows (so an active
// filter could render no chip at all), and the chip ids went to the wire in click order.

import type { TagFilterVocabularyEntry } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// Deep import the PURE lib module (NOT the "@orb/client/features/character" barrel): a barrel import drags
// browser TSX into the dom-less root typecheck:graph program (the character-list-view precedent).
import type { LibraryChipTag } from "../../../../../packages/client/src/features/character/lib/character-library-lens.ts";
import {
  effectiveTagFilter,
  knownTagIds,
  loadedProgressLabel,
  resultCountLabel,
  tagIdsInState,
  tagVocabulary,
  vocabularyPanelTags,
} from "../../../../../packages/client/src/features/character/lib/character-library-lens.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// The vocabulary read's four fields — `tag.listTagFilterVocabulary`, ALREADY RANKED most-used-first by the
// server (side-eye 2026-08-18 P2-6: the chip rail used to read the management screen's five-junction
// rollup, 433KB for 1,736 rows to paint 8 chips). So these fixtures are written in the order the server
// would return them, and `tagVocabulary` is asserted to PRESERVE it rather than to produce it — the rank
// itself is pinned server-side (tests/server/domain/tag/tag.int.test.ts).
const libraryTag = (id: string, name: string, characters: number, isHiddenOnCard = false): TagFilterVocabularyEntry => ({
  id: castId<TagId>(id),
  name,
  isHiddenOnCard,
  characters,
});

test("resultCountLabel: with every match loaded it states one number, pluralised", () => {
  expect(resultCountLabel(1, 1)).toBe("1 character");
  expect(resultCountLabel(3, 3)).toBe("3 characters");
  expect(resultCountLabel(0, 0)).toBe("0 characters");
});

// THE RULING SURVIVES — ITS INPUT CHANGED (#493, side-eye 2026-08-22 rail-characters P2-1). The half that
// held: the number here is the SERVER's census, never "loaded so far" — "30 characters" over a 412-match
// library is a false statement and always was. The half that died: printing BOTH numbers here. At rest the
// line read `30 of 327 characters` — the page size (`character.list {limit:30}`) worded as a result count,
// 230px under a band already reading `CHARACTERS 327` — and the natural reading is "only 30 of your
// characters match", which is false in the state everybody sees.
test("resultCountLabel: a partially-loaded page states the CENSUS, not the page size", () => {
  expect(resultCountLabel(30, 412)).toBe("412 characters");
  expect(resultCountLabel(30, 1)).toBe("1 character");
});

// …and the loaded number is not lost: it moves to the foot of the list, beside the tail-fetch sentinel,
// which is where "how much of it have I got" is the question being asked.
test("loadedProgressLabel: reports the loaded fraction only while there IS one", () => {
  expect(loadedProgressLabel(30, 327)).toBe("30 of 327 loaded");
  // Complete, or no census yet — a progress line with nothing to report is noise.
  expect(loadedProgressLabel(30, 30)).toBeNull();
  expect(loadedProgressLabel(30, null)).toBeNull();
});

// `partialGroupingLabel`'s TEST WENT WITH THE FUNCTION (#1696). #493 P2-2 measured the defect it described —
// `ADVENTURE 1 · … · UNCATEGORIZED 27`, four counts summing to the 30 rows paged in, read as library facts
// over a 327-character library — and the blanket caveat was the honest thing to say WHILE the counts were
// the page's. They are `character.listTagGroups`' census now, so the sentence would be false; the property
// that replaced it is per-bucket and lives where the buckets are made
// (`tests/client/features/character/lib/character-list-view.test.ts`).

test("resultCountLabel: before the census lands, the loaded count is the only honest thing to say", () => {
  expect(resultCountLabel(2, null)).toBe("2 characters");
});

test("tagIdsInState: splits the three-state entries by arm and SORTS (the query key must not follow clicks)", () => {
  const entries = [
    { id: castId<TagId>("tag_zeta"), state: "include" as const },
    { id: castId<TagId>("tag_alpha"), state: "include" as const },
    { id: castId<TagId>("tag_mid"), state: "exclude" as const },
  ];
  expect(tagIdsInState(entries, "include")).toEqual(["tag_alpha", "tag_zeta"]);
  expect(tagIdsInState(entries, "exclude")).toEqual(["tag_mid"]);
  // Cycling the two include chips in the other order must produce the SAME wire input.
  expect(tagIdsInState([entries[1] as (typeof entries)[number], entries[0] as (typeof entries)[number]], "include")).toEqual(["tag_alpha", "tag_zeta"]);
});

test("tagVocabulary: drops hidden-on-card tags and PRESERVES the server's most-used-first rank", () => {
  const library = [libraryTag("tag_h", "hidden", 99, true), libraryTag("tag_a", "alpha", 9), libraryTag("tag_b", "beta", 3), libraryTag("tag_c", "cast", 3)];
  expect(tagVocabulary(library, []).map((tag) => tag.name)).toEqual(["alpha", "beta", "cast"]);
});

test("tagVocabulary: an ACTIVE hidden-on-card tag is pinned back in — known ⟺ named (W5)", () => {
  // A hidden tag still EXISTS, so `knownTagIds` keeps it filtering; a chip reading "Deleted tag" over an id
  // that is narrowing the list would be the invisible-filter defect wearing a label.
  const library = [libraryTag("tag_h", "hidden", 99, true), libraryTag("tag_used", "used", 4)];
  const active = [{ id: castId<TagId>("tag_h"), state: "exclude" as const }];
  expect(tagVocabulary(library, active).map((tag) => tag.name)).toEqual(["hidden", "used"]);
});

// ── W5: referential integrity for the persisted filter (staleness-and-session-freshness.md §4.2.2) ──
// The owner's import repro in a pure function: a persisted include-id whose tag is gone matches zero rows
// under the server's AND-semantics, so it empties the whole library — invisibly, and across every reload.

test("effectiveTagFilter: an id the library does not know is DROPPED from the wire, on both arms", () => {
  const known = knownTagIds([libraryTag("tag_live", "live", 2)]);
  const entries = [
    { id: castId<TagId>("tag_live"), state: "include" as const },
    { id: castId<TagId>("tag_dead_era"), state: "include" as const },
    { id: castId<TagId>("tag_also_dead"), state: "exclude" as const },
  ];
  expect(effectiveTagFilter(entries, known)).toEqual([{ id: "tag_live", state: "include" }]);
  // …and the whole filter going dead leaves the request UNFILTERED rather than matching nothing.
  expect(tagIdsInState(effectiveTagFilter([entries[1] as (typeof entries)[number]], known), "include")).toEqual([]);
});

test("effectiveTagFilter: a HIDDEN-on-card tag is known, so it keeps filtering", () => {
  const known = knownTagIds([libraryTag("tag_h", "hidden", 9, true)]);
  const entries = [{ id: castId<TagId>("tag_h"), state: "include" as const }];
  expect(effectiveTagFilter(entries, known)).toEqual(entries);
});

test("effectiveTagFilter: an UNRESOLVED authority passes the blob through (not-loaded ≠ not-known)", () => {
  // Treating the in-flight read as "nothing is known" would drop every LIVE filter on first paint, flash the
  // unfiltered library, and re-key the collection query on every boot.
  const entries = [{ id: castId<TagId>("tag_live"), state: "include" as const }];
  expect(effectiveTagFilter(entries, null)).toEqual(entries);
});

test("tagVocabulary: an unused tag is dropped — UNLESS it is an active filter (it must stay clearable)", () => {
  const library = [libraryTag("tag_used", "used", 4), libraryTag("tag_unused", "unused", 0)];
  expect(tagVocabulary(library, []).map((tag) => tag.name)).toEqual(["used"]);

  const active = [{ id: castId<TagId>("tag_unused"), state: "include" as const }];
  // A filter narrowing the library to nothing is exactly the one whose chip the user needs most.
  expect(tagVocabulary(library, active).map((tag) => tag.name)).toEqual(["used", "unused"]);
});

// ── vocabularyPanelTags — the BOUNDED expansion's order + index (side-eye 2026-08-17 P1) ────────────
// The disclosure used to render the whole vocabulary back into the wrapping rail (551 chips, a 5,957px
// wall, the character list at zero height). It renders into a bounded scroller now — which re-opens the
// hole the cap was minted against unless the ACTIVE chips lead, and is unusable at 551 entries without an
// index. Both rules are pure, so they are pinned here rather than only through a mounted pane.

const panelChip = (id: string, name: string): LibraryChipTag => ({ id: castId<TagId>(id), name });

test("vocabularyPanelTags: ACTIVE entries lead, and the caller's most-used ranking survives underneath", () => {
  const tags = [panelChip("tag_a", "alpha"), panelChip("tag_b", "beta"), panelChip("tag_c", "gamma")];
  const active = [{ id: castId<TagId>("tag_c"), state: "exclude" as const }];
  // `gamma` was ranked last and is now first — an active filter must be above the scroller's fold, and
  // the other two keep the order they arrived in (the sort is stable).
  expect(vocabularyPanelTags(tags, active, "").map((tag) => tag.name)).toEqual(["gamma", "alpha", "beta"]);
});

test("vocabularyPanelTags: the query is a case-insensitive, trimmed NAME substring", () => {
  const tags = [panelChip("tag_a", "Adventure"), panelChip("tag_b", "Slice of life"), panelChip("tag_c", "advent calendar")];
  expect(vocabularyPanelTags(tags, [], "  ADVENT ").map((tag) => tag.name)).toEqual(["Adventure", "advent calendar"]);
  // A mid-word match counts: a 551-entry vocabulary is searched by fragment, not by prefix.
  expect(vocabularyPanelTags(tags, [], "of li").map((tag) => tag.name)).toEqual(["Slice of life"]);
  // The empty query is the WHOLE vocabulary, never an empty result.
  expect(vocabularyPanelTags(tags, [], "").length).toBe(tags.length);
});

test("vocabularyPanelTags: filtering does not lose the active-first rule", () => {
  const tags = [panelChip("tag_a", "adventure"), panelChip("tag_b", "advice")];
  const active = [{ id: castId<TagId>("tag_b"), state: "include" as const }];
  expect(vocabularyPanelTags(tags, active, "adv").map((tag) => tag.name)).toEqual(["advice", "adventure"]);
});
