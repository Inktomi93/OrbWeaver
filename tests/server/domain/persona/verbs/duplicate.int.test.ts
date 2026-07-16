// verb: duplicate — clone an owned persona (FINAL-Persona §A.6b gap #2). Load-bearing: the clone is a FRESH
// id owned by the caller; name gets the " (copy)" suffix; `starred` resets to false; `avatarAssetId`/
// `metadata` carry forward verbatim; a foreign/missing source throws (no row, no audit).

import { personas } from "@orb/db";
import { createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

describe("duplicate", () => {
  test("clones name/description/starred(reset)/avatar/metadata into a fresh owned row (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
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
        metadata: { descriptionPosition: "at_depth", inject: { depth: 3, role: "user" } },
      },
    });

    const clone = await svc.duplicate({ principal: principal(owner), personaId: source.id });

    expect(clone.id).not.toBe(source.id);
    expect(clone.name).toBe("Nyx (copy)");
    expect(clone.title).toBe("The Wanderer");
    expect(clone.description).toBe("a wandering scholar");
    expect(clone.starred).toBe(false); // a fresh identity, not a second favorite
    expect(clone.avatarAssetId).toBe(avatar); // trivial re-point — same asset, no new blob
    expect(clone.avatarHash).toBe("sha_avatar");
    expect(clone.metadata?.descriptionPosition).toBe("at_depth");
    expect(clone.metadata?.inject).toEqual({ depth: 3, role: "user" });

    const rows = await db.select().from(personas).where(eq(personas.id, clone.id));
    expect(rows[0]?.ownerId).toBe(owner);
    expect(h.audits.map((a) => a.entry.action)).toContain("persona.duplicate");
  });

  test("a foreign/missing source throws PersonaNotFoundError (no row minted, no audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const foreign = await svc.create({
      principal: principal(other),
      input: { name: "Theirs", description: "d" },
    });

    await expect(svc.duplicate({ principal: principal(owner), personaId: foreign.id })).rejects.toBeInstanceOf(PersonaNotFoundError);

    const rows = await db.select().from(personas).where(eq(personas.ownerId, owner));
    expect(rows).toHaveLength(0);
    expect(h.audits.map((a) => a.entry.action)).not.toContain("persona.duplicate");
  });
});
