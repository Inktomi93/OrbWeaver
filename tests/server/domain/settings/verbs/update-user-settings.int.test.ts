// verb: updateUserSettings — whole-blob replace. Seeds the row on first touch, stamps the service-owned
// schemaVersion, returns the post-write view, and audits. Scoped to the principal's userId.

import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("updateUserSettings", () => {
  test("first-touch replace persists the blob, stamps schemaVersion, audits", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const config = { ...DEFAULT_USER_SETTINGS, memory: { enabled: true } };
    const view = await h.svc.updateUserSettings({
      principal: principal(u, "user"),
      input: { config },
    });
    expect(view.config.memory.enabled).toBe(true);
    expect(view.schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);
    expect(view.updatedAt).toBe(h.clock.now());
    expect(h.audits.map((x) => x.entry.action)).toContain("settings.updateUserSettings");
  });
});
