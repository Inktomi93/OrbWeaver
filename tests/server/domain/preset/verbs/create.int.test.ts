// verb: create — writes an OWNED preset (audited), defaulting the config to DEFAULT_PROMPT_CONFIG.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { createPresetService } from "@orb/server/domain/preset";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
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
    expect(h.audits.map((a) => a.entry.action)).toContain("preset.create");

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
});
