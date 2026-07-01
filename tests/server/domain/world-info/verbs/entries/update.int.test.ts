// verb: updateEntry — owner-scoped via the owned-book inArray subquery. Load-bearing (invariant #4): a
// FOREIGN entry id is NotFound, NEVER a silent cross-tenant write; a patch updates whitelisted fields;
// `metadata: null` clears the blob; a no-op re-reads.

import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("updateEntry", () => {
  test("patches content + keys of an owned entry", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "old", keys: ["x"] },
    });

    const updated = await svc.updateEntry({
      principal: principal(owner),
      entryId: entry.id,
      input: { content: "new", keys: ["y", "z"] },
    });
    expect(updated.content).toBe("new");
    expect(updated.keys).toEqual(["y", "z"]);
  });

  test("clears metadata when passed null", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c", metadata: { scopeMode: "always" } },
    });

    const cleared = await svc.updateEntry({
      principal: principal(owner),
      entryId: entry.id,
      input: { metadata: null },
    });
    expect(cleared.metadata).toBeNull();
  });

  test("a foreign entry id is NotFound — no cross-tenant write", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const theirBook = await svc.createBook({ principal: principal(other), input: { name: "T" } });
    const theirEntry = await svc.createEntry({
      principal: principal(other),
      bookId: theirBook.id,
      input: { title: "E", content: "secret" },
    });

    await expect(
      svc.updateEntry({
        principal: principal(owner),
        entryId: theirEntry.id,
        input: { content: "hijack" },
      }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
    const still = await svc.getEntry({ principal: principal(other), entryId: theirEntry.id });
    expect(still.content).toBe("secret");
  });
});
