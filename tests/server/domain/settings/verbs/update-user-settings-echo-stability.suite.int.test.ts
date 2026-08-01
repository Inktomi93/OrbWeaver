// verb: updateUserSettingsSection — ECHO-STABILITY (retro-workboard #16). The pre-revert oscillation
// (background/theme save→revert→save, only fixable by clearing localStorage) was fed by a non-idempotent
// server round-trip: the client autosave form (create-autosave-entity-form) re-baselines on a clean server
// echo, so if `parse(merge(current, patch)).section` does NOT deep-equal the value the client just sent,
// the form adopts a DIFFERENT value than it saved. That is fine ONCE (a legitimate rewrite the client shows
// as the new truth); it is a LOOP only if it never converges. This suite pins the fixed point on the REAL
// verb: appearance (whole-object autosave patch, incl. a materialized background), theme (stale id), and a
// lifted legacy row — each reaches a byte-stable fixed point in ≤1 legitimate rewrite and never re-lifts.

import { DEFAULT_APPEARANCE_SETTINGS, parseUserSettings, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { userSettings } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** Read the raw stored blob + version COLUMN — the echo-stability invariants live at the storage layer
 *  (the column beats the in-blob probe, so a lifted row must never re-lift on the next read). */
async function readRow(db: Db, userId: UserId): Promise<{ config: unknown; schemaVersion: number }> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error("user_settings row missing");
  }
  return { config: row.config, schemaVersion: row.schemaVersion };
}

