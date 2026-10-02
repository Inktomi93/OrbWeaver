// Mirror int-test for domain/world-info/verbs/createImport — the STANDALONE world-info-book import over a
// real db: parse an untrusted upload (the orb envelope or a raw SillyTavern world file) → the canonical
// shape → the UNATTACHED additive owned write. Wires the real `createImportStandaloneLorebook` write op
// behind the verb. Asserts: a fresh book lands unattached (`created:true`, no character_books row); an
// equal re-import reuses the row (`created:false`, nothing written); a same-named DIFFERENT book lands
// beside the original under a numbered name with the original untouched; a raw ST file lands under its
// filename stem with ST's field spellings mapped; and a malformed or non-world upload is refused as a value.

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
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const ENC = new TextEncoder();

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
    name: "Harbor Lore",
    description: "the lore",
    entries: [
      {
        title: "The Harbor",
        description: null,
        content: "A harbor of eternal dusk.",
        keys: ["harbor"],
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
  return buildWorldBookFile(b);
}

/** A raw SillyTavern `worlds/*.json`: ST's own field spellings (`key`/`order`/`disable`, numeric `position`),
 *  keyed by uid, with the activation fields ST writes and orb stores inert. */
const ST_WORLD_TEXT =
  '{"entries":{"0":{"uid":0,"key":["harbor"],"keysecondary":["dock"],"comment":"The Harbor","content":"Ships at rest.","constant":false,"selective":true,"order":100,"position":1,"disable":false,"probability":50,"useProbability":true},"1":{"uid":1,"key":[],"keysecondary":[],"comment":"Always on","content":"The tide.","constant":true,"order":50,"position":0,"disable":true}}}';

describe("createImport", () => {
  test("a fresh upload lands an UNATTACHED book + its entries (created:true)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });

    const outcome = await verb({ ownerId: owner.id, bytes: bytes(book()) });
    expect(outcome).toEqual({ ok: true, created: true, name: "Harbor Lore", renamedFrom: null });

    const books = await db.select().from(worldBooks);
    expect(books).toHaveLength(1);
    expect(books[0]?.name).toBe("Harbor Lore");
    expect(books[0]?.ownerId).toBe(owner.id);
    const entries = await db.select().from(worldEntries);
    expect(entries.map((e) => e.title)).toEqual(["The Harbor"]);
    // UNATTACHED — no character_books row (the standalone path never attaches).
    expect(await db.select().from(characterBooks)).toHaveLength(0);
  });

  test("an EQUAL re-import reuses the row (created:false) and writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });

    await verb({ ownerId: owner.id, bytes: bytes(book()) });
    const second = await verb({ ownerId: owner.id, bytes: bytes(book()) });
    expect(second).toEqual({ ok: true, created: false, name: "Harbor Lore", renamedFrom: null });

    expect(await db.select().from(worldBooks)).toHaveLength(1);
    expect(await db.select().from(worldEntries)).toHaveLength(1);
  });

  test("a same-named DIFFERENT book lands BESIDE the original under a numbered name; the original keeps its entries", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });

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
    expect(second).toEqual({ ok: true, created: true, name: "Harbor Lore (2)", renamedFrom: "Harbor Lore" });

    // TWO books; the original's entry survives untouched beside the new book's own.
    const books = await db.select().from(worldBooks);
    expect(books.map((b) => b.name).toSorted()).toEqual(["Harbor Lore", "Harbor Lore (2)"]);
    const entries = await db.select().from(worldEntries);
    expect(entries.map((e) => e.title).toSorted()).toEqual(["New Lore", "The Harbor"]);
  });

  test("a raw SillyTavern world file lands under its filename stem with ST's spellings and order mapped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });

    const outcome = await verb({ ownerId: owner.id, bytes: ENC.encode(ST_WORLD_TEXT), filename: "worlds/Harbor Town.json" });
    expect(outcome).toEqual({ ok: true, created: true, name: "Harbor Town", renamedFrom: null });

    const entries = (await db.select().from(worldEntries)).toSorted((a, b) => b.priority - a.priority);
    expect(entries.map((e) => e.title)).toEqual(["The Harbor", "Always on"]);
    // `order` → priority, `disable` → enabled, numeric `position` → the orb anchor, `constant` → always.
    expect(entries.map((e) => e.priority)).toEqual([100, 50]);
    expect(entries.map((e) => e.enabled)).toEqual([true, false]);
    expect(entries[0]?.metadata?.position).toBe("after");
    expect(entries[1]?.metadata?.position).toBe("before");
    expect(entries[1]?.metadata?.scopeMode).toBe("always");
    // The activation fields orb does not apply are KEPT on the entry untouched (owner ruling).
    expect(entries[0]?.metadata?.["keysecondary"]).toEqual(["dock"]);
    expect(entries[0]?.metadata?.["probability"]).toBe(50);
  });

  test("an ST world file whose entries carry EMPTY or REPEATED comments lands every entry (a title is not a key)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });
    // Two entries with no comment (the title falls back to the first key), two sharing one comment.
    const text =
      '{"entries":{"0":{"uid":0,"key":["anchor"],"comment":"","content":"one","order":1},"1":{"uid":1,"key":["bell"],"comment":"","content":"two","order":2},"2":{"uid":2,"key":["c"],"comment":"Same","content":"three","order":3},"3":{"uid":3,"key":["d"],"comment":"Same","content":"four","order":4}}}';

    const outcome = await verb({ ownerId: owner.id, bytes: ENC.encode(text), filename: "worlds/Shared Titles.json" });

    expect(outcome).toEqual({ ok: true, created: true, name: "Shared Titles", renamedFrom: null });
    const entries = await db.select().from(worldEntries);
    expect(entries.map((e) => e.content).toSorted()).toEqual(["four", "one", "three", "two"]);
    expect(entries.map((e) => e.title).toSorted()).toEqual(["Same", "Same", "anchor", "bell"]);
  });

  test("a same name owned by a DIFFERENT user does not collide (owner-scoped dedup)", async () => {
    const db = await freshDb();
    const a = await seedUser(db, {});
    const b = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });

    await verb({ ownerId: a.id, bytes: bytes(book()) });
    const second = await verb({ ownerId: b.id, bytes: bytes(book()) });
    expect(second).toEqual({ ok: true, created: true, name: "Harbor Lore", renamedFrom: null });
    expect(await db.select().from(worldBooks)).toHaveLength(2);
  });

  test("a malformed or non-world upload returns { ok:false } and writes nothing (never throws)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const verb = createImport({ importStandalone: createImportStandaloneLorebook(importCtx(db)) });

    const notJson = await verb({ ownerId: owner.id, bytes: ENC.encode("{not json") });
    expect(notJson.ok).toBe(false);
    expect(notJson.error).toBeDefined();
    // A JSON object that is neither grammar (a regex script, say) is refused, never imported as an empty book.
    const foreign = await verb({ ownerId: owner.id, bytes: ENC.encode('{"name":"x","findRegex":"a","replaceString":"b"}'), filename: "x.json" });
    expect(foreign.ok).toBe(false);
    expect(await db.select().from(worldBooks)).toHaveLength(0);
  });
});
