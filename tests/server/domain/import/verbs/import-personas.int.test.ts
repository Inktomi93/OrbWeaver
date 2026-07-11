// Mirror int-test for domain/import/verbs/importPersonas (PD-77) — writes settings.json personas over a real
// db (RULING A: the bulk-serializer exemption), dedups by name, and populates the cross-verb
// `personaByUserName` map the chat importer reads.

import { personas as personasTable } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { createImportPersonas } from "../../../../../packages/server/src/domain/import/verbs/import-personas.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeProfileHarness } from "../_support.ts";

function persona(
  name: string,
  over: Record<string, unknown> = {},
): {
  parsed: {
    name: string;
    description: string;
    avatarFile: string;
    isDefault: boolean;
    metadata: null;
  };
} {
  return {
    parsed: {
      name,
      description: `${name} desc`,
      avatarFile: `${name}.png`,
      isDefault: false,
      metadata: null,
      ...over,
    },
  };
}

describe("importPersonas", () => {
  test("writes new personas and populates personaByUserName (lowercased)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const h = makeProfileHarness(db, owner.id);
    const svc = createImportPersonas(h.ctx);

    const result = await svc({
      personas: [persona("Alex", { isDefault: true }), persona("Eve")],
    });

    expect(result.personasCreated).toBe(2);
    expect(result.personasSkipped).toBe(0);
    expect(result.defaultPersonaId).not.toBeNull();

    const rows = await db
      .select({ name: personasTable.name, ownerId: personasTable.ownerId })
      .from(personasTable)
      .where(eq(personasTable.ownerId, owner.id));
    expect(rows.map((r) => r.name).sort()).toEqual(["Eve", "Alex"]);

    // The chat importer reads this to attribute `user_name`s.
    expect(h.profile.personaByUserName.get("alex")).toBe(result.defaultPersonaId);
    expect(h.profile.personaByUserName.has("eve")).toBe(true);
  });

  test("dedups by name — a re-import (or existing row) reuses the identity, never duplicates", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const h = makeProfileHarness(db, owner.id);
    const svc = createImportPersonas(h.ctx);

    const first = await svc({ personas: [persona("Alex")] });
    const second = await svc({ personas: [persona("Alex"), persona("New")] });

    expect(first.personasCreated).toBe(1);
    expect(second.personasCreated).toBe(1); // only "New"
    expect(second.personasSkipped).toBe(1); // "Alex" reused
    const rows = await db
      .select({ id: personasTable.id })
      .from(personasTable)
      .where(eq(personasTable.ownerId, owner.id));
    expect(rows).toHaveLength(2);
  });
});
