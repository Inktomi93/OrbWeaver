// verb: import — restore an owned persona from one portable FILE (the `export.ts` round-trip twin, and THE
// one import path the single-entity door AND the bundle descriptor both call). Load-bearing: mints an owned,
// avatar-less row (audited); defaults omitted fields exactly like `create`; ADDITIVE — equal content reuses
// the owned persona untouched (same id, zero duplicate rows), the same name with different content lands as
// a second persona under " 2"; and NEVER throws for a malformed file — the refusal is a typed outcome
// carrying the words the import door renders.

import { personas } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PersonaDetail } from "@orb/server/domain/persona";
import { createPersonaService } from "@orb/server/domain/persona";
import type { PersonaBackup } from "@orb/server/kit/serde/persona";
import { buildPersonaBackup } from "@orb/server/kit/serde/persona";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { createBulkImportPersonas } from "../../../../../packages/server/src/domain/persona/persistence/import-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** A portable persona file from the canonical shape (the bytes both doors hand the verb). */
function fileFor(over: Partial<PersonaBackup> & Pick<PersonaBackup, "name" | "description">): Uint8Array {
  return buildPersonaBackup({ title: null, starred: false, metadata: null, ...over });
}

/** The imported persona, or a failure naming the refusal (every test here expects a legal file). */
function imported(outcome: Awaited<ReturnType<ReturnType<typeof createPersonaService>["import"]>>): PersonaDetail {
  if (!outcome.ok) {
    throw new Error(`import refused: ${outcome.error}`);
  }
  return outcome.persona;
}

