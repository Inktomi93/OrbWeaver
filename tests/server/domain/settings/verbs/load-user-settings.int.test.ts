// verb: loadUserSettings — the lenient typed-blob loader chat/workloads inject. Returns the parsed
// UserSettings (defaults for a never-touched account; the written blob otherwise). Raw userId (no gate).

import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("loadUserSettings", () => {
  test("a never-touched account loads the parsed defaults", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const settings = await h.svc.loadUserSettings(u);
    expect(settings.memory.enabled).toBe(false);
    expect(settings.worldInfo.scanDepth).toBeGreaterThan(0);
  });

  test("loads a written blob", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    await h.svc.updateUserSettingsSection({
      principal: principal(u, "user"),
      input: { section: "memory", patch: { enabled: true } },
    });
    const settings = await h.svc.loadUserSettings(u);
    expect(settings.memory.enabled).toBe(true);
  });
});
