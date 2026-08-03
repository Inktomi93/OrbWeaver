// verb: export — read an owned persona as the portable backup shape (FINAL-Persona §A.6b gap #3).
// Load-bearing: projects the owned persona to the backup shape (no `avatarAssetId`); a foreign/missing
// persona throws.

import type { PortableParse } from "@orb/contracts/portability";
import { createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { parsePersonaBackup } from "@orb/server/kit/serde/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

/** The parse outcome's value — the portable serdes return a typed refusal reason, never null. */
function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

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

    const file = await svc.export({ principal: principal(owner), personaId: source.id });
    expect(file.filename).toBe("nyx.json");
    const backup = must(parsePersonaBackup(file.bytes));

    expect(backup).toEqual({
      name: "Nyx",
      title: "The Wanderer",
      description: "a wandering scholar",
      starred: true,
      metadata: { descriptionPosition: "in_prompt" },
    });
    expect(backup).not.toHaveProperty("avatarAssetId");
    // The FILE is the unit: the same bytes the bundle descriptor streams for this persona.
    expect(JSON.parse(new TextDecoder().decode(file.bytes))).not.toHaveProperty("avatarAssetId");
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
