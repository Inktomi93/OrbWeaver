// verb: get — owner-scoped single read. Load-bearing: "not found" and "not yours" collapse into one answer
// (no foreign-existence leak) — both throw CharacterNotFoundError. Owner-only (viewing != owning).

import { characterTags, tags } from "@orb/db";
import type { CharacterId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("get", () => {
  test("returns an owned character by id", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    const got = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(got.id).toBe(created.id);
    expect(got.name).toBe("Nyx");
  });

  test("another user's character is indistinguishable from missing (CharacterNotFoundError)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "secret", name: "Secret", description: "d" },
    });
    await expect(
      svc.get({ principal: principal(other), characterId: created.id }),
    ).rejects.toBeInstanceOf(CharacterNotFoundError);
  });

  test("a missing id throws CharacterNotFoundError", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await expect(
      svc.get({ principal: principal(owner), characterId: castId<CharacterId>("character_ghost") }),
    ).rejects.toBeInstanceOf(CharacterNotFoundError);
  });
});

describe("get — canonical tags (the editor chips)", () => {
  test("the detail carries ACCEPTED junction tags only", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    expect(created.tags).toEqual([]); // a fresh card carries no junction rows yet
    const fantasy = castId<TagId>("tag_fantasy");
    const staged = castId<TagId>("tag_staged");
    await db.insert(tags).values([
      { id: fantasy, ownerId: owner, name: "fantasy" },
      { id: staged, ownerId: owner, name: "staged" },
    ]);
    await db.insert(characterTags).values([
      { characterId: created.id, tagId: fantasy, status: "accepted" },
      { characterId: created.id, tagId: staged, status: "pending" },
    ]);

    const got = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(got.tags.map((t) => t.name)).toEqual(["fantasy"]);
  });
});
