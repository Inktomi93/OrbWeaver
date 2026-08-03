// verb: createFromCharacter — non-lossy mint from an owned character card. Load-bearing: copies
// name/description/avatar; when swapMacros, {{char}}/{{user}} invert; stores sourceCharacterId +
// swapMacros provenance in typed metadata; a foreign/missing character throws (DomainNotFound); audits.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createPersonaService } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAsset, seedCharacter, seedUser } from "../_support.ts";

describe("createFromCharacter", () => {
  test("copies the card (name/description/avatar) + records provenance, no swap (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const avatar = await seedAsset(db, { ownerId: owner, hash: "card_hash" });
    // A real character TypeID — the metadata `sourceCharacterId` round-trips through `typeIdSchema`, which
    // validates the full TypeID shape (a fake id would fail the read-seam parse and null the metadata).
    const character = await seedCharacter(db, {
      id: mintTypeId(ID_PREFIX.character),
      ownerId: owner,
      name: "Aria",
      description: "{{char}} greets {{user}}",
      avatarAssetId: avatar,
    });

    const detail = await svc.createFromCharacter({
      principal: principal(owner),
      characterId: character,
      swapMacros: false,
    });

    expect(detail.name).toBe("Aria");
    expect(detail.description).toBe("{{char}} greets {{user}}");
    expect(detail.avatarAssetId).toBe(avatar);
    expect(detail.avatarHash).toBe("card_hash");
    expect(detail.metadata?.sourceCharacterId).toBe(character);
    expect(detail.metadata?.swapMacros).toBe(false);
    expect(h.audits.map((a) => a.entry.action)).toContain("persona.createFromCharacter");
  });

  test("swapMacros inverts {{char}} ↔ {{user}} in the copied description", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, {
      id: mintTypeId(ID_PREFIX.character),
      ownerId: owner,
      description: "{{char}} loves {{user}}",
    });

    const detail = await svc.createFromCharacter({
      principal: principal(owner),
      characterId: character,
      swapMacros: true,
    });

    expect(detail.description).toBe("{{user}} loves {{char}}");
    expect(detail.metadata?.swapMacros).toBe(true);
  });

  test("a null card description mints an empty-string persona description", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, { ownerId: owner, description: null });
    const detail = await svc.createFromCharacter({
      principal: principal(owner),
      characterId: character,
      swapMacros: true,
    });
    expect(detail.description).toBe("");
  });

  test("a character owned by someone else throws (no existence leak)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const character = await seedCharacter(db, { ownerId: owner });
    await expect(
      svc.createFromCharacter({
        principal: principal(other),
        characterId: character,
        swapMacros: false,
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });

  test("a missing character throws", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await expect(
      svc.createFromCharacter({
        principal: principal(owner),
        characterId: castId<CharacterId>("character_ghost"),
        swapMacros: false,
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });
});
