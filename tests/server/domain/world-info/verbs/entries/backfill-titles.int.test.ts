// verb: backfillTitles — fill blank titles from keys. Load-bearing: a blank-titled entry with keys gets the
// comma-joined keys as its title; an entry with no keys is LEFT blank (no synthetic default); the count is
// returned. Blank titles are seeded directly (createEntry requires a non-empty title — blanks are the
// import-path case the verb defends).

import { worldEntries } from "@orb/db";
import type { Handle, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("backfillTitles", () => {
  test("fills blank titles from keys, leaves keyless entries blank", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });

    const withKeys = castId<WorldEntryId>("world_entry_keys");
    const noKeys = castId<WorldEntryId>("world_entry_nokeys");
    await db.insert(worldEntries).values([
      {
        id: withKeys,
        worldBookId: book.id,
        title: "  ",
        content: "c",
        keys: ["alpha", "beta"],
        createdAt: 1,
      },
      { id: noKeys, worldBookId: book.id, title: "", content: "c", keys: null, createdAt: 1 },
    ]);

    const res = await svc.backfillTitles({ principal: principal(owner), bookId: book.id });
    expect(res.filled).toBe(1);

    const filled = await db.select().from(worldEntries).where(eq(worldEntries.id, withKeys));
    const skipped = await db.select().from(worldEntries).where(eq(worldEntries.id, noKeys));
    expect(filled[0]?.title).toBe("alpha, beta");
    expect(skipped[0]?.title).toBe("");
    expect(h.audits.map((a) => a.entry.action)).toContain("worldInfo.backfillTitles");
  });

  test("returns 0 (no audit) when nothing is blank", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "Has Title", content: "c" },
    });

    const res = await svc.backfillTitles({ principal: principal(owner), bookId: book.id });
    expect(res.filled).toBe(0);
    expect(h.audits.filter((a) => a.entry.action === "worldInfo.backfillTitles")).toHaveLength(0);
  });
});