describe("updateUserSettingsSection — echo-stability fixed points (#16)", () => {
  test("a WHOLE-appearance autosave patch reaches a byte-stable fixed point in one rewrite", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_appear_fp" }), "user");

    // The client sends the ENTIRE appearance object (create-autosave-entity-form saves `values`), not a
    // sparse patch. Start from the real defaults, flip a few knobs — exactly the client's save payload.
    const clientValues = { ...DEFAULT_APPEARANCE_SETTINGS, chatStyle: "flat" as const, fontScale: 1.2, backgroundDim: 0.6 };

    const first = await h.svc.updateUserSettingsSection({ principal: p, input: { section: "appearance", patch: clientValues } });
    const echoed = first.config.appearance;

    // The autosave form re-baselines to `echoed`. For a FIXED POINT, re-saving `echoed` must return an
    // identical `echoed` — else the form re-baselines again, forever (the oscillation).
    const second = await h.svc.updateUserSettingsSection({ principal: p, input: { section: "appearance", patch: echoed } });
    expect(second.config.appearance).toStrictEqual(echoed);

    // And the value the client SENT already equals the echo (≤1 rewrite): every appearance field is
    // `.catch/.default` over a valid value, so a valid whole-object save is a fixed point at rewrite 0.
    expect(echoed).toStrictEqual(clientValues);
  });

  test("re-saving the exact server echo is byte-identical across repeated cycles (no drift)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_appear_cycle" }), "user");

    const seeded = await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "appearance", patch: { ...DEFAULT_APPEARANCE_SETTINGS, elevation: "glow" as const, avatarSize: "lg" as const } },
    });
    const anchor = JSON.stringify(seeded.config.appearance);
    // Three re-saves of the exact echo, sequenced (each depends on the prior for realism, but no
    // await-in-loop) — every cycle must reproduce the anchor byte-for-byte.
    const c1 = await h.svc.updateUserSettingsSection({ principal: p, input: { section: "appearance", patch: seeded.config.appearance } });
    expect(JSON.stringify(c1.config.appearance)).toBe(anchor);
    const c2 = await h.svc.updateUserSettingsSection({ principal: p, input: { section: "appearance", patch: c1.config.appearance } });
    expect(JSON.stringify(c2.config.appearance)).toBe(anchor);
    const c3 = await h.svc.updateUserSettingsSection({ principal: p, input: { section: "appearance", patch: c2.config.appearance } });
    expect(JSON.stringify(c3.config.appearance)).toBe(anchor);
  });

  test("a materialized-background library entry survives the appearance round-trip unchanged (BG-C one-rewrite fixed point)", async () => {
    const db = await freshDb();
    // The echo≠save-BY-DESIGN case: the client pastes an external URL; the server materializes it into an
    // owned CAS `asset` entry (addExternalBackground), which the client appends to `appearance.backgroundLibrary`
    // and saves through the SAME appearance autosave. Once saved, re-saving the resolved appearance must be a
    // stable fixed point — the branded `assetId`, the hash, and every field survive parse+merge unchanged.
    // A REAL materialize op mints a valid asset TypeID (crockford base32) — it must survive the branded
    // `typeIdSchema(asset)` validation the parse round-trip applies, or the `.catch([])` drops the WHOLE
    // library and the just-saved background silently vanishes (the invisible-save symptom).
    const stored = { assetId: mintTypeId(ID_PREFIX.asset), assetHash: "deadbeef", mime: "image/png" };
    const h = makeHarness(db, { materializeBackground: () => Promise.resolve({ ok: true, asset: stored }) });
    const p = principal(await seedUser(db, { id: "user_bg_fp" }), "user");

    // 1. Materialize a pasted URL into a ready library entry (the discrete verb — writes no settings).
    const entry = await h.svc.addExternalBackground({ principal: p, url: "https://cdn.example/wallpaper.png" });

    // 2. The client appends the entry to its appearance object and picks the `asset` kind, then autosaves
    //    the WHOLE appearance. That was the pre-SET-SEAMS pane payload; the live client now sends the
    //    background SECTION's key-minimal patch, so this stands as the WIDEST-echo stress case.
    const clientAppearance = {
      ...DEFAULT_APPEARANCE_SETTINGS,
      backgroundImageKind: "asset" as const,
      backgroundAssetId: entry.assetId,
      backgroundAssetHash: entry.assetHash,
      backgroundAssetMime: entry.mime,
      backgroundLibrary: [entry],
    };
    const echoed = (await h.svc.updateUserSettingsSection({ principal: p, input: { section: "appearance", patch: clientAppearance } })).config.appearance;

    // The branded assetId, the hash, the minted entryId and provenanceUrl all round-trip byte-identical —
    // parse does not drop the entry (the F-P2 collision fix) nor re-mint the entryId.
    expect(echoed.backgroundLibrary).toStrictEqual([entry]);
    expect(echoed).toStrictEqual(clientAppearance);

    // 3. Re-save the echo — the fixed point holds (no re-materialize, no drift).
    const second = (await h.svc.updateUserSettingsSection({ principal: p, input: { section: "appearance", patch: echoed } })).config.appearance;
    expect(second).toStrictEqual(echoed);
  });

  test("a stale/deleted theme id round-trips byte-stable (degrades at RESOLUTION, not at parse — no rewrite)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_theme_fp" }), "user");

    // A theme id whose row was deleted: it must PERSIST as-sent (the `.catch(null)` only fires on a schema
    // failure, and any string is valid) and degrade to the Hearth default only when `useSelectedTheme`
    // fails to fetch the row. If parse silently nulled it, the client would re-baseline null→save→loop.
    const stale = "theme_00000000000000000000000dead";
    const echoed = (await h.svc.updateUserSettingsSection({ principal: p, input: { section: "theme", patch: { selectedThemeId: stale } } })).config.theme;
    expect(echoed.selectedThemeId).toBe(stale);

    const second = (await h.svc.updateUserSettingsSection({ principal: p, input: { section: "theme", patch: echoed } })).config.theme;
    expect(second).toStrictEqual(echoed);
  });

  test("every WRITE stamps the schemaVersion column to the current version (the anti-re-lift invariant)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_stamp" }), "user");
    await h.svc.updateUserSettingsSection({ principal: p, input: { section: "memory", patch: { enabled: true } } });
    const row = await readRow(db, castId("user_stamp"));
    // The COLUMN is what beats the in-blob probe on the next read — it MUST be current after any write.
    expect(row.schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);
  });

  test("a legacy v1 row stabilizes on first write and NEVER re-lifts", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const userId = castId<UserId>("user_legacy");
    await seedUser(db, { id: "user_legacy" });

    // Plant a pre-v4 blob directly, with a STALE version column (1) — the exact "unstamped legacy row" the
    // #16 gotcha warns about (parseUserSettings without a current column re-runs the v1→v4 lift chain).
    // FABRICATION-OK: deliberately the legacy v1 shape, not the column's $type — a real pre-lift db row.
    const legacyBlob = {
      schemaVersion: 1,
      defaultModel: "legacy-model",
      defaultPersonaId: "persona_legacy",
      memoryEnabled: true,
    } as unknown as typeof userSettings.$inferInsert.config;
    await db
      .insert(userSettings)
      .values({ userId, schemaVersion: 1, config: legacyBlob, updatedAt: 1 })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { schemaVersion: 1, config: legacyBlob, updatedAt: 1 },
      });

    // The first read lifts v1→v4 (in-blob probe = 1). The value it produces is the resolved truth.
    const firstRead = (await h.svc.getUserSettings({ principal: principal(userId, "user") })).config;
    expect(firstRead.routing.roleDefaults.chat?.model).toBe("legacy-model");
    expect(firstRead.memory.enabled).toBe(true);

    // Any write re-stamps the column to v4 (writeUserConfig), so the row is now stored at the current
    // version — the lift never runs again.
    await h.svc.updateUserSettingsSection({ principal: principal(userId, "user"), input: { section: "memory", patch: { enabled: true } } });
    const rowAfter = await readRow(db, userId);
    expect(rowAfter.schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);

    // Re-parse the STORED blob at the stamped column version — it must equal the resolved truth (no
    // second lift, byte-stable). This is the property that was violated when a row went out unstamped.
    const reparsed = parseUserSettings(rowAfter.config, rowAfter.schemaVersion);
    const secondRead = (await h.svc.getUserSettings({ principal: principal(userId, "user") })).config;
    expect(JSON.stringify(reparsed)).toBe(JSON.stringify(secondRead));

    // And a further read is identical to the one before it — the row has reached its fixed point.
    const thirdRead = (await h.svc.getUserSettings({ principal: principal(userId, "user") })).config;
    expect(JSON.stringify(thirdRead)).toBe(JSON.stringify(secondRead));
  });

  test("repeated parse/serialize cycles of the stored blob are byte-stable (idempotent parser)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_idem" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "appearance", patch: { ...DEFAULT_APPEARANCE_SETTINGS, backgroundImageKind: "seeded" as const, backgroundSeededId: "sunset" } },
    });
    const row = await readRow(db, castId("user_idem"));
    let acc = parseUserSettings(row.config, row.schemaVersion);
    const anchor = JSON.stringify(acc);
    for (let i = 0; i < 5; i += 1) {
      acc = parseUserSettings(JSON.parse(JSON.stringify(acc)), row.schemaVersion);
      expect(JSON.stringify(acc)).toBe(anchor);
    }
  });
});
