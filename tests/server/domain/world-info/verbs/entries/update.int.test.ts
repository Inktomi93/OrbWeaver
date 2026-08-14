// verb: updateEntry — owner-scoped via the owned-book inArray subquery. Load-bearing (invariant #4): a
// FOREIGN entry id is NotFound, NEVER a silent cross-tenant write; a patch updates whitelisted fields;
// `metadata: null` clears the blob; a no-op re-reads.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("updateEntry", () => {
  test("patches content + keys of an owned entry", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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

  // THE ROOM PLANE (entity→room member-freshness bridge §3.6). Unlike the `wiEntryScopeChanged` chat-bus fan
  // — which fires only for a SCOPE-affecting field, and only into chat-scope attachments — the domain event
  // is UNCONDITIONAL on a real write: a content-only edit moves what every room reading this book (through
  // ANY of the four scopes) assembles next turn, and that was the exact case with no room driver at all.
  test("a CONTENT-only edit raises `world-info.updated` even though the scope fan deliberately stays silent", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const entry = await svc.createEntry({ principal: principal(owner), bookId: book.id, input: { title: "E", content: "old" } });
    h.domainEvents.length = 0;
    h.wiEvents.length = 0;

    await svc.updateEntry({ principal: principal(owner), entryId: entry.id, input: { content: "new" } });

    expect(h.domainEvents).toEqual([{ type: "world-info.updated", bookId: book.id }]);
    // The scope fan is silent — content is not a scope-affecting field. That asymmetry is the point.
    expect(h.wiEvents).toEqual([]);
  });

  test("a NO-OP edit raises no room event — the verb re-reads without writing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const entry = await svc.createEntry({ principal: principal(owner), bookId: book.id, input: { title: "E", content: "c" } });
    h.domainEvents.length = 0;

    await svc.updateEntry({ principal: principal(owner), entryId: entry.id, input: {} });

    expect(h.domainEvents).toEqual([]);
  });

  test("clears metadata when passed null", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
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
