// verb: resetUserConfig (#1771, from #1716) — the ONE repair door for a `user_settings.config` that cannot
// be read, and the only settings write whose content does not descend from a read of the row it lands on.
//
// WHAT THESE PIN, and why each one is load-bearing:
//   1. THE DEAD END IT OPENS. Before this verb, an unreadable blob refused EVERY write there was — the
//      section autosave and (through it) the per-leaf "Reset to its default", plus the backup restore,
//      which read-merges the file onto the current blob. The first test proves the refusal is still there
//      (the #471 guard is correct and must not have been loosened) and that this verb runs anyway.
//   2. THE REPAIR IS REAL. `getUserSettings().configUnreadable` goes from a failure kind to `null`, which is
//      what clears the client's state and re-arms every autosave driver on the pane.
//   3. TWO PRINCIPALS. The verb takes no id at all, so the wire cannot express "reset someone else's
//      settings"; the pin shows a second user's row is byte-identical after the first user resets, and that
//      the ONLY input the verb has (the principal) is what scopes it.

import { USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { userSettings } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeHarness, principal, seedUser } from "../_support.ts";

/** Put a user's row into the state the #471 guard refuses on: a schemaVersion COLUMN above anything this
 *  build has a lift for, so no walk can reach the current shape (`version-from-future`). The blob itself is
 *  untouched — this is the rollback / older-client case, where the data is INTACT and unreadable HERE. */
async function makeUnreadable(db: Awaited<ReturnType<typeof freshDb>>, userId: UserId): Promise<void> {
  await db
    .update(userSettings)
    .set({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION + 900 })
    .where(eq(userSettings.userId, userId));
}

describe("resetUserConfig", () => {
  test("runs where every read-derived settings write is refused, and clears the unreadable state", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_reset" });
    await h.svc.updateUserSettingsSection({ principal: principal(u, "user"), input: { section: "memory", patch: { enabled: true } } });
    await makeUnreadable(db, u);

    // The dead end: the ordinary write path refuses (correctly — it would persist the degraded stand-in).
    await expect(
      h.svc.updateUserSettingsSection({ principal: principal(u, "user"), input: { section: "memory", patch: { enabled: false } } }),
    ).rejects.toMatchObject({ code: "stored_config_unreadable" });
    expect((await h.svc.getUserSettings({ principal: principal(u, "user") })).configUnreadable).toBe("version-from-future");

    // …and the door opens anyway, because its content is a contract constant, not a read of that row.
    const view = await h.svc.resetUserConfig({ principal: principal(u, "user") });
    expect(view.configUnreadable).toBe(null);
    expect(view.schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);
    expect(view.config.memory.enabled).toBe(false);

    // The repair is durable, and the pane's own read agrees with the mutation's response row.
    expect((await h.svc.getUserSettings({ principal: principal(u, "user") })).configUnreadable).toBe(null);
    // The ordinary write path works again — the whole point of the door.
    await h.svc.updateUserSettingsSection({ principal: principal(u, "user"), input: { section: "memory", patch: { enabled: true } } });
    expect((await h.svc.getUserSettings({ principal: principal(u, "user") })).config.memory.enabled).toBe(true);
  });

  test("SCOPED TO THE PRINCIPAL — one user's reset cannot reach another's row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    await h.svc.updateUserSettingsSection({ principal: principal(a, "user"), input: { section: "memory", patch: { enabled: true } } });
    await h.svc.updateUserSettingsSection({ principal: principal(b, "user"), input: { section: "memory", patch: { enabled: true } } });
    const before = (await db.select().from(userSettings).where(eq(userSettings.userId, b)))[0];

    // The verb's ONLY parameter is the principal — there is no id to hand it, so the cross-tenant attempt
    // is not expressible at all. What a hostile caller CAN do is call it as themselves, which resets THEIR
    // row and nothing else; this asserts the second half.
    const view = await h.svc.resetUserConfig({ principal: principal(a, "user") });
    expect(view.userId).toBe(a);
    expect(view.config.memory.enabled).toBe(false);

    const after = (await db.select().from(userSettings).where(eq(userSettings.userId, b)))[0];
    expect(after).toEqual(before);
    expect((await h.svc.getUserSettings({ principal: principal(b, "user") })).config.memory.enabled).toBe(true);
  });

  test("an ADMIN resetting is still only resetting their own row (the role does not widen the scope)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const admin = await seedUser(db, { id: "user_admin", role: "admin" });
    const victim = await seedUser(db, { id: "user_victim" });
    await h.svc.updateUserSettingsSection({ principal: principal(victim, "user"), input: { section: "memory", patch: { enabled: true } } });
    await h.svc.resetUserConfig({ principal: principal(admin, "admin") });
    expect((await h.svc.getUserSettings({ principal: principal(victim, "user") })).config.memory.enabled).toBe(true);
  });

  test("a NEVER-WRITTEN account seeds its row rather than failing (the row-absent arm)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_fresh" });
    const view = await h.svc.resetUserConfig({ principal: principal(u, "user") });
    expect(view.configUnreadable).toBe(null);
    expect(view.updatedAt).toBe(FROZEN_AT);
    expect(await db.select().from(userSettings).where(eq(userSettings.userId, u))).toHaveLength(1);
  });

  test("audits the act — the action name, the scope, and NO blob in the metadata", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_audit" });
    await h.svc.resetUserConfig({ principal: principal(u, "user") });
    const entry = h.audits.at(-1)?.entry;
    expect(entry).toMatchObject({ actorUserId: u, action: "settings.resetUserConfig", entityType: "settings", entityId: u });
    // Never the discarded blob: this domain's audit names sections and keys, never values.
    expect(entry?.metadata).toEqual({});
    // The `settingsChanged` emit is NOT asserted here: this domain's shared harness wires `emitUserEvent`
    // as a plain no-op rather than a spy (`../_support.ts`), and widening that fake for one verb would
    // change every settings suite's harness. The emit rides the same line as its siblings' in
    // `verbs/reset-user-config.ts`; the CLIENT half — that the reset's echo re-reads and clears the state —
    // is pinned at `tests/client/features/config/surfaces/config-content-surface.ct.tsx`.
  });
});
