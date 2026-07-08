// verb: import — mint a fresh owned persona from a backup blob (FINAL-Persona §A.6b gap #3, the
// `export.ts` round-trip twin). Load-bearing: mints an owned, avatar-less row (audited); defaults omitted
// fields exactly like `create`; `export -> import` round-trips the visible fields under a NEW id.

import { createPersonaService } from "@orb/server/domain/persona";
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

  test("export -> import round-trips the visible fields under a NEW id", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const source = await svc.create({
      principal: principal(owner),
      input: { name: "Nyx", description: "a wandering scholar", starred: true },
    });

    const backup = await svc.export({ principal: principal(owner), personaId: source.id });
    const restored = await svc.import({ principal: principal(owner), input: backup });

    expect(restored.id).not.toBe(source.id);
    expect(restored.name).toBe(source.name);
    expect(restored.description).toBe(source.description);
    expect(restored.starred).toBe(source.starred);
  });
});
