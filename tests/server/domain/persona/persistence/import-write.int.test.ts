// Mirror int-test for domain/persona/persistence/createBulkImportPersonas (Option B) — the persona-
// OWNED bulk-import WRITE over a real db: dedup-by-name over one owner-scoped pre-fetch, batch insert, and the
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

    const nateKey = "alex";
    expect(result.personasCreated).toBe(2);
    expect(result.personasSkipped).toBe(0);
    expect(result.defaultPersonaId).toBe(result.idByName[nateKey]);
    expect(Object.keys(result.idByName).sort()).toEqual(["eve", "alex"]);

    const rows = await db.select({ name: personas.name }).from(personas).where(eq(personas.ownerId, owner.id));
    expect(rows.map((r) => r.name).sort()).toEqual(["Eve", "Alex"]);
  });

  test("dedup-by-name — a re-import (or existing row) reuses the identity, never duplicates", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, {});
    const op = createBulkImportPersonas(importCtx(db));

    const first = await op({ ownerId: owner.id, personas: [persona("Alex")] });
    const second = await op({ ownerId: owner.id, personas: [persona("Alex"), persona("New")] });

    const nateKey = "alex";
    expect(first.personasCreated).toBe(1);
    expect(second.personasCreated).toBe(1); // only "New"
    expect(second.personasSkipped).toBe(1); // "Alex" reused
    // The reused id matches the first run's (idByName is stable across runs).
    expect(second.idByName[nateKey]).toBe(first.idByName[nateKey]);

    const rows = await db.select({ id: personas.id }).from(personas).where(eq(personas.ownerId, owner.id));
    expect(rows).toHaveLength(2);
  });
});
