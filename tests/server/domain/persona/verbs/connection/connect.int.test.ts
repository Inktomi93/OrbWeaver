// verb: connectToCharacter — idempotent junction insert, double ownership gate. Load-bearing: a re-connect
// is a no-op (not an error); BOTH owner gates fire (a foreign character OR a foreign persona throws); a
// real connect audits.

import { characterPersonas } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedUser } from "../../_support.ts";

describe("connectToCharacter", () => {
  test("links persona↔character and is idempotent on re-connect (one junction row)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const character = await seedCharacter(db, { ownerId: owner });
    const persona = await svc.create({
      principal: principal(owner),
      input: { name: "P", description: "d" },
    });

    await svc.connectToCharacter({
      principal: principal(owner),
      characterId: character,
      personaId: persona.id,
    });
    await svc.connectToCharacter({
      principal: principal(owner),
      characterId: character,
      personaId: persona.id,
    });

    const rows = await db
      .select()
      .from(characterPersonas)
      .where(
        and(
          eq(characterPersonas.characterId, character),
          eq(characterPersonas.personaId, persona.id),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(h.audits.filter((a) => a.entry.action === "persona.connectToCharacter")).toHaveLength(2);
  });

  test("a character owned by another user is rejected — no junction row", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const foreignCharacter = await seedCharacter(db, { ownerId: other });
    const persona = await svc.create({
      principal: principal(owner),
      input: { name: "P", description: "d" },
    });
    await expect(
      svc.connectToCharacter({
        principal: principal(owner),
        characterId: foreignCharacter,
        personaId: persona.id,
      }),
    ).rejects.toThrow(DomainNotFoundError);
    expect(await db.select().from(characterPersonas)).toHaveLength(0);
  });

  test("a foreign persona throws PersonaNotFoundError", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const character = await seedCharacter(db, { ownerId: owner });
    const foreignPersona = await svc.create({
      principal: principal(other),
      input: { name: "Theirs", description: "d" },
    });
    await expect(
      svc.connectToCharacter({
        principal: principal(owner),
        characterId: character,
        personaId: foreignPersona.id,
      }),
    ).rejects.toThrow(PersonaNotFoundError);
  });
});
