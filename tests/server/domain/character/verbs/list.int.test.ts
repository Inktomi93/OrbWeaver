// verb: list — owner-scoped, newest-first, cursor-paged. Load-bearing INVARIANT 3: synthetic group
// buckets NEVER appear in a user-facing list (they'd leak the hidden memory identities). Also
// owner-scoped (no foreign rows). Paging mirrors `domain/notifications`'s `{items, nextCursor}` contract
// test shape (first page + nextCursor, a second page, empty, a bounded limit) plus the compound-cursor
// tiebreak the `domain/assets` precedent exists for (a frozen clock stamps ties on `createdAt`).

import { characterTags, tags } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, TagId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService, createStampRefinerySignals } from "@orb/server/domain/character";
import { describe } from "vitest";
import { cardTokenSize } from "../../../../../packages/server/src/domain/character/substrate/card-tokens.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedCharacterStats, seedCharacterSummary, seedRawCharacter, seedUser } from "../_support.ts";

describe("list", () => {
  test("returns the owner's characters newest-first, excluding other owners", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });

    await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    h.advance(1000);
    const second = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("b"), name: "B", description: "d" },
    });
    await svc.create({
      principal: principal(other),
      input: { handle: castId<CharacterHandle>("c"), name: "C", description: "d" },
    });

    const page = await svc.list({ principal: principal(owner) });
    expect(page.items.map((r) => r.handle)).toEqual(["b", "a"]);
    expect(page.items[0]?.id).toBe(second.id);
    expect(page.items[0]?.tokenSize).toBeGreaterThan(0);
    expect(page.nextCursor).toBeNull();
  });

  test("synthetic group buckets are excluded from the list (invariant 3)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("real"), name: "Real", description: "d" },
    });
    await seedRawCharacter(db, {
      id: "character_grp",
      ownerId: owner,
      handle: castId<CharacterHandle>("__group__chat_1"),
      synthetic: true,
    });

    const page = await svc.list({ principal: principal(owner) });
    expect(page.items.map((r) => r.handle)).toEqual(["real"]);
  });

  test("an owner with no characters gets an empty page (nextCursor null)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const page = await svc.list({ principal: principal(owner) });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("list — cursor paging", () => {
  test("a bounded limit pages the remainder via nextCursor, then null", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    h.advance(1000);
    const b = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("b"), name: "B", description: "d" },
    });
    h.advance(1000);
    const c = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("c"), name: "C", description: "d" },
    });

    const first = await svc.list({ principal: principal(owner), limit: 2 });
    expect(first.items.map((r) => r.id)).toEqual([c.id, b.id]);
    // Default sort is `recent`; nothing's been chatted → the null tail orders by createdAt DESC (== the old
    // newest-first). The cursor is sort-discriminated (carries `sort` + `lastChattedAt`, null here).
    expect(first.nextCursor).toEqual({
      sort: "recent",
      lastChattedAt: null,
      createdAt: b.createdAt,
      id: b.id,
    });

    const cursor = first.nextCursor;
    if (cursor === null) {
      throw new Error("expected a page cursor");
    }
    const second = await svc.list({ principal: principal(owner), limit: 2, cursor });
    expect(second.items.map((r) => r.id)).toEqual([a.id]);
    expect(second.nextCursor).toBeNull();
  });

  test("a createdAt tie (frozen clock, no advance between creates) is broken by id — no skip, no dupe", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    // Both created at the SAME frozen instant — createdAt alone can't order them.
    const first = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("tie-1"), name: "Tie1", description: "d" },
    });
    const second = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("tie-2"), name: "Tie2", description: "d" },
    });
    expect(first.createdAt).toBe(second.createdAt);

    const firstPage = await svc.list({ principal: principal(owner), limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    // A FULL page always carries a cursor (mirrors notifications — no lookahead peek); exhaustion is
    // discovered on the NEXT fetch, which comes back short.
    expect(firstPage.nextCursor).not.toBeNull();

    const cursor = firstPage.nextCursor;
    if (cursor === null) {
      throw new Error("expected a page cursor");
    }
    const secondPage = await svc.list({ principal: principal(owner), limit: 1, cursor });
    expect(secondPage.items).toHaveLength(1);
    // The two pages, together, cover both ties exactly once (no skip, no dupe) — order-independent.
    const seenIds = new Set([...firstPage.items, ...secondPage.items].map((r) => r.id));
    expect(seenIds).toEqual(new Set([first.id, second.id]));

    const secondCursor = secondPage.nextCursor;
    if (secondCursor === null) {
      throw new Error("expected a page cursor (the second page was also full)");
    }
    const thirdPage = await svc.list({
      principal: principal(owner),
      limit: 1,
      cursor: secondCursor,
    });
    expect(thirdPage.items).toEqual([]);
    expect(thirdPage.nextCursor).toBeNull();
  });
});

