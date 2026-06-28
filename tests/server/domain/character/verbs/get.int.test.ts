// verb: get — owner-scoped single read. Load-bearing: "not found" and "not yours" collapse into one answer
// (no foreign-existence leak) — both throw CharacterNotFoundError. Owner-only (viewing != owning).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
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
