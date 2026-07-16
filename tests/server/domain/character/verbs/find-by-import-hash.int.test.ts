// verb: findByImportHash — the re-import dedup oracle. Load-bearing: a stored `importHash` is found
// (returns the identity ref), a missing one is `null`, the lookup is OWNER-SCOPED (a different owner's
// byte-identical import is NOT returned — the dedup is per-user, not global), and a card created with
// provenance is itself findable (the create→dedup round-trip the import composition root relies on).

import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

describe("findByImportHash", () => {
  test("returns the owner's character carrying the hash", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const importHash = "c".repeat(64);
    const characterId = await seedRawCharacter(db, {
      id: "character_imported",
      ownerId: owner,
      handle: "aria",
      importedFrom: "Aria.png",
      importHash,
    });

    const ref = await svc.findByImportHash({ ownerId: owner, importHash });
    expect(ref).toEqual({ characterId });
  });

  test("returns null when no character carries the hash", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await seedRawCharacter(db, { ownerId: owner, handle: "aria", importHash: "d".repeat(64) });

    const ref = await svc.findByImportHash({ ownerId: owner, importHash: "e".repeat(64) });
    expect(ref).toBeNull();
  });

  test("is owner-scoped — a different owner's same-hash card is not returned", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const a = await seedUser(db, { handle: "a" });
    const b = await seedUser(db, { handle: "b" });
    const sharedHash = "f".repeat(64);
    // Owner B already imported the byte-identical card.
    await seedRawCharacter(db, {
      id: "character_b",
      ownerId: b,
      handle: "aria",
      importHash: sharedHash,
    });

    // Owner A has nothing — the dedup must miss (per-user dedup, not global).
    const ref = await svc.findByImportHash({ ownerId: a, importHash: sharedHash });
    expect(ref).toBeNull();
  });

  test("a card created with provenance is findable by its hash (create→dedup round-trip)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const importHash = "1".repeat(64);
    const detail = await svc.create({
      principal: principal(owner),
      input: { handle: "aria", name: "Aria", description: "imported" },
      provenance: { importedFrom: "Aria.png", importHash },
    });

    const ref = await svc.findByImportHash({ ownerId: owner, importHash });
    expect(ref).toEqual({ characterId: detail.id });
  });
});
