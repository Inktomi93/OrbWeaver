// verb: createBook — owner-scoped mint. Load-bearing: the new row is owned by `principal.userId`; the view
// matches the inserted values; every create audits `worldInfo.createBook`.

import { worldBooks } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("createBook", () => {
  test("mints a book owned by the caller and returns its view (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const book = await svc.createBook({
      principal: principal(owner),
      input: { name: "Lore", description: "the world" },
    });

    expect(book.name).toBe("Lore");
    expect(book.description).toBe("the world");
    const rows = await db.select().from(worldBooks).where(eq(worldBooks.id, book.id));
    expect(rows[0]?.ownerId).toBe(owner);
    expect(h.audits.map((a) => a.entry.action)).toContain("worldInfo.createBook");
  });

  test("a missing description stores + returns null", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const book = await svc.createBook({ principal: principal(owner), input: { name: "Bare" } });

    expect(book.description).toBeNull();
  });
});
