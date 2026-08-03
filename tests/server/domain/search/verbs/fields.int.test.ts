// verb: fields / suggest — the lexical BM25 engine (PD-37). Asserts the complementary (non-vector)
// retrieval surface against a real db: lexical matching, the name>description field boost, prefix matching,
// owner isolation (the index corpus is one owner's cards), autocomplete suggestions, and the per-owner
// TTL cache (a card added within the TTL window is NOT seen until the entry rebuilds).
//
// EACH TEST USES A UNIQUE OWNER — the field-index cache is a module-scope singleton keyed by ownerId, so a
// shared handle would bleed one test's index into another (a fresh db won't reset the cache).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { FIELD_INDEX_TTL_MS } from "../../../../../packages/server/src/domain/search/substrate/field-index.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeSearch, seedCharacter, seedUser } from "../_support.ts";

describe("fields", () => {
  test("returns the lexically matching card", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("fields_match") });
    const dragon = await seedCharacter(db, {
      id: "character_dragon",
      ownerId: owner,
      name: "Dragon Knight",
    });
    await seedCharacter(db, { id: "character_wizard", ownerId: owner, name: "Wizard" });

    const svc = makeSearch(db);
    const hits = await svc.fields({ ownerId: owner, query: "dragon", topN: 5 });

    expect(hits.map((h) => h.characterId)).toEqual([dragon]);
  });

  test("a name match outranks a description-only match (field boost)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("fields_boost") });
    const named = await seedCharacter(db, {
      id: "character_named",
      ownerId: owner,
      name: "Dragon",
      description: "a knight",
    });
    const described = await seedCharacter(db, {
      id: "character_described",
      ownerId: owner,
      name: "Rider",
      description: "rides a dragon into battle",
    });

    const svc = makeSearch(db);
    const hits = await svc.fields({ ownerId: owner, query: "dragon", topN: 5 });

    expect(hits.map((h) => h.characterId)).toEqual([named, described]);
  });

  test("prefix matching finds a card by a partial term", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("fields_prefix") });
    const c = await seedCharacter(db, {
      id: "character_pref",
      ownerId: owner,
      name: "Dragonborn",
    });

    const svc = makeSearch(db);
    const hits = await svc.fields({ ownerId: owner, query: "drag", topN: 5 });

    expect(hits.map((h) => h.characterId)).toEqual([c]);
  });

  test("never returns another owner's card (the corpus is one owner's cards)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("fields_owner") });
    const other = await seedUser(db, { handle: castId<Handle>("fields_other") });
    const mine = await seedCharacter(db, {
      id: "character_mine",
      ownerId: owner,
      name: "Dragon Mine",
    });
    await seedCharacter(db, { id: "character_theirs", ownerId: other, name: "Dragon Theirs" });

    const svc = makeSearch(db);
    const hits = await svc.fields({ ownerId: owner, query: "dragon", topN: 5 });

    expect(hits.map((h) => h.characterId)).toEqual([mine]);
  });

  test("the per-owner index is TTL-cached (a new card appears only after the TTL rebuild)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("fields_ttl") });
    await seedCharacter(db, { id: "character_first", ownerId: owner, name: "Dragon First" });

    let clock = FROZEN_AT_MS;
    const svc = makeSearch(db, undefined, () => clock);

    // Build the index at T0.
    const first = await svc.fields({ ownerId: owner, query: "dragon", topN: 5 });
    expect(first).toHaveLength(1);

    // Add a second matching card AFTER the index was built.
    await seedCharacter(db, { id: "character_second", ownerId: owner, name: "Dragon Second" });

    // Within the TTL window → cache hit → the new card is NOT indexed yet.
    const cached = await svc.fields({ ownerId: owner, query: "dragon", topN: 5 });
    expect(cached).toHaveLength(1);

    // Past the TTL → rebuild → both cards are indexed.
    clock = FROZEN_AT_MS + FIELD_INDEX_TTL_MS + 1;
    const rebuilt = await svc.fields({ ownerId: owner, query: "dragon", topN: 5 });
    expect(rebuilt).toHaveLength(2);
  });
});

describe("suggest", () => {
  test("autocompletes a partial query into whole-term suggestions", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("suggest_basic") });
    await seedCharacter(db, { id: "character_sug", ownerId: owner, name: "Dragonborn" });

    const svc = makeSearch(db);
    const suggestions = await svc.suggest({ ownerId: owner, query: "dragon", limit: 5 });

    expect(suggestions.map((s) => s.suggestion)).toContain("dragonborn");
  });

  test("suggests nothing for a partial that matches no owner card", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("suggest_empty") });
    await seedCharacter(db, { id: "character_sug2", ownerId: owner, name: "Wizard" });

    const svc = makeSearch(db);
    const suggestions = await svc.suggest({ ownerId: owner, query: "dragon", limit: 5 });

    expect(suggestions).toEqual([]);
  });
});