describe("import", () => {
  test("mints a fresh owned persona from a backup blob (no avatar; audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const detail = imported(
      await svc.import({
        principal: principal(owner),
        bytes: fileFor({
          name: "Restored",
          description: "brought back",
          starred: true,
          metadata: { descriptionPosition: "at_depth", inject: { depth: 1, role: "system" } },
        }),
      }),
    );

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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const detail = imported(await svc.import({ principal: principal(owner), bytes: fileFor({ name: "Bare", description: "d" }) }));

    expect(detail.title).toBeNull();
    expect(detail.starred).toBe(false);
  });

  test("export -> import round-trips the visible fields (merges into the source under the SAME id)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const source = await svc.create({
      principal: principal(owner),
      input: { name: "Nyx", description: "a wandering scholar", starred: true },
    });

    // The EXPORT door's own bytes go straight back in — the round-trip closes through the real file.
    const file = await svc.export({ principal: principal(owner), personaId: source.id });
    const restored = imported(await svc.import({ principal: principal(owner), bytes: file.bytes }));

    // Equal content: the backup IS the source persona, so the import reuses it untouched.
    expect(restored.id).toBe(source.id);
    expect(restored.name).toBe(source.name);
    expect(restored.description).toBe(source.description);
    expect(restored.starred).toBe(source.starred);
  });

  test("re-importing the same backup is idempotent; an EDITED backup under the same name lands beside it, never over it", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const backup = fileFor({ name: "Restored", description: "brought back", starred: true });

    const first = imported(await svc.import({ principal: principal(owner), bytes: backup }));
    const second = imported(await svc.import({ principal: principal(owner), bytes: backup }));
    const third = imported(
      await svc.import({ principal: principal(owner), bytes: fileFor({ name: "Restored", description: "edited on re-import", starred: true }) }),
    );

    // The equal backup reuses the owned row; the edited one is a second persona under the next free name.
    expect(second.id).toBe(first.id);
    expect(third.id).not.toBe(first.id);
    expect(third.name).toBe("Restored 2");
    expect(third.description).toBe("edited on re-import");

    // The original row is untouched, and nothing was duplicated.
    const rows = await db.select().from(personas).where(eq(personas.ownerId, owner));
    expect(rows.map((r) => [r.name, r.description]).toSorted((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""))).toEqual([
      ["Restored", "brought back"],
      ["Restored 2", "edited on re-import"],
    ]);
  });

  test("a DIFFERENT name still mints a fresh row (dedup keys on name, not blanket-merge)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const a = imported(await svc.import({ principal: principal(owner), bytes: fileFor({ name: "Alpha", description: "a" }) }));
    const b = imported(await svc.import({ principal: principal(owner), bytes: fileFor({ name: "Beta", description: "b" }) }));

    expect(b.id).not.toBe(a.id);
    const rows = await db.select().from(personas).where(eq(personas.ownerId, owner));
    expect(rows).toHaveLength(2);
  });

  test("a malformed file NEVER throws — it returns the operator-facing reason the import door renders", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const garbage = await svc.import({ principal: principal(owner), bytes: new TextEncoder().encode("{not json") });
    expect(garbage.ok).toBe(false);
    expect(garbage.ok ? "" : garbage.error).toContain("not JSON");

    // The case the OLD uniform "not a valid file" copy hid: a backup from a NEWER orbweaver.
    const future = new TextEncoder().encode(JSON.stringify({ schemaKind: "orb.persona", schemaVersion: 99, name: "x", description: "y" }));
    const newer = await svc.import({ principal: principal(owner), bytes: future });
    expect(newer.ok ? "" : newer.error).toContain("newer version of orbweaver");

    // Nothing was written by either refusal.
    expect(await db.select().from(personas).where(eq(personas.ownerId, owner))).toHaveLength(0);
  });

  test("`created` discriminates a fresh mint from a reuse (the descriptor's dedup signal)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const bytes = fileFor({ name: "Once", description: "d" });

    const first = await svc.import({ principal: principal(owner), bytes });
    const second = await svc.import({ principal: principal(owner), bytes });
    expect(first.ok && first.created).toBe(true);
    expect(second.ok && second.created).toBe(false);
  });

  // ── THE TWO DOORS AGREE ON WHAT "the same persona" MEANS ────────────────────────────────────────────────
  // The single-file door and the bulk (profile-import) door resolve through the ONE content identity beside
  // the persona serde: the folded name plus the content. "Alice" and " alice " with the same description are
  // one person whichever door they came through; "Alice" with another description is a second persona.
  test("the single-file door folds the name the way the bulk door does (whitespace + case) when the content is equal", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const first = imported(await svc.import({ principal: principal(owner), bytes: fileFor({ name: "Alice", description: "a" }) }));
    // The SAME person, spelled the way an export from another tool (or a hand-edited file) spells it.
    const second = imported(await svc.import({ principal: principal(owner), bytes: fileFor({ name: " alice ", description: "a" }) }));
    expect(second.id).toBe(first.id);
    expect(await db.select().from(personas).where(eq(personas.ownerId, owner))).toHaveLength(1);

    // A different description under the same name is a second persona, named apart.
    const third = imported(await svc.import({ principal: principal(owner), bytes: fileFor({ name: "Alice", description: "b" }) }));
    expect(third.id).not.toBe(first.id);
    expect(third.name).toBe("Alice 2");
    expect(await db.select().from(personas).where(eq(personas.ownerId, owner))).toHaveLength(2);
  });

  test("the BULK door lands on the row the single-file door already minted (one persona, not two)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const single = imported(await svc.import({ principal: principal(owner), bytes: fileFor({ name: " Alice ", description: "a" }) }));
    const bulk = createBulkImportPersonas({ db, now: h.ctx.now, newPersonaId: h.ctx.newPersonaId });
    const result = await bulk({
      ownerId: owner,
      personas: [{ name: "ALICE", description: "a", avatarAssetId: null, metadata: null, isDefault: false }],
    });

    expect(result.personasCreated).toBe(0);
    expect(result.personasSkipped).toBe(1);
    expect(result.idByName["alice"]).toBe(single.id);
    expect(await db.select().from(personas).where(eq(personas.ownerId, owner))).toHaveLength(1);
  });
});
