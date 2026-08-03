// verb: findByHandle — the default-card seeder's partial-rerun resolve path. Load-bearing: an existing
// handle resolves to the identity ref, a missing one is `null`, the lookup is OWNER-SCOPED (a different
// owner's same-handle card is NOT returned), and a card created through the service is findable by its handle
// (the create→resolve round-trip the seeder's handle_conflict tolerance relies on).

import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

describe("findByHandle", () => {
  test("returns the owner's character carrying the handle", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedRawCharacter(db, {
      id: "character_assistant",
      ownerId: owner,
      handle: castId<CharacterHandle>("assistant"),
    });

    const ref = await svc.findByHandle({ ownerId: owner, handle: castId<CharacterHandle>("assistant") });
    expect(ref).toEqual({ characterId });
  });

  test("returns null when no character carries the handle", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedRawCharacter(db, { ownerId: owner, handle: castId<CharacterHandle>("niko") });

    const ref = await svc.findByHandle({ ownerId: owner, handle: castId<CharacterHandle>("assistant") });
    expect(ref).toBeNull();
  });

  test("is owner-scoped — a different owner's same-handle card is not returned", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const a = await seedUser(db, { handle: castId<Handle>("a") });
    const b = await seedUser(db, { handle: castId<Handle>("b") });
    // Owner B owns the "assistant" handle (per-owner unique index — A may hold the same handle).
    await seedRawCharacter(db, { id: "character_b", ownerId: b, handle: castId<CharacterHandle>("assistant") });

    const ref = await svc.findByHandle({ ownerId: a, handle: castId<CharacterHandle>("assistant") });
    expect(ref).toBeNull();
  });

  test("a card created through the service is findable by its handle (create→resolve round-trip)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const detail = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("assistant"), name: "Assistant", description: "the welcome assistant" },
    });

    const ref = await svc.findByHandle({ ownerId: owner, handle: castId<CharacterHandle>("assistant") });
    expect(ref).toEqual({ characterId: detail.id });
  });
});
