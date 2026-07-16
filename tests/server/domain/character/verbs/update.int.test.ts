// verb: update — edit-in-place. Load-bearing: a content edit recomputes contentHash + emits
// character.updated; `null` CLEARS a nullable field while `undefined` (omitted) keeps it; an empty edit
// neither writes nor emits; not-owned throws.

import { AssetNotFoundError, CharacterNotFoundError, CharacterOperationError, createCharacterService } from "@orb/server/domain/character";
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
    expect(h.events).toEqual([{ type: "character.updated", characterId: created.id, contentChanged: true }]);
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

  test("a starred-flag edit changes no card content and emits a no-content-change event", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    h.events.length = 0;

    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { starred: true },
    });

    expect(updated.starred).toBe(true);
    expect(updated.contentHash).toBe(created.contentHash);
    // The emit stamps contentChanged=false → the embeddings indexer skips re-embedding a star toggle.
    expect(h.events).toEqual([{ type: "character.updated", characterId: created.id, contentChanged: false }]);
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
    await expect(svc.update({ principal: principal(other), characterId: created.id, input: { name: "Hax" } })).rejects.toBeInstanceOf(CharacterNotFoundError);
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

  test("applies a handle rename (FINAL-Character §2 identity column) and audits only `handle`", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    h.audits.length = 0;

    const updated = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { handle: "nyx-prime" },
    });

    expect(updated.handle).toBe("nyx-prime");
    // A pure rename doesn't touch card content → the hash is unchanged (handle is not embedded).
    expect(updated.contentHash).toBe(created.contentHash);
    const reread = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(reread.handle).toBe("nyx-prime");
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.entry.metadata).toEqual({ fields: ["handle"] });
  });

  test("audits ONLY the fields that actually changed (a provided-but-identical value is not logged)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "before", personality: "stoic" },
    });
    h.audits.length = 0;

    // description changes; name + handle are re-sent identical (must NOT appear in the audit).
    await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { description: "after", name: "Nyx", handle: "nyx" },
    });

    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.entry.metadata).toEqual({ fields: ["description"] });
  });

  test("refuses a reserved `__group__*` handle (mirror of the `__agent__` refusal) — nothing written", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    h.events.length = 0;

    await expect(
      svc.update({
        principal: principal(owner),
        characterId: created.id,
        input: { handle: "__group__chat_1" },
      }),
    ).rejects.toBeInstanceOf(CharacterOperationError);
    const reread = await svc.get({ principal: principal(owner), characterId: created.id });
    expect(reread.handle).toBe("nyx");
    expect(h.events).toHaveLength(0);
  });

  test("a colliding handle rename surfaces the typed handle_conflict — the other card is untouched", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    const mara = await svc.create({
      principal: principal(owner),
      input: { handle: "mara", name: "Mara", description: "d" },
    });

    await expect(svc.update({ principal: principal(owner), characterId: mara.id, input: { handle: "nyx" } })).rejects.toMatchObject({
      code: "handle_conflict",
    });
    const reread = await svc.get({ principal: principal(owner), characterId: mara.id });
    expect(reread.handle).toBe("mara");
  });

  test("D44 §12.1/§12.5 — themeOverride round-trips (set, then null clears it)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    expect(created.themeOverride).toBeNull();

    const withOverride = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { themeOverride: { accent: "oklch(0.7 0.14 250)" } },
    });
    expect(withOverride.themeOverride).toEqual({ accent: "oklch(0.7 0.14 250)" });

    const cleared = await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { themeOverride: null },
    });
    expect(cleared.themeOverride).toBeNull();
  });
});