describe("list — sort (recent / alpha) + stale-cursor rejection", () => {
  test("the recent sort ranks chatted characters first and carries lastChattedAt on the cursor", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const cold = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("cold"), name: "Cold", description: "d" },
    });
    const hot = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("hot"), name: "Hot", description: "d" },
    });
    // Only "hot" has been chatted → it leads; "cold" (never chatted) sinks to the null tail.
    await seedCharacterStats(db, { characterId: hot.id, lastActivityAt: 7000 });

    const page = await svc.list({ principal: principal(owner), sort: "recent", limit: 1 });
    expect(page.items.map((r) => r.id)).toEqual([hot.id]);
    expect(page.items[0]?.lastChattedAt).toBe(7000);
    expect(page.nextCursor).toEqual({
      sort: "recent",
      lastChattedAt: 7000,
      createdAt: hot.createdAt,
      id: hot.id,
    });

    const cursor = page.nextCursor;
    if (cursor === null) {
      throw new Error("expected a page cursor");
    }
    const second = await svc.list({
      principal: principal(owner),
      sort: "recent",
      limit: 1,
      cursor,
    });
    expect(second.items.map((r) => r.id)).toEqual([cold.id]);
  });

  test("the alpha sort orders by name and yields an alpha-shaped cursor", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("z"), name: "Zoe", description: "d" },
    });
    const ada = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "Ada", description: "d" },
    });

    const page = await svc.list({ principal: principal(owner), sort: "alpha", limit: 1 });
    expect(page.items.map((r) => r.name)).toEqual(["Ada"]);
    expect(page.nextCursor).toEqual({ sort: "alpha", name: "Ada", id: ada.id });
  });

  test("newest/oldest yield createdAt-shaped cursors (the direction-flipped twins)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const first = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    h.advance(1000);
    const second = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("b"), name: "B", description: "d" },
    });

    const newest = await svc.list({ principal: principal(owner), sort: "newest", limit: 1 });
    expect(newest.items.map((r) => r.id)).toEqual([second.id]);
    expect(newest.nextCursor).toEqual({
      sort: "newest",
      createdAt: second.createdAt,
      id: second.id,
    });

    const oldest = await svc.list({ principal: principal(owner), sort: "oldest", limit: 1 });
    expect(oldest.items.map((r) => r.id)).toEqual([first.id]);
    expect(oldest.nextCursor).toEqual({ sort: "oldest", createdAt: first.createdAt, id: first.id });
  });

  test("mostChats/fewestChats carry a (nullable) chatCount on the cursor", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const busy = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("busy"), name: "Busy", description: "d" },
    });
    // "quiet" has no stats row → null chat count (the tail).
    await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("quiet"), name: "Quiet", description: "d" },
    });
    await seedCharacterStats(db, { characterId: busy.id, lastActivityAt: 7000, chats: 9 });

    const most = await svc.list({ principal: principal(owner), sort: "mostChats", limit: 1 });
    expect(most.items.map((r) => r.id)).toEqual([busy.id]);
    expect(most.nextCursor).toEqual({ sort: "mostChats", chatCount: 9, id: busy.id });

    // fewestChats: the never-chatted "quiet" (null) STILL sinks to the tail → "busy" leads, and the last row
    // of a full page (here the only row on a limit-1 page) carries its chatCount.
    const fewest = await svc.list({ principal: principal(owner), sort: "fewestChats", limit: 1 });
    expect(fewest.items.map((r) => r.id)).toEqual([busy.id]);
    expect(fewest.nextCursor).toEqual({ sort: "fewestChats", chatCount: 9, id: busy.id });
  });

  test("summary tokenSize reads the stamped denorm column (== cardTokenSize of the written card)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // A card with real free-text content across several fields + a greeting (all contribute to the estimate).
    const input = {
      handle: castId<CharacterHandle>("hefty"),
      name: "Hefty",
      description: "A verbose character with a long, detailed backstory spanning many sentences.",
      personality: "curious, meticulous, verbose",
      greetings: [{ text: "Greetings, traveller — welcome to my exceedingly wordy realm." }],
    };
    const made = await svc.create({ principal: principal(owner), input });

    // The ONE computer over the SAME card content the create verb stamped (defaults applied for omitted fields).
    const expected = cardTokenSize({
      name: input.name,
      description: input.description,
      personality: input.personality,
      scenario: null,
      exampleMessages: null,
      systemPrompt: null,
      postHistoryInstructions: null,
      greetings: input.greetings,
    });
    expect(expected).toBeGreaterThan(0);

    const page = await svc.list({ principal: principal(owner) });
    const row = page.items.find((r) => r.id === made.id);
    expect(row?.tokenSize).toBe(expected);
  });

  test("largestCards/smallestCards carry tokenSize on the cursor (the stamped denorm)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // "big" has a much longer definition → a larger stamped token_size than "small".
    const big = await svc.create({
      principal: principal(owner),
      input: {
        handle: castId<CharacterHandle>("big"),
        name: "Big",
        description: "An elaborate, sprawling description with a great deal of text so its token estimate is clearly the larger of the two.",
      },
    });
    await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("small"), name: "Sm", description: "tiny" },
    });

    const largest = await svc.list({ principal: principal(owner), sort: "largestCards", limit: 1 });
    expect(largest.items.map((r) => r.id)).toEqual([big.id]);
    const bigSize = largest.items[0]?.tokenSize ?? 0;
    expect(bigSize).toBeGreaterThan(0);
    expect(largest.nextCursor).toEqual({ sort: "largestCards", tokenSize: bigSize, id: big.id });

    // smallestCards flips direction — "small" leads; its cursor carries its (smaller) stamped size.
    const smallest = await svc.list({
      principal: principal(owner),
      sort: "smallestCards",
      limit: 1,
    });
    const leadSmall = smallest.items[0];
    if (leadSmall === undefined) {
      throw new Error("expected a leading row");
    }
    expect(leadSmall.tokenSize).toBeLessThan(bigSize);
    expect(smallest.nextCursor).toEqual({
      sort: "smallestCards",
      tokenSize: leadSmall.tokenSize,
      id: leadSmall.id,
    });
  });

  // ── the two SCORE sorts (I2 — the refinery signal made sortable) ────────────────────────────────────
  // The value is a member of the `characters.refinery` JSON blob, so these sorts read it through a SQL
  // json_extract rather than a column. The pins that matter: an UNSCORED card sorts to the tail in BOTH
  // directions (it is unjudged, never "the worst"), and the cursor carries the same extracted value the
  // ORDER BY used, so a page boundary can never disagree with the page it came from.
  test("bestScore/worstScore order by the refinery signal and sink the UNSCORED tail both ways", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCharacterService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const high = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("high"), name: "High", description: "a" } });
    const low = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("low"), name: "Low", description: "b" } });
    const unscored = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("none"), name: "None", description: "c" } });
    // Stamp through the REAL refinery op — the same writer the sweep and a session's score run use.
    const stamp = createStampRefinerySignals({ db });
    await stamp({ ownerId: owner, characterId: high.id, patch: { score: 9.5 } });
    await stamp({ ownerId: owner, characterId: low.id, patch: { score: 2 } });

    const best = await svc.list({ principal: principal(owner), sort: "bestScore" });
    expect(best.items.map((r) => r.id)).toEqual([high.id, low.id, unscored.id]);
    const worst = await svc.list({ principal: principal(owner), sort: "worstScore" });
    // Direction flips for the SCORED rows; the unscored card stays LAST rather than leading "worst".
    expect(worst.items.map((r) => r.id)).toEqual([low.id, high.id, unscored.id]);
  });

  test("the score cursor carries the extracted score and pages through the unscored tail", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const high = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("h"), name: "H", description: "a" } });
    const low = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("l"), name: "L", description: "b" } });
    const unscored = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("u"), name: "U", description: "c" } });
    const stamp = createStampRefinerySignals({ db });
    await stamp({ ownerId: owner, characterId: high.id, patch: { score: 8 } });
    await stamp({ ownerId: owner, characterId: low.id, patch: { score: 4 } });

    const page1 = await svc.list({ principal: principal(owner), sort: "bestScore", limit: 1 });
    expect(page1.items.map((r) => r.id)).toEqual([high.id]);
    expect(page1.nextCursor).toEqual({ sort: "bestScore", score: 8, id: high.id });
    const cursor1 = page1.nextCursor;
    if (cursor1 === null) {
      throw new Error("expected a next cursor");
    }
    const page2 = await svc.list({ principal: principal(owner), sort: "bestScore", limit: 1, cursor: cursor1 });
    expect(page2.items.map((r) => r.id)).toEqual([low.id]);
    // The boundary into the NULL tail: the cursor's score is null and the next page is the unscored card
    // (an unscored boundary must stay INSIDE the tail — the mostChats null-boundary shape).
    const cursor2 = page2.nextCursor;
    if (cursor2 === null) {
      throw new Error("expected a next cursor");
    }
    const page3 = await svc.list({ principal: principal(owner), sort: "bestScore", limit: 1, cursor: cursor2 });
    expect(page3.items.map((r) => r.id)).toEqual([unscored.id]);
    expect(page3.nextCursor).toEqual({ sort: "bestScore", score: null, id: unscored.id });
    const cursor3 = page3.nextCursor;
    if (cursor3 === null) {
      throw new Error("expected a next cursor");
    }
    const page4 = await svc.list({ principal: principal(owner), sort: "bestScore", limit: 1, cursor: cursor3 });
    expect(page4.items).toEqual([]);
  });

  test("a cursor minted under a DIFFERENT sort is rejected (never silently re-keyed)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const made = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "Ada", description: "d" },
    });
    // An alpha cursor threaded into a recent query — a threading bug the verb must catch, not apply.
    await expect(
      svc.list({
        principal: principal(owner),
        sort: "recent",
        cursor: { sort: "alpha", name: "Ada", id: made.id },
      }),
    ).rejects.toThrow("does not match");
  });
});

