// verb: get — owner-scoped single read. Load-bearing: "not found" and "not yours" collapse into one
// answer (no foreign-existence leak) — both throw PersonaNotFoundError.
// @subject packages/server/src/domain/persona/verbs/get.ts

import type { Handle, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
// The central user factory replaces the harness's hand-rolled seedUser (support/factories).
import { seedUser } from "@orb/testkit/node/factories/index.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createPersonaService, PersonaNotFoundError } from "#server/domain/persona/index.ts";
import { makeHarness, principal } from "../_support.ts";

describe("get", () => {
  test("returns an owned persona by id", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = (await seedUser(db, { handle: castId<Handle>("owner") })).id;
    const created = await svc.create({
      principal: await principal(db, owner),
      input: { name: "Nyx", description: "d" },
    });
    const got = await svc.get({ principal: await principal(db, owner), personaId: created.id });
    expect(got.id).toBe(created.id);
    expect(got.name).toBe("Nyx");
  });

  test("another user's persona is indistinguishable from a missing one (PersonaNotFoundError)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = (await seedUser(db, { handle: castId<Handle>("owner") })).id;
    const other = (await seedUser(db, { handle: castId<Handle>("other") })).id;
    const created = await svc.create({
      principal: await principal(db, owner),
      input: { name: "Secret", description: "d" },
    });
    await expect(svc.get({ principal: await principal(db, other), personaId: created.id })).rejects.toThrow(PersonaNotFoundError);
  });

  test("a missing id throws PersonaNotFoundError", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = (await seedUser(db, { handle: castId<Handle>("owner") })).id;
    await expect(svc.get({ principal: await principal(db, owner), personaId: castId<PersonaId>("persona_ghost") })).rejects.toThrow(PersonaNotFoundError);
  });
});
