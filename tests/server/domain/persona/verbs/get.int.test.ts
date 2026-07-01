// verb: get — owner-scoped single read. Load-bearing: "not found" and "not yours" collapse into one
// answer (no foreign-existence leak) — both throw PersonaNotFoundError.

import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("get", () => {
  test("returns an owned persona by id", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Nyx", description: "d" },
    });
    const got = await svc.get({ principal: principal(owner), personaId: created.id });
    expect(got.id).toBe(created.id);
    expect(got.name).toBe("Nyx");
  });

  test("another user's persona is indistinguishable from a missing one (PersonaNotFoundError)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Secret", description: "d" },
    });
    await expect(svc.get({ principal: principal(other), personaId: created.id })).rejects.toThrow(
      PersonaNotFoundError,
    );
  });

  test("a missing id throws PersonaNotFoundError", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await expect(
      svc.get({ principal: principal(owner), personaId: castId<PersonaId>("persona_ghost") }),
    ).rejects.toThrow(PersonaNotFoundError);
  });
});