// ── THE SERVER-SIDE LENSES (owner ruling 2026-08-13: "if i search then it should not just search on
// virtual stuff yeah? same for sort etc") ───────────────────────────────────────────────────────────
// Every narrowing the library toolbar offers is a predicate on the SAME scope the page windows and the
// census counts, so a term/chip that matches nothing on the loaded page still finds its row. The chat
// precedent (`listChats`, 2026-08-09) is the shape these mirror.

/** Seed one owner with the four rows every lens test narrows over. */
async function seedLensLibrary(
  db: Awaited<ReturnType<typeof freshDb>>,
): Promise<{ owner: UserId; aria: CharacterId; bolt: CharacterId; cass: CharacterId; dusk: CharacterId; rpg: TagId; noir: TagId }> {
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const rpg = castId<TagId>("tag_rpg");
  const noir = castId<TagId>("tag_noir");
  await db.insert(tags).values([
    { id: rpg, ownerId: owner, name: "rpg" },
    { id: noir, ownerId: owner, name: "noir" },
  ]);
  const aria = await seedRawCharacter(db, {
    id: "character_aria",
    ownerId: owner,
    handle: castId<CharacterHandle>("aria"),
    name: "Aria Nightshade",
    starred: true,
    createdAt: 4000,
  });
  const bolt = await seedRawCharacter(db, { id: "character_bolt", ownerId: owner, handle: castId<CharacterHandle>("bolt"), name: "Bolt", createdAt: 3000 });
  const cass = await seedRawCharacter(db, {
    id: "character_cass",
    ownerId: owner,
    handle: castId<CharacterHandle>("cassius"),
    name: "Cassius",
    createdAt: 2000,
  });
  const dusk = await seedRawCharacter(db, {
    id: "character_dusk",
    ownerId: owner,
    handle: castId<CharacterHandle>("dusk"),
    name: "Dusk",
    archived: true,
    createdAt: 1000,
  });
  await db.insert(characterTags).values([
    { characterId: aria, tagId: rpg, status: "accepted" },
    { characterId: cass, tagId: rpg, status: "accepted" },
    { characterId: cass, tagId: noir, status: "accepted" },
  ]);
  return { owner, aria, bolt, cass, dusk, rpg, noir };
}

