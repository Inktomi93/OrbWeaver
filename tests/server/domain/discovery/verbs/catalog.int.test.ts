// Integration: PD-40 catalog + compareCharacters — distill-powered analytics over character_summaries.
//   • catalog: per-facet card counts + top tags (case-folded) + co-tagged pairs + total; owner-scoped.
//   • compareCharacters: facet diff (shared/distinct tags + tag-Jaccard redundancy); null on self/foreign.

import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, makeDiscoveryHarness, seedCharacter, seedUser } from "../_support.ts";

async function seedCard(
  db: Db,
  args: {
    id: string;
    ownerId: UserId;
    name?: string;
    genre?: string;
    tone?: string;
    tags?: string[];
    pitch?: string;
  },
): Promise<CharacterId> {
  const id = await seedCharacter(db, {
    id: args.id,
    ownerId: args.ownerId,
    name: args.name ?? args.id,
  });
  await db.insert(characterSummaries).values({
    characterId: id,
    genre: args.genre ?? null,
    tone: args.tone ?? null,
    tags: args.tags ?? [],
    elevatorPitch: args.pitch ?? null,
    model: "test-summarize-model",
    computedAt: FROZEN_AT,
  });
  return id;
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("catalog", () => {
  test("aggregates facet counts + top tags (case-folded) + co-tagged pairs, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    await seedCard(db, {
      id: "c1",
      ownerId: owner,
      genre: "fantasy",
      tone: "dark",
      tags: ["Dragons", "curse"],
    });
    await seedCard(db, {
      id: "c2",
      ownerId: owner,
      genre: "fantasy",
      tone: "tense",
      tags: ["dragons", "curse"],
    });
    await seedCard(db, {
      id: "c3",
      ownerId: owner,
      genre: "horror",
      tone: "dark",
      tags: ["eldritch"],
    });
    // A foreign owner's card must not leak into the aggregate.
    await seedCard(db, { id: "cf", ownerId: other, genre: "romance", tags: ["cozy"] });

    const cat = await svcFor(db).catalog(owner);
    expect(cat.totalDistilled).toBe(3);
    expect(cat.genres).toEqual([
      { value: "fantasy", count: 2 },
      { value: "horror", count: 1 },
    ]);
    // "Dragons"/"dragons" fold to one tag, count 2; "curse" count 2.
    const dragons = cat.topTags.find((t) => t.tag === "dragons");
    expect(dragons?.count).toBe(2);
    // The (curse, dragons) pair co-occurs on 2 cards.
    expect(cat.tagPairs).toContainEqual({ a: "curse", b: "dragons", count: 2 });
  });
});

describe("compareCharacters", () => {
  test("diffs two cards by facets + a tag-Jaccard redundancy", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedCard(db, {
      id: "a",
      ownerId: owner,
      name: "Aria",
      genre: "fantasy",
      tone: "dark",
      tags: ["dragons", "curse", "quest"],
      pitch: "A cursed knight.",
    });
    const b = await seedCard(db, {
      id: "b",
      ownerId: owner,
      name: "Bryn",
      genre: "fantasy",
      tone: "tense",
      tags: ["dragons", "heist"],
    });

    const cmp = await svcFor(db).compareCharacters(owner, a, b);
    expect(cmp).not.toBeNull();
    expect(cmp?.a.name).toBe("Aria");
    expect(cmp?.sameGenre).toBe(true);
    expect(cmp?.sameTone).toBe(false);
    expect(cmp?.sharedTags).toEqual(["dragons"]);
    expect(cmp?.onlyA.sort()).toEqual(["curse", "quest"]);
    expect(cmp?.onlyB).toEqual(["heist"]);
    // Jaccard: |∩|=1 (dragons), |∪|=4 (dragons,curse,quest,heist) → 0.25.
    expect(cmp?.redundancy).toBeCloseTo(0.25);
  });

  test("null on self-compare or a foreign/undistilled card", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const a = await seedCard(db, { id: "a", ownerId: owner, genre: "fantasy", tags: ["x"] });
    const foreign = await seedCard(db, { id: "f", ownerId: other, genre: "horror", tags: ["y"] });
    const svc = svcFor(db);
    expect(await svc.compareCharacters(owner, a, a)).toBeNull(); // self
    expect(await svc.compareCharacters(owner, a, foreign)).toBeNull(); // foreign belt
    expect(
      await svc.compareCharacters(owner, a, castId<CharacterId>("character_missing")),
    ).toBeNull();
  });
});
