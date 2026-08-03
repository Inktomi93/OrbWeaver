// Mirror int-test for domain/world-info/verbs/createExport (W-worldinfo; export-import-portability.md §1) —
// the STANDALONE world-info-book export over a real db: read an owned `world_books` row + its `world_entries`
// → the canonical shape → the portable `worlds/*.json` file. Asserts the owner gate (foreign/absent → null),
// the priority order + the null-keys restore, and that the emitted bytes re-parse to the canonical shape
// (the export/import round-trip closes through `#kit/serde/world-info`).

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { worldBooks, worldEntries } from "@orb/db";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { parseWorldBookFile } from "@orb/server/kit/serde/world-info";
import { describe } from "vitest";
import { createExport } from "../../../../../packages/server/src/domain/world-info/verbs/export.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;

async function seedBook(db: Db, ownerId: string, bookId: WorldBookId): Promise<void> {
  await db.insert(worldBooks).values({
    id: bookId,
    ownerId: castId(ownerId),
    name: "Aria's World",
    description: "the lore",
    createdAt: NOW,
  });
  await db.insert(worldEntries).values([
    {
      id: castId<WorldEntryId>("world_entry_low"),
      worldBookId: bookId,
      title: "Low",
      description: null,
      content: "low priority",
      keys: null,
      enabled: true,
      priority: 1,
      ignoreBudget: false,
      metadata: null,
      createdAt: NOW,
    },
    {
      id: castId<WorldEntryId>("world_entry_high"),
      worldBookId: bookId,
      title: "High",
      description: "a memo",
      content: "high priority",
      keys: ["one", "two"],
      enabled: true,
      priority: 10,
      ignoreBudget: true,
      metadata: { scopeMode: "always" },
      createdAt: NOW,
    },
  ]);
}

describe("createExport", () => {
  test("owned book -> portable worlds/*.json bytes that re-parse to the canonical shape", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const bookId = castId<WorldBookId>("world_book_export");
    await seedBook(db, owner.id, bookId);

    const result = await createExport({ db })({ ownerId: owner.id, bookId });
    if (result === null) {
      throw new Error("export returned null for an owned book");
    }
    expect(result.filename).toBe("aria-s-world.json");

    const parsed = parseWorldBookFile(result.bytes);
    if (!parsed.ok) {
      throw new Error(`export bytes did not re-parse: ${parsed.reason}`);
    }
    const canonical = parsed.value;
    const expected: BulkImportLorebookInput = {
      name: "Aria's World",
      description: "the lore",
      // Descending priority (listBookEntries order): High (10) before Low (1).
      entries: [
        {
          title: "High",
          description: "a memo",
          content: "high priority",
          keys: ["one", "two"],
          enabled: true,
          priority: 10,
          ignoreBudget: true,
          metadata: { scopeMode: "always" },
        },
        {
          title: "Low",
          description: null,
          content: "low priority",
          // stored NULL keys restore to an empty array on the wire.
          keys: [],
          enabled: true,
          priority: 1,
          ignoreBudget: false,
          metadata: null,
        },
      ],
    };
    expect(canonical).toEqual(expected);
  });

  test("a foreign / absent book returns null (the owner gate, leak-free)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const stranger = await seedUser(db, {});
    const bookId = castId<WorldBookId>("world_book_owned");
    await seedBook(db, owner.id, bookId);

    expect(await createExport({ db })({ ownerId: stranger.id, bookId })).toBeNull();
    expect(await createExport({ db })({ ownerId: owner.id, bookId: castId("world_book_missing") })).toBeNull();
  });
});