describe("list — server-side search", () => {
  test("matches the NAME over the whole library, not the loaded page", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner, cass } = await seedLensLibrary(db);

    // A one-row page: the match lives BEYOND it, which is exactly the case a client-side filter cannot serve.
    const page = await svc.list({ principal: principal(owner), search: "cassi", limit: 1 });
    expect(page.items.map((r) => r.id)).toEqual([cass]);
    expect(page.totalCount).toBe(1);
    // A FULL page always mints a cursor (no lookahead peek); the SEARCH rides the next fetch too, so the
    // page after it is empty rather than the rest of the unfiltered library.
    const cursor = page.nextCursor;
    if (cursor === null) {
      throw new Error("expected a page cursor");
    }
    const second = await svc.list({ principal: principal(owner), search: "cassi", limit: 1, cursor });
    expect(second.items).toEqual([]);
  });

  test("matches the handle, the distilled pitch, and an ACCEPTED tag name — case-insensitively", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner, aria, bolt, cass } = await seedLensLibrary(db);
    await seedCharacterSummary(db, { characterId: bolt, elevatorPitch: "A courier who runs the lightning road." });

    const byHandle = await svc.list({ principal: principal(owner), search: "CASSIUS" });
    expect(byHandle.items.map((r) => r.id)).toEqual([cass]);

    const byPitch = await svc.list({ principal: principal(owner), search: "lightning road" });
    expect(byPitch.items.map((r) => r.id)).toEqual([bolt]);

    // The tag arm: "rpg" is on Aria + Cassius and on neither's name.
    const byTag = await svc.list({ principal: principal(owner), search: "rpg", sort: "alpha" });
    expect(byTag.items.map((r) => r.id)).toEqual([aria, cass]);
  });

  test("a PENDING tag suggestion is not searchable (the accepted-tags projection is the search scope)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner, bolt } = await seedLensLibrary(db);
    const staged = castId<TagId>("tag_staged");
    await db.insert(tags).values([{ id: staged, ownerId: owner, name: "staged-only" }]);
    await db.insert(characterTags).values([{ characterId: bolt, tagId: staged, status: "pending" }]);

    const page = await svc.list({ principal: principal(owner), search: "staged-only" });
    expect(page.items).toEqual([]);
  });

  test("a whitespace-only search is the UNSEARCHED library, never a search for a space", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner } = await seedLensLibrary(db);

    const page = await svc.list({ principal: principal(owner), search: "   " });
    expect(page.items).toHaveLength(4);
  });
});

