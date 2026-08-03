// verb: updateBook — owner-scoped patch. Load-bearing: a foreign book is NotFound (no silent write); a
// patch updates the whitelisted fields; a no-op edit re-reads without throwing.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("updateBook", () => {
  test("patches name + description of an owned book", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Old" } });

    const updated = await svc.updateBook({
      principal: principal(owner),
      bookId: book.id,
      input: { name: "New", description: "fresh" },
    });

    expect(updated.name).toBe("New");
    expect(updated.description).toBe("fresh");
    expect(h.audits.map((a) => a.entry.action)).toContain("worldInfo.updateBook");
  });

  test("a foreign book is NotFound — no write", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(svc.updateBook({ principal: principal(owner), bookId: theirs.id, input: { name: "Hijack" } })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
    const still = await svc.getBook({ principal: principal(other), bookId: theirs.id });
    expect(still.name).toBe("Theirs");
  });

  test("a no-op edit (no fields) re-reads without auditing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Same" } });

    const same = await svc.updateBook({ principal: principal(owner), bookId: book.id, input: {} });
    expect(same.name).toBe("Same");
    expect(h.audits.filter((a) => a.entry.action === "worldInfo.updateBook")).toHaveLength(0);
  });
});
