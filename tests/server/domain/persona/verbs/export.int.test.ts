// verb: export — read an owned persona as the portable backup shape (FINAL-Persona §A.6b gap #3).
// Load-bearing: projects the owned persona to the backup shape (no `avatarAssetId`); a foreign/missing
// persona throws.

import { createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

describe("export", () => {
  test("projects the owned persona to the backup shape (no avatarAssetId)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const avatar = await seedAsset(db, { ownerId: owner, hash: "sha_avatar" });
    const source = await svc.create({
      principal: principal(owner),
      input: {
        name: "Nyx",
        title: "The Wanderer",
        description: "a wandering scholar",
        starred: true,
        avatarAssetId: avatar,
        metadata: { descriptionPosition: "in_prompt" },
      },
    });

    const backup = await svc.export({ principal: principal(owner), personaId: source.id });

    expect(backup).toEqual({
      name: "Nyx",
      title: "The Wanderer",
      description: "a wandering scholar",
      starred: true,
      metadata: { descriptionPosition: "in_prompt" },
    });
    expect(backup).not.toHaveProperty("avatarAssetId");
  });

  test("a foreign/missing persona throws PersonaNotFoundError", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const foreign = await svc.create({
      principal: principal(other),
      input: { name: "Theirs", description: "d" },
    });

    await expect(svc.export({ principal: principal(owner), personaId: foreign.id })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });
});
