// Mirror INT suite for domain/import/verbs/import-character (the #1598 re-upload scenarios; the sibling .int.test.ts is #1702's provenance pin) — the #1598 non-destructiveness pin, over a REAL
// db with the REAL world-info import ops (`createBulkImportLorebook` + `createHasPrimaryBook`) injected
// exactly as `entry/compose/world-info.ts` wires them. The sibling `.test.ts` proves the mapping over fakes;
// only a real db can prove what a re-upload does to rows the owner has since EDITED, which is the whole
// finding: `bulkImportLorebook` REPLACES an existing primary book (header update + full entry
// delete/reinsert), so after #1470 made the dedup arm reconcile every plane, re-uploading the same card file
// reverted the owner's edits to that book.
//
// The character front door is the one fake here (it is entry's port, not this verb's business), and it
// INSERTS a real `characters` row — world-info's write asserts the row exists and is the caller's, so a
// recording stub would prove nothing about the seat.
//
// OWNER RULING 2026-09-05 (#1598): the re-upload is NON-DESTRUCTIVE and the replace moved to an explicit
// restore door (`restore-character-book.int.test.ts` is its mirror).

import type { CreateCharacterInput } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import { characterBooks, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createImportService } from "@orb/server/domain/import";
import { createBulkImportLorebook, createHasPrimaryBook } from "@orb/server/domain/world-info";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { ImportContext } from "../../../../../packages/server/src/domain/import/context.ts";
import { seedCharacter, seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const CARD_ENTRY_CONTENT = "A realm of eternal dusk.";
const OWNER_EDIT = "A realm of eternal dusk, ruled by the Thrice-Crowned.";

// Raw ST wire TEXT (snake_case by spec) rather than an object literal — the format IS the fixture, and a
// string keeps the wire's own spelling without a naming-convention suppression.
const CARD_WITH_BOOK = `{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Aria","description":"A wandering bard.","character_book":{"name":"Aria's World","entries":[{"keys":["kingdom"],"content":"${CARD_ENTRY_CONTENT}","comment":"The Kingdom","constant":true,"insertion_order":10}]}}}`;
const CARD_BYTES = new TextEncoder().encode(CARD_WITH_BOOK);

/** Deterministic world-book/entry minters (no unseeded ids under tests/ — test-determinism). */
function worldInfoOps(db: Db): {
  readonly importLorebook: NonNullable<ImportContext["importLorebook"]>;
  readonly hasPrimaryBook: NonNullable<ImportContext["hasPrimaryBook"]>;
} {
  let n = 0;
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  return {
    importLorebook: createBulkImportLorebook({
      db,
      now: (): number => NOW,
      newBookId: (): WorldBookId => castId<WorldBookId>(`world_book_${counter()}`),
      newEntryId: (): WorldEntryId => castId<WorldEntryId>(`world_entry_${counter()}`),
    }),
    hasPrimaryBook: createHasPrimaryBook({ db }),
  };
}

/** The card-import ctx as entry composes it: the character port INSERTS (so the FK chain the world-info
 *  write gates on is real), and the by-importHash oracle answers off the rows it wrote. */
async function importCtx(db: Db): Promise<{ readonly ctx: ImportContext; readonly ownerId: UserId }> {
  const owner = await seedUser(db);
  const byHash = new Map<string, CharacterId>();
  const ctx: ImportContext = {
    ownerId: owner.id,
    createCharacter: async ({ input, importHash }: { readonly input: CreateCharacterInput; readonly importHash: string }) => {
      const row = await seedCharacter(db, { ownerId: owner.id, name: input.name, handle: input.handle, importHash });
      byHash.set(importHash, row.id);
      return { characterId: row.id };
    },
    findByImportHash: ({ importHash }): Promise<CharacterId | null> => Promise.resolve(byHash.get(importHash) ?? null),
    findByHandle: (): Promise<null> => Promise.resolve(null),
    storeAsset: (): Promise<never> => Promise.reject(new Error("no avatar store in this suite (bare-JSON cards)")),
    attachCardTag: (): Promise<boolean> => Promise.resolve(true),
    ...worldInfoOps(db),
  };
  return { ctx, ownerId: owner.id };
}

async function entryContents(db: Db, characterId: CharacterId): Promise<string[]> {
  const rows = await db
    .select({ content: worldEntries.content })
    .from(worldEntries)
    .innerJoin(characterBooks, eq(characterBooks.worldBookId, worldEntries.worldBookId))
    .where(eq(characterBooks.characterId, characterId));
  return rows.map((r) => r.content);
}

describe("importCharacter — a re-upload never overwrites an edited primary book (#1598)", () => {
  test("the first import lands the card's embedded book; a re-upload KEEPS the owner's edits and says so", async ({ db }) => {
    const { ctx } = await importCtx(db);
    const service = createImportService(ctx);

    const first = await service.importCharacter({ card: { bytes: CARD_BYTES, filename: "aria.json" } });
    expect(first.created).toBe(true);
    expect(first.skippedOverlays).toEqual([]);
    expect(await entryContents(db, first.characterId)).toEqual([CARD_ENTRY_CONTENT]);

    // The owner curates the book the card shipped — the state the finding is about.
    await db.update(worldEntries).set({ content: OWNER_EDIT }).where(eq(worldEntries.content, CARD_ENTRY_CONTENT));

    const again = await service.importCharacter({ card: { bytes: CARD_BYTES, filename: "aria.json" } });

    expect(again.created).toBe(false);
    expect(again.characterId).toBe(first.characterId);
    // THE PIN: the edit survives the re-upload, and the outcome NAMES the plane it deliberately skipped.
    expect(await entryContents(db, first.characterId)).toEqual([OWNER_EDIT]);
    expect(again.skippedOverlays).toHaveLength(1);
    expect(again.skippedOverlays[0]).toContain("was NOT re-asserted");
    // Skipping is not the same as duplicating: no second book, and the primary attach is untouched.
    expect(await db.select({ id: worldBooks.id }).from(worldBooks)).toHaveLength(1);
    expect(await db.select({ role: characterBooks.role }).from(characterBooks).where(eq(characterBooks.characterId, first.characterId))).toEqual([
      { role: "primary" },
    ]);
  });

  test("a FREE primary seat still lands the embedded book on the dedup arm (#1470's reconcile is intact)", async ({ db }) => {
    const { ctx } = await importCtx(db);
    const service = createImportService(ctx);

    const first = await service.importCharacter({ card: { bytes: CARD_BYTES, filename: "aria.json" } });
    // Simulate the #1470 partial: the character row is there, the book plane never landed (or was deleted).
    await db.delete(characterBooks).where(eq(characterBooks.characterId, first.characterId));
    await db.delete(worldEntries);
    await db.delete(worldBooks);

    const again = await service.importCharacter({ card: { bytes: CARD_BYTES, filename: "aria.json" } });

    expect(again.created).toBe(false);
    expect(again.skippedOverlays).toEqual([]);
    expect(await entryContents(db, first.characterId)).toEqual([CARD_ENTRY_CONTENT]);
  });
});
