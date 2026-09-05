// verb: listTagGroups — the library's GROUP-BY-TAG census (#1696).
//
// WHAT IS ACTUALLY BEING PINNED. The categorized view folded the LOADED rows into buckets, so at 312
// characters the headers counted the ~30 the keyset had paged in and presented them as library facts. The
// property this suite exists for is that the census is a fact about the MATCHED LIBRARY and never about a
// page — so every arm below seeds more rows than any page would carry and asks with no paging input at all
// (there is none in the shape, which is half the fix).
//
// THE FOUR THINGS THAT CAN GO WRONG, one arm each: the census counts the wrong scope (owner leak), it
// ignores the lens (the #493 refusal's first disqualifier — a lens-blind count beside lens-filtered
// members), it cannot answer Uncategorized (the second disqualifier), or it counts tags the grouped view
// does not fold by (pending suggestions, hidden-on-card).

import { characterTags, tags } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, TagId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

interface Library {
  readonly owner: UserId;
  readonly stranger: UserId;
  readonly rpg: TagId;
  readonly noir: TagId;
  readonly hidden: TagId;
  readonly aria: CharacterId;
}

/**
 * A library with every shape the census has to judge:
 *   · `aria`    — starred, carries rpg + noir (so she is in TWO buckets: the reason the groups cannot sum)
 *   · `bolt`    — no tags at all (Uncategorized)
 *   · `cass`    — rpg, plus a PENDING noir suggestion (which is not a bucket she is in)
 *   · `dusk`    — archived, rpg (so the archived axis has something to move)
 *   · `veil`    — carries ONLY a hidden-on-card tag ⇒ Uncategorized ON SCREEN, which is what the fold does
 *   · a STRANGER's character carrying the stranger's own tag, so an owner-scope slip has a marker to leak
 */
async function seedLibrary(db: Awaited<ReturnType<typeof freshDb>>): Promise<Library> {
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const rpg = castId<TagId>("tag_rpg");
  const noir = castId<TagId>("tag_noir");
  const hidden = castId<TagId>("tag_hidden");
  const foreign = castId<TagId>("tag_foreign");
  await db.insert(tags).values([
    { id: rpg, ownerId: owner, name: "rpg" },
    { id: noir, ownerId: owner, name: "noir" },
    { id: hidden, ownerId: owner, name: "hidden-note", isHiddenOnCard: true },
    { id: foreign, ownerId: stranger, name: "strangers-tag" },
  ]);
  const aria = await seedRawCharacter(db, {
    id: "character_aria",
    ownerId: owner,
    handle: castId<CharacterHandle>("aria"),
    name: "Aria Nightshade",
    starred: true,
    createdAt: 5000,
  });
  await seedRawCharacter(db, { id: "character_bolt", ownerId: owner, handle: castId<CharacterHandle>("bolt"), name: "Bolt", createdAt: 4000 });
  const cass = await seedRawCharacter(db, { id: "character_cass", ownerId: owner, handle: castId<CharacterHandle>("cass"), name: "Cassius", createdAt: 3000 });
  const dusk = await seedRawCharacter(db, {
    id: "character_dusk",
    ownerId: owner,
    handle: castId<CharacterHandle>("dusk"),
    name: "Dusk",
    archived: true,
    createdAt: 2000,
  });
  const veil = await seedRawCharacter(db, { id: "character_veil", ownerId: owner, handle: castId<CharacterHandle>("veil"), name: "Veil", createdAt: 1000 });
  const theirs = await seedRawCharacter(db, {
    id: "character_theirs",
    ownerId: stranger,
    handle: castId<CharacterHandle>("theirs"),
    name: "Theirs",
    createdAt: 900,
  });
  await db.insert(characterTags).values([
    { characterId: aria, tagId: rpg, status: "accepted" },
    { characterId: aria, tagId: noir, status: "accepted" },
    { characterId: cass, tagId: rpg, status: "accepted" },
    // A PENDING suggestion is not a tag the row wears — the grouped view folds by accepted tags only.
    { characterId: cass, tagId: noir, status: "pending" },
    { characterId: dusk, tagId: rpg, status: "accepted" },
    // Her only tag is hidden-on-card, so on screen she has none.
    { characterId: veil, tagId: hidden, status: "accepted" },
    { characterId: theirs, tagId: foreign, status: "accepted" },
  ]);
  return { owner, stranger, rpg, noir, hidden, aria };
}

function bucket(groups: readonly { readonly name: string; readonly characters: number }[], name: string): number | undefined {
  return groups.find((group) => group.name === name)?.characters;
}

