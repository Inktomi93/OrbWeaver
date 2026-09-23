// verb: updateUserSettingsSection — deep-merge ONE namespace + re-validate. The load-bearing invariant:
// two concurrent patches on SIBLING sections of the SAME user both land (the per-user
// serializer makes the read-merge-write atomic w.r.t. other same-user writes — without it last-write-wins
// would silently drop one). Plus: a section patch deep-merges (doesn't clobber sibling sections/keys).

import type { UserSettings } from "@orb/contracts/settings";
import { USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { userSettings } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeHarness, principal, seedUser } from "../_support.ts";

describe("updateUserSettingsSection", () => {
  test("two concurrent patches on sibling sections BOTH land (serialized per user)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const p = principal(u, "user");
    await Promise.all([
      h.svc.updateUserSettingsSection({
        principal: p,
        input: { section: "memory", patch: { enabled: true } },
      }),
      h.svc.updateUserSettingsSection({
        principal: p,
        input: { section: "worldInfo", patch: { scanDepth: 42 } },
      }),
    ]);
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.memory.enabled).toBe(true);
    expect(view.config.worldInfo.scanDepth).toBe(42);
  });

  test("a patch deep-merges into the section (siblings survive)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const p = principal(u, "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "worldInfo", patch: { scanDepth: 10 } },
    });
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "worldInfo", patch: { tokenBudget: 2048 } },
    });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.worldInfo.scanDepth).toBe(10);
    expect(view.config.worldInfo.tokenBudget).toBe(2048);
  });

  test("different users run concurrently (each lands its own row)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    await Promise.all([
      h.svc.updateUserSettingsSection({
        principal: principal(a, "user"),
        input: { section: "memory", patch: { enabled: true } },
      }),
      h.svc.updateUserSettingsSection({
        principal: principal(b, "user"),
        input: { section: "memory", patch: { enabled: false } },
      }),
    ]);
    expect((await h.svc.getUserSettings({ principal: principal(a, "user") })).config.memory.enabled).toBe(true);
    expect((await h.svc.getUserSettings({ principal: principal(b, "user") })).config.memory.enabled).toBe(false);
  });

  test("the appearance section patches + deep-merges (D44 §12.1 display prefs round-trip)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_appearance" });
    const p = principal(u, "user");
    // Two partial patches on the same section: the second must not clobber the first (deep-merge).
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "appearance", patch: { chatStyle: "flat", avatarSize: "lg" } },
    });
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "appearance", patch: { showInChatAvatars: false } },
    });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.appearance.chatStyle).toBe("flat");
    expect(view.config.appearance.avatarSize).toBe("lg"); // survived the second patch
    expect(view.config.appearance.showInChatAvatars).toBe(false);
    // An untouched knob keeps its §12.1 default.
    expect(view.config.appearance.density).toBe("comfortable");
  });

  test("appearance.elevation patches (default flat; ramp is opt-in)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_elevation" });
    const p = principal(u, "user");
    expect((await h.svc.getUserSettings({ principal: p })).config.appearance.elevation).toBe("flat");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "appearance", patch: { elevation: "ramp" } },
    });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.appearance.elevation).toBe("ramp");
  });

  test("the theme section patches (selectedThemeId round-trip)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_theme" });
    const p = principal(u, "user");
    expect((await h.svc.getUserSettings({ principal: p })).config.theme.selectedThemeId).toBeNull();
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "theme", patch: { selectedThemeId: "theme_00000000000000000000000002" } },
    });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.theme.selectedThemeId).toBe("theme_00000000000000000000000002");
  });

  // The `regex` section-patch test is GONE with the section (D121-E): the owner's script library is
  // `regex_scripts` rows behind the `regex` tRPC router, not an addressable settings namespace.

  test("the prose section stores an override and CLEARS it on a null leaf (a real reset-to-default)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_prose" });
    const p = principal(u, "user");
    const override = { text: "Pick whoever has been quiet longest.", baseVersion: 1 };
    const before = (await h.svc.getUserSettings({ principal: p })).config;
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "prose", patch: { "chat.arbiter.system": override, "chat.compaction.system": null } },
    });
    const after = (await h.svc.getUserSettings({ principal: p })).config;
    expect(after.prose["chat.arbiter.system"]).toEqual(override);
    expect(after.prose["chat.compaction.system"]).toBeUndefined();
    // The write is key-minimal: a prose patch leaves the sibling section it shares a blob with alone.
    expect(after.imagery).toEqual(before.imagery);

    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "prose", patch: { "chat.arbiter.system": null } },
    });
    const cleared = (await h.svc.getUserSettings({ principal: p })).config.prose;
    expect(cleared["chat.arbiter.system"]).toBeUndefined();
  });

  // #471 — THE WIPE CLASS. The read seam degrades an unreadable blob to schema defaults (correct for a
  // render), and this verb is a read-modify-WRITE: before the guard, one transient bad read plus any
  // section patch persisted the defaults and destroyed the user's whole settings blob, silently and
  // permanently (the proven cause of the #461 latch loss). The assertion is on the RAW row, because a read
  // back through `getUserSettings` degrades to defaults either way and would pass over the wipe.
  test("an UNREADABLE stored blob refuses the write — the stored bytes survive (#471)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_corrupt" });
    // A double-encoded write: the column holds a JSON *string*, not an object. `parseUserSettings` cannot
    // read it and hands out DEFAULT_USER_SETTINGS.
    const stored = '{"memory":{"enabled":true}}';
    await db.insert(userSettings).values({
      userId: u,
      schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
      // @orb-waive no-test-fabrication(unknown): a non-object config column IS the corruption under test; no typed factory expresses it. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      config: stored as unknown as UserSettings,
      updatedAt: FROZEN_AT,
    });

    await expect(
      h.svc.updateUserSettingsSection({
        principal: principal(u, "user"),
        input: { section: "memory", patch: { enabled: false } },
      }),
    ).rejects.toBeInstanceOf(DomainOperationError);

    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, u));
    expect(row?.config).toBe(stored);
    expect(row?.updatedAt).toBe(FROZEN_AT);
    // The refusal happens BEFORE the side effects — no audit row claims a write that never landed.
    expect(h.audits).toHaveLength(0);
  });

  // The other two arms of the same three-outcome decision: an ABSENT row is a legitimate first write, and a
  // READABLE row patches exactly as before. Without these the guard could be "refuse everything".
  test("an absent row still first-writes, and a readable row still patches (#471 non-arms)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_fresh" });
    const p = principal(u, "user");
    expect(await db.select().from(userSettings).where(eq(userSettings.userId, u))).toHaveLength(0);
    await h.svc.updateUserSettingsSection({ principal: p, input: { section: "memory", patch: { enabled: true } } });
    expect((await h.svc.getUserSettings({ principal: p })).config.memory.enabled).toBe(true);
    await h.svc.updateUserSettingsSection({ principal: p, input: { section: "worldInfo", patch: { scanDepth: 7 } } });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.memory.enabled).toBe(true);
    expect(view.config.worldInfo.scanDepth).toBe(7);
  });
});

// PD-139a — an embed/imageEmbed model change is the trigger the PD-104 purge+reindex machine was missing.
// The verb captures the two model ids pre-merge and fires the injected `onEmbedModelChanged` ONLY on an
// actual change of either; the compose root wires that op to a bulk index/all/force reindex.
