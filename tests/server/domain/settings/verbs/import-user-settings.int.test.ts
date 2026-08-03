// verb: importUserSettings — restores a user-settings-backup into the owner's OWN settings, per-namespace MERGE
// (R7). Load-bearing: only the carried namespaces are touched (a sibling namespace the file omits survives),
// the fence holds on restore (a crafted routing key never writes connection config — R10), idempotent, and a
// non-settings file returns {ok:false} without throwing.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { createImportUserSettings, createSettingsContext } from "@orb/server/domain/settings";
import { buildUserSettingsBackup } from "@orb/server/kit/serde/user-settings";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("importUserSettings", () => {
  test("merges the carried namespace; a sibling namespace the file omits survives (R7)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_owner" });
    const p = principal(owner, "user");

    // Pre-existing sibling state the restore must NOT clobber.
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "memory", patch: { enabled: true } },
    });

    // A backup carrying ONLY appearance.
    const bytes = buildUserSettingsBackup({
      appearance: { ...DEFAULT_USER_SETTINGS.appearance, fontScale: 1.4 },
    });
    const result = await createImportUserSettings(ctx)(owner, bytes);
    expect(result).toEqual({ ok: true, created: false });

    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.appearance.fontScale).toBe(1.4); // restored
    expect(view.config.memory.enabled).toBe(true); // sibling survived (merge, not clobber)
  });

  test("a crafted routing key in the file never writes connection config (the fence holds on restore)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_fence" });
    const p = principal(owner, "user");

    const hostile = new TextEncoder().encode(
      JSON.stringify({
        schemaKind: "orb.user-settings",
        schemaVersion: 1,
        settings: {
          routing: { roleDefaults: { chat: { source: "openrouter", model: "attack" } } },
          appearance: { fontScale: 1.1 },
        },
      }),
    );
    const result = await createImportUserSettings(ctx)(owner, hostile);
    expect(result.ok).toBe(true);

    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.appearance.fontScale).toBe(1.1); // the allowlisted pref applied
    // routing untouched — the crafted connection assignment never landed (still the empty default).
    expect(view.config.routing.roleDefaults.chat).toBeUndefined();
  });

  test("a non-settings file returns {ok:false} without throwing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_bad" });

    const result = await createImportUserSettings(ctx)(owner, new TextEncoder().encode("nope"));
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