describe("listTagGroups", () => {
  test("counts the OWNER's library, by visible ACCEPTED tag, with Uncategorized as its own bucket", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner } = await seedLibrary(db);

    // Default lens: `archived` omitted is UNFILTERED, so Dusk counts too.
    const census = await svc.listTagGroups({ principal: principal(owner) });

    expect(bucket(census.groups, "rpg")).toBe(3);
    expect(bucket(census.groups, "noir")).toBe(1);
    // The stranger's tag never appears — an owner-scope slip would surface it by NAME.
    expect(census.groups.map((group) => group.name)).not.toContain("strangers-tag");
    // A HIDDEN-ON-CARD tag is not a group the fold renders, so it is not a bucket here either …
    expect(census.groups.map((group) => group.name)).not.toContain("hidden-note");
    // … and its only carrier lands in Uncategorized, WITH the genuinely untagged row.
    expect(census.uncategorized).toBe(2);
  });

  test("the groups do NOT sum to the matched total — which is why Uncategorized is a first-class count", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner } = await seedLibrary(db);

    const census = await svc.listTagGroups({ principal: principal(owner) });
    const page = await svc.list({ principal: principal(owner), limit: 1 });

    // Aria carries two visible tags, so she is counted in two buckets: `total − sum(groups)` is −1 here, and
    // an implementation that derived Uncategorized that way would print a negative bucket on a tagged
    // library. The census answers it with its own COUNT instead.
    const summed = census.groups.reduce((total, group) => total + group.characters, 0);
    expect(summed).toBeGreaterThan(page.totalCount - census.uncategorized);
  });

  test("a STRANGER's census is empty — the buckets are owner-scoped, not merely the rows", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { stranger } = await seedLibrary(db);

    // The stranger owns exactly one tagged character, so a leak-free answer is their OWN one bucket and
    // nothing of the owner's.
    const census = await svc.listTagGroups({ principal: principal(stranger) });
    expect(census.groups.map((group) => group.name)).toEqual(["strangers-tag"]);
    expect(census.uncategorized).toBe(0);
  });

  // THE #493 REFUSAL'S FIRST DISQUALIFIER, closed: the available census (`tag.listTagFilterVocabulary`)
  // counts the WHOLE library, and printing that beside lens-filtered members is a second wrong answer with
  // more authority than the first. This one moves with every lens the page moves with.
  test("the ARCHIVED axis moves the census, exactly as it moves the page", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner } = await seedLibrary(db);

    const shown = await svc.listTagGroups({ principal: principal(owner), archived: false });
    // Dusk is archived, so the toggle's OFF state drops her from `rpg` — 3 becomes 2.
    expect(bucket(shown.groups, "rpg")).toBe(2);
    const archivedOnly = await svc.listTagGroups({ principal: principal(owner), archived: true });
    expect(bucket(archivedOnly.groups, "rpg")).toBe(1);
    expect(archivedOnly.uncategorized).toBe(0);
  });

  test("SEARCH narrows the census over the whole library, and the census tracks the STARRED axis too", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner } = await seedLibrary(db);

    const searched = await svc.listTagGroups({ principal: principal(owner), search: "cassius" });
    expect(bucket(searched.groups, "rpg")).toBe(1);
    // Her `noir` is PENDING, so the search that finds her still does not put her in that bucket.
    expect(bucket(searched.groups, "noir")).toBeUndefined();
    expect(searched.uncategorized).toBe(0);

    const starred = await svc.listTagGroups({ principal: principal(owner), starred: true });
    expect(bucket(starred.groups, "rpg")).toBe(1);
    expect(bucket(starred.groups, "noir")).toBe(1);
  });

  test("the TAG CHIPS narrow it as well — an include chip is the same predicate the page pages by", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner, noir } = await seedLibrary(db);

    const census = await svc.listTagGroups({ principal: principal(owner), includeTagIds: [noir] });
    // Only Aria carries noir, and she also carries rpg — so BOTH of her buckets read 1 and nothing else
    // survives the chip.
    expect(bucket(census.groups, "noir")).toBe(1);
    expect(bucket(census.groups, "rpg")).toBe(1);
    expect(census.uncategorized).toBe(0);
  });

  test("the order is MOST-POPULATED FIRST with an alphabetical tie-break — a total order, so it cannot reshuffle", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner } = await seedLibrary(db);

    const first = await svc.listTagGroups({ principal: principal(owner) });
    const second = await svc.listTagGroups({ principal: principal(owner) });
    expect(first.groups.map((group) => group.name)).toEqual(["rpg", "noir"]);
    // A count sort alone reshuffles equal-count rows between identical calls; the name tie-break is what
    // makes two identical asks two identical answers.
    expect(second.groups.map((group) => group.name)).toEqual(first.groups.map((group) => group.name));
  });

  test("an empty library is an empty census, not a zero-filled one", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("lonely") });

    const census = await svc.listTagGroups({ principal: principal(owner) });
    expect(census.groups).toEqual([]);
    expect(census.uncategorized).toBe(0);
  });
});
