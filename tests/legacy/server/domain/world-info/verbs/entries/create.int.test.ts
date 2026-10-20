// verb: createEntry — owner-scoped mint into a book. Load-bearing: a foreign book is NotFound; defaults are
// applied (enabled/priority/ignoreBudget); `metadata` is coerced to the typed shape at the write seam.
// @subject packages/server/src/domain/world-info/verbs/entries/create.ts

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createWorldInfoService, WorldInfoNotFoundError } from "#server/domain/world-info/index.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("createEntry", () => {
  test("mints an entry with defaults + typed metadata (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: await principal(db, owner), input: { name: "B" } });

    const entry = await svc.createEntry({
      principal: await principal(db, owner),
      bookId: book.id,
      input: {
        title: "Castle",
        content: "a fortress",
        keys: ["castle"],
        metadata: { scopeMode: "keyword", inject: { depth: 3, role: "user" } },
      },
    });

    expect(entry.worldBookId).toBe(book.id);
    expect(entry.enabled).toBe(true);
    expect(entry.priority).toBe(0);
    expect(entry.ignoreBudget).toBe(false);
    expect(entry.keys).toEqual(["castle"]);
    expect(entry.metadata?.scopeMode).toBe("keyword");
    expect(entry.metadata?.inject).toEqual({ depth: 3, role: "user" });
    expect(h.audits.map((a) => a.entry.action)).toContain("worldInfo.createEntry");
  });

  test("a foreign book is NotFound — no entry written", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: await principal(db, other), input: { name: "Theirs" } });

    await expect(
      svc.createEntry({
        principal: await principal(db, owner),
        bookId: theirs.id,
        input: { title: "X", content: "c" },
      }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
