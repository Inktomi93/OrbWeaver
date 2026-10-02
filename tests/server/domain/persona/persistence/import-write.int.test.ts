// Mirror int-test for domain/persona/persistence/createBulkImportPersonas (Option B) — the persona-
// OWNED bulk-import WRITE over a real db: content-identity dedup over one owner-scoped pre-fetch (equal
// content reuses, same name with different content lands beside under " 2"), batch insert, and the
// `idByName` (lowercased) the import verb copies into `personaByUserName`. Input is the canonical
// `BulkImportPersonaInput` (`@orb/contracts/persona`); the ST→canonical mapping is import's job (tested there).

import type { BulkImportPersonaInput } from "@orb/contracts/persona";
import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import type { PersonaImportContext } from "../../../../../packages/server/src/domain/persona/contract/import.ts";
import { createBulkImportPersonas } from "../../../../../packages/server/src/domain/persona/persistence/import-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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
    const op = createBulkImportPersonas(importCtx(db));

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

  test("equal content reuses the row; the same name with DIFFERENT content lands beside it as 'Alex 2'; never merged", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas(importCtx(db));
    const otherAlex: BulkImportPersonaInput = { ...persona("Alex"), description: "a different Alex" };

    const first = await op({ ownerId: owner.id, personas: [persona("Alex")] });
    const second = await op({ ownerId: owner.id, personas: [persona("Alex"), otherAlex, persona("New")] });

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
    const third = await op({ ownerId: owner.id, personas: [otherAlex] });
    expect(third.personasCreated).toBe(0);
    expect(third.personasSkipped).toBe(1);
    expect(await db.select({ id: personas.id }).from(personas).where(eq(personas.ownerId, owner.id))).toHaveLength(3);
  });
});
