// verb: list — owner-scoped, newest-first. Load-bearing: another user's personas NEVER appear (the
// ownership predicate is in the WHERE), and ordering is by createdAt desc (the clock advances between
// creates to break the tie a frozen clock would otherwise produce).

import { createPersonaService } from "@orb/server/domain/persona";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

const ONE_MINUTE = 60_000;

describe("list", () => {
  test("returns only the caller's personas, newest first", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });

    const first = await svc.create({
      principal: principal(owner),
      input: { name: "First", description: "" },
    });
    h.advance(ONE_MINUTE);
    const second = await svc.create({
      principal: principal(owner),
      input: { name: "Second", description: "" },
    });
    await svc.create({ principal: principal(other), input: { name: "Foreign", description: "" } });

    const mine = await svc.list({ principal: principal(owner) });
    expect(mine.map((p) => p.id)).toEqual([second.id, first.id]);

    const theirs = await svc.list({ principal: principal(other) });
    expect(theirs.map((p) => p.name)).toEqual(["Foreign"]);
  });

  test("an owner with no personas gets an empty array", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    expect(await svc.list({ principal: principal(owner) })).toEqual([]);
  });
});
