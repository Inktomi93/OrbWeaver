// Mirror int-test for domain/world-info/verbs/createImport (W-worldinfo; export-import-portability.md §1) —
// the STANDALONE world-info-book import over a real db: parse an untrusted `worlds/*.json` upload → the
// canonical shape → the UNATTACHED owned write (dedup on `(ownerId, name)`, R6). Wires the real
// `createImportStandaloneLorebook` write op behind the verb. Asserts: a fresh book lands unattached
// (`created:true`, no character_books row); a same-named re-import replaces in place (`created:false`); and
// a malformed upload returns `{ ok:false }` (never a throw).

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, worldBooks, worldEntries } from "@orb/db";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { buildWorldBookFile } from "@orb/server/kit/serde/world-info";
import { describe } from "vitest";
import type { WorldInfoImportContext } from "../../../../../packages/server/src/domain/world-info/contract/import.ts";
import { createImportStandaloneLorebook } from "../../../../../packages/server/src/domain/world-info/persistence/import-write.ts";
import { createImport } from "../../../../../packages/server/src/domain/world-info/verbs/import.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures";

const NOW = 1_700_000_000_000;

function importCtx(db: Db): WorldInfoImportContext {
  let n = 0;
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  return {
    db,
    now: (): number => NOW,
    newBookId: (): WorldBookId => castId<WorldBookId>(`world_book_${counter()}`),
    newEntryId: (): WorldEntryId => castId<WorldEntryId>(`world_entry_${counter()}`),
  };
}

function book(over: Partial<BulkImportLorebookInput> = {}): BulkImportLorebookInput {
  return {
    name: "Aria's World",
    description: "the lore",
    entries: [
      {
        title: "The Kingdom",
        description: null,
        content: "A realm of eternal dusk.",
        keys: ["kingdom"],
        enabled: true,
        priority: 10,
        ignoreBudget: false,
        metadata: { scopeMode: "always" },
      },
    ],
    ...over,
  };
}

function bytes(b: BulkImportLorebookInput): Uint8Array {
  return new TextEncoder().encode(buildWorldBookFile(b));
}

describe("createImport", () => {
  test("a fresh upload lands an UNATTACHED book + its entries (created:true)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });

    const outcome = await verb({ ownerId: owner.id, bytes: bytes(book()) });
    expect(outcome).toEqual({ ok: true, created: true });

    const books = await db.select().from(worldBooks);
    expect(books).toHaveLength(1);
    expect(books[0]?.name).toBe("Aria's World");
    expect(books[0]?.ownerId).toBe(owner.id);
    const entries = await db.select().from(worldEntries);
    expect(entries.map((e) => e.title)).toEqual(["The Kingdom"]);
    // UNATTACHED — no character_books row (the standalone path never attaches).
    expect(await db.select().from(characterBooks)).toHaveLength(0);
  });

  test("a same-named re-import replaces in place (dedup on (ownerId, name); created:false)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const write = createImportStandaloneLorebook(importCtx(db));
    const verb = createImport({ importStandalone: write });

    await verb({ ownerId: owner.id, bytes: bytes(book()) });
    const second = await verb({
      ownerId: owner.id,
      bytes: bytes(
        book({
          entries: [
            {
              title: "New Lore",
              description: null,
              content: "rewritten",
              keys: [],
              enabled: true,
              priority: 5,
              ignoreBudget: false,
              metadata: null,
            },
          ],
        }),
      ),
    });
    expect(second).toEqual({ ok: true, created: false });

    // ONE book, entries fully swapped; still unattached.
    const books = await db.select().from(worldBooks);
    expect(books).toHaveLength(1);
    const entries = await db.select().from(worldEntries);
    expect(entries.map((e) => e.title)).toEqual(["New Lore"]);
  });

  test("a same name owned by a DIFFERENT user does not collide (owner-scoped dedup)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, {});
    const b = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });

    await verb({ ownerId: a.id, bytes: bytes(book()) });
    const second = await verb({ ownerId: b.id, bytes: bytes(book()) });
    expect(second).toEqual({ ok: true, created: true });
    expect(await db.select().from(worldBooks)).toHaveLength(2);
  });

  test("a malformed upload returns { ok:false } and writes nothing (never throws)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });

    const outcome = await verb({ ownerId: owner.id, bytes: new TextEncoder().encode("{not json") });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBeDefined();
    expect(await db.select().from(worldBooks)).toHaveLength(0);
  });
});