describe("list — server-side chip filters (starred · archived · tags)", () => {
  // BOTH axes are TRI-STATE (`undefined` = unfiltered), which is what keeps the four lookup-map callers
  // whole: an omitted `archived` still serves the archived rows a portrait map needs, while the library's
  // own "Archived" toggle sends `archived: false` to hide them.
  test("starred:true is the favorites lens; archived:false is the Archived toggle's OFF state", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner, aria, dusk } = await seedLensLibrary(db);

    const favorites = await svc.list({ principal: principal(owner), starred: true });
    expect(favorites.items.map((r) => r.id)).toEqual([aria]);

    const unfiltered = await svc.list({ principal: principal(owner) });
    expect(unfiltered.items.map((r) => r.id)).toContain(dusk);

    const hidden = await svc.list({ principal: principal(owner), archived: false });
    expect(hidden.items.map((r) => r.id)).not.toContain(dusk);
    expect(hidden.totalCount).toBe(3);
  });

  test("include tags are AND-semantics and exclude tags subtract — over the whole library", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner, aria, bolt, cass, dusk, rpg, noir } = await seedLensLibrary(db);

    // rpg AND noir ⇒ only Cassius carries both.
    const both = await svc.list({ principal: principal(owner), includeTagIds: [rpg, noir] });
    expect(both.items.map((r) => r.id)).toEqual([cass]);

    // rpg, NOT noir ⇒ Aria only.
    const excluded = await svc.list({ principal: principal(owner), includeTagIds: [rpg], excludeTagIds: [noir] });
    expect(excluded.items.map((r) => r.id)).toEqual([aria]);

    // A pure exclusion still returns the rows that carry no rpg tag at all (Bolt, and archived Dusk).
    const notRpg = await svc.list({ principal: principal(owner), excludeTagIds: [rpg], sort: "alpha" });
    expect(notRpg.items.map((r) => r.id)).toEqual([bolt, dusk]);
  });

  test("a dead tag id in the include list matches nothing (it is a real predicate, not a no-op)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner } = await seedLensLibrary(db);

    const page = await svc.list({ principal: principal(owner), includeTagIds: [castId<TagId>("tag_deleted")] });
    expect(page.items).toEqual([]);
    expect(page.totalCount).toBe(0);
  });

  test("filters compose with the keyset: page 2 of a FILTERED list continues the same scope", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner, aria, cass, rpg } = await seedLensLibrary(db);

    const first = await svc.list({ principal: principal(owner), includeTagIds: [rpg], sort: "alpha", limit: 1 });
    expect(first.items.map((r) => r.id)).toEqual([aria]);
    const cursor = first.nextCursor;
    if (cursor === null) {
      throw new Error("expected a page cursor");
    }
    const second = await svc.list({ principal: principal(owner), includeTagIds: [rpg], sort: "alpha", limit: 1, cursor });
    expect(second.items.map((r) => r.id)).toEqual([cass]);
  });
});

