// Integration: PD-40 cooccurrence reads — topKeywords / cooccurringKeywords / characterKeywords over the
// rollup tables (seeded directly; the compute has its own test). Proofs: owner-scoping (audit #1), the
// canonical-pair "other side" resolution, and the minCount/limit knobs.

import type { Db } from "@orb/db";
import { characterKeywordProfiles, keywordCooccurrence } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, makeDiscoveryHarness, seedCharacter, seedUser } from "../_support.ts";

let coocN = 0;
let profN = 0;

async function seedPair(db: Db, ownerId: UserId, pair: { a: string; b: string; count: number }): Promise<void> {
  coocN += 1;
  await db.insert(keywordCooccurrence).values({
    id: castId(`keyword_cooccurrence_${coocN}`),
    ownerId,
    keywordA: pair.a,
    keywordB: pair.b,
    count: pair.count,
    computedAt: FROZEN_AT,
  });
}

async function seedProfile(db: Db, characterId: CharacterId, keyword: string, count: number): Promise<void> {
  profN += 1;
  await db.insert(characterKeywordProfiles).values({
    id: castId(`character_keyword_profile_${profN}`),
    characterId,
    keyword,
    count,
    computedAt: FROZEN_AT,
  });
}

function svcFor(db: Db): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db).ctx);
}

describe("cooccurrence reads", () => {
  test("topKeywords sums per-character counts, honours minCount, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const a = await seedCharacter(db, { id: "character_a", ownerId: owner, name: "A" });
    const b = await seedCharacter(db, { id: "character_b", ownerId: owner, name: "B" });
    const foreign = await seedCharacter(db, { id: "character_f", ownerId: other, name: "F" });
    await seedProfile(db, a, "dragons", 3);
    await seedProfile(db, b, "dragons", 2); // dragons total = 5
    await seedProfile(db, a, "castle", 1); // below default minCount 2
    await seedProfile(db, foreign, "pirates", 9); // foreign owner — excluded

    const top = await svcFor(db).topKeywords(owner);
    expect(top).toEqual([{ keyword: "dragons", count: 5 }]);
  });

  test("cooccurringKeywords resolves the other side of the canonical pair", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    // canonical A<B: (castle,dragons), (dragons,knights)
    await seedPair(db, owner, { a: "castle", b: "dragons", count: 4 });
    await seedPair(db, owner, { a: "dragons", b: "knights", count: 2 });

    const rows = await svcFor(db).cooccurringKeywords(owner, "dragons");
    expect(rows).toEqual([
      { keyword: "castle", count: 4 },
      { keyword: "knights", count: 2 },
    ]);
  });

  test("characterKeywords returns one character's profile, owner belt", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const hero = await seedCharacter(db, { id: "character_hero", ownerId: owner, name: "Hero" });
    const foreign = await seedCharacter(db, { id: "character_f", ownerId: other, name: "F" });
    await seedProfile(db, hero, "dragons", 3);
    await seedProfile(db, hero, "castle", 1);
    await seedProfile(db, foreign, "pirates", 5);

    const svc = svcFor(db);
    expect(await svc.characterKeywords(owner, hero)).toEqual([
      { keyword: "dragons", count: 3 },
      { keyword: "castle", count: 1 },
    ]);
    // A foreign character (owned by `other`) is not readable through `owner`'s belt.
    expect(await svc.characterKeywords(owner, foreign)).toEqual([]);
  });
});
