// verb: import — restore an owned persona from a backup blob (FINAL-Persona §A.6b gap #3, the `export.ts`
// round-trip twin). Load-bearing: mints an owned, avatar-less row (audited); defaults omitted fields exactly
// like `create`; IDEMPOTENT (audit gap G-7) — dedups on `(ownerId, name)`, so re-importing the same backup
// MERGES into the existing persona (same id) and creates ZERO duplicate rows.

import { personas } from "@orb/db";
import { createPersonaService } from "@orb/server/domain/persona";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("import", () => {
  test("mints a fresh owned persona from a backup blob (no avatar; audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const detail = await svc.import({
      principal: principal(owner),
      input: {
        name: "Restored",
        title: null,
        description: "brought back",
        starred: true,
        metadata: { descriptionPosition: "at_depth", inject: { depth: 1, role: "system" } },
      },
    });

    expect(detail.name).toBe("Restored");
    expect(detail.starred).toBe(true);
    expect(detail.avatarAssetId).toBeNull();
    expect(detail.avatarHash).toBeNull();
    expect(detail.metadata?.descriptionPosition).toBe("at_depth");
    expect(h.audits.map((a) => a.entry.action)).toContain("persona.import");
  });

  test("defaults omitted fields exactly like create (title null, starred false)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const detail = await svc.import({
      principal: principal(owner),
      input: { name: "Bare", description: "d" },
    });

    expect(detail.title).toBeNull();
    expect(detail.starred).toBe(false);
  });

  test("export -> import round-trips the visible fields (merges into the source under the SAME id)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const source = await svc.create({
      principal: principal(owner),
      input: { name: "Nyx", description: "a wandering scholar", starred: true },
    });

    const backup = await svc.export({ principal: principal(owner), personaId: source.id });
    const restored = await svc.import({ principal: principal(owner), input: backup });

    // (ownerId, name) dedup: the backup's name already exists for the owner, so import merges in place.
    expect(restored.id).toBe(source.id);
    expect(restored.name).toBe(source.name);
    expect(restored.description).toBe(source.description);
    expect(restored.starred).toBe(source.starred);
  });

  test("re-importing the same backup is idempotent — ZERO duplicate rows (audit gap G-7)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const backup = {
      name: "Restored",
      title: null,
      description: "brought back",
      starred: true,
      metadata: null,
    };

    const first = await svc.import({ principal: principal(owner), input: backup });
    const second = await svc.import({ principal: principal(owner), input: backup });
    const third = await svc.import({
      principal: principal(owner),
      input: { ...backup, description: "edited on re-import" },
    });

    // Same owned row reused across every re-import (dedup on `(ownerId, name)`).
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    // The merge applied the changed field in place.
    expect(third.description).toBe("edited on re-import");

    // Exactly ONE "Restored" row exists for the owner — re-import minted no duplicates.
    const rows = await db.select().from(personas).where(eq(personas.ownerId, owner));
    expect(rows.filter((r) => r.name === "Restored")).toHaveLength(1);
  });

  test("a DIFFERENT name still mints a fresh row (dedup keys on name, not blanket-merge)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const a = await svc.import({
      principal: principal(owner),
      input: { name: "Alpha", description: "a" },
    });
    const b = await svc.import({
      principal: principal(owner),
      input: { name: "Beta", description: "b" },
    });

    expect(b.id).not.toBe(a.id);
    const rows = await db.select().from(personas).where(eq(personas.ownerId, owner));
    expect(rows).toHaveLength(2);
  });
});
