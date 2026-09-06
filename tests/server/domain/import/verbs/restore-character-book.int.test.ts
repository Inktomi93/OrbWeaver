// Mirror INT test for domain/import/verbs/restore-character-book — THE RESTORE DOOR (#1598), over a REAL db
// with the REAL world-info write. The re-upload path is now non-destructive
// (`import-character.int.test.ts`), so this is the ONE place the documented REPLACE semantic is still
// reachable: the owner asks for the card's own lorebook back and gets it, edits and all overwritten.
//
// The refusals are pinned as VALUES (never throws — the `importChatFile` contract): a card this owner never
// imported, a card carrying no embedded book, and unreadable bytes each come back as an operator-facing
// sentence the calling route renders with a 400.

import type { CreateCharacterInput } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import { characterBooks, worldBooks, worldEntries } from "@orb/db";
import type { CharacterId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
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
const CARD_WITHOUT_BOOK = '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Bookless","description":"no lore"}}';
const ENC = new TextEncoder();
const CARD_BYTES = ENC.encode(CARD_WITH_BOOK);

/** The card-import ctx as entry composes it (see `import-character.int.test.ts` for the same shape). */
async function importCtx(db: Db): Promise<ImportContext> {
  const owner = await seedUser(db);
  const byHash = new Map<string, CharacterId>();
  let n = 0;
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  return {
    ownerId: owner.id,
    createCharacter: async ({
      input,
      importHash,
    }: {
      readonly input: CreateCharacterInput;
      readonly importHash: string;
    }): Promise<{ readonly characterId: CharacterId }> => {
      const row = await seedCharacter(db, { ownerId: owner.id, name: input.name, handle: input.handle, importHash });
      byHash.set(importHash, row.id);
      return { characterId: row.id };
    },
    findByImportHash: ({ importHash }): Promise<CharacterId | null> => Promise.resolve(byHash.get(importHash) ?? null),
    findByHandle: (): Promise<null> => Promise.resolve(null),
    storeAsset: (): Promise<never> => Promise.reject(new Error("no avatar store in this suite (bare-JSON cards)")),
    attachCardTag: (): Promise<boolean> => Promise.resolve(true),
    importLorebook: createBulkImportLorebook({
      db,
      now: (): number => NOW,
      newBookId: (): WorldBookId => castId<WorldBookId>(`world_book_${counter()}`),
      newEntryId: (): WorldEntryId => castId<WorldEntryId>(`world_entry_${counter()}`),
    }),
    hasPrimaryBook: createHasPrimaryBook({ db }),
  };
}

async function entryContents(db: Db, characterId: CharacterId): Promise<string[]> {
  const rows = await db
    .select({ content: worldEntries.content })
    .from(worldEntries)
    .innerJoin(characterBooks, eq(characterBooks.worldBookId, worldEntries.worldBookId))
    .where(eq(characterBooks.characterId, characterId));
  return rows.map((r) => r.content);
}

describe("restoreCharacterBook — the explicit way back to the card's own lorebook (#1598)", () => {
  test("re-asserts the card's book over the owner's edited primary, in place (same book row + attach)", async ({ db }) => {
    const service = createImportService(await importCtx(db));
    const imported = await service.importCharacter({ card: { bytes: CARD_BYTES, filename: "aria.json" } });
    await db.update(worldEntries).set({ content: OWNER_EDIT }).where(eq(worldEntries.content, CARD_ENTRY_CONTENT));
    const bookIdBefore = (await db.select({ id: worldBooks.id }).from(worldBooks))[0]?.id;

    const outcome = await service.restoreCharacterBook({ card: { bytes: CARD_BYTES, filename: "aria.json" } });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      throw new Error(outcome.error);
    }
    expect(outcome.characterId).toBe(imported.characterId);
    expect(outcome.replaced).toBe(true);
    expect(outcome.entryCount).toBe(1);
    // THE PIN: the card's content is back, in the SAME book row (no second book, no orphaned attach).
    expect(await entryContents(db, imported.characterId)).toEqual([CARD_ENTRY_CONTENT]);
    expect(outcome.worldBookId).toBe(bookIdBefore);
    expect(await db.select({ id: worldBooks.id }).from(worldBooks)).toHaveLength(1);
  });

  test("refuses — as a VALUE — a card this owner never imported", async ({ db }) => {
    const service = createImportService(await importCtx(db));

    const outcome = await service.restoreCharacterBook({ card: { bytes: CARD_BYTES, filename: "aria.json" } });

    expect(outcome).toStrictEqual({ ok: false, error: expect.stringContaining("No character of yours was imported from this exact card file") });
    expect(await db.select({ id: worldBooks.id }).from(worldBooks)).toHaveLength(0);
  });

  test("refuses a card that carries no embedded lorebook, and bytes that are not a card at all", async ({ db }) => {
    const service = createImportService(await importCtx(db));
    await service.importCharacter({ card: { bytes: ENC.encode(CARD_WITHOUT_BOOK), filename: "bookless.json" } });

    const noBook = await service.restoreCharacterBook({ card: { bytes: ENC.encode(CARD_WITHOUT_BOOK), filename: "bookless.json" } });
    expect(noBook).toStrictEqual({ ok: false, error: expect.stringContaining("carries no embedded world book") });

    const garbage = await service.restoreCharacterBook({ card: { bytes: ENC.encode("not a card"), filename: "junk.json" } });
    expect(garbage).toStrictEqual({ ok: false, error: expect.stringContaining("isn't a readable V2/V3 character card") });
  });
});