describe("list — totalCount (the census the readouts print)", () => {
  test("totalCount counts the whole FILTERED scope, never the page", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner } = await seedLensLibrary(db);

    const page = await svc.list({ principal: principal(owner), limit: 1 });
    expect(page.items).toHaveLength(1);
    // Four rows in scope, one on the page.
    expect(page.totalCount).toBe(4);

    const searched = await svc.list({ principal: principal(owner), search: "a", limit: 1 });
    expect(searched.totalCount).toBe((await svc.list({ principal: principal(owner), search: "a" })).items.length);
  });

  test("the census is owner-scoped (another owner's rows never count)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const { owner } = await seedLensLibrary(db);
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    await seedRawCharacter(db, { id: "character_foreign", ownerId: other, handle: castId<CharacterHandle>("foreign"), name: "Aria Nightshade" });

    const page = await svc.list({ principal: principal(owner), search: "aria" });
    expect(page.items).toHaveLength(1);
    expect(page.totalCount).toBe(1);
  });
});

describe("list — canonical tags (the library tag filter)", () => {
  test("each summary carries its ACCEPTED tags; pending suggestions and other rows' tags don't bleed", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const tagged = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("tagged"), name: "Tagged", description: "d" },
    });
    const bare = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("bare"), name: "Bare", description: "d" },
    });
    const fantasy = castId<TagId>("tag_fantasy");
    const staged = castId<TagId>("tag_staged");
    await db.insert(tags).values([
      { id: fantasy, ownerId: owner, name: "fantasy" },
      { id: staged, ownerId: owner, name: "staged" },
    ]);
    await db.insert(characterTags).values([
      { characterId: tagged.id, tagId: fantasy, status: "accepted" },
      { characterId: tagged.id, tagId: staged, status: "pending" },
    ]);

    const page = await svc.list({ principal: principal(owner) });

    const taggedRow = page.items.find((r) => r.id === tagged.id);
    const bareRow = page.items.find((r) => r.id === bare.id);
    expect(taggedRow?.tags.map((t) => t.name)).toEqual(["fantasy"]);
    expect(bareRow?.tags).toEqual([]);
  });
});
