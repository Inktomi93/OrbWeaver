// verb: update — edit-in-place. Load-bearing: a content edit recomputes contentHash + emits
// character.updated; `null` CLEARS a nullable field while `undefined` (omitted) keeps it; an empty edit
// neither writes nor emits; not-owned throws.

import {
  AssetNotFoundError,
  CharacterNotFoundError,
  createCharacterService,
} from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

describe("update", () => {
  test("a content edit changes contentHash and emits character.updated", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "before" },
    });
    h.events.length = 0;

    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { description: "after" },
    });

    expect(updated.description).toBe("after");
    expect(updated.contentHash).not.toBe(created.contentHash);
    expect(h.events).toEqual([{ type: "character.updated", characterId: created.id }]);
  });

  test("null clears a nullable field; omitted fields are kept", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: {
        handle: "nyx",
        name: "Nyx",
        description: "d",
        personality: "stoic",
        scenario: "a tavern",
      },
    });

    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { personality: null },
    });

    expect(updated.personality).toBeNull();
    expect(updated.scenario).toBe("a tavern");
  });

  test("an empty edit neither writes nor emits", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    h.events.length = 0;
    h.audits.length = 0;

    const same = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: {},
    });
    expect(same.contentHash).toBe(created.contentHash);
    expect(h.events).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  test("the starred flag is updated without touching card content", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { starred: true },
    });
    expect(updated.starred).toBe(true);
    expect(updated.contentHash).toBe(created.contentHash);
  });

  test("updating another user's character throws CharacterNotFoundError", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    await expect(
      svc.update({ principal: principal(other), characterId: created.id, input: { name: "Hax" } }),
    ).rejects.toBeInstanceOf(CharacterNotFoundError);
  });

  test("a FOREIGN avatar asset throws AssetNotFoundError (D21 cross-root belt — nothing written)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const foreign = await seedAsset(db, { id: "asset_foreign", ownerId: other });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    h.events.length = 0;

    await expect(
      svc.update({
        principal: principal(owner),
        characterId: created.id,
        input: { avatarAssetId: foreign },
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);

    const reread = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(reread.avatarAssetId).toBeNull();
    expect(h.events).toHaveLength(0);
  });
});
