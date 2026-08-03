import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { createPresetService } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedUser } from "../_support.ts";

describe("create", () => {
  test("writes an owned preset with the given config; returns the detail; audits preset.create", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);

    const detail = await svc.create({
      userId: owner,
      name: "My RP",
      kind: "roleplay",
      config: DEFAULT_PROMPT_CONFIG,
    });

    expect(detail.name).toBe("My RP");
    expect(detail.isSystemDefault).toBe(false);
    expect(detail.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion);
    const create = h.audits.find((a) => a.entry.action === "preset.create");
    expect(create?.entry.metadata).toEqual({ name: "My RP", kind: "roleplay" });

    const fetched = await svc.get({ userId: owner, id: detail.id });
    expect(fetched.id).toBe(detail.id);
  });

  test("omitting config falls back to DEFAULT_PROMPT_CONFIG", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);

    const detail = await svc.create({ userId: owner, name: "Bare", kind: "roleplay" });
    expect(detail.config.sections.length).toBe(DEFAULT_PROMPT_CONFIG.sections.length);
  });

  test("a name already in the owner's library is NUMBERED at mint time — Duplicate can't stack twins (F5)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPresetService(h.ctx);
    const owner = await seedUser(db);

    const first = await svc.create({ userId: owner, name: "Copy of Roleplay", kind: "roleplay" });
    const second = await svc.create({ userId: owner, name: "Copy of Roleplay", kind: "roleplay" });

    expect(first.name).toBe("Copy of Roleplay");
    expect(second.name).toBe("Copy of Roleplay 2");
    // The audit records the name actually MINTED, not the submitted one (an audit that lies about the row's
    // name is worse than no audit).
    const names = h.audits.filter((a) => a.entry.action === "preset.create").map((a) => (a.entry.metadata as { name: string }).name);
    expect(names).toEqual(["Copy of Roleplay", "Copy of Roleplay 2"]);
  });
});
