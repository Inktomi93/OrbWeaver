// verb: getUserSettings — a never-touched account reads the parsed defaults with `updatedAt: 0` and NO
// row written (the read/write asymmetry); a written account reads back its stored config.

import { USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { userSettings } from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("getUserSettings", () => {
  test("a never-touched account reads defaults, updatedAt 0, and writes NO row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const view = await h.svc.getUserSettings({ principal: principal(u, "user") });
    expect(view.userId).toBe(u);
    expect(view.updatedAt).toBe(0);
    expect(view.config.memory.enabled).toBe(false);
    const rows = await db.select().from(userSettings).where(eq(userSettings.userId, u));
    expect(rows).toHaveLength(0);
  });

  // #1716 — the read-time twin of the #471 write refusal. `writeUserConfig` asks this exact question of
  // this exact row before every write and refuses when it is not intact; without the verdict on the READ,
  // the pane rendered schema defaults that looked like the user's settings and said "Saved" over them.
  test("a blob from a NEWER build reports configUnreadable, and an intact one reports null", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_future" });
    await h.svc.updateUserSettingsSection({ principal: principal(u, "user"), input: { section: "memory", patch: { enabled: true } } });
    expect((await h.svc.getUserSettings({ principal: principal(u, "user") })).configUnreadable).toBe(null);

    // Bump the row's schemaVersion COLUMN past this build: no lift exists above it, so the current schema
    // would silently strip anything it has never heard of. The row is fine on the build that wrote it.
    await db
      .update(userSettings)
      .set({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION + 900 })
      .where(eq(userSettings.userId, u));
    const view = await h.svc.getUserSettings({ principal: principal(u, "user") });
    expect(view.configUnreadable).toBe("version-from-future");
    // The VALUE is still served — the session stays usable; it is the WRITE that stands down.
    expect(view.config.memory.enabled).toBe(true);
  });

  test("a never-touched account reports configUnreadable null — absence is not corruption", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_absent" });
    // `parseOutcome(undefined)` would say `not-an-object`, which is honest about the bytes and wrong about
    // the situation: there is nothing to read, and the first write is legitimate (the same arm
    // `writeUserConfig` takes). A "your settings couldn't be read" banner on a fresh account is the defect
    // this pin exists to prevent.
    expect((await h.svc.getUserSettings({ principal: principal(u, "user") })).configUnreadable).toBe(null);
  });

  test("reads back a written config (scoped to the principal's userId)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    await h.svc.updateUserSettingsSection({
      principal: principal(u, "user"),
      input: { section: "memory", patch: { enabled: true } },
    });
    const view = await h.svc.getUserSettings({ principal: principal(u, "user") });
    expect(view.config.memory.enabled).toBe(true);
    expect(view.updatedAt).toBeGreaterThan(0);
  });
});
