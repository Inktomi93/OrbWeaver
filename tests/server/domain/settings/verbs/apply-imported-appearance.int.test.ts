// verb: applyImportedAppearance — lands a foreign profile's `appearance` plane (the SillyTavern importer's
// background library + `power_user` ergonomics) in ONE serialized write. Three load-bearing behaviours, each
// of which silently corrupts a re-import or a multi-profile import when wrong:
//   • the library APPENDS and dedups by `assetId` — a replace would wipe the user's own uploads, and a
//     non-deduped append would double the library on every re-run of an idempotent import;
//   • the scalar patch is FIRST-WRITER-WINS against the schema DEFAULT — a user's own choice is never
//     overwritten, and with several ST profile dirs the outcome cannot depend on readdir order;
//   • a no-op input writes nothing at all (no row touch, no event).

import { parseUserSettings } from "@orb/contracts/settings";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createApplyImportedAppearance, createSettingsContext } from "@orb/server/domain/settings";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

const DEFAULTS = parseUserSettings({}).appearance;

// Asset ids are MINTED, never hand-written: `backgroundLibraryEntrySchema.assetId` is a branded `typeIdSchema`
// that validates the 26-char suffix at RUNTIME, and the array's `.catch([])` would wipe the WHOLE library on
// one bad row — so a literal fixture id reads back as an empty library rather than as a failure.
const ASSET_IDS = new Map<string, AssetId>();
function assetIdFor(key: string): AssetId {
  const existing = ASSET_IDS.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const minted = mintTypeId(ID_PREFIX.asset);
  ASSET_IDS.set(key, minted);
  return minted;
}

/** One background-library entry, as the ST importer builds it after the CAS write. Stable per `key`, so a
 *  "re-import" fixture really does present the same content-addressed asset id twice. */
function entry(key: string, name: string): { entryId: string; assetId: AssetId; assetHash: string; mime: string; name: string } {
  return { entryId: `row-${key}`, assetId: assetIdFor(key), assetHash: `hash-${key}`, mime: "image/jpeg", name };
}

describe("applyImportedAppearance", () => {
  test("APPENDS background-library entries and dedups by assetId (a re-import adds nothing)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const apply = createApplyImportedAppearance(createSettingsContext(h.deps));
    const owner = await seedUser(db, { id: "user_bg" });
    const p = principal(owner, "user");

    const first = await apply(owner, { patch: {}, backgroundLibrary: [entry("aaa", "bedroom clean"), entry("bbb", "tavern day")] });
    expect(first.backgroundsAdded).toBe(2);

    // A re-run of the whole-profile import: the CAS is content-addressed, so the SAME asset ids come back.
    const second = await apply(owner, { patch: {}, backgroundLibrary: [entry("aaa", "bedroom clean"), entry("bbb", "tavern day"), entry("ccc", "royal")] });
    expect(second.backgroundsAdded).toBe(1);

    const library = (await h.svc.getUserSettings({ principal: p })).config.appearance.backgroundLibrary;
    expect(library.map((e) => e.name)).toEqual(["bedroom clean", "tavern day", "royal"]);
    // The pre-existing rows keep their OWN entryId — a user who renamed an import is not undone by a re-run.
    expect(library[0]?.entryId).toBe("row-aaa");
  });

  test("does NOT replace a library the user already has", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_own_bg" });
    const p = principal(owner, "user");

    await h.svc.updateUserSettingsSection({ principal: p, input: { section: "appearance", patch: { backgroundLibrary: [entry("mine", "my upload")] } } });
    await createApplyImportedAppearance(ctx)(owner, { patch: {}, backgroundLibrary: [entry("aaa", "bedroom clean")] });

    const library = (await h.svc.getUserSettings({ principal: p })).config.appearance.backgroundLibrary;
    expect(library.map((e) => e.name)).toEqual(["my upload", "bedroom clean"]);
  });

  test("FIRST-WRITER-WINS: an untouched key is claimed, a key the user already chose is left alone", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_pref" });
    const p = principal(owner, "user");

    // The user has deliberately chosen a chat width; `showMessageId` is still at its default.
    const chosenWidth = DEFAULTS.chatWidthPct + 10;
    await h.svc.updateUserSettingsSection({ principal: p, input: { section: "appearance", patch: { chatWidthPct: chosenWidth } } });

    const outcome = await createApplyImportedAppearance(ctx)(owner, {
      patch: { chatWidthPct: 33, showMessageId: !DEFAULTS.showMessageId },
      backgroundLibrary: [],
    });

    // Only the untouched key is claimed, and the report says exactly which.
    expect(outcome.patchedKeys).toEqual(["showMessageId"]);
    const appearance = (await h.svc.getUserSettings({ principal: p })).config.appearance;
    expect(appearance.chatWidthPct).toBe(chosenWidth);
    expect(appearance.showMessageId).toBe(!DEFAULTS.showMessageId);

    // A SECOND profile dir in the same run can no longer flip what the first one claimed — the outcome does
    // not depend on the order the profile dirs were walked in.
    const again = await createApplyImportedAppearance(ctx)(owner, { patch: { showMessageId: DEFAULTS.showMessageId }, backgroundLibrary: [] });
    expect(again.patchedKeys).toEqual([]);
    expect((await h.svc.getUserSettings({ principal: p })).config.appearance.showMessageId).toBe(!DEFAULTS.showMessageId);
  });

  test("a NO-OP input changes nothing and writes nothing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_noop" });

    const outcome = await createApplyImportedAppearance(ctx)(owner, { patch: {}, backgroundLibrary: [] });

    expect(outcome).toEqual({ backgroundsAdded: 0, patchedKeys: [] });
    // No audit row: the write never happened, so the log must not claim it did.
    expect(h.audits.filter((a) => a.entry.action === "settings.importAppearance")).toEqual([]);
  });

  test("audits what it actually changed, and never the whole config blob", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const ctx = createSettingsContext(h.deps);
    const owner = await seedUser(db, { id: "user_audit" });

    await createApplyImportedAppearance(ctx)(owner, { patch: { showTimestamps: !DEFAULTS.showTimestamps }, backgroundLibrary: [entry("aaa", "bg")] });

    const audited = h.audits.find((a) => a.entry.action === "settings.importAppearance");
    expect(audited?.entry.metadata).toEqual({ keys: ["showTimestamps"], backgroundsAdded: 1 });
  });
});
