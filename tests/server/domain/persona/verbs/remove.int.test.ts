// verb: remove — owner-scoped delete. Load-bearing: the junction CASCADEs (a connected persona's
// character_personas rows vanish with it); a not-owned/missing target throws (no cross-user delete); a
// real delete audits.

import { characterPersonas, personas } from "@orb/db";
import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedUser } from "../_support.ts";

describe("remove", () => {
  test("deletes an owned persona and CASCADEs its character_personas links (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await seedCharacter(db, { ownerId: owner });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Doomed", description: "d" },
    });
    await svc.connectToCharacter({
      principal: principal(owner),
      characterId: character,
      personaId: created.id,
    });

    const result = await svc.remove({ principal: principal(owner), personaId: created.id });

    expect(result).toEqual({ deleted: true });
    expect(await db.select().from(personas).where(eq(personas.id, created.id))).toHaveLength(0);
    expect(
      await db.select().from(characterPersonas).where(eq(characterPersonas.personaId, created.id)),
    ).toHaveLength(0);
    expect(h.audits.map((a) => a.entry.action)).toContain("persona.remove");
  });

  test("a not-owned persona throws PersonaNotFoundError (no delete)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Mine", description: "d" },
    });
    await expect(
      svc.remove({ principal: principal(other), personaId: created.id }),
    ).rejects.toThrow(PersonaNotFoundError);
    expect(await db.select().from(personas).where(eq(personas.id, created.id))).toHaveLength(1);
    expect(h.audits.some((a) => a.entry.action === "persona.remove")).toBe(false);
  });

  test("a missing id throws PersonaNotFoundError", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await expect(
      svc.remove({ principal: principal(owner), personaId: castId<PersonaId>("persona_ghost") }),
    ).rejects.toThrow(PersonaNotFoundError);
  });
});
