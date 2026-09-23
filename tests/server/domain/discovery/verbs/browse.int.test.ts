// Integration: the distill READ-half — the filterable distilled catalog (`browseCharacters`) +
// the facet dropdowns (`characterFacets`). Proofs:
//   • owner isolation (audit #1) — a foreign owner sees none of another user's distilled cards.
//   • the facet filters (genre/tone/tag) + the case-insensitive `q` substring narrow in SQL.
//   • CONTENT-only — the row carries facets + card identity (name/avatar), no engagement counts.
//   • the sort axis (`recent` = collected-date desc default; `name` = card name asc).
//   • THE KEYSET (A8, side-eye corpus re-pass 2026-08-19): walking the cursor reaches EVERY row exactly
//     once in both orderings — including across a tie, which is the seam a naive keyset drops rows at —
//     `totalCount` counts the filtered scope rather than the page, and a cursor minted under one sort is
//     refused under the other instead of being applied to the wrong keyset.

import type { BrowseSort } from "@orb/contracts/discovery";
import type { Db } from "@orb/db";
import { assets, characterSummaries, characters } from "@orb/db";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeDiscoveryHarness, seedCharacter, seedUser } from "../_support.ts";

// Insert a distilled summary row directly (the browse read is decoupled from the distill compute; a direct
// seed keeps the filter/sort assertions independent of a scripted summarize run).
async function seedSummary(
  db: Db,
  overrides: {
    readonly characterId: CharacterId;
    readonly genre?: string;
    readonly tone?: string;
    readonly setting?: string;
    readonly tags?: string[];
    readonly elevatorPitch?: string;
  },
): Promise<void> {
  await db.insert(characterSummaries).values({
    characterId: overrides.characterId,
    genre: overrides.genre ?? null,
    tone: overrides.tone ?? null,
    setting: overrides.setting ?? null,
    tags: overrides.tags ?? [],
    elevatorPitch: overrides.elevatorPitch ?? null,
    overview: null,
    model: "test-summarize-model",
    computedAt: FROZEN_AT,
  });
}

async function seedAvatarAsset(db: Db, id: string, ownerId: UserId, hash: string): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({
    id: assetId,
    ownerId,
    kind: "avatar",
    mime: "image/png",
    size: 1,
    hash,
    uploadedAt: FROZEN_AT,
  });
  return assetId;
}

