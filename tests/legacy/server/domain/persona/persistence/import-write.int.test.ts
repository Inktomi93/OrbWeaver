// Mirror int-test for domain/persona/persistence/createBulkImportPersonas (Option B) — the persona-
// OWNED bulk-import WRITE over a real db: content-identity dedup over one owner-scoped pre-fetch (equal
// content reuses; same name with different content follows the per-collision choice — merge into the owned
// row by default, or keep both under " 2"), batch insert, and the
// `idByName` (lowercased) the import verb copies into `personaByUserName`. Input is the canonical
// `BulkImportPersonaInput` (`@orb/contracts/persona`); the ST→canonical mapping is import's job (tested there).

import type { BulkImportPersonaInput } from "@orb/contracts/persona";
import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { seedUser } from "@orb/testkit/node/factories/index.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { PersonaImportContext } from "#server/domain/persona/contract/import.ts";
import { createBulkImportPersonas } from "#server/domain/persona/persistence/import-write.ts";

const NOW = 1_700_000_000_000;

/** A deterministic counter-minted `PersonaImportContext`. */
function importCtx(db: Db): PersonaImportContext {
  let n = 0;
  return {
    db,
    now: (): number => NOW,
    newPersonaId: (): PersonaId => {
      n += 1;
      return castId<PersonaId>(`persona_${String(n).padStart(26, "0")}`);
    },
  };
}

function persona(name: string, isDefault = false): BulkImportPersonaInput {
  return {
    name,
    description: `${name} desc`,
    avatarAssetId: null,
    metadata: null,
    isDefault,
  };
}

