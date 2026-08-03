// persistence/queries — the owner-scoped reads + the parse-at-the-seam projections. Load-bearing:
//   • `toEntryView` narrows `metadata` to the typed `EntryMetadata | null` and degrades a CORRUPT blob to
//     null (invariant #5 — the read-seam zod `.catch`), and re-surfaces `keys` as `string[] | null`.
//   • `loadOwnedEntry` is owner-scoped THROUGH the book (entries have no ownerId, D23) — a foreign entry
//     returns undefined, never another tenant's row.
//   • the SCAN / ACTIVATION selection: an entry persisted with keys + `inject`/`scopeMode`/`position`
//     metadata feeds the kit resolvers (`matchEntryKeys` keyword fire, `resolveEntryInjection` depth/role
//     placement, `resolveEntryScope`, `resolveEntryPosition`) straight off the stored view — the
//     storage→selection path this domain is responsible for (the per-turn POOL that DRIVES it is Phase-5
//     chat; here we prove the stored shape selects correctly).
// Internal (non-front-door) files are imported by RELATIVE path — the package `./*` map only resolves a
// module's directory front door, not a flat file.

import type { EntryView } from "@orb/contracts/world-info";
import { worldBooks, worldEntries } from "@orb/db";
import type { Handle, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { buildKeywordHaystack, matchEntryKeys, resolveEntryInjection, resolveEntryPosition, resolveEntryScope } from "@orb/kit/world-info";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { loadOwnedBook, loadOwnedEntry, toBookView, toEntryView } from "../../../../../packages/server/src/domain/world-info/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const FROZEN_AT = 1_750_000_000_000;
type DbHandle = Awaited<ReturnType<typeof freshDb>>;

/** First row, or fail the test — keeps `!` (noNonNullAssertion) out of the assertions. */
function only<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("expected a row");
  }
  return row;
}

async function seedBook(db: DbHandle, ownerId: UserId, id: string): Promise<WorldBookId> {
  const bookId = castId<WorldBookId>(id);
  await db.insert(worldBooks).values({ id: bookId, ownerId, name: "B", createdAt: FROZEN_AT });
  return bookId;
}

async function seedEntry(db: DbHandle, bookId: WorldBookId, overrides: { id: string; keys?: string[] | null; metadata?: unknown }): Promise<WorldEntryId> {
  const entryId = castId<WorldEntryId>(overrides.id);
  await db.insert(worldEntries).values({
    id: entryId,
    worldBookId: bookId,
    title: "E",
    content: "c",
    keys: overrides.keys ?? null,
    metadata: overrides.metadata as never,
    createdAt: FROZEN_AT,
  });
  return entryId;
}

async function loadEntryView(db: DbHandle, entryId: WorldEntryId): Promise<EntryView> {
  const rows = await db.select().from(worldEntries).where(eq(worldEntries.id, entryId));
  return toEntryView(only(rows));
}

describe("toBookView / toEntryView projections", () => {
  test("toBookView drops ownerId; toEntryView types metadata + degrades corrupt to null", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bookId = await seedBook(db, owner, "world_book_a");
    const goodId = await seedEntry(db, bookId, {
      id: "world_entry_good",
      keys: ["dragon"],
      metadata: { scopeMode: "keyword", inject: { depth: 2, role: "system" }, position: "after" },
    });
    const corruptId = await seedEntry(db, bookId, {
      id: "world_entry_corrupt",
      metadata: "not-an-object",
    });

    const view = toBookView(only(await db.select().from(worldBooks)));
    expect(view).not.toHaveProperty("ownerId");

    const good = await loadEntryView(db, goodId);
    expect(good.keys).toEqual(["dragon"]);
    expect(good.metadata?.scopeMode).toBe("keyword");

    const corrupt = await loadEntryView(db, corruptId);
    expect(corrupt.metadata).toBeNull();
  });
});

describe("loadOwnedBook / loadOwnedEntry owner-scoping", () => {
  test("a foreign entry returns undefined (owner-scoped through the book)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirBook = await seedBook(db, other, "world_book_theirs");
    const theirEntry = await seedEntry(db, theirBook, { id: "world_entry_theirs" });

    expect(await loadOwnedBook(db, owner, theirBook)).toBeUndefined();
    expect(await loadOwnedEntry(db, owner, theirEntry)).toBeUndefined();
    expect(await loadOwnedEntry(db, other, theirEntry)).toBeDefined();
  });
});

describe("scan / activation selection over stored entries (kit resolvers)", () => {
  test("keyword entry fires on a key match and resolves its depth/role placement", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bookId = await seedBook(db, owner, "world_book_scan");
    const entryId = await seedEntry(db, bookId, {
      id: "world_entry_scan",
      keys: ["Castle"],
      metadata: { inject: { depth: 4, role: "assistant" } },
    });
    const view = await loadEntryView(db, entryId);
    const hasKeys = (view.keys ?? []).length > 0;

    // The haystack the chat assembly would build (recent message + names), lowercased by the kit helper.
    const haystack = buildKeywordHaystack(["We rode toward the CASTLE gates."], ["Knight"]);
    expect(matchEntryKeys(view.keys ?? [], haystack)).toEqual(["castle"]);

    expect(resolveEntryScope(view.metadata, hasKeys)).toBe("keyword");
    expect(resolveEntryInjection(view.metadata)).toEqual({ depth: 4, role: "assistant" });
  });

  test("a keyless always-entry resolves to always-scope + default position, no injection", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bookId = await seedBook(db, owner, "world_book_always");
    const entryId = await seedEntry(db, bookId, { id: "world_entry_always", keys: null });
    const view = await loadEntryView(db, entryId);
    const hasKeys = (view.keys ?? []).length > 0;

    expect(resolveEntryScope(view.metadata, hasKeys)).toBe("always");
    expect(resolveEntryInjection(view.metadata)).toBeNull();
    expect(resolveEntryPosition(view.metadata)).toBe("before");
  });
});