/** The keyset's refusal when a cursor's ordering is not the requested one. */
const CURSOR_SORT_MISMATCH = /does not match/u;

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("browseCharacters", () => {
  test("returns the owner's distilled cards with facets + identity, newest-collected first", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const older = await seedCharacter(db, { id: "character_older", ownerId: owner, name: "Older" });
    const newer = await seedCharacter(db, { id: "character_newer", ownerId: owner, name: "Newer" });
    // Make `newer` the more-recently collected card + give it an avatar.
    const avatar = await seedAvatarAsset(db, "asset_av", owner, "cas_avatar_hash");
    await db
      .update(characters)
      .set({ createdAt: FROZEN_AT + 1000, avatarAssetId: avatar })
      .where(eq(characters.id, newer));

    await seedSummary(db, {
      characterId: older,
      genre: "fantasy",
      tone: "dark",
      tags: ["airships"],
      elevatorPitch: "Old hook.",
    });
    await seedSummary(db, {
      characterId: newer,
      genre: "horror",
      tone: "tense",
      tags: ["eldritch"],
      elevatorPitch: "New hook.",
    });

    const page = await svcFor(db).browseCharacters(owner);
    const rows = page.items;
    expect(rows.map((r) => r.name)).toEqual(["Newer", "Older"]);
    // The census is the whole scope, and a page shorter than the ask has no next.
    expect(page.totalCount).toBe(2);
    expect(page.nextCursor).toBeNull();
    expect(rows[0]).toMatchObject({
      name: "Newer",
      genre: "horror",
      tone: "tense",
      tags: ["eldritch"],
      avatarHash: "cas_avatar_hash",
    });
    // `Older` has no avatar → null.
    expect(rows[1]?.avatarHash).toBeNull();
  });

  test("a foreign owner sees none of another user's cards (audit #1)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const c = await seedCharacter(db, { id: "character_1", ownerId: owner, name: "Mine" });
    await seedSummary(db, { characterId: c, genre: "fantasy" });
    const page = await svcFor(db).browseCharacters(other);
    expect(page.items).toEqual([]);
    expect(page.totalCount).toBe(0);
  });

  test("filters by genre/tone/tag and case-insensitive q, sorts by name", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "Bravo" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "Alpha" });
    await seedSummary(db, {
      characterId: a,
      genre: "fantasy",
      tone: "dark",
      tags: ["Airships", "Sky-Pirates"],
      elevatorPitch: "Maps the sky.",
    });
    await seedSummary(db, {
      characterId: b,
      genre: "horror",
      tone: "tense",
      tags: ["eldritch"],
      elevatorPitch: "Dread below.",
    });
    const svc = svcFor(db);

    const names = async (filter: Parameters<typeof svc.browseCharacters>[1]): Promise<string[]> =>
      (await svc.browseCharacters(owner, filter)).items.map((r) => r.name);

    expect(await names({ genre: "fantasy" })).toEqual(["Bravo"]);
    expect(await names({ tone: "tense" })).toEqual(["Alpha"]);
    // exact tag membership, case-insensitive.
    expect(await names({ tag: "airships" })).toEqual(["Bravo"]);
    // q substring over name/pitch/tags.
    expect(await names({ q: "DREAD" })).toEqual(["Alpha"]);
    // name sort.
    expect(await names({ sort: "name" })).toEqual(["Alpha", "Bravo"]);
    // limit is the PAGE size, and the census still counts the whole filtered scope — the exact pair the
    // corpus header needed: it prints `totalCount`-shaped numbers over a list that holds one page.
    const firstPage = await svc.browseCharacters(owner, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.totalCount).toBe(2);
    // A filtered census counts the FILTER's scope, never the library.
    expect((await svc.browseCharacters(owner, { genre: "fantasy" })).totalCount).toBe(1);
  });

  // ── A8: EVERY DISTILLED CARD IS REACHABLE ────────────────────────────────────────────────────────────
  // The pane above this read prints the catalog census; the list used to stop at a silent 200-row ceiling
  // with no cursor, so the difference was simply unreachable. These walk the keyset one row at a time —
  // the harshest page size — in both orderings, over a fixture whose `createdAt` values COLLIDE (the seed
  // helper stamps one frozen clock), which is the seam a keyset without a tie-break drops rows at.
  type BrowseCursorOf = Awaited<ReturnType<ReturnType<typeof svcFor>["browseCharacters"]>>["nextCursor"];

  /** Recursive rather than a loop: each page's request DEPENDS on the previous page's answer, which is what
   *  a keyset is, and the lint that bans `await` in a loop is banning the parallelisable case. `guard` ends
   *  a non-terminating keyset as a failure instead of a hang. */
  async function walk(
    svc: ReturnType<typeof svcFor>,
    owner: UserId,
    step: { readonly sort: BrowseSort; readonly cursor?: BrowseCursorOf; readonly guard?: number },
  ): Promise<string[]> {
    const guard = step.guard ?? 20;
    if (guard === 0) {
      throw new Error("the browse keyset did not terminate");
    }
    const cursor = step.cursor ?? null;
    const page = await svc.browseCharacters(owner, { sort: step.sort, limit: 1, ...(cursor === null ? {} : { cursor }) });
    const seen = page.items.map((r) => r.name);
    if (page.nextCursor === null) {
      return seen;
    }
    return [...seen, ...(await walk(svc, owner, { sort: step.sort, cursor: page.nextCursor, guard: guard - 1 }))];
  }

  /** Seed one distilled card. Named so the fixtures below can plant a set in one `Promise.all`. */
  async function seedDistilled(db: Db, owner: UserId, name: string): Promise<void> {
    const id = await seedCharacter(db, { id: `character_${name.toLowerCase()}`, ownerId: owner, name });
    await seedSummary(db, { characterId: id, genre: "fantasy" });
  }

  test("walking the cursor reaches every row exactly once — in both orderings, across a createdAt tie", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // Four cards collected at the SAME instant: `recent` alone cannot order them, so the tie-break is the
    // only thing keeping the page boundary total.
    await Promise.all(["Delta", "Alpha", "Charlie", "Bravo"].map((name) => seedDistilled(db, owner, name)));
    const svc = svcFor(db);

    const byName = await walk(svc, owner, { sort: "name" });
    expect(byName).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);

    const byRecent = await walk(svc, owner, { sort: "recent" });
    expect(byRecent).toHaveLength(4);
    expect([...byRecent].sort()).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
    // Reachability is the whole point: the walk's row count agrees with the census the header prints.
    expect((await svc.browseCharacters(owner)).totalCount).toBe(byRecent.length);
  });

  test("a cursor minted under one sort is REFUSED under the other, never applied to the wrong keyset", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await Promise.all(["Alpha", "Bravo"].map((name) => seedDistilled(db, owner, name)));
    const svc = svcFor(db);
    const first = await svc.browseCharacters(owner, { sort: "name", limit: 1 });
    expect(first.nextCursor).not.toBeNull();
    const cursor = first.nextCursor;
    if (cursor === null) {
      throw new Error("expected a next cursor");
    }
    await expect(svc.browseCharacters(owner, { sort: "recent", limit: 1, cursor })).rejects.toThrow(CURSOR_SORT_MISMATCH);
  });
});

describe("characterFacets", () => {
  test("returns distinct genres + tones with counts, descending, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "A" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "B" });
    const c = await seedCharacter(db, { id: "character_c", ownerId: owner, name: "C" });
    const foreign = await seedCharacter(db, { id: "character_f", ownerId: other, name: "F" });
    await seedSummary(db, { characterId: a, genre: "fantasy", tone: "dark" });
    await seedSummary(db, { characterId: b, genre: "fantasy", tone: "tense" });
    await seedSummary(db, { characterId: c, genre: "horror", tone: "dark" });
    await seedSummary(db, { characterId: foreign, genre: "romance", tone: "wholesome" });

    const facets = await svcFor(db).characterFacets(owner);
    expect(facets.genres).toEqual([
      { value: "fantasy", count: 2 },
      { value: "horror", count: 1 },
    ]);
    expect(facets.tones).toEqual([
      { value: "dark", count: 2 },
      { value: "tense", count: 1 },
    ]);
  });
});