describe("createBulkImportPersonas", () => {
  test("writes new personas, returns idByName (lowercased) + the default", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas({ ...importCtx(db), db: databaseHandle(db) });

    const result = await op({
      ownerId: owner.id,
      personas: [persona("Alex", true), persona("Eve")],
    });

    const alexKey = "alex";
    expect(result.personasCreated).toBe(2);
    expect(result.personasSkipped).toBe(0);
    expect(result.defaultPersonaId).toBe(result.idByName[alexKey]);
    // The map follows the input order: the first input under a folded name owns the key.
    expect(Object.keys(result.idByName)).toEqual(["alex", "eve"]);

    const rows = await db.select({ name: personas.name }).from(personas).where(eq(personas.ownerId, owner.id));
    expect(rows.map((r) => r.name).sort()).toEqual(["Alex", "Eve"]);
  });

  test("keep-both: equal content reuses the row; the same name with DIFFERENT content lands beside it as 'Alex 2'", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas({ ...importCtx(db), db: databaseHandle(db) });
    const otherAlex: BulkImportPersonaInput = { ...persona("Alex"), description: "a different Alex" };
    const keepBoth = { alex: "keep-both" } as const;

    const first = await op({ ownerId: owner.id, personas: [persona("Alex")] });
    const second = await op({ ownerId: owner.id, personas: [persona("Alex"), otherAlex, persona("New")], collisions: keepBoth });

    const alexKey = "alex";
    expect(first.personasCreated).toBe(1);
    expect(second.personasCreated).toBe(2); // "Alex 2" and "New"
    expect(second.personasSkipped).toBe(1); // the equal "Alex" reused
    // The reused id matches the first run's; the first input under a name owns `idByName`.
    expect(second.idByName[alexKey]).toBe(first.idByName[alexKey]);

    const rows = await db.select({ name: personas.name, description: personas.description }).from(personas).where(eq(personas.ownerId, owner.id));
    expect(rows.map((r) => r.name).toSorted()).toEqual(["Alex", "Alex 2", "New"]);
    // The original row was NOT updated in place.
    expect(rows.find((r) => r.name === "Alex")?.description).toBe("Alex desc");

    // The renamed row is found again by CONTENT on the next run — no "Alex 3".
    const third = await op({ ownerId: owner.id, personas: [otherAlex], collisions: keepBoth });
    expect(third.personasCreated).toBe(0);
    expect(third.personasSkipped).toBe(1);
    expect(await db.select({ id: personas.id }).from(personas).where(eq(personas.ownerId, owner.id))).toHaveLength(3);
  });

  test("merge (the default): a same-name, different-content input links to the owned persona and mints nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas({ ...importCtx(db), db: databaseHandle(db) });
    const otherAlex: BulkImportPersonaInput = { ...persona("Alex", true), description: "a different Alex" };

    const first = await op({ ownerId: owner.id, personas: [persona("Alex")] });
    const unlisted = await op({ ownerId: owner.id, personas: [otherAlex] });
    const listed = await op({ ownerId: owner.id, personas: [otherAlex], collisions: { alex: "merge" } });

    for (const result of [unlisted, listed]) {
      expect(result.personasCreated).toBe(0);
      // A merge is its own tally: it is not an equal-content skip.
      expect(result.personasMerged).toBe(1);
      expect(result.personasSkipped).toBe(0);
      expect(result.mergedKeys).toEqual(["alex"]);
      expect(result.idByName["alex"]).toBe(first.idByName["alex"]);
      expect(result.defaultPersonaId).toBe(first.idByName["alex"]);
    }
    const rows = await db.select({ name: personas.name, description: personas.description }).from(personas).where(eq(personas.ownerId, owner.id));
    // The owned row keeps its content: merge links, it never edits.
    expect(rows).toEqual([{ name: "Alex", description: "Alex desc" }]);
  });

  test("the default merge resolves each owned name on its own: 'Nate' and 'Nate 2' merge into their own rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas({ ...importCtx(db), db: databaseHandle(db) });
    const a = await op({ ownerId: owner.id, personas: [{ ...persona("Nate"), description: "A" }] });
    const b = await op({ ownerId: owner.id, personas: [{ ...persona("Nate 2"), description: "B" }] });

    const result = await op({
      ownerId: owner.id,
      personas: [
        { ...persona("Nate"), description: "Y" },
        { ...persona("Nate 2"), description: "Y" },
      ],
    });

    expect(result.personasCreated).toBe(0);
    expect(result.mergedKeys.toSorted()).toEqual(["nate", "nate 2"]);
    expect(result.idByName["nate"]).toBe(a.idByName["nate"]);
    expect(result.idByName["nate 2"]).toBe(b.idByName["nate 2"]);
  });

  test("keep-both mints the name the review shows: the next one no owned name folds to", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas({ ...importCtx(db), db: databaseHandle(db) });
    await op({ ownerId: owner.id, personas: [persona("Eve"), persona("eve 2")] });

    await op({ ownerId: owner.id, personas: [{ ...persona("Eve"), description: "other" }], collisions: { eve: "keep-both" } });

    const rows = await db.select({ name: personas.name }).from(personas).where(eq(personas.ownerId, owner.id));
    expect(rows.map((r) => r.name).toSorted()).toEqual(["Eve", "Eve 3", "eve 2"]);
  });

  test("keep-both lands the name the review previews when the folder also adds 'Nate 2'", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas({ ...importCtx(db), db: databaseHandle(db) });
    await op({ ownerId: owner.id, personas: [persona("Nate")] });

    await op({
      ownerId: owner.id,
      personas: [persona("Nate 2"), { ...persona("Nate"), description: "other" }],
      collisions: { nate: "keep-both" },
    });

    const rows = await db.select({ name: personas.name }).from(personas).where(eq(personas.ownerId, owner.id));
    expect(rows.map((r) => r.name).toSorted()).toEqual(["Nate", "Nate 2", "Nate 3"]);
  });

  test("a name is trimmed before it is minted: ' Eve ' keeps both as 'Eve 2', not 'Eve  2'", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas({ ...importCtx(db), db: databaseHandle(db) });
    await op({ ownerId: owner.id, personas: [persona("Eve")] });

    await op({ ownerId: owner.id, personas: [{ ...persona(" Eve "), description: "other" }], collisions: { eve: "keep-both" } });

    const rows = await db.select({ name: personas.name }).from(personas).where(eq(personas.ownerId, owner.id));
    expect(rows.map((r) => r.name).toSorted()).toEqual(["Eve", "Eve 2"]);
  });

  test("a persona named like an Object.prototype member still merges by default", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas({ ...importCtx(db), db: databaseHandle(db) });
    const first = await op({ ownerId: owner.id, personas: [persona("constructor")] });

    const result = await op({ ownerId: owner.id, personas: [{ ...persona("constructor"), description: "a different one" }], collisions: {} });

    expect(result.personasCreated).toBe(0);
    expect(result.idByName["constructor"]).toBe(first.idByName["constructor"]);
    expect(await db.select({ id: personas.id }).from(personas).where(eq(personas.ownerId, owner.id))).toHaveLength(1);
  });

  test("a choice is keyed by folded name: keep-both for one name does not split another", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas({ ...importCtx(db), db: databaseHandle(db) });
    await op({ ownerId: owner.id, personas: [persona("Alex"), persona("Eve")] });

    const result = await op({
      ownerId: owner.id,
      personas: [
        { ...persona("Alex"), description: "other Alex" },
        { ...persona("Eve"), description: "other Eve" },
      ],
      collisions: { alex: "keep-both" },
    });

    expect(result.personasCreated).toBe(1);
    const rows = await db.select({ name: personas.name }).from(personas).where(eq(personas.ownerId, owner.id));
    expect(rows.map((r) => r.name).toSorted()).toEqual(["Alex", "Alex 2", "Eve"]);
  });
});
